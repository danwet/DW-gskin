import "server-only";

import { refreshGoogleAccessToken } from "../google-token";
import { buildFixtureMessages, fixtureStage } from "./fixtures";
import type { AgentConfig } from "./config";
import type { InboundMessage } from "./types";

export type MailSource = "gmail" | "fixtures";

export type MailFetchResult =
  | { ok: true; source: MailSource; messages: InboundMessage[] }
  | { ok: false; source: MailSource; reason: string };

export function gmailConfigured(config?: Partial<AgentConfig>): boolean {
  return Boolean(
    (config?.gmailRefreshToken ?? process.env.GMAIL_REFRESH_TOKEN) &&
      process.env.AUTH_GOOGLE_ID &&
      process.env.AUTH_GOOGLE_SECRET,
  );
}

export function resolveMailSource(config?: Partial<AgentConfig>): MailSource {
  const forced = config?.mailAgentSource ?? (process.env.MAIL_AGENT_SOURCE?.trim().toLowerCase() as AgentConfig["mailAgentSource"]);
  if (forced === "fixtures") return "fixtures";
  if (forced === "gmail") return "gmail";
  return gmailConfigured(config) ? "gmail" : "fixtures";
}

export async function fetchInboxMessages(config?: AgentConfig): Promise<MailFetchResult> {
  const source = resolveMailSource(config);
  if (source === "fixtures") {
    return { ok: true, source, messages: buildFixtureMessages(new Date(), config?.fixtureStage ?? fixtureStage()) };
  }
  return fetchGmailMessages(config?.gmailRefreshToken);
}

async function fetchGmailMessages(refreshTokenOverride?: string): Promise<MailFetchResult> {
  const refreshToken = (refreshTokenOverride ?? process.env.GMAIL_REFRESH_TOKEN)?.trim();
  if (!refreshToken) {
    return { ok: false, source: "gmail", reason: "GMAIL_REFRESH_TOKEN is not set" };
  }
  const token = await refreshGoogleAccessToken(refreshToken);
  if (!token) {
    return { ok: false, source: "gmail", reason: "Could not refresh the Gmail access token" };
  }

  const listResponse = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=25&q=in:inbox",
    { headers: { Authorization: `Bearer ${token.access_token}` } },
  );
  if (!listResponse.ok) {
    return { ok: false, source: "gmail", reason: `Gmail list failed with ${listResponse.status}` };
  }
  const list = (await listResponse.json().catch(() => null)) as { messages?: { id?: string }[] } | null;
  const ids = (list?.messages ?? []).map((m) => m.id).filter((id): id is string => Boolean(id));

  const messages: InboundMessage[] = [];
  for (const id of ids) {
    const mapped = await fetchGmailMessage(token.access_token, id);
    if (mapped) messages.push(mapped);
  }
  return { ok: true, source: "gmail", messages };
}

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

async function fetchGmailMessage(accessToken: string, id: string): Promise<InboundMessage | null> {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  const data = (await response.json().catch(() => null)) as {
    id?: string;
    threadId?: string;
    snippet?: string;
    payload?: unknown;
    internalDate?: string;
  } | null;
  if (!data?.id) return null;
  const from = headerValue(data.payload, "From");
  const subject = headerValue(data.payload, "Subject");
  const match = /([^<]*)\s*<([^>]+)>/.exec(from);
  return {
    id: data.id,
    threadId: data.threadId ?? data.id,
    from: (match?.[1] ?? from).trim() || "Onbekend",
    fromEmail: match?.[2]?.trim() ?? "",
    subject: subject || "(geen onderwerp)",
    snippet: data.snippet ?? "",
    body: findPlainText(data.payload),
    bodyHtml: findHtml(data.payload) || undefined,
    receivedAt: data.internalDate ? new Date(Number(data.internalDate)).toISOString() : new Date().toISOString(),
    link: data.threadId ? `https://mail.google.com/mail/u/0/#inbox/${data.threadId}` : undefined,
    listUnsubscribe: headerValue(data.payload, "List-Unsubscribe") || undefined,
    listUnsubscribePost: headerValue(data.payload, "List-Unsubscribe-Post") || undefined,
    messageIdHeader: headerValue(data.payload, "Message-ID") || undefined,
  };
}
