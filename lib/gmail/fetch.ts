import "server-only";

import type { InboundMessage } from "../agent/types";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

export type GmailListPage = {
  ok: boolean;
  ids: string[];
  nextPageToken: string | null;
  resultSizeEstimate: number | null;
  error?: string;
};

function decodeBody(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function findPlainText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const part = payload as { mimeType?: string; body?: { data?: string }; parts?: unknown[] };
  if (part.body?.data) return decodeBody(part.body.data);
  for (const child of part.parts ?? []) {
    const text = findPlainText(child);
    if (text) return text;
  }
  return "";
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
  let from = (match?.[1] ?? "").trim().replace(/^["']|["']$/g, "").trim();

  // A sender without a display name ("info@example.com") is shown by the part
  // before the @ instead of the full address.
  if (!fromEmail && rawFrom.includes("@")) {
    fromEmail = rawFrom.replace(/^["']|["']$/g, "").trim();
  }
  if (!from && fromEmail.includes("@")) {
    from = fromEmail.split("@")[0].trim();
  }
  if (!from) from = "Onbekend";

  return {
    id: message.id,
    threadId: message.threadId ?? message.id,
    from,
    fromEmail,
    subject: subject || "(geen onderwerp)",
    snippet: message.snippet ?? "",
    body: findPlainText(message.payload),
    bodyHtml: findHtml(message.payload) || undefined,
    receivedAt: message.internalDate
      ? new Date(Number(message.internalDate)).toISOString()
      : new Date().toISOString(),
    link: message.threadId ? `https://mail.google.com/mail/u/0/#inbox/${message.threadId}` : undefined,
    listUnsubscribe: headerValue(message.payload, "List-Unsubscribe") || undefined,
    listUnsubscribePost: headerValue(message.payload, "List-Unsubscribe-Post") || undefined,
    messageIdHeader: headerValue(message.payload, "Message-ID") || undefined,
  };
}

export async function fetchGmailMessage(accessToken: string, id: string): Promise<InboundMessage | null> {
  const response = await fetch(`${GMAIL_API}/messages/${id}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  return mapGmailMessage(await response.json().catch(() => null));
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
    return { ok: false, ids: [], nextPageToken: null, resultSizeEstimate: null, error: `Gmail list faalde (${response.status}).` };
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
