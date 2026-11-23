import { sessionUser, unauthorized } from "@/lib/api-auth";
import { gmailRefreshTokenState, resolveGmailConnection } from "@/lib/gmail/connection";
import { runGmailAction, type MailAction } from "@/lib/gmail/actions";
import { listStoredMessages, purgeMessages } from "@/lib/gmail/store";
import {
  applyArchiveCleanup,
  readAssessments,
  recordMailAction,
  rememberHiddenMessages,
} from "@/lib/agent/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Archive or trash a conversation in Gmail for real. Gmail.modify only:
 * no sending, no permanent deletion (trash stays recoverable for 30 days).
 */
export async function POST(request: Request) {
  const user = await sessionUser();
  if (!user) return unauthorized();

  const body = (await request.json().catch(() => null)) as { conversationId?: string; action?: string } | null;
  const conversationId = body?.conversationId?.trim();
  const action = body?.action as MailAction | undefined;
  if (!conversationId || (action !== "archive" && action !== "trash")) {
    return Response.json({ error: "Ongeldig verzoek." }, { status: 400 });
  }

  const connection = await resolveGmailConnection(user.id, user.email).catch(() => null);
  const tokenState = await gmailRefreshTokenState(user.id);
  if (!connection) {
    return Response.json({ error: "Gmail is niet gekoppeld." }, { status: 400 });
  }
  if (!tokenState.ok) {
    const uitleg: Record<typeof tokenState.reason, string> = {
      "no-row": "Gmail is niet gekoppeld.",
      "needs-reconnect": "De Gmail-koppeling staat op 'opnieuw koppelen'. Ga naar Instellingen → Verbindingen.",
      decrypt:
        "De opgeslagen Gmail-sleutel kan hier niet worden ontsleuteld. Dat komt door een afwijkende GMAIL_TOKEN_SECRET, niet door je koppeling: mail ophalen lukt nog wel, archiveren niet.",
      read: "De koppeling kon niet worden gelezen door een storing bij de database. Probeer het zo nog eens.",
    };
    return Response.json({ error: uitleg[tokenState.reason], reason: tokenState.reason }, { status: 409 });
  }
  const refreshToken = tokenState.token;

  const stored = (await listStoredMessages(user.id)).filter((row) => row.thread_id === conversationId);
  const assessment = (await readAssessments()).find((entry) => entry.conversationId === conversationId);
  const ids = stored.length > 0
    ? stored.map((row) => row.message_id)
    : assessment?.sourceMessageId
      ? [assessment.sourceMessageId]
      : [];

  if (ids.length === 0) {
    return Response.json({ error: "Mail niet gevonden." }, { status: 404 });
  }

  // Record the undo before anything moves. If Gmail then refuses, the record is
  // dropped again; if the cleanup fails, a restore is still possible.
  await recordMailAction({
    conversationId,
    action,
    messageIds: ids,
    assessment,
    at: new Date().toISOString(),
  }).catch(() => null);

  // Lukt het verplaatsen in Gmail niet (bijvoorbeeld omdat de sleutel hier niet
  // past), dan behandelen we de mail als afgehandeld in de app zelf: de kaart
  // gaat naar Afgehandeld en komt niet elke ronde terug. Dat is eerlijker dan
  // hem laten terugspringen naar de lijst.
  let gmailFout: string | null = null;
  for (const id of ids) {
    const result = await runGmailAction(refreshToken, id, action);
    if (!result.ok) {
      gmailFout = result.message ?? "Verplaatsen in Gmail mislukte.";
      break;
    }
  }

  if (gmailFout) {
    await rememberHiddenMessages(ids).catch(() => null);
    await applyArchiveCleanup({ conversationId, action, messageIds: ids, assessment, keepSnapshot: true }).catch(
      () => null,
    );
    return Response.json({ ok: true, action, messages: ids.length, gmailError: gmailFout });
  }

  // Gmail is now changed. Everything below is bookkeeping: if that fails the
  // request must still report success, because the mail really is archived.
  let cleanupError: string | null = null;
  try {
    // One write: store the undo snapshot and drop the card(s).
    await applyArchiveCleanup({ conversationId, action, messageIds: ids, assessment, keepSnapshot: true });
    // Bij archiveren blijft de kaart bestaan (voor Afgehandeld); de berichtrijen
    // mogen weg, want de kaart zelf houdt de inhoud.
    await purgeMessages(user.id, ids);
  } catch (error) {
    cleanupError = error instanceof Error ? error.message : "Opruimen mislukt.";
  }

  return Response.json({ ok: true, action, messages: ids.length, cleanupError });
}
