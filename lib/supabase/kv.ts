import "server-only";

/**
 * Supabase-backed JSON document storage, used to replace the local `data/`
 * files when Supabase is configured (Vercel production). When the service-role
 * credentials are absent (local dev without Supabase), the callers fall back to
 * their existing file-based stores.
 *
 * The Supabase client is imported lazily so that plain-Node tooling (the agent
 * verification harness) never has to load `@supabase/supabase-js`.
 */

export function supabaseUrl(): string | undefined {
  return process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || undefined;
}

export function supabaseServiceKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || undefined;
}

export function supabaseAvailable(): boolean {
  return Boolean(supabaseUrl() && supabaseServiceKey());
}

/**
 * Supabase is the only persistent store. Callers throw this instead of silently
 * falling back to local files, so a misconfiguration is visible immediately.
 */
export function requireSupabase(): void {
  if (!supabaseAvailable()) {
    throw new Error(
      "Supabase is niet geconfigureerd. Zet NEXT_PUBLIC_SUPABASE_URL (of SUPABASE_URL) en SUPABASE_SERVICE_ROLE_KEY in .env.local én in Vercel.",
    );
  }
}

/** Thrown when Supabase is configured but the expected table is missing. */
export function missingTableError(table: string): Error {
  return new Error(
    `Supabase-tabel "${table}" is niet bereikbaar. Draai supabase/migrate-nextauth.sql in de Supabase SQL Editor.`,
  );
}

export type JsonTable = "dw_agent_state" | "dw_user_state" | "dw_agent_settings";
export type IdColumn = "id" | "user_id";

export type ReadDoc =
  | { ok: false } // Supabase unavailable — caller should use its file fallback
  | { ok: true; value: unknown | null }; // read succeeded; value is null when no row exists

async function loadClient() {
  if (!supabaseAvailable()) return null;
  const { createServerSupabaseClient } = await import("./client");
  return createServerSupabaseClient();
}

export async function supabaseReadJson(
  table: JsonTable,
  idColumn: IdColumn,
  idValue: string,
): Promise<ReadDoc> {
  const client = await loadClient();
  if (!client) return { ok: false };
  const { data, error } = await client
    .from(table)
    .select("data")
    .eq(idColumn, idValue)
    .maybeSingle();
  if (error) return { ok: false };
  const row = data as { data?: unknown } | null;
  return { ok: true, value: row?.data ?? null };
}

export async function supabaseWriteJson(
  table: JsonTable,
  idColumn: IdColumn,
  idValue: string,
  doc: unknown,
): Promise<boolean> {
  const client = await loadClient();
  if (!client) return false;
  const { error } = await client.from(table).upsert({
    [idColumn]: idValue,
    data: doc,
    updated_at: new Date().toISOString(),
  });
  return !error;
}

export function scanBucket(): string {
  return process.env.SUPABASE_SCAN_BUCKET?.trim() || "Scans";
}

/** True when the scan storage bucket exists and is reachable with the service-role key. */
export async function supabaseScanBucketReady(): Promise<boolean> {
  const client = await loadClient();
  if (!client) return false;
  const { error } = await client.storage.from(scanBucket()).list("", { limit: 1 });
  return !error;
}

export type SupabaseProbe = {
  configured: boolean;
  missing: string[];
  agentStateReady: boolean;
  userStateReady: boolean;
  settingsReady: boolean;
  gmailReady: boolean;
};

async function tableReady(table: string): Promise<boolean> {
  const client = await loadClient();
  if (!client) return false;
  const { error } = await client.from(table).select("*").limit(1);
  return !error;
}

/** Checks which credentials are missing and whether the three JSON tables are reachable. */
export async function supabaseProbe(): Promise<SupabaseProbe> {
  const missing: string[] = [];
  if (!supabaseUrl()) missing.push("NEXT_PUBLIC_SUPABASE_URL (of SUPABASE_URL)");
  if (!supabaseServiceKey()) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length > 0) {
    return {
      configured: false,
      missing,
      agentStateReady: false,
      userStateReady: false,
      settingsReady: false,
      gmailReady: false,
    };
  }
  const [agent, user, settings, gmailConnections, gmailMessages, gmailImports, actionProposals] =
    await Promise.all([
      supabaseReadJson("dw_agent_state", "id", "singleton"),
      supabaseReadJson("dw_user_state", "user_id", "__probe__"),
      supabaseReadJson("dw_agent_settings", "id", "singleton"),
      tableReady("dw_gmail_connections"),
      tableReady("dw_gmail_messages"),
      tableReady("dw_gmail_imports"),
      tableReady("dw_action_proposals"),
    ]);
  return {
    configured: true,
    missing: [],
    agentStateReady: agent.ok,
    userStateReady: user.ok,
    settingsReady: settings.ok,
    gmailReady: gmailConnections && gmailMessages && gmailImports && actionProposals,
  };
}

/** Uploads a scanned invoice to Supabase Storage; false when unavailable or the bucket is missing. */
export async function supabaseUploadScan(name: string, buffer: Buffer, mime: string): Promise<boolean> {
  const client = await loadClient();
  if (!client) return false;
  const { error } = await client.storage.from(scanBucket()).upload(name, buffer, {
    contentType: mime,
    upsert: true,
  });
  return !error;
}

/** Downloads a scanned invoice from Supabase Storage; null when unavailable or not found. */
export async function supabaseDownloadScan(name: string): Promise<Buffer | null> {
  const client = await loadClient();
  if (!client) return null;
  const { data, error } = await client.storage.from(scanBucket()).download(name);
  if (error || !data) return null;
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
