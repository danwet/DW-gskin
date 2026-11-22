import { sessionUser, unauthorized } from "@/lib/api-auth";
import { getGmailRefreshToken, resolveGmailConnection } from "@/lib/gmail/connection";
import { runGmailAction, type MailAction } from "@/lib/gmail/actions";
import { listStoredMessages, purgeMessages } from "@/lib/gmail/store";
import {
  applyArchiveCleanup,
  clearMailAction,
  readAssessments,
  recordMailAction,
  removeAssessments,
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
  const refreshToken = await getGmailRefreshToken(user.id);
  if (!connection) {
    return Response.json({ error: "Gmail is niet gekoppeld." }, { status: 400 });
  }
  if (!refreshToken) {
    // The row exists but the token cannot be decrypted here (wrong secret).
    return Response.json(
      { error: "De Gmail-koppeling kon niet worden gelezen. Koppel opnieuw bij Instellingen → Verbindingen." },
      { status: 409 },
    );
  }

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

  for (const id of ids) {
    const result = await runGmailAction(refreshToken, id, action);
    if (!result.ok) {
      await clearMailAction().catch(() => null);
      return Response.json(
        { error: result.message ?? "Actie mislukt." },
        { status: result.reason === "scope" ? 403 : 502 },
      );
    }
  }

  // Gmail is now changed. Everything below is bookkeeping: if that fails the
  // request must still report success, because the mail really is archived.
  let cleanupError: string | null = null;
  try {
    // One write: store the undo snapshot and drop the card(s).
    await applyArchiveCleanup({ conversationId, action, messageIds: ids, assessment, keepSnapshot: true });
    if (!assessment) await removeAssessments([conversationId]);
    // Drop the message rows so a later reconcile does not resurrect the card.
    await purgeMessages(user.id, ids);
  } catch (error) {
    cleanupError = error instanceof Error ? error.message : "Opruimen mislukt.";
  }

  return Response.json({ ok: true, action, messages: ids.length, cleanupError });
}
