import { sessionUser, unauthorized } from "@/lib/api-auth";
import { refreshGoogleAccessToken } from "@/lib/google-token";
import { getGmailRefreshToken, resolveGmailConnection } from "@/lib/gmail/connection";
import { restoreGmailMessage } from "@/lib/gmail/actions";
import { fetchGmailMessage } from "@/lib/gmail/fetch";
import { saveMessages } from "@/lib/gmail/store";
import { readMeta, restoreAssessment, updateMeta } from "@/lib/agent/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Puts the last archived or trashed conversation back, in Gmail and here. */
export async function POST() {
  const user = await sessionUser();
  if (!user) return unauthorized();

  const meta = await readMeta();
  const last = meta.lastAction ?? null;
  if (!last) return Response.json({ error: "Er is geen actie om terug te zetten." }, { status: 400 });

  const connection = await resolveGmailConnection(user.id, user.email).catch(() => null);
  const refreshToken = await getGmailRefreshToken(user.id);
  if (!connection || !refreshToken) {
    return Response.json({ error: "Gmail is niet gekoppeld." }, { status: 400 });
  }

  for (const id of last.messageIds) {
    const result = await restoreGmailMessage(refreshToken, id, last.action);
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
    const messages = await Promise.all(last.messageIds.map((id) => fetchGmailMessage(token.access_token, id)));
    const found = messages.filter((message): message is NonNullable<typeof message> => Boolean(message));
    if (found.length > 0) await saveMessages(user.id, found);
  }
  await restoreAssessment(last.assessment);
  await updateMeta({ lastAction: null });

  return Response.json({ ok: true, action: last.action, conversationId: last.conversationId });
}
