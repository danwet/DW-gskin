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

  if (error || !data) throw new Error("Gmail-koppeling kon niet worden opgeslagen.");
  return toConnection(data as Row);
}

export async function getGmailConnection(userId: string): Promise<GmailConnection | null> {
  const row = await readRow(userId);
  return row ? toConnection(row) : null;
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
  const supabase = await dbClient();
  const { data, error } = await supabase
    .from("dw_gmail_connections")
    .select("*")
    .eq("status", "connected")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Row;
  try {
    return { userId: row.user_id, email: row.email, refreshToken: decryptSecret(row.refresh_token_encrypted) };
  } catch {
    return null;
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
