import { sessionUser, unauthorized } from "@/lib/api-auth";
import { runMailAgent } from "@/lib/agent/pipeline";
import { readAssessments, readMeta } from "@/lib/agent/store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Manual sync from the dashboard. Runs the mail agent (incremental, so a run
 * with nothing new costs no model calls) and returns the refreshed cards.
 */
export async function POST() {
  const user = await sessionUser();
  if (!user) return unauthorized();

  try {
    const result = await runMailAgent();
    const [items, meta] = await Promise.all([readAssessments(), readMeta()]);
    return Response.json({
      ok: result.ok,
      processed: result.processed,
      skipped: result.skipped ?? 0,
      note: result.note ?? null,
      items,
      meta,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync mislukt.";
    return Response.json({ error: message }, { status: 503 });
  }
}
