import type { InvoiceAssessment } from "./types";

/**
 * Pas als de uiterste betaaldatum binnen drie dagen valt, wordt betalen echt
 * urgent en verschuift de mail van Mag naar Moet.
 */
export const TIER_WINDOW_DAYS = 3;

/**
 * Hoeveel haast een openstaande factuur heeft. Geld dat je verschuldigd bent is
 * niet automatisch 'nu': pas als de uiterste betaaldatum dichterbij komt wordt
 * het 'moet'. Staat er geen datum in, dan is er niets te plannen en blijft het
 * 'moet' — je kunt niet bewijzen dat het nog mag wachten.
 */
export function invoiceTier(
  invoice: InvoiceAssessment | undefined,
  nowMs: number = Date.now(),
): "moet" | "mag" | null {
  const amount = Number(invoice?.amount ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (invoice?.paymentStatus === "paid_confirmed") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(invoice?.dueDate ?? "");
  // Zonder datum valt er niets te plannen: dan is het niet aantoonbaar 'mag'.
  if (!match) return "moet";
  // Vergelijk kalenderdagen, geen uren: op de dag zelf telt de volle dag mee.
  const dueDay = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime();
  const today = new Date(nowMs).setHours(0, 0, 0, 0);
  const days = Math.round((dueDay - today) / 86_400_000);
  return days <= TIER_WINDOW_DAYS ? "moet" : "mag";
}
