import type { AssessmentDraft } from "./classify";
import type { InboundMessage, MailAssessment } from "./types";
import { detectUnsubscribe } from "./unsubscribe";
import { detectShipment } from "./shipment";
import { isValidIban } from "../epc";

/** The text that came out of a PDF attachment, if the mail carried one. */
export function extractAttachmentText(body?: string): string {
  if (!body) return "";
  const marker = body.indexOf("--- Factuurbijlage:");
  return marker === -1 ? "" : body.slice(marker);
}

/**
 * Reads the amount to pay from invoice text. Totaal/Door u te betalen wins,
 * otherwise the largest amount, so subtotals do not win by accident.
 */
export function amountFromInvoiceText(text: string): number | null {
  const toNumber = (raw: string): number | null => {
    const cleaned = raw.replace(/[^\d.,]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
    const value = Number.parseFloat(cleaned);
    return Number.isFinite(value) ? value : null;
  };

  const total = /(?:door\s+u\s+te\s+betalen|te\s+betalen|totaal(?:bedrag)?|total)\D{0,40}?(\d[\d.,]*)/i.exec(text);
  if (total) {
    const value = toNumber(total[1]);
    if (value !== null) return value;
  }

  const all = [...text.matchAll(/€\s*(\d[\d.,]*)/g)]
    .map((match) => toNumber(match[1]))
    .filter((value): value is number => value !== null);
  return all.length > 0 ? Math.max(...all) : null;
}

/**
 * The account to pay, taken from the attachment. Masked numbers (NL04KNAB****)
 * never match, so the customer's own account cannot win by accident.
 */
export function ibanFromInvoiceText(text: string): string | null {
  const candidates = text.match(/\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g) ?? [];
  for (const candidate of candidates) {
    if (isValidIban(candidate)) return candidate.toUpperCase();
  }
  return null;
}

/** Subjects always start with a capital letter. */
/**
 * Keeps the action label consistent with the structured invoice data: when the
 * amount is unknown, a number must not leak into the action text.
 */
export function normalizeNextAction(nextAction: string, invoiceAmount?: number | null): string {
  const text = (nextAction ?? "").trim();
  if (!text) return "Bekijk deze mail.";
  if (invoiceAmount != null) return text;
  const cleaned = text
    .replace(/\s*(?:€|eur)\s*\d[\d.,]*/gi, "")
    .replace(/\s*\d[\d.,]*\s*(?:euro|eur)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned || "Betaal factuur";
}

/** Emoji, variation selectors, zero-width joiners and skin tones. */
const EMOJI_PATTERN = /[\p{Extended_Pictographic}\p{Regional_Indicator}\u{FE0F}\u{200D}\u{1F3FB}-\u{1F3FF}]/gu;

/** Removes emoji so a subject reads as plain text. */
export function stripEmoji(value: string): string {
  return (value ?? "")
    .replace(EMOJI_PATTERN, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Subjects carry no emoji and always start with a capital letter. */
export function capitalizeSubject(value: string): string {
  const trimmed = stripEmoji(value).trim();
  if (!trimmed) return "(geen onderwerp)";
  return trimmed.charAt(0).toLocaleUpperCase("nl-NL") + trimmed.slice(1);
}

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
  ownerEmail?: string | null,
): MailAssessment {
  const latest = conversation[conversation.length - 1];

  // A card names the other party, never your own last reply. Prefer the first
  // message that did not come from the mailbox owner.
  const owner = (ownerEmail ?? "").trim().toLowerCase();
  const counterparty =
    (owner ? conversation.find((message) => message.fromEmail && message.fromEmail.toLowerCase() !== owner) : undefined) ??
    conversation[0] ??
    latest;
  // The attachment text is authoritative for the amount: models routinely miss
  // it when the PDF splits the currency symbol from the number.
  const attachmentText = extractAttachmentText(latest.body);
  const attachmentAmount = attachmentText ? amountFromInvoiceText(attachmentText) : null;
  const attachmentIban = attachmentText ? ibanFromInvoiceText(attachmentText) : null;

  const invoice = draft.invoice
    ? {
        supplier: draft.invoice.supplier || undefined,
        invoiceNumber: draft.invoice.invoiceNumber || undefined,
        amount: draft.invoice.amount ?? attachmentAmount ?? undefined,
        currency: draft.invoice.currency || undefined,
        iban: draft.invoice.iban || attachmentIban || undefined,
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
    subject: capitalizeSubject(latest.subject),
    from: counterparty.from,
    fromEmail: counterparty.fromEmail,
    link: latest.link,
    classification: draft.classification,
    nextAction: normalizeNextAction(draft.nextAction || "Bekijk deze mail.", invoice?.amount),
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
