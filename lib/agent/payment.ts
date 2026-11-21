import "server-only";

import type { InboundMessage } from "./types";

export type PaymentInfo = {
  /** Who was paid, as named in the confirmation. */
  supplier: string;
  amount?: number;
  currency?: string;
  paidAt?: string;
};

const CONFIRMATION =
  /(ontvangstbewijs|betaling ontvangen|u heeft betaald|je hebt betaald|payment received|payment sent|receipt for your payment|u heeft een betaling gedaan)/i;
/** "Uw betaling aan X is voltooid" and friends. */
const CONFIRMATION_LOOSE = /betaling[^\n]{0,40}?(voltooid|ontvangen|verwerkt|geslaagd)/i;

const PAID_TO =
  /(?:betaling aan|betaald aan|payment to|paid to|ontvangen van|verzonden naar)\s+([A-Z0-9][^\n]{1,70})/i;

/** Strips the noise a receipt puts around the merchant name. */
function cleanSupplier(value: string): string {
  return value
    .replace(/\s+is\s+voltooid.*$/i, "")
    .replace(/\s+(voor|for)\s+.*$/i, "")
    .replace(/["“”]/g, "")
    .trim()
    .slice(0, 60);
}

/**
 * Recognises a payment confirmation and who it went to. These are receipts,
 * not order statuses: they should stay in the inbox and never be auto-archived.
 */
export function detectPayment(message: InboundMessage): PaymentInfo | null {
  const text = `${message.subject ?? ""}\n${message.snippet ?? ""}\n${message.body ?? ""}`;
  if (!CONFIRMATION.test(text) && !CONFIRMATION_LOOSE.test(text)) return null;

  const to = PAID_TO.exec(text);
  const supplier = to ? cleanSupplier(to[1]) : "";
  if (!supplier) return null;

  // Receipts quote the amount with a symbol or a code, in any order.
  const SYMBOL = /(?:€|eur|\$|usd|£|gbp)\s*(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})|(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\s*(?:€|eur|\$|usd|£|gbp)/i;
  const amountMatch = SYMBOL.exec(text);
  const rawAmount = amountMatch?.[1] ?? amountMatch?.[2];
  const amount = rawAmount
    ? Number.parseFloat(rawAmount.replace(/\.(?=\d{3}\b)/g, "").replace(",", "."))
    : undefined;

  const currency = /(?:\$|usd)/i.test(amountMatch?.[0] ?? "") ? "USD" : /(?:£|gbp)/i.test(amountMatch?.[0] ?? "") ? "GBP" : "EUR";

  return {
    supplier,
    amount: Number.isFinite(amount) ? amount : undefined,
    currency,
    paidAt: message.receivedAt,
  };
}
