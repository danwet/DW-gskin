import { sessionUser, unauthorized } from "@/lib/api-auth";
import { getGmailRefreshToken, resolveGmailConnection } from "@/lib/gmail/connection";
import { getSyncProgress, syncStep, triageStep } from "@/lib/gmail/sync";
import { startImport } from "@/lib/gmail/store";
import { readMeta, updateMeta } from "@/lib/agent/store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  const user = await sessionUser();
  if (!user) return unauthorized();
  const meta = await readMeta().catch(() => null);
  return Response.json({ progress: await getSyncProgress(user.id), lastRunAt: meta?.lastRunAt ?? null });
}

/**
 * One step of the import/triage loop. The client repeats this until the phase
 * is `done`; every step is resumable because the cursor lives in Supabase.
 */
export async function POST() {
  const user = await sessionUser();
  if (!user) return unauthorized();

  const connection = await resolveGmailConnection(user.id, user.email).catch(() => null);
  const refreshToken = await getGmailRefreshToken(user.id);
  if (!refreshToken) {
    // No usable token (e.g. local dev): still judge what is already stored,
    // since triage never touches Gmail.
    try {
      const triage = await triageStep(user.id, user.email);
      return Response.json({
        ok: true,
        step: "triage",
        processed: triage.processed,
        imported: 0,
        removed: 0,
        autoArchived: 0,
        progress: await getSyncProgress(user.id),
        note: "Alleen beoordeeld; Gmail is op deze omgeving niet gekoppeld.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Beoordelen mislukt.";
      return Response.json({ error: message }, { status: 503 });
    }
  }

  const state = await getSyncProgress(user.id);
  if (state.phase === "idle" || state.phase === "error") {
    await startImport(user.id);
  }

  try {
    // Do as much as fits in one request instead of one step per round trip: a
    // short-lived tab then still finishes, and the loop is far less chatty.
    const deadline = Date.now() + 45_000;
    let result = await syncStep(user.id, refreshToken, connection?.email ?? user.email);
    let imported = result.imported;
    let triaged = result.triaged;
    let removed = result.removed;
    let autoArchived = result.autoArchived;

    while (Date.now() < deadline && (result.progress.phase === "importing" || result.progress.phase === "triaging")) {
      result = await syncStep(user.id, refreshToken, connection?.email ?? user.email);
      imported += result.imported;
      triaged += result.triaged;
      removed += result.removed;
      autoArchived += result.autoArchived;
      if (!result.ok && result.error) break;
    }

    result = { ...result, imported, triaged, removed, autoArchived };
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
