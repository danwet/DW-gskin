import { cookies } from "next/headers";

import { sessionUser, unauthorized } from "@/lib/api-auth";
import { saveGmailConnection } from "@/lib/gmail/connection";
import { startImport } from "@/lib/gmail/store";
import {
  GMAIL_STATE_COOKIE,
  checkGmailScopes,
  exchangeGmailCode,
  fetchGmailProfileEmail,
} from "@/lib/gmail/oauth";
import { updateMeta } from "@/lib/agent/store";

export const dynamic = "force-dynamic";

function back(origin: string, status: string, reason?: string) {
  const url = new URL("/", origin);
  url.searchParams.set("gmail", status);
  if (reason) url.searchParams.set("reason", reason);
  return Response.redirect(url, 303);
}

/** Completes the read-only Gmail consent flow and stores the encrypted token. */
export async function GET(request: Request) {
  const user = await sessionUser();
  if (!user) return unauthorized();

  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const denied = url.searchParams.get("error");

  const jar = await cookies();
  const stored = jar.get(GMAIL_STATE_COOKIE)?.value ?? "";
  jar.delete(GMAIL_STATE_COOKIE);

  if (denied) return back(origin, "denied");
  if (!code || !state) return back(origin, "state_error");
  if (stored !== `${user.id}:${state}`) return back(origin, "state_error");

  let tokens: Awaited<ReturnType<typeof exchangeGmailCode>>;
  try {
    tokens = await exchangeGmailCode(origin, code);
  } catch (error) {
    console.error("[gmail] token exchange failed:", error instanceof Error ? error.message : error);
    return back(origin, "exchange_error");
  }

  // Refuse broader Gmail grants, even when Google returns previously
  // granted scopes alongside the read-only one.
  const scope = checkGmailScopes(tokens.scopes);
  if (!scope.ok) return back(origin, "scope_rejected", scope.reason);

  if (!tokens.refreshToken) return back(origin, "no_refresh_token");

  const email = await fetchGmailProfileEmail(tokens.refreshToken);
  if (!email) return back(origin, "profile_error");

  try {
    await saveGmailConnection({
      userId: user.id,
      email,
      refreshToken: tokens.refreshToken,
      scopes: tokens.scopes,
    });

    // A fresh connection clears the old failure, so the dashboard stops showing
    // "koppel opnieuw" while everything is fine.
    await updateMeta({ lastError: null }).catch(() => null);

    // Queue the first full inbox import; the dashboard runner picks it up.
    await startImport(user.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    console.error("[gmail] storing the connection failed:", message);
    if (/does not exist|schema cache|PGRST205|42P01/i.test(message)) {
      return back(origin, "db_missing");
    }
    return back(origin, "save_error", message.slice(0, 180));
  }

  return back(origin, "connected");
}
