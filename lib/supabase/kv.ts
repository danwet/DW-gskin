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

export function supabaseAvailable(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Supabase is the only persistent store. Callers throw this instead of silently
 * falling back to local files, so a misconfiguration is visible immediately.
 */
export function requireSupabase(): void {
  if (!supabaseAvailable()) {
    throw new Error(
      "Supabase is niet geconfigureerd. Zet NEXT_PUBLIC_SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY in .env.local én in Vercel.",
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

const SCAN_BUCKET = process.env.SUPABASE_SCAN_BUCKET?.trim() || "scanned-invoices";

export type SupabaseProbe = {
  configured: boolean;
  agentStateReady: boolean;
  userStateReady: boolean;
  settingsReady: boolean;
};

/** Checks whether the three JSON tables are actually reachable (they must be created by the SQL migration). */
export async function supabaseProbe(): Promise<SupabaseProbe> {
  if (!supabaseAvailable()) {
    return { configured: false, agentStateReady: false, userStateReady: false, settingsReady: false };
  }
  const [agent, user, settings] = await Promise.all([
    supabaseReadJson("dw_agent_state", "id", "singleton"),
    supabaseReadJson("dw_user_state", "user_id", "__probe__"),
    supabaseReadJson("dw_agent_settings", "id", "singleton"),
  ]);
  return {
    configured: true,
    agentStateReady: agent.ok,
    userStateReady: user.ok,
    settingsReady: settings.ok,
  };
}

/** Uploads a scanned invoice to Supabase Storage; false when unavailable or the bucket is missing. */
export async function supabaseUploadScan(name: string, buffer: Buffer, mime: string): Promise<boolean> {
  const client = await loadClient();
  if (!client) return false;
  const { error } = await client.storage.from(SCAN_BUCKET).upload(name, buffer, {
    contentType: mime,
    upsert: true,
  });
  return !error;
}

/** Downloads a scanned invoice from Supabase Storage; null when unavailable or not found. */
export async function supabaseDownloadScan(name: string): Promise<Buffer | null> {
  const client = await loadClient();
  if (!client) return null;
  const { data, error } = await client.storage.from(SCAN_BUCKET).download(name);
  if (error || !data) return null;
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
