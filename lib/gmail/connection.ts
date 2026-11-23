import "server-only";

import { dbClient } from "../supabase/db";
import { decryptSecret, encryptSecret } from "../token-crypto";

export type GmailConnectionStatus = "connected" | "needs_reconnect";

export type GmailConnection = {
  userId: string;
  email: string;
  scopes: string[];
  status: GmailConnectionStatus;
  connectedAt: string;
  lastCheckedAt: string | null;
};

type Row = {
  user_id: string;
  email: string;
  refresh_token_encrypted: string;
  scopes: string;
  status: GmailConnectionStatus;
  connected_at: string;
  last_checked_at: string | null;
};

function toConnection(row: Row): GmailConnection {
  return {
    userId: row.user_id,
    email: row.email,
    scopes: row.scopes ? row.scopes.split(" ").filter(Boolean) : [],
    status: row.status,
    connectedAt: row.connected_at,
    lastCheckedAt: row.last_checked_at,
  };
}

async function readRow(userId: string): Promise<Row | null> {
  const supabase = await dbClient();
  const { data, error } = await supabase
    .from("dw_gmail_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Gmail-koppeling kon niet worden gelezen.");
  return (data as Row | null) ?? null;
}

export async function saveGmailConnection(input: {
  userId: string;
  email: string;
  /** A new refresh token, or null to keep the stored one. */
  refreshToken: string | null;
  scopes: string[];
}): Promise<GmailConnection> {
  const supabase = await dbClient();

  let encrypted = input.refreshToken ? encryptSecret(input.refreshToken) : "";
  if (!encrypted) {
    const existing = await readRow(input.userId);
    if (!existing) throw new Error("Geen bestaande Gmail-koppeling gevonden om te hergebruiken.");
    encrypted = existing.refresh_token_encrypted;
  }

  const { data, error } = await supabase
    .from("dw_gmail_connections")
    .upsert({
      user_id: input.userId,
      email: input.email,
      refresh_token_encrypted: encrypted,
      scopes: input.scopes.join(" "),
      status: "connected",
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) throw new Error(`Gmail-koppeling kon niet worden opgeslagen: ${error.message} (${error.code ?? "?"})`);
  if (!data) throw new Error("Gmail-koppeling kon niet worden opgeslagen: geen rij terug.");
  return toConnection(data as Row);
}

export async function getGmailConnection(userId: string): Promise<GmailConnection | null> {
  const row = await readRow(userId);
  return row ? toConnection(row) : null;
}

/**
 * Zelfde sleutel als getGmailRefreshToken, maar met de reden erbij: "koppel
 * opnieuw" is alleen juist als de koppeling echt weg is, niet als de sleutel
 * hier niet past.
 */
export type RefreshTokenState =
  | { ok: true; token: string }
  | { ok: false; reason: "no-row" | "needs-reconnect" | "decrypt" | "read" };

export async function gmailRefreshTokenState(userId: string): Promise<RefreshTokenState> {
  let row: Row | null;
  try {
    row = await readRow(userId);
  } catch {
    return { ok: false, reason: "read" };
  }
  if (!row) return { ok: false, reason: "no-row" };
  if (row.status !== "connected") return { ok: false, reason: "needs-reconnect" };
  try {
    return { ok: true, token: decryptSecret(row.refresh_token_encrypted) };
  } catch {
    return { ok: false, reason: "decrypt" };
  }
}

export async function getGmailRefreshToken(userId: string): Promise<string | null> {
  const row = await readRow(userId);
  if (!row || row.status !== "connected") return null;
  try {
    return decryptSecret(row.refresh_token_encrypted);
  } catch {
    return null;
  }
}

/** The connection used by the background run, which has no user session. */
export async function getActiveGmailRefreshToken(): Promise<{
  userId: string;
  email: string;
  refreshToken: string;
} | null> {
  const result = await readActiveGmailConnection();
  return result.ok ? { userId: result.userId, email: result.email, refreshToken: result.refreshToken } : null;
}

/**
 * Why a run has no usable connection. Guessing "koppel opnieuw" while the mail
 * was merely unreadable sends people through a pointless reconnect.
 */
export type ActiveConnectionResult =
  | { ok: true; userId: string; email: string; refreshToken: string }
  | { ok: false; reason: "no-row" | "read-error" | "decrypt-error"; detail?: string };

export async function readActiveGmailConnection(): Promise<ActiveConnectionResult> {
  const supabase = await dbClient();

  let attempt = await supabase
    .from("dw_gmail_connections")
    .select("*")
    .eq("status", "connected")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // A single retry absorbs a hiccup on the database side.
  if (attempt.error) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    attempt = await supabase
      .from("dw_gmail_connections")
      .select("*")
      .eq("status", "connected")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
  }

  if (attempt.error) return { ok: false, reason: "read-error", detail: attempt.error.message };
  if (!attempt.data) return { ok: false, reason: "no-row" };

  const row = attempt.data as Row;
  try {
    return { ok: true, userId: row.user_id, email: row.email, refreshToken: decryptSecret(row.refresh_token_encrypted) };
  } catch (error) {
    return {
      ok: false,
      reason: "decrypt-error",
      detail: error instanceof Error ? error.message : undefined,
    };
  }
}

export async function markGmailNeedsReconnect(userId: string): Promise<void> {
  const supabase = await dbClient();
  await supabase
    .from("dw_gmail_connections")
    .update({ status: "needs_reconnect", updated_at: new Date().toISOString() })
    .eq("user_id", userId);
}

export async function touchGmailConnection(userId: string): Promise<void> {
  const supabase = await dbClient();
  await supabase
    .from("dw_gmail_connections")
    .update({ last_checked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("user_id", userId);
}

export async function deleteGmailConnection(userId: string): Promise<void> {
  const supabase = await dbClient();
  await supabase.from("dw_gmail_connections").delete().eq("user_id", userId);
}

/**
 * Finds the connection for this user, adopting a legacy row that was created
 * under an older session id (the JWT subject used to change per sign-in).
 */
export async function resolveGmailConnection(userId: string, email: string): Promise<GmailConnection | null> {
  const direct = await getGmailConnection(userId);
  if (direct) return direct;
  if (!email) return null;

  const supabase = await dbClient();
  const { data } = await supabase
    .from("dw_gmail_connections")
    .select("*")
    .eq("email", email)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;

  const row = data as Row;
  const { error } = await supabase
    .from("dw_gmail_connections")
    .update({ user_id: userId, updated_at: new Date().toISOString() })
    .eq("user_id", row.user_id);
  if (error) return toConnection(row);

  await supabase.from("dw_gmail_imports").update({ user_id: userId }).eq("user_id", row.user_id);
  await supabase.from("dw_gmail_messages").update({ user_id: userId }).eq("user_id", row.user_id);
  return { ...toConnection(row), userId };
}

/** True when a connection row exists, even if its token cannot be read here. */
export async function hasGmailConnection(): Promise<boolean> {
  const supabase = await dbClient();
  const { count } = await supabase
    .from("dw_gmail_connections")
    .select("*", { count: "exact", head: true });
  return (count ?? 0) > 0;
}
