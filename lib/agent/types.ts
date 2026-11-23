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

/** Iets dat je gekocht hebt: abonnement, licentie, trial of los product. */
export type PurchaseInfo = {
  shop?: string;
  product?: string;
  orderNumber?: string;
  amount?: number;
  currency?: string;
  status: "trial" | "paid" | "renewed" | "refunded" | "cancelled" | "unknown";
  startsAt?: string;
  endsAt?: string;
  renewsAt?: string;
  link?: string;
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
  /** The shop the parcel belongs to, when a carrier mail names it. */
  shop?: string;
  /** Tracking code, used to tie a carrier mail to an earlier order. */
  tracking?: string;
  /** Identity of the order this mail belongs to, so one trail spans all mails. */
  orderKey?: string;
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
  /**
   * Hoeveel aandacht dit vandaag vraagt, bepaald door het model: "moet" is nu,
   * "mag" kan wachten, "hoeft_niet" is alleen informatie.
   */
  tier?: "moet" | "mag" | "hoeft_niet";
  /**
   * Het oordeel bij bewaren: is het gesprek tot stilstand gekomen (informatie)
   * of wacht er nog een actie van jou?
   */
  savedVerdict?: { stopped: boolean; reason?: string; at: string };
  /**
   * True zodra er een bericht van jou in de thread staat. Zo'n thread is nooit
   * "hoeft niet": je hebt er zelf naar gehandeld.
   */
  userReplied?: boolean;
  /** True wanneer het model (niet de regel-fallback) de beoordeling maakte. */
  viaModel?: boolean;
  /**
   * Wat voor mail dit is, volgens het model: het leest de mail en benoemt de
   * soort, in plaats van dat een keyword bepaalt hoe hij behandeld wordt.
   */
  category?: "order" | "invoice" | "appointment" | "question" | "admin" | "newsletter" | "other";
  classification: AgentClassification;
  nextAction: string;
  priorityReason: string;
  deadline?: string | null;
  consequence?: Consequence;
  impact?: string;
  purchase?: PurchaseInfo;
  invoice?: InvoiceAssessment;
  preparedAction?: string;
  draftReply?: string;
  sentAt?: string;
  snoozedUntil?: string;
  /** Tier the card was demoted to while snoozed ("later" = Mag, "info" = Hoeft niet). */
  snoozedTier?: "later" | "info";
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
  /** Which mailbox produced this assessment. Untagged rows are test data. */
  mailbox?: "gmail" | "fixtures";
  /** Proposal summary attached by the inbox API (not stored in the assessment). */
  proposal?: {
    id: string;
    action: "archive" | "trash" | "reply" | "unsubscribe";
    status: "pending" | "approved" | "rejected";
    version: number;
  };
  /** Detected newsletter unsubscribe option, when present. */
  unsubscribe?: UnsubscribeInfo;
  /** Plain-text body, retained for the newsletter easy-reader view. */
  body?: string;
  /** The original message has HTML we can render in the popup. */
  hasHtml?: boolean;
  /** Brand mark found in a newsletter, shown on the card. */
  logoUrl?: string;
  /** HTML body, retained so the newsletter reader can show images. */
  bodyHtml?: string;
  /** Detected shipment/tracking update, when present. */
  shipment?: ShipmentInfo;
  /** Payment confirmation: who was paid. Never auto-archived. */
  payment?: { supplier: string; amount?: number; currency?: string; paidAt?: string };
  /** Set when the agent archived the mail itself after reading the order status. */
  archivedAt?: string;
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
  skipped?: number;
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
  /** Status changes counted per day, for the Weggewerkt panel. */
  dailyChanges?: { date: string; orderStatus: number; paymentStatus: number };
  /** How many invoices you marked paid today, kept even after the card leaves. */
  dailyPaid?: { date: string; count: number };
  /** Same idea for answered mail: counted even when the card is gone. */
  dailyAnswered?: { date: string; count: number };
  /** A run was attempted without the right secret; only the time is kept. */
  cronRejectedAt?: string | null;
  cronRejectedCount?: number;
  /** What the rejected request looked like, without any secret value. */
  cronReject?: {
    at: string;
    hadHeader: boolean;
    headerScheme: string | null;
    headerLength: number;
    hadKey: boolean;
    keyLength: number;
    method?: string;
    presentedLength?: number;
    presentedHash?: string;
    expectedHash?: string;
    expectedLength?: number;
  } | null;
  /** Gmail history cursor for reconciling deletions and archive actions. */
  gmailHistoryId?: string;
  /** Snapshot of the last archive/trash, so it can be undone. */
  /**
   * Reading state for the notification bell. Stored on the server so the badge
   * is the same on every device.
   */
  notifications?: { since: string | null; read: string[] };
  lastAction?: LastMailAction | null;
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
  /** PDF parts found in the mail; small ones arrive inline as base64. */
  pdfAttachments?: { filename: string; attachmentId?: string; data?: string }[];
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

/** One archive/trash action, kept so the user can undo it. */
export type LastMailAction = {
  conversationId: string;
  /** "declare" does not move mail; it changes the card's state. */
  action: "archive" | "trash" | "declare";
  messageIds?: string[];
  /** The state before a declaration change, so it can be undone. */
  previous?: {
    declaration?: "none" | "pending" | "declared";
    handledByUser?: boolean;
    handledAt?: string;
  };
  /** Missing when the card was already gone; the mail is still restored. */
  assessment?: MailAssessment;
  at: string;
};
