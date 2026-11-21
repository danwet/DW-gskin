import "server-only";

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { isValidIban } from "../epc";
import { isValidCalendarDate } from "./validate";

export type ExtractedInvoice = {
  supplier: string;
  invoiceNumber: string;
  invoiceDate: string; // YYYY-MM-DD or ""
  dueDate: string; // YYYY-MM-DD or ""
  dueDateSource: string; // explanation of how dueDate was derived
  amount: number | null;
  currency: string;
  iban: string;
  reference: string; // betalingskenmerk / structured reference
  senderSays: string; // announced consequence of delay, if the document names one
};

const MONTHS_NL: Record<string, number> = {
  januari: 1, februari: 2, maart: 3, april: 4, mei: 5, juni: 6,
  juli: 7, augustus: 8, september: 9, oktober: 10, november: 11, december: 12,
};

function toIso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Parses a calendar date written in a handful of common formats; returns YYYY-MM-DD or null. */
function parseFlexibleDate(input: string): string | null {
  const s = input.trim();
  const iso = s.match(/^(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    const isoOut = toIso(year, month, day);
    return isValidCalendarDate(isoOut) ? isoOut : null;
  }
  const eu = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})$/);
  if (eu) {
    const day = Number(eu[1]);
    const month = Number(eu[2]);
    const year = Number(eu[3]);
    const isoOut = toIso(year, month, day);
    return isValidCalendarDate(isoOut) ? isoOut : null;
  }
  const named = s.match(/^(\d{1,2})\s+([a-zA-Z]+)\s+(20\d{2})$/i);
  if (named) {
    const day = Number(named[1]);
    const month = MONTHS_NL[named[2].toLowerCase()];
    const year = Number(named[3]);
    if (month && month >= 1 && month <= 12) {
      const isoOut = toIso(year, month, day);
      return isValidCalendarDate(isoOut) ? isoOut : null;
    }
  }
  return null;
}

function addDays(iso: string, days: number): string | null {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return toIso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function labeledValue(text: string, labels: RegExp): string {
  const match = text.match(new RegExp(`(?:${labels.source})\\s*[:\\-]?\\s*([^\\n]{1,80})`, "i"));
  return match?.[1]?.trim() ?? "";
}

function firstDate(text: string): string | null {
  const tokens = text.split(/[\s,;]+/).filter(Boolean);
  for (const token of tokens) {
    const cleaned = token.replace(/[()]/g, "");
    const parsed = parseFlexibleDate(cleaned);
    if (parsed) return parsed;
  }
  return null;
}

function dateNear(text: string, pattern: RegExp): string | null {
  const match = text.match(new RegExp(`(?:${pattern.source})[^\\n]{0,60}`, "i"));
  if (!match) return null;
  const window = match[0];
  const candidates = window.match(/\d{1,2}[-/.]\d{1,2}[-/.]20\d{2}|20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}\s+[a-zA-Z]+\s+20\d{2}/g);
  for (const candidate of candidates ?? []) {
    const parsed = parseFlexibleDate(candidate);
    if (parsed) return parsed;
  }
  return null;
}

function parseAmountEur(text: string): number | null {
  // Prefer the total line when present.
  const total = text.match(/(?:totaal|te betalen|total due|total|openstaand bedrag)\s*[:\s]*[^\n]{0,40}?(?:€|eur)\s*([\d.,]+)/i);
  const first = text.match(/(?:€|eur)\s*([\d]{1,7}(?:[.,]\d{1,2})?)/i);
  const match = total?.[1] ?? first?.[1];
  if (!match) return null;
  const normalized = match.replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
}

function parseIban(text: string): string {
  const source = text.toUpperCase();
  const labeled = source.match(/IBAN[:\s]*([A-Z]{2}\d{2}[A-Z0-9 ]{10,30})/);
  const raw = labeled?.[1] ?? source.match(/\b([A-Z]{2}\d{2}[A-Z0-9]{10,30})\b/)?.[1];
  if (!raw) return "";
  const iban = raw.replace(/\s+/g, "");
  return /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban) && isValidIban(iban) ? iban : "";
}

function parseReference(text: string): string {
  const match = text.match(
    /(?:betalingskenmerk|kenmerk|referentie|reference|gestructureerde mededeling|structured reference|payment reference)\s*[:]?\s*([A-Za-z0-9 +/.\-]{4,40})/i,
  );
  return match?.[1]?.trim() ?? "";
}

function sentenceContaining(text: string, pattern: RegExp): string | null {
  const match = text.match(new RegExp(`[^.!?\\n]*(?:${pattern.source})[^.!?\\n]*`, "i"));
  return match?.[0]?.trim() || null;
}

function parseSupplier(text: string): string {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const labeled = lines.find((line) => /^(leverancier|aanbieder|verkoper|supplier|from|van|bedrijf)\s*[:]?\s*\S/i.test(line));
  if (labeled) return labeled.replace(/^(leverancier|aanbieder|verkoper|supplier|from|van|bedrijf)\s*[:]?\s*/i, "").trim();
  // Fallback: the first short line that is not a date, amount, iban, or obvious label.
  for (const line of lines.slice(0, 6)) {
    if (/^(factuur|invoice|datum|date|bedrag|amount|iban|betaling|totaal|total)/i.test(line)) continue;
    if (/\d{1,2}[-/.]\d{1,2}[-/.]20\d{2}/.test(line)) continue;
    if (/(€|eur|iban|betreft|kenmerk)/i.test(line)) continue;
    if (line.length >= 3 && line.length <= 60) return line;
  }
  return "";
}

function parseInvoiceNumber(text: string): string {
  const match =
    text.match(/(?:factuur(?:nummer)?|invoice(?:\s*(?:number|no\.?))?)\s*[:#]?\s*([A-Za-z0-9][A-Za-z0-9./-]{1,30})/i) ??
    text.match(/\b(?:inv|factuur)[-:\s#]*([A-Za-z0-9][A-Za-z0-9./-]{1,30})\b/i);
  return match?.[1]?.trim() ?? "";
}

function extractDueDate(text: string, invoiceDate: string): { date: string; source: string } {
  const duePattern = /uiterste\s+betaaldatum|uiterlijk|betaal\s+voor|vervaldatum|vervalt\s+op|due\s+date/i;
  const explicit = dateNear(text, duePattern);
  if (explicit) return { date: explicit, source: "Staat op de factuur" };

  const term = text.match(/(?:binnen\s+|betalingstermijn\s*(?:van)?\s*|payment\s+terms?\s*[:]?\s*|uiterlijk\s+)(\d{1,3})\s*dagen|(\d{1,3})\s*dagen\s+(?:na|after)/i);
  const days = term ? Number(term[1] ?? term[2]) : NaN;
  if (Number.isFinite(days) && invoiceDate) {
    const computed = addDays(invoiceDate, days);
    if (computed) return { date: computed, source: `Berekend: ${days} dagen na factuurdatum` };
  }

  return { date: "", source: "Niet gevonden — controleer de datum" };
}

function extractConsequence(text: string): string {
  return (
    sentenceContaining(text, /incasso|uit handen|deurwaarder|aanmaning|opschorten|afsluiten|collection|suspens/) ??
    sentenceContaining(text, /aanmaningskosten|incassokosten|administratiekosten/) ??
    ""
  );
}

/** Extracts readable text from a text-layer PDF; returns "" for images and scanned PDFs (no OCR). */
export async function extractTextFromBuffer(buffer: Buffer, mime: string): Promise<string> {
  if (mime !== "application/pdf") return "";
  try {
    const doc = await getDocument({ data: new Uint8Array(buffer), disableWorker: true } as unknown as Parameters<typeof getDocument>[0]).promise;
    let text = "";
    for (let page = 1; page <= doc.numPages; page += 1) {
      const pageObj = await doc.getPage(page);
      const content = await pageObj.getTextContent();
      for (const item of content.items) {
        if ("str" in item) text += `${item.str}\n`;
      }
      text += "\n";
    }
    return text;
  } catch {
    return "";
  }
}

export function parseInvoiceText(text: string): ExtractedInvoice {
  const clean = text.replace(/\r/g, "");
  const invoiceDate = dateNear(clean, /factuurdatum|invoice\s+date|datum\s+factuur/i) ?? firstDate(clean) ?? "";
  const due = extractDueDate(clean, invoiceDate);
  const amount = parseAmountEur(clean);
  return {
    supplier: parseSupplier(clean),
    invoiceNumber: parseInvoiceNumber(clean),
    invoiceDate,
    dueDate: due.date,
    dueDateSource: due.source,
    amount,
    currency: amount != null ? "EUR" : "",
    iban: parseIban(clean),
    reference: parseReference(clean),
    senderSays: extractConsequence(clean),
  };
}
