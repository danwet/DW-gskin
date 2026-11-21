import { sessionUser, unauthorized } from "@/lib/api-auth";
import { getGmailRefreshToken, resolveGmailConnection } from "@/lib/gmail/connection";
import { getSyncProgress, syncStep } from "@/lib/gmail/sync";
import { startImport } from "@/lib/gmail/store";
import { updateMeta } from "@/lib/agent/store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  const user = await sessionUser();
  if (!user) return unauthorized();
  return Response.json({ progress: await getSyncProgress(user.id) });
}

/**
 * One step of the import/triage loop. The client repeats this until the phase
 * is `done`; every step is resumable because the cursor lives in Supabase.
 */
export async function POST() {
  const user = await sessionUser();
  if (!user) return unauthorized();

  await resolveGmailConnection(user.id, user.email).catch(() => null);
  const refreshToken = await getGmailRefreshToken(user.id);
  if (!refreshToken) {
    return Response.json({ error: "Gmail is nog niet gekoppeld." }, { status: 400 });
  }

  const state = await getSyncProgress(user.id);
  if (state.phase === "idle" || state.phase === "error") {
    await startImport(user.id);
  }

  try {
    const result = await syncStep(user.id, refreshToken);
    // Keep the visible "last sync" honest while the import/triage loop runs.
    const now = new Date().toISOString();
    await updateMeta(
      result.ok
        ? { lastRunAt: now, lastSuccessfulRunAt: now, lastError: null }
        : { lastRunAt: now, lastError: result.error ?? "Synchronisatie mislukt." },
    ).catch(() => {});
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Synchronisatie mislukt.";
    return Response.json({ error: message }, { status: 503 });
  }
}
