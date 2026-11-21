import type { InvoiceData } from "./epc";
import { triageInbox } from "./triage";
import type { Brief, RawMessage } from "./types";

export type MailboxRead = {
  messages: RawMessage[];
  invoices: InvoiceData[];
  error: string | null;
};

export function briefFromMailbox(read: MailboxRead, displayName: string): Brief {
  if (read.error && read.messages.length === 0 && read.invoices.length === 0) {
    return emptyWith(read.error);
  }
  if (read.messages.length === 0 && read.invoices.length === 0) {
    return emptyWith("Nothing in this run needs a reply.");
  }

  const brief = triageInbox(read.messages, displayName);
  const seen = brief.loops.flatMap((loop) => (loop.payment ? [loop.payment] : []));
  const extra = read.invoices.filter((invoice) => !seen.some((existing) => sameInvoice(existing, invoice)));
  if (extra.length === 0) return paymentsInsight(brief);

  const loops = [
    ...extra.map((invoice) => ({
      id: `loop-${invoice.id}`,
      title: `Pay ${invoice.recipient_name}`,
      detail: `If you don't, €${invoice.amount.toFixed(2)} stays unpaid and this invoice remains open.`,
      doneByAgent: false,
      messageId: invoice.id.replace(/^pay-/, ""),
      payment: invoice,
    })),
    ...brief.loops,
  ];
  return paymentsInsight({ ...brief, loops });
}

function emptyWith(detail: string): Brief {
  return {
    source: "user",
    messageCount: 0,
    insight: { title: "Nothing needs you yet.", detail },
    events: [],
    upcoming: [],
    drafts: [],
    quiet: [],
    actions: [],
    loops: [],
  };
}

function paymentsInsight(brief: Brief): Brief {
  const payments = brief.loops.filter((loop) => loop.payment).length;
  if (payments === 0 || brief.drafts.length > 0) return brief;
  return {
    ...brief,
    insight: {
      title: "Still needs you.",
      detail: payments === 1 ? "One invoice is still unpaid." : `${payments} invoices are still unpaid.`,
    },
  };
}

function sameInvoice(a: InvoiceData, b: InvoiceData): boolean {
  if (a.id === b.id) return true;
  const left = a.iban.replace(/\s+/g, "");
  const right = b.iban.replace(/\s+/g, "");
  return Boolean(left) && left === right && a.amount === b.amount;
}
