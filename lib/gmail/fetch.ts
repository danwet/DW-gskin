import "server-only";

import { extractTextFromBuffer } from "../scan/extract";

import type { InboundMessage } from "../agent/types";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

/**
 * Sender label for a card. A missing name falls back to the part before the @,
 * so "info@example.com" and "<info@example.com>" both read as "info".
 */
/** A segment that names a department rather than the organisation. */
const DEPARTMENT_HINT =
  /\b(debiteurenbeheer|debiteuren|crediteuren|administratie|facturatie|finance|financien|klantenservice|support|service|sales|recruitment|hr|afdeling|department|team|office|info|informatie|noreply|no-reply|mail)\b/i;

/**
 * "Debiteurenbeheer | Shave Energy" is really "Shave Energy", and
 * "Gasservice Noordholland | Installatie afdeling" is really
 * "Gasservice Noordholland": keep the segment that is not a department.
 */
export function simplifySenderName(name: string): string {
  const parts = name
    .split(/\s*[|·]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return name;
  return parts.find((part) => !DEPARTMENT_HINT.test(part)) ?? parts[0];
}

/** A display name that is only a department, e.g. "administratie". */
const DEPARTMENT_ONLY =
  /^(administratie|debiteurenbeheer|debiteuren|crediteuren|facturatie|finance|financien|klantenservice|support|service|sales|hr|recruitment|info|informatie|mail|office|team|noreply|no-reply)$/i;

const FREE_MAIL = /(^|\.)(gmail|googlemail|outlook|hotmail|live|yahoo|icloud|ziggo|kpnmail|telfort|upcmail|planet|home|hetnet|me)\./i;

/** "administratie@shave-energy.nl" → "Shave Energy". */
export function organisationFromEmail(email: string): string {
  const domain = (email ?? "").split("@")[1]?.toLowerCase() ?? "";
  if (!domain || FREE_MAIL.test(domain)) return "";
  const label = domain.split(".")[0];
  if (!label || label.length < 3) return "";
  return label
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function senderDisplayName(from?: string | null, fromEmail?: string | null): string {
  const name = (from ?? "").trim().replace(/^["']+|["']+$/g, "").trim();
  const email = (fromEmail ?? "").trim();
  if (name && name !== "Onbekend" && !name.includes("@")) {
    const simplified = simplifySenderName(name);
    // A pure department name says nothing; use the organisation behind the domain.
    if (DEPARTMENT_ONLY.test(simplified)) {
      const organisation = organisationFromEmail(email || name);
      if (organisation) return organisation;
    }
    return simplified;
  }
  const address = email.includes("@") ? email : name.includes("@") ? name : "";
  const local = address ? address.split("@")[0].trim() : "";
  return local || name || "Onbekend";
}

export type GmailListPage = {
  ok: boolean;
  ids: string[];
  nextPageToken: string | null;
  resultSizeEstimate: number | null;
  status?: number;
  error?: string;
};

function decodeBody(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

/** Only the text/plain part counts as body text. */
function findPlainText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const part = payload as { mimeType?: string; body?: { data?: string }; parts?: unknown[] };
  if (part.mimeType === "text/plain" && part.body?.data) return decodeBody(part.body.data);
  for (const child of part.parts ?? []) {
    const text = findPlainText(child);
    if (text) return text;
  }
  return "";
}

/** Newsletter HTML turned into readable text, for mails without a plain part. */
export function htmlToText(html: string): string {
  return (html ?? "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function findHtml(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const part = payload as { mimeType?: string; body?: { data?: string }; parts?: unknown[] };
  if (part.mimeType === "text/html" && part.body?.data) return decodeBody(part.body.data);
  for (const child of part.parts ?? []) {
    const html = findHtml(child);
    if (html) return html;
  }
  return "";
}

function headerValue(payload: unknown, name: string): string {
  if (!payload || typeof payload !== "object") return "";
  const part = payload as { headers?: { name?: string; value?: string }[] };
  return part.headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

/** Maps a Gmail `format=full` resource to the app's inbound-message shape. */
/**
 * Walks the payload and collects PDF parts. Small attachments come back inline
 * as base64 (`body.data`); larger ones only carry an `attachmentId`.
 */
type PdfPart = { filename: string; attachmentId?: string; data?: string };

function findPdfParts(payload: unknown): PdfPart[] {
  const found: PdfPart[] = [];

  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const part = node as {
      mimeType?: string;
      filename?: string;
      body?: { attachmentId?: string; data?: string; size?: number };
      parts?: unknown[];
    };
    const mime = (part.mimeType ?? "").toLowerCase().split(";")[0].trim();
    const filename = part.filename ?? "";
    const isPdf = mime === "application/pdf" || /\.pdf$/i.test(filename);
    if (isPdf && (part.body?.attachmentId || part.body?.data)) {
      found.push({
        filename: filename || "factuur.pdf",
        attachmentId: part.body?.attachmentId,
        data: part.body?.data,
      });
    }
    for (const child of part.parts ?? []) walk(child);
  };

  walk(payload);
  return found;
}

export function mapGmailMessage(data: unknown): InboundMessage | null {
  if (!data || typeof data !== "object") return null;
  const message = data as {
    id?: string;
    threadId?: string;
    snippet?: string;
    payload?: unknown;
    internalDate?: string;
  };
  if (!message.id) return null;
  const rawFrom = headerValue(message.payload, "From");
  const subject = headerValue(message.payload, "Subject");
  const match = /([^<]*)\s*<([^>]+)>/.exec(rawFrom);

  let fromEmail = match?.[2]?.trim() ?? "";
  const rawName = (match?.[1] ?? "").trim().replace(/^["']|["']$/g, "").trim();

  if (!fromEmail && rawFrom.includes("@")) {
    fromEmail = rawFrom.replace(/^["']|["']$/g, "").trim();
  }
  const from = senderDisplayName(rawName, fromEmail);

  const plain = findPlainText(message.payload);
  const html = findHtml(message.payload);
  return {
    id: message.id,
    threadId: message.threadId ?? message.id,
    from,
    fromEmail,
    subject: subject || "(geen onderwerp)",
    snippet: message.snippet ?? "",
    // Multipart newsletters often only carry HTML: read it as text.
    body: plain || (html ? htmlToText(html) : ""),
    bodyHtml: html || undefined,
    receivedAt: message.internalDate
      ? new Date(Number(message.internalDate)).toISOString()
      : new Date().toISOString(),
    link: message.threadId ? `https://mail.google.com/mail/u/0/#inbox/${message.threadId}` : undefined,
    listUnsubscribe: headerValue(message.payload, "List-Unsubscribe") || undefined,
    listUnsubscribePost: headerValue(message.payload, "List-Unsubscribe-Post") || undefined,
    messageIdHeader: headerValue(message.payload, "Message-ID") || undefined,
    pdfAttachments: findPdfParts(message.payload),
  };
}

function base64UrlToBuffer(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

async function pdfTextFromPayload(part: PdfPart, accessToken: string, messageId: string): Promise<string> {
  // Inline attachments already carry their bytes.
  let raw = part.data ?? "";

  if (!raw && part.attachmentId) {
    const response = await fetch(
      `${GMAIL_API}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(part.attachmentId)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!response.ok) return "";
    const data = (await response.json().catch(() => null)) as { data?: string } | null;
    raw = data?.data ?? "";
  }

  if (!raw) return "";
  try {
    return await extractTextFromBuffer(base64UrlToBuffer(raw), "application/pdf");
  } catch {
    return "";
  }
}

export async function fetchGmailMessage(accessToken: string, id: string): Promise<InboundMessage | null> {
  const response = await fetch(`${GMAIL_API}/messages/${id}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  const mapped = mapGmailMessage(await response.json().catch(() => null));
  if (!mapped) return null;

  // Invoice details live in the PDF, not in the mail text.
  for (const part of mapped.pdfAttachments ?? []) {
    const text = await pdfTextFromPayload(part, accessToken, id);
    if (text) {
      mapped.body = `${mapped.body ?? ""}\n\n--- Factuurbijlage: ${part.filename} ---\n${text}`.trim();
      break;
    }
  }
  return mapped;
}

/** One page of the inbox, newest first (Gmail returns newest first by default). */
export async function listGmailInbox(
  accessToken: string,
  options: { pageToken?: string | null; maxResults?: number } = {},
): Promise<GmailListPage> {
  const params = new URLSearchParams({
    maxResults: String(options.maxResults ?? 50),
    q: "in:inbox",
  });
  if (options.pageToken) params.set("pageToken", options.pageToken);

  const response = await fetch(`${GMAIL_API}/messages?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    return {
      ok: false,
      ids: [],
      nextPageToken: null,
      resultSizeEstimate: null,
      status: response.status,
      error: `Gmail list faalde (${response.status}).`,
    };
  }
  const data = (await response.json().catch(() => null)) as {
    messages?: { id?: string }[];
    nextPageToken?: string;
    resultSizeEstimate?: number;
  } | null;
  return {
    ok: true,
    ids: (data?.messages ?? []).map((m) => m.id).filter((id): id is string => Boolean(id)),
    nextPageToken: data?.nextPageToken ?? null,
    resultSizeEstimate: typeof data?.resultSizeEstimate === "number" ? data.resultSizeEstimate : null,
  };
}
