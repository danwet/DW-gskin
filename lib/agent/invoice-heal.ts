import "server-only";

import { listThreadMessages } from "@/lib/gmail/store";
import { dueDateFromInvoiceText } from "./build";
import { setInvoiceDueDate } from "./store";
import { invoiceTier } from "./invoice-tier";
import type { MailAssessment } from "./types";

/**
 * Een factuur zonder uiterste betaaldatum kan niet beoordeeld worden: dan is er
 * niets om 'dichtbij' aan af te meten. Deze stap haalt de datum alsnog uit de
 * opgeslagen mail, zodat de kaart op zijn eigen gegevens in Moet of Mag valt —
 * zonder dat iemand hem hoeft te verplaatsen.
 */
export async function healInvoiceDueDates(userId: string, items: MailAssessment[]): Promise<MailAssessment[]> {
  const missing = items
    .filter((item) => Number(item.invoice?.amount ?? 0) > 0 && !item.invoice?.dueDate)
    .slice(0, 5);
  if (missing.length === 0) return items;

  const healed = new Map<string, string>();
  for (const item of missing) {
    try {
      const messages = await listThreadMessages(userId, item.conversationId);
      const body = messages[messages.length - 1]?.body ?? "";
      const due = dueDateFromInvoiceText(body.replace(/[\u200b\u200c\u200d\ufeff]/g, ""));
      if (!due) continue;
      healed.set(item.conversationId, due);
      await setInvoiceDueDate(item.conversationId, due, invoiceTier({ ...item.invoice!, dueDate: due }) ?? item.tier);
    } catch {
      // Volgende keer opnieuw.
    }
  }
  if (healed.size === 0) return items;

  return items.map((item) => {
    const due = healed.get(item.conversationId);
    if (!due || !item.invoice) return item;
    return { ...item, invoice: { ...item.invoice, dueDate: due } };
  });
}
