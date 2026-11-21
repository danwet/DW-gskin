import { sessionUser, unauthorized } from "@/lib/api-auth";
import { loadAgentConfig } from "@/lib/agent/config";
import { getGmailRefreshToken } from "@/lib/gmail/connection";
import { sendGmailReply, type Attachment } from "@/lib/agent/gmail-send";
import { markArchivedByAgent, markSent, readAssessments, saveDraft } from "@/lib/agent/store";
import { archiveGmailMessage, markGmailMessageRead } from "@/lib/gmail/actions";
import { listStoredMessages } from "@/lib/gmail/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  return sendReply(request);
}

async function sendReply(request: Request) {
  const user = await sessionUser();
  if (!user) return unauthorized();

  const form = await request.formData().catch(() => null);
  const conversationId = typeof form?.get("conversationId") === "string" ? (form.get("conversationId") as string) : "";
  const draft = typeof form?.get("body") === "string" ? (form.get("body") as string) : "";
  if (!conversationId || !draft.trim()) {
    return Response.json({ ok: false, error: "conversationId en body zijn verplicht" }, { status: 400 });
  }

  const items = await readAssessments();
  const item = items.find((entry) => entry.conversationId === conversationId);
  if (!item) return Response.json({ ok: false, error: "Gesprek niet gevonden" }, { status: 404 });

  await saveDraft(conversationId, draft);

  const files = form?.getAll("files") ?? [];
  const attachments: Attachment[] = [];
  for (const entry of files) {
    if (!(entry instanceof File)) continue;
    attachments.push({
      filename: entry.name || "bijlage",
      mimeType: entry.type || "application/octet-stream",
      content: Buffer.from(await entry.arrayBuffer()),
    });
  }

  const config = await loadAgentConfig();
  const refreshToken = (await getGmailRefreshToken(user.id)) ?? config.gmailRefreshToken;
  if (!refreshToken) {
    return Response.json({ ok: false, error: "Gmail is niet gekoppeld." }, { status: 409 });
  }
  const subject = /^re:/i.test(item.subject) ? item.subject : `Re: ${item.subject}`;
  const result = await sendGmailReply({
    refreshToken,
    from: user.email,
    to: item.fromEmail,
    subject,
    body: draft,
    signatureHtml: config.emailSignature || undefined,
    attachments,
  });

  if (result.ok) {
    // The sent copy shows up as unread in Sent; clear that right away.
    if (result.id) await markGmailMessageRead(refreshToken, result.id).catch(() => null);

    const updated = await markSent(conversationId);

    // A replied mail has served its purpose: out of the inbox, marked read.
    try {
      const ids = (await listStoredMessages(user.id))
        .filter((row) => row.thread_id === conversationId)
        .map((row) => row.message_id);
      const targets = ids.length > 0 ? ids : item.sourceMessageId ? [item.sourceMessageId] : [];

      let archived = targets.length > 0;
      for (const id of targets) {
        const outcome = await archiveGmailMessage(refreshToken, id);
        if (!outcome.ok) {
          archived = false;
          break;
        }
      }
      if (archived) await markArchivedByAgent([conversationId]);
    } catch {
      // The reply is sent; archiving is a follow-up we can retry next sync.
    }

    return Response.json({ ok: true, item: updated });
  }

  return Response.json(result, { status: result.reason === "not_configured" ? 409 : 502 });
}
