import { sessionUser, unauthorized } from "@/lib/api-auth";
import { refreshGoogleAccessToken } from "@/lib/google-token";
import { gmailRefreshTokenState, resolveGmailConnection } from "@/lib/gmail/connection";
import { restoreGmailMessage } from "@/lib/gmail/actions";
import { fetchGmailMessage } from "@/lib/gmail/fetch";
import { saveMessages } from "@/lib/gmail/store";
import { readMeta, restoreAssessment, revertDeclaration, unarchiveConversation, updateMeta } from "@/lib/agent/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Puts the last archived or trashed conversation back, in Gmail and here. */
export async function POST() {
  const user = await sessionUser();
  if (!user) return unauthorized();

  const meta = await readMeta();
  const last = meta.lastAction ?? null;
  if (!last) return Response.json({ error: "Er is geen actie om terug te zetten." }, { status: 400 });

  // A declaration never touched Gmail: put the card's state back instead.
  if (last.action === "declare") {
    await revertDeclaration(last.conversationId, last.previous ?? {});
    await updateMeta({ lastAction: null });
    return Response.json({ ok: true, action: "declare", conversationId: last.conversationId });
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
        "De opgeslagen Gmail-sleutel kan hier niet worden ontsleuteld. Dat komt door een afwijkende GMAIL_TOKEN_SECRET, niet door je koppeling.",
      read: "De koppeling kon niet worden gelezen door een storing bij de database. Probeer het zo nog eens.",
    };
    return Response.json({ error: uitleg[tokenState.reason], reason: tokenState.reason }, { status: 409 });
  }
  const refreshToken = tokenState.token;

  const messageIds = last.messageIds ?? [];
  if (messageIds.length === 0) {
    return Response.json({ error: "Er is geen actie om terug te zetten." }, { status: 400 });
  }

  for (const id of messageIds) {
    const result = await restoreGmailMessage(refreshToken, id, last.action as "archive" | "trash");
    if (!result.ok) {
      return Response.json(
        { error: result.message ?? "Terugzetten mislukt." },
        { status: result.reason === "scope" ? 403 : 502 },
      );
    }
  }

  // Pull the messages back in and restore the card exactly as it was.
  const token = await refreshGoogleAccessToken(refreshToken);
  if (token) {
    const messages = await Promise.all(messageIds.map((id) => fetchGmailMessage(token.access_token, id)));
    const found = messages.filter((message): message is NonNullable<typeof message> => Boolean(message));
    if (found.length > 0) await saveMessages(user.id, found);
  }
  // The card comes back exactly as it was; without a card the re-imported mail
  // is judged again, which rebuilds it.
  if (last.assessment) await restoreAssessment(last.assessment);
  await unarchiveConversation(last.conversationId);
  await updateMeta({ lastAction: null });

  return Response.json({ ok: true, action: last.action, conversationId: last.conversationId });
}
