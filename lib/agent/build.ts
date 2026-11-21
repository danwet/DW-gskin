import type { AssessmentDraft } from "./classify";
import type { InboundMessage, MailAssessment } from "./types";
import { detectUnsubscribe } from "./unsubscribe";
import { detectShipment } from "./shipment";

export function conversationKey(message: InboundMessage): string {
  if (message.threadId?.trim()) return message.threadId.trim();
  const subject = message.subject
    .replace(/^(?:re|fwd|antw|aw|wg|tr)\s*:\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return `${message.fromEmail.toLowerCase()}::${subject}`;
}

export function groupByConversation(messages: InboundMessage[]): Map<string, InboundMessage[]> {
  const grouped = new Map<string, InboundMessage[]>();
  for (const message of messages) {
    const key = conversationKey(message);
    const list = grouped.get(key) ?? [];
    list.push(message);
    grouped.set(key, list);
  }
  for (const list of grouped.values()) {
    list.sort((a, b) => Date.parse(a.receivedAt) - Date.parse(b.receivedAt));
  }
  return grouped;
}

export function buildAssessment(
  conversation: InboundMessage[],
  draft: AssessmentDraft,
  now: Date,
  mailbox: "gmail" | "fixtures" = "fixtures",
): MailAssessment {
  const latest = conversation[conversation.length - 1];
  const invoice = draft.invoice
    ? {
        supplier: draft.invoice.supplier || undefined,
        invoiceNumber: draft.invoice.invoiceNumber || undefined,
        amount: draft.invoice.amount ?? undefined,
        currency: draft.invoice.currency || undefined,
        iban: draft.invoice.iban || undefined,
        dueDate: draft.invoice.dueDate ?? undefined,
        paymentStatus: draft.invoice.paymentStatus,
        paymentAdvice: draft.invoice.paymentAdvice || undefined,
        unreadAttachment: draft.invoice.unreadAttachment || undefined,
      }
    : undefined;
  const consequence = draft.senderSays || draft.possibleConsequence
    ? {
        senderSays: draft.senderSays ?? undefined,
        possible: draft.possibleConsequence ?? undefined,
      }
    : undefined;
  return {
    mailbox,
    conversationId: conversationKey(latest),
    subject: latest.subject,
    from: latest.from,
    fromEmail: latest.fromEmail,
    link: latest.link,
    classification: draft.classification,
    nextAction: draft.nextAction || "Bekijk deze mail.",
    priorityReason: draft.priorityReason || "",
    deadline: draft.deadline ?? undefined,
    consequence,
    impact: draft.impact ?? undefined,
    invoice,
    preparedAction: draft.preparedAction || undefined,
    draftReply: draft.draftReply || undefined,
    sourceMessageId: latest.id,
    receivedAt: latest.receivedAt,
    updatedAt: now.toISOString(),
    unsubscribe: detectUnsubscribe(latest) ?? undefined,
    body: latest.body || undefined,
    bodyHtml: latest.bodyHtml || undefined,
    shipment: detectShipment(latest) ?? undefined,
    thread: conversation.map((message) => ({
      from: message.from,
      fromEmail: message.fromEmail,
      subject: message.subject,
      body: message.body || undefined,
      receivedAt: message.receivedAt,
    })),
  };
}
