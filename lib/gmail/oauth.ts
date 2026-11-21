import "server-only";

import { refreshGoogleAccessToken } from "../google-token";

export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const GMAIL_CALLBACK_PATH = "/api/gmail/callback";
export const GMAIL_STATE_COOKIE = "gskin_gmail_state";

/** Anything under these prefixes counts as a Gmail grant. */
const GMAIL_SCOPE_PREFIXES = ["https://www.googleapis.com/auth/gmail.", "https://mail.google.com/"];

export function gmailOAuthConfigured(): boolean {
  return Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
}

export function gmailCallbackUri(origin: string): string {
  return `${origin.replace(/\/$/, "")}${GMAIL_CALLBACK_PATH}`;
}

/** Separate consent screen: only gmail.readonly, offline access for the background run. */
export function gmailAuthUrl(origin: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.AUTH_GOOGLE_ID ?? "",
    redirect_uri: gmailCallbackUri(origin),
    response_type: "code",
    scope: GMAIL_READONLY_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export type ScopeCheck = { ok: true } | { ok: false; reason: string };

/**
 * The connection is only usable when gmail.readonly was granted and no broader
 * Gmail scope came along (Google can return previously granted scopes).
 */
export function checkGmailScopes(granted: string[]): ScopeCheck {
  const gmailScopes = granted.filter((scope) => GMAIL_SCOPE_PREFIXES.some((prefix) => scope.startsWith(prefix)));
  if (!gmailScopes.includes(GMAIL_READONLY_SCOPE)) {
    return { ok: false, reason: "De alleen-lezen Gmail-scope (gmail.readonly) is niet verleend." };
  }
  const broader = gmailScopes.filter((scope) => scope !== GMAIL_READONLY_SCOPE);
  if (broader.length > 0) {
    return { ok: false, reason: `Er zijn ruimere Gmail-rechten verleend: ${broader.join(", ")}.` };
  }
  return { ok: true };
}

export type GmailTokenExchange = {
  refreshToken: string | null;
  scopes: string[];
};

export async function exchangeGmailCode(origin: string, code: string): Promise<GmailTokenExchange> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID ?? "",
      client_secret: process.env.AUTH_GOOGLE_SECRET ?? "",
      code,
      grant_type: "authorization_code",
      redirect_uri: gmailCallbackUri(origin),
    }),
  });
  if (!response.ok) throw new Error(`Google token exchange mislukt (${response.status}).`);
  const data = (await response.json().catch(() => null)) as { refresh_token?: string; scope?: string } | null;
  if (!data) throw new Error("Google gaf geen bruikbaar tokenantwoord.");
  return {
    refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : null,
    scopes: typeof data.scope === "string" ? data.scope.split(" ").filter(Boolean) : [],
  };
}

/** Which Gmail account did the user authorise? Read via gmail.readonly itself. */
export async function fetchGmailProfileEmail(refreshToken: string): Promise<string | null> {
  const token = await refreshGoogleAccessToken(refreshToken);
  if (!token) return null;
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!response.ok) return null;
  const data = (await response.json().catch(() => null)) as { emailAddress?: string } | null;
  return data?.emailAddress ?? null;
}
