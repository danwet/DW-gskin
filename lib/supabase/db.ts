import "server-only";

import { requireSupabase } from "./kv";

/**
 * Service-role Supabase client for table access. Loaded lazily so plain-Node
 * tooling (the agent verification harness) never imports `@supabase/supabase-js`.
 */
export async function dbClient() {
  requireSupabase();
  const { createServerSupabaseClient } = await import("./client");
  const client = createServerSupabaseClient();
  if (!client) throw new Error("Supabase is niet geconfigureerd.");
  return client;
}
