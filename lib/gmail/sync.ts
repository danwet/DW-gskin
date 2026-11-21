import "server-only";

import { buildAssessment, groupByConversation } from "../agent/build";
import { classifyConversation } from "../agent/classify";
import { loadAgentConfig, type ProviderId } from "../agent/config";
import { upsertAssessments } from "../agent/store";
import type { InboundMessage } from "../agent/types";
import { refreshGoogleAccessToken } from "../google-token";
import { fetchGmailMessage, listGmailInbox } from "./fetch";
import { reconcileGmailHistory } from "./history";
import {
  countUntriaged,
  getImportState,
  listThreadMessages,
  listUntriagedMessages,
  markThreadTriaged,
  saveMessages,
  updateImportState,
  type ImportPhase,
} from "./store";

export type SyncProgress = {
  phase: ImportPhase;
  imported: number;
  total: number | null;
  threadsImported: number;
  triaged: number;
  pending: number;
  lastError: string | null;
};

export type StepResult = {
  ok: boolean;
  step: "import" | "triage" | "idle" | "error";
  processed: number;
  progress: SyncProgress;
  error?: string;
};

const IMPORT_BATCH = 25;
const TRIAGE_BATCH = 3;

async function readProgress(userId: string): Promise<SyncProgress> {
  const state = await getImportState(userId);
  if (!state) {
    return { phase: "idle", imported: 0, total: null, threadsImported: 0, triaged: 0, pending: 0, lastError: null };
  }
  const active = state.phase === "importing" || state.phase === "triaging" || Boolean(state.pageToken);
  return {
    // A leftover page token means the mailbox was not fully walked; report it
    // as importing so the runner resumes instead of showing "done".
    phase: state.phase === "done" && state.pageToken ? "importing" : state.phase,
    imported: state.importedCount,
    total: state.totalEstimate,
    threadsImported: state.importedThreads,
    triaged: state.triagedCount,
    pending: active
      ? await countUntriaged(userId).catch(() => Math.max(state.importedThreads - state.triagedCount, 0))
      : 0,
    lastError: state.lastError,
  };
}

export async function getSyncProgress(userId: string): Promise<SyncProgress> {
  return readProgress(userId);
}

/**
 * One import batch: the next page of the inbox (newest first), stored message
 * by message. The page token lives in Supabase, so an interrupted import
 * continues instead of starting over.
 */
export async function importStep(userId: string, refreshToken: string): Promise<StepResult> {
  const state = await getImportState(userId);
  if (!state) {
    return { ok: false, step: "error", processed: 0, progress: await readProgress(userId), error: "Importstatus ontbreekt." };
  }
  const morePages = Boolean(state.pageToken);

  if (state.phase === "triaging" && !morePages) {
    return { ok: true, step: "idle", processed: 0, progress: await readProgress(userId) };
  }

  // After the first import, keep watching the newest page for new mail.
  if (state.phase === "done" && !morePages) {
    const token = await refreshGoogleAccessToken(refreshToken);
    if (!token) {
      return { ok: false, step: "error", processed: 0, progress: await readProgress(userId), error: "Gmail-token kon niet worden vernieuwd." };
    }
    const page = await listGmailInbox(token.access_token, { maxResults: IMPORT_BATCH });
    if (!page.ok) {
      await updateImportState(userId, { lastError: page.error ?? "Gmail-list mislukt." });
      return { ok: false, step: "error", processed: 0, progress: await readProgress(userId), error: page.error };
    }
    const messages: InboundMessage[] = [];
    for (const id of page.ids) {
      const mapped = await fetchGmailMessage(token.access_token, id);
      if (mapped) messages.push(mapped);
    }
    const saved = await saveMessages(userId, messages);
    await updateImportState(userId, {
      importedCount: state.importedCount + saved.newMessages,
      importedThreads: state.importedThreads + saved.newThreads,
      lastError: null,
    });
    return { ok: true, step: "import", processed: saved.newMessages, progress: await readProgress(userId) };
  }

  const token = await refreshGoogleAccessToken(refreshToken);
  if (!token) {
    await updateImportState(userId, { phase: "error", lastError: "Gmail-token kon niet worden vernieuwd." });
    return {
      ok: false,
      step: "error",
      processed: 0,
      progress: await readProgress(userId),
      error: "Gmail-token kon niet worden vernieuwd.",
    };
  }

  const page = await listGmailInbox(token.access_token, { pageToken: state.pageToken, maxResults: IMPORT_BATCH });
  if (!page.ok) {
    // A paused import leaves a stale page token; Gmail then rejects the page.
    // Restart the walk from the top (upserts dedupe) instead of getting stuck.
    if (state.pageToken) {
      await updateImportState(userId, {
        pageToken: null,
        phase: "importing",
        importedCount: 0,
        importedThreads: 0,
        lastError: null,
      });
      return { ok: true, step: "import", processed: 0, progress: await readProgress(userId) };
    }
    await updateImportState(userId, { phase: "error", lastError: page.error ?? "Gmail-list mislukt." });
    return { ok: false, step: "error", processed: 0, progress: await readProgress(userId), error: page.error };
  }

  const messages: InboundMessage[] = [];
  let missed = 0;
  for (const id of page.ids) {
    let mapped = await fetchGmailMessage(token.access_token, id);
    if (!mapped) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      mapped = await fetchGmailMessage(token.access_token, id);
    }
    if (mapped) messages.push(mapped);
    else missed += 1;
  }

  const saved = await saveMessages(userId, messages);
  const totalEstimate = Math.max(state.totalEstimate ?? 0, page.resultSizeEstimate ?? 0);

  // Stay on this page until every message is fetched, otherwise a rate limit
  // silently drops mail and the import reports "done" too early.
  if (missed > 0) {
    await updateImportState(userId, {
      phase: "importing",
      pageToken: state.pageToken ?? null,
      importedCount: state.importedCount + saved.newMessages,
      totalEstimate,
      importedThreads: state.importedThreads + saved.newThreads,
      lastError: `${missed} van ${page.ids.length} berichten niet opgehaald; opnieuw proberen.`,
    });
    return { ok: true, step: "import", processed: saved.saved, progress: await readProgress(userId) };
  }

  const done = !page.nextPageToken;
  await updateImportState(userId, {
    phase: done ? "triaging" : "importing",
    pageToken: page.nextPageToken,
    importedCount: state.importedCount + saved.saved,
    totalEstimate,
    importedThreads: state.importedThreads + saved.newThreads,
    lastError: null,
  });

  return { ok: true, step: "import", processed: saved.saved, progress: await readProgress(userId) };
}

/**
 * One triage batch: the newest not-yet-triaged conversations, classified with
 * the existing model config. Messages are marked triaged so a resume neither
 * repeats work nor creates duplicate cards.
 */
export async function triageStep(userId: string, ownerEmail?: string | null): Promise<StepResult> {
  const config = await loadAgentConfig().catch(() => null);
  const provider: ProviderId = config?.defaultProvider ?? "openai";
  const entry = config?.providers?.[provider];
  const apiKey = entry?.apiKey || undefined;
  const model = entry?.model || undefined;

  const untriaged = await listUntriagedMessages(userId, 200);
  if (untriaged.length === 0) {
    const state = await getImportState(userId);
    if (state && state.phase !== "done") await updateImportState(userId, { phase: "done" });
    return { ok: true, step: "idle", processed: 0, progress: await readProgress(userId) };
  }

  const grouped = groupByConversation(untriaged);
  const threads = Array.from(grouped.entries())
    .map(([conversationId, list]) => ({ conversationId, latest: list[list.length - 1] }))
    .sort((a, b) => Date.parse(b.latest.receivedAt) - Date.parse(a.latest.receivedAt))
    .slice(0, TRIAGE_BATCH);

  const updates = [];
  const errors: string[] = [];
  for (const thread of threads) {
    const threadId = thread.latest.threadId ?? thread.latest.id;
    const conversation = await listThreadMessages(userId, threadId);
    const target = conversation.length > 0 ? conversation : grouped.get(thread.conversationId) ?? [thread.latest];
    try {
      const draft = await classifyConversation(target, { provider, apiKey, model });
      updates.push(buildAssessment(target, draft, new Date(), "gmail", ownerEmail));
      await markThreadTriaged(userId, threadId);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Classificatie mislukt.");
    }
  }

  if (updates.length > 0) await upsertAssessments(updates);

  const state = await getImportState(userId);
  const currentPhase = state?.phase ?? "idle";
  const moreRemain = untriaged.length > threads.length;
  // While the import is still walking the mailbox it owns the phase; triage
  // must never move it forward, or the remaining pages would never be fetched.
  const stillImporting = currentPhase === "importing" || Boolean(state?.pageToken);
  const nextPhase: ImportPhase = stillImporting ? "importing" : moreRemain ? "triaging" : "done";
  await updateImportState(userId, {
    triagedCount: (state?.triagedCount ?? 0) + updates.length,
    phase: nextPhase,
    lastError: errors.length > 0 ? errors[0] : null,
  });

  return {
    ok: errors.length === 0,
    step: "triage",
    processed: updates.length,
    progress: await readProgress(userId),
    error: errors[0],
  };
}

/** One unit of work for the client runner: import a batch, then triage a batch. */
export async function syncStep(
  userId: string,
  refreshToken: string,
  ownerEmail?: string | null,
): Promise<{
  ok: boolean;
  imported: number;
  triaged: number;
  removed: number;
  progress: SyncProgress;
  error?: string;
}> {
  const state = await getImportState(userId);
  let imported = 0;
  let error: string | undefined;

  // First bring the store in line with Gmail: mail that was archived or
  // deleted elsewhere disappears before anything new is imported.
  const reconcile = await reconcileGmailHistory(userId, refreshToken).catch(() => null);

  const morePages = Boolean(state?.pageToken);
  // A pending page token means the mailbox is not fully walked yet, even when
  // the phase says "done" — resume the import in that case.
  if (!state || state.phase === "idle" || state.phase === "importing" || morePages) {
    const step = await importStep(userId, refreshToken);
    imported = step.processed;
    if (!step.ok) error = step.error;
  }

  const triage = await triageStep(userId, ownerEmail);
  if (!triage.ok && !error) error = triage.error;

  return {
    ok: !error,
    imported,
    triaged: triage.processed,
    removed: reconcile?.removed ?? 0,
    progress: await readProgress(userId),
    error,
  };
}
