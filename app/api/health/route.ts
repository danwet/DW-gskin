import { supabaseProbe, supabaseScanBucketReady } from "@/lib/supabase/kv";

export const dynamic = "force-dynamic";

/**
 * Public, read-only diagnostic. Reports only booleans (never values) so the
 * deployment's effective environment can be checked from the outside.
 */
export async function GET() {
  const supabase = await supabaseProbe();
  return Response.json({
    ok: true,
    env: {
      supabaseUrlFromServer: Boolean(process.env.SUPABASE_URL?.trim()),
      supabaseUrlFromPublic: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()),
      supabaseServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
      cronSecret: Boolean(process.env.CRON_SECRET?.trim()),
      authSecret: Boolean(process.env.AUTH_SECRET?.trim()),
      authGoogleId: Boolean(process.env.AUTH_GOOGLE_ID?.trim()),
      authGoogleSecret: Boolean(process.env.AUTH_GOOGLE_SECRET?.trim()),
    },
    supabase,
    scanBucketReady: await supabaseScanBucketReady(),
  });
}
