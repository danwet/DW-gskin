import { sessionUser, unauthorized } from "@/lib/api-auth";
import { getGmailRefreshToken, resolveGmailConnection } from "@/lib/gmail/connection";
import { runGmailAction, type MailAction } from "@/lib/gmail/actions";
import { listStoredMessages, purgeMessages } from "@/lib/gmail/store";
import { readAssessments, removeAssessments } from "@/lib/agent/store";

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
  if (!connection || !refreshToken) {
    return Response.json({ error: "Gmail is niet gekoppeld." }, { status: 400 });
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

  for (const id of ids) {
    const result = await runGmailAction(refreshToken, id, action);
    if (!result.ok) {
      return Response.json(
        { error: result.message ?? "Actie mislukt." },
        { status: result.reason === "scope" ? 403 : 502 },
      );
    }
  }

  // Mirror it locally so the card disappears straight away.
  await purgeMessages(user.id, ids);
  await removeAssessments([conversationId]);

  return Response.json({ ok: true, action, messages: ids.length });
}
