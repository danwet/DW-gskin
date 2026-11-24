export interface InvoiceData {
  id: string;
  recipient_name: string;
  iban: string;
  amount: number;
  reference: string;
  /** Free-text remittance; used when the reference is not a valid RF reference. */
  text?: string;
  due_date?: string;
  pdf_url?: string;
  pdf_filename?: string;
}

function calendarDate(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

export function isPastDue(iso: string, now = new Date()): boolean {
  const due = calendarDate(iso);
  if (!due) return false;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return due.getTime() < today.getTime();
}

export function isDueUrgent(iso: string, now = new Date()): boolean {
  const due = calendarDate(iso);
  if (!due) return false;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const soon = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2);
  return due.getTime() <= soon.getTime();
}

export function dueTime(iso: string): number | null {
  return calendarDate(iso)?.getTime() ?? null;
}

export function formatDueLabel(iso: string, locale: "en-GB" | "nl-NL" = "nl-NL"): string {
  const due = calendarDate(iso);
  if (!due) return iso;
  return due.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
}

/**
 * ISO 11649 creditor reference: "RF" + two check digits + up to 21 characters,
 * where the whole string passes the mod-97 check. Only such a value may go in
 * the reference field of an EPC QR; anything else has to be free text.
 */
export function isValidCreditorReference(value: string): boolean {
  const normalized = (value || "").replace(/\s+/g, "").toUpperCase();
  if (!/^RF\d{2}[A-Z0-9]{1,21}$/.test(normalized)) return false;

  const rearranged = normalized.slice(4) + normalized.slice(0, 4);
  const digits = Array.from(rearranged)
    .map((char) => (/[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char))
    .join("");

  let remainder = 0;
  for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder === 1;
}

export function generateEPCQRString(data: InvoiceData): string {
  const recipient = (data.recipient_name || "").substring(0, 70);
  const iban = (data.iban || "").replace(/\s+/g, "").toUpperCase();
  const amount = `EUR${Number(data.amount || 0).toFixed(2)}`;

  const rawReference = (data.reference || "").trim();
  // A bank app treats the reference field as a structured betalingskenmerk and
  // rejects anything that is not a valid RF reference, so an invoice number
  // belongs in the free-text field instead.
  const reference = isValidCreditorReference(rawReference) ? rawReference.replace(/\s+/g, "").toUpperCase() : "";

  // Het order- of factuurnummer hoort altijd in het betalingskenmerk te staan:
  // daaraan herkent de leverancier de betaling. Is er een gestructureerde
  // referentie, dan zit het nummer daar al in; anders gaat het als vrije tekst
  // mee, aangevuld met wat er verder nog aan kenmerk bekend is.
  let text = "";
  if (reference.length === 0) {
    const nummer = rawReference;
    const extra = (data.text || "").trim();
    const delen = [nummer ? `Factuur ${nummer}` : "", extra].filter(Boolean);
    // Nooit hetzelfde nummer twee keer achter elkaar.
    if (extra && nummer && extra.toLowerCase().includes(nummer.toLowerCase())) {
      text = extra;
    } else {
      text = delen.join(" · ");
    }
    text = text.trim().substring(0, 140);
  }

  return [
    "BCD",
    "002",
    "1",
    "SCT",
    "",
    recipient,
    iban,
    amount,
    "",
    reference,
    text,
  ].join("\n");
}

/** Validates an IBAN with the ISO 13616 mod-97 check. */
export function isValidIban(iban: string): boolean {
  const normalized = (iban || "").replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(normalized)) return false;
  const rearranged = normalized.slice(4) + normalized.slice(0, 4);
  const digits = Array.from(rearranged)
    .map((char) => (/[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char))
    .join("");
  let remainder = 0;
  for (const digit of digits) {
    remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}
