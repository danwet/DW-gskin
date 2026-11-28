import type { MailAssessment } from "@/lib/agent/types";

/** "€ 151,38" — met het teken van de valuta en een komma als decimaalteken. */
export function bedragTekst(bedrag: number, valuta?: string | null): string {
  const code = (valuta ?? "").toUpperCase();
  const teken = code === "USD" ? "$" : code === "GBP" ? "£" : "€";
  const getal = bedrag.toFixed(2).replace(".", ",");
  // Non-breaking space: het bedrag mag nooit los van het teken op een nieuwe
  // regel belanden.
  return `${teken}\u00A0${getal}`;
}

/** "Declareer € 151,38" — met bedrag, want dat is wat je gaat declareren. */
export function declareLabel(item: MailAssessment): string {
  const bedrag = item.invoice?.amount;
  if (bedrag == null) return "Declareer factuur";
  return `Declareer ${bedragTekst(bedrag, item.invoice?.currency)}`;
}
