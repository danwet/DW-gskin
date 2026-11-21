import "server-only";

import type { InboundMessage, UnsubscribeInfo } from "./types";

const ONE_CLICK_PATTERN = /list-unsubscribe\s*=\s*one-click/i;
const KEYWORDS = /afmelden|unsubscribe|uitschrijven|e-mailvoorkeuren|email.?preferences|voorkeuren|nieuwsbrief.*afmelden/i;

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Only public HTTPS hostnames are acceptable destinations. IP literals, localhost
 * and internal domains are rejected so the server never reaches local addresses.
 */
export function validateUnsubscribeUrl(value: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  const host = parsed.hostname.toLowerCase();
  if (!host) return null;
  // Reject IPv4/IPv6 literals entirely.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) return null;
  if (host === "localhost" || host.endsWith(".localhost")) return null;
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".lan")) return null;
  if (host === "0.0.0.0" || host === "::1") return null;
  return parsed.toString();
}

function parseListUnsubscribe(header: string): { https: string[]; mailto: string[] } {
  const https: string[] = [];
  const mailto: string[] = [];
  const matches = header.match(/<([^>]*)>/g) ?? [];
  for (const match of matches) {
    const value = match.slice(1, -1).trim();
    if (/^https:\/\//i.test(value)) https.push(value);
    else if (/^mailto:/i.test(value)) mailto.push(value);
  }
  // Some senders omit the angle brackets.
  if (https.length === 0 && mailto.length === 0) {
    for (const token of header.split(/[\s,;]+/)) {
      const trimmed = token.trim();
      if (/^https:\/\//i.test(trimmed)) https.push(trimmed);
      else if (/^mailto:/i.test(trimmed)) mailto.push(trimmed);
    }
  }
  return { https, mailto };
}

function findUnsubscribeLinkInText(text: string): { url: string; kind: "manual" | "mailto" } | null {
  const keywordIndex = text.search(KEYWORDS);
  if (keywordIndex === -1) return null;
  const windowText = text.slice(keywordIndex, keywordIndex + 500);
  const match = windowText.match(/https?:\/\/[^\s<>"']+|mailto:[^\s<>"']+/i);
  if (!match) return null;
  const url = match[0].replace(/[.,;)\]]+$/, "");
  return /^mailto:/i.test(url) ? { url, kind: "mailto" } : { url, kind: "manual" };
}

/**
 * Determines whether and how a message can be unsubscribed. Pure string work —
 * it never performs a network request and never triggers link prefetching.
 */
export function detectUnsubscribe(message: InboundMessage): UnsubscribeInfo | null {
  const header = message.listUnsubscribe ?? "";
  const postHeader = message.listUnsubscribePost ?? "";

  if (header) {
    const { https, mailto } = parseListUnsubscribe(header);
    const oneClick = ONE_CLICK_PATTERN.test(postHeader);

    if (https.length > 0) {
      const validated = validateUnsubscribeUrl(https[0]);
      if (validated) {
        if (oneClick) {
          return {
            kind: "one-click",
            url: validated,
            domain: domainOf(validated),
            listId: message.messageIdHeader ? `list-${message.messageIdHeader}` : undefined,
          };
        }
        return { kind: "manual", url: validated, domain: domainOf(validated) };
      }
      // Unusable (non-https/internal) one-click destination: fall back to manual only
      // if it can still be opened safely, otherwise drop the action entirely.
      return null;
    }

    if (mailto.length > 0) {
      return { kind: "mailto" };
    }
  }

  const bodyLink = findUnsubscribeLinkInText(`${message.snippet ?? ""}\n${message.body ?? ""}`);
  if (bodyLink?.kind === "mailto") return { kind: "mailto" };
  if (bodyLink?.kind === "manual") {
    const validated = validateUnsubscribeUrl(bodyLink.url);
    if (validated) return { kind: "manual", url: validated, domain: domainOf(validated) };
  }
  return null;
}

export type OneClickResult = { ok: boolean; status: number | null };

/**
 * Performs the RFC 8058 one-click POST. Does not follow redirects, sends no
 * cookies or credentials, and only the exact RFC body/header.
 */
export async function performOneClickUnsubscribe(url: string, signal?: AbortSignal): Promise<OneClickResult> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "List-Unsubscribe=One-Click",
    redirect: "manual",
    signal,
  });
  return { ok: response.status >= 200 && response.status < 300, status: response.status };
}
