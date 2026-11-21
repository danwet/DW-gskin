import { supabaseProbe, supabaseScanBucketReady } from "@/lib/supabase/kv";
import { gmailCallbackUri } from "@/lib/gmail/oauth";

export const dynamic = "force-dynamic";

/**
 * Public, read-only diagnostic. Reports booleans (never secrets) plus the
 * exact Gmail redirect URI, so the Google Cloud registration can be verified.
 */
export async function GET(request: Request) {
  const supabase = await supabaseProbe();
  return Response.json({
    gmailRedirectUri: gmailCallbackUri(new URL(request.url).origin),
    // Marker so a deploy can be verified from the outside.
    pdfAttachments: true,
    ok: true,
    env: {
      supabaseUrlFromServer: Boolean(process.env.SUPABASE_URL?.trim()),
      supabaseUrlFromPublic: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()),
      supabaseServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
      cronSecret: Boolean(process.env.CRON_SECRET?.trim()),
      authSecret: Boolean(process.env.AUTH_SECRET?.trim()),
      authGoogleId: Boolean(process.env.AUTH_GOOGLE_ID?.trim()),
      authGoogleSecret: Boolean(process.env.AUTH_GOOGLE_SECRET?.trim()),
      gmailTokenSecret: Boolean(process.env.GMAIL_TOKEN_SECRET?.trim()),
    },
    supabase,
    scanBucketReady: await supabaseScanBucketReady(),
  });
}
