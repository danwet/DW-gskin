export type AgentClassification = "reply_needed" | "action_needed" | "waiting" | "info" | "unclassified";

export type PaymentStatus = "unknown" | "open_per_sender" | "paid_confirmed";

export type InvoiceAssessment = {
  supplier?: string;
  invoiceNumber?: string;
  amount?: number;
  currency?: string;
  iban?: string;
  dueDate?: string;
  paymentStatus: PaymentStatus;
  paymentAdvice?: string;
  unreadAttachment?: string;
};

export type Consequence = {
  senderSays?: string;
  possible?: string;
};

export type ShipmentInfo = {
  supplier: string;
  orderNumber: string;
  status: string;
  carrier?: string;
  deliveredAt?: string; // YYYY-MM-DD
  /** Current checkpoint for international shipments (airport, customs, ...). */
  location?: string;
  /** True when the shipment crosses borders (customs/airport/international). */
  international?: boolean;
};

export type UnsubscribeKind = "one-click" | "manual" | "mailto";
export type UnsubscribeStatus = "idle" | "sending" | "sent" | "error";

export type UnsubscribeInfo = {
  kind: UnsubscribeKind;
  /** Public HTTPS destination for one-click POST or manual page opening. */
  url?: string;
  /** Display domain, e.g. "nieuwsbrief.nl". */
  domain?: string;
  /** Reliable list identifier when determinable, else undefined. */
  listId?: string;
  status?: UnsubscribeStatus;
  /** Short error message shown on the card when status is "error". */
  message?: string;
};

/** One card per conversation, holding the latest successful assessment. */
export type MailAssessment = {
  conversationId: string;
  subject: string;
  from: string;
  fromEmail: string;
  link?: string;
  classification: AgentClassification;
  nextAction: string;
  priorityReason: string;
  deadline?: string | null;
  consequence?: Consequence;
  impact?: string;
  invoice?: InvoiceAssessment;
  preparedAction?: string;
  draftReply?: string;
  sentAt?: string;
  snoozedUntil?: string;
  sourceMessageId: string;
  receivedAt: string;
  handledByUser?: boolean;
  handledAt?: string;
  needsAttention?: boolean;
  attentionReason?: string;
  updatedAt: string;
  /** Origin of the item: a mail import or a paper-invoice scan. */
  source?: "mail" | "scan";
  /** Owner (session user id) of a scanned invoice, used for ownership checks. */
  ownerId?: string;
  /** Original scan display name (e.g. "factuur.pdf"). */
  scanFileName?: string;
  /** Stored scan file name under data/scans. */
  scanFilePath?: string;
  scanMime?: string;
  /** When the user manually marked a scanned invoice as paid. */
  paidAt?: string;
  /** Detected newsletter unsubscribe option, when present. */
  unsubscribe?: UnsubscribeInfo;
  /** Plain-text body, retained for the newsletter easy-reader view. */
  body?: string;
  /** HTML body, retained so the newsletter reader can show images. */
  bodyHtml?: string;
  /** Detected shipment/tracking update, when present. */
  shipment?: ShipmentInfo;
  /** Declaration state for a paid invoice: none / pending (in "Declareren") / declared. */
  declaration?: "none" | "pending" | "declared";
  /** Full conversation thread, retained for the collapsible context view. */
  thread?: ThreadMessage[];
  /** When the user saved ("bewaard") this email via the popup. */
  savedAt?: string;
};

export type RunRecord = {
  at: string;
  ok: boolean;
  source: "gmail" | "fixtures";
  model: "openai" | "anthropic" | "gemini" | "openrouter" | "rule";
  conversations: number;
  messages: number;
  archived?: number;
  error: string | null;
};

export type AgentMeta = {
  lastRunAt: string | null;
  lastSuccessfulRunAt: string | null;
  lastError: string | null;
  source: "gmail" | "fixtures";
  model: "openai" | "anthropic" | "gemini" | "openrouter" | "rule";
  conversationsProcessed: number;
  messagesSeen: number;
  runs?: RunRecord[];
};

export type InboundMessage = {
  id: string;
  threadId?: string;
  from: string;
  fromEmail: string;
  subject: string;
  snippet: string;
  body?: string;
  /** HTML body, retained so the newsletter reader can show images. */
  bodyHtml?: string;
  receivedAt: string;
  link?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  /** Raw List-Unsubscribe header value, if present. */
  listUnsubscribe?: string;
  /** Raw List-Unsubscribe-Post header value, if present. */
  listUnsubscribePost?: string;
  /** Message-ID header value, when present. */
  messageIdHeader?: string;
};

/** A single message within a conversation thread, stored for context display. */
export type ThreadMessage = {
  from: string;
  fromEmail: string;
  subject: string;
  body?: string;
  receivedAt: string;
};
