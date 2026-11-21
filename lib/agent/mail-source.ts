import "server-only";

import { refreshGoogleAccessToken } from "../google-token";
import { fetchGmailMessage, listGmailInbox } from "../gmail/fetch";
import { getActiveGmailRefreshToken } from "../gmail/connection";
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

export function resolveMailSource(config?: Partial<AgentConfig>, gmailReady?: boolean): MailSource {
  const ready = gmailReady ?? gmailConfigured(config);
  // Once a Gmail account is linked it is the only source: test data is never
  // used again, whatever the setting says.
  if (ready) return "gmail";
  const forced = config?.mailAgentSource ?? (process.env.MAIL_AGENT_SOURCE?.trim().toLowerCase() as AgentConfig["mailAgentSource"]);
  return forced === "gmail" ? "gmail" : "fixtures";
}

/** The stored read-only Gmail connection, if there is one. */
export async function storedGmailConnection(): Promise<
  { userId: string; email: string; refreshToken: string } | null
> {
  try {
    return await getActiveGmailRefreshToken();
  } catch {
    return null;
  }
}

export async function fetchInboxMessages(config?: AgentConfig): Promise<MailFetchResult> {
  const connection = await storedGmailConnection();
  const gmailReady = Boolean(connection) || gmailConfigured(config);
  const source = resolveMailSource(config, gmailReady);
  if (source === "fixtures") {
    return { ok: true, source, messages: buildFixtureMessages(new Date(), config?.fixtureStage ?? fixtureStage()) };
  }
  return fetchGmailMessages(connection?.refreshToken ?? config?.gmailRefreshToken);
}

/** Newest inbox page, read-only. Used by the incremental refresh. */
async function fetchGmailMessages(refreshTokenOverride?: string): Promise<MailFetchResult> {
  const refreshToken = (refreshTokenOverride ?? process.env.GMAIL_REFRESH_TOKEN)?.trim();
  if (!refreshToken) {
    return { ok: false, source: "gmail", reason: "GMAIL_REFRESH_TOKEN is not set" };
  }
  const token = await refreshGoogleAccessToken(refreshToken);
  if (!token) {
    return { ok: false, source: "gmail", reason: "Could not refresh the Gmail access token" };
  }

  const page = await listGmailInbox(token.access_token, { maxResults: 25 });
  if (!page.ok) {
    return { ok: false, source: "gmail", reason: page.error ?? "Gmail list failed" };
  }

  const messages: InboundMessage[] = [];
  for (const id of page.ids) {
    const mapped = await fetchGmailMessage(token.access_token, id);
    if (mapped) messages.push(mapped);
  }
  return { ok: true, source: "gmail", messages };
}
