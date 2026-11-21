export interface InvoiceData {
  id: string;
  recipient_name: string;
  iban: string;
  amount: number;
  reference: string;
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

export function formatDueLabel(iso: string, locale: "en-GB" | "nl-NL" = "en-GB"): string {
  const due = calendarDate(iso);
  if (!due) return iso;
  return due.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
}

export function generateEPCQRString(data: InvoiceData): string {
  const recipient = (data.recipient_name || "").substring(0, 70);
  const iban = (data.iban || "").replace(/\s+/g, "").toUpperCase();
  const amount = `EUR${Number(data.amount || 0).toFixed(2)}`;
  const reference = (data.reference || "").substring(0, 140);

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
    reference
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
