import "server-only";

import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import { missingTableError, requireSupabase, supabaseReadJson, supabaseWriteJson } from "../supabase/kv";
import type { AgentMeta, MailAssessment, RunRecord } from "./types";

type AgentState = {
  assessments: Record<string, MailAssessment>;
  meta: AgentMeta;
};

const EMPTY_META: AgentMeta = {
  lastRunAt: null,
  lastSuccessfulRunAt: null,
  lastError: null,
  source: "fixtures",
  model: "rule",
  conversationsProcessed: 0,
  messagesSeen: 0,
  runs: [],
};

let directoryOverride: string | null = null;

export function setAgentStoreDirectoryForTests(dir: string | null) {
  directoryOverride = dir;
}

function directory() {
  return directoryOverride ?? path.join(process.cwd(), "data", "agent");
}

function stateFile() {
  return path.join(directory(), "state.json");
}

let lock: Promise<unknown> = Promise.resolve();

function withLock<T>(task: () => Promise<T>): Promise<T> {
  const run = lock.then(task, task);
  lock = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function parseState(raw: unknown): AgentState {
  const parsed = (raw ?? {}) as Partial<AgentState>;
  const assessments: Record<string, MailAssessment> = {};
  if (parsed.assessments && typeof parsed.assessments === "object") {
    for (const [key, value] of Object.entries(parsed.assessments)) {
      if (value && typeof value === "object") assessments[key] = value as MailAssessment;
    }
  }
  return {
    assessments,
    meta: parsed.meta ? { ...EMPTY_META, ...parsed.meta } : { ...EMPTY_META },
  };
}

async function readStateFromFile(): Promise<AgentState> {
  try {
    const raw = await readFile(stateFile(), "utf8");
    return parseState(JSON.parse(raw));
  } catch {
    return { assessments: {}, meta: { ...EMPTY_META } };
  }
}

async function writeStateToFile(state: AgentState): Promise<void> {
  try {
    const folder = directory();
    await mkdir(folder, { recursive: true });
    const target = stateFile();
    const temp = `${target}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(state), "utf8");
    await rename(temp, target);
  } catch {
    // Read-only filesystems (e.g. Vercel without Supabase) should not crash the request.
  }
}

async function readState(): Promise<AgentState> {
  // The verification harness sets an explicit directory; everything else must use Supabase.
  if (directoryOverride !== null) return readStateFromFile();
  requireSupabase();
  const doc = await supabaseReadJson("dw_agent_state", "id", "singleton");
  if (!doc.ok) throw missingTableError("dw_agent_state");
  return parseState(doc.value);
}

async function writeState(state: AgentState): Promise<void> {
  if (directoryOverride !== null) {
    await writeStateToFile(state);
    return;
  }
  requireSupabase();
  const written = await supabaseWriteJson("dw_agent_state", "id", "singleton", state);
  if (!written) throw missingTableError("dw_agent_state");
}

export function readAssessments(): Promise<MailAssessment[]> {
  return withLock(async () => Object.values((await readState()).assessments));
}

export function readAssessment(conversationId: string): Promise<MailAssessment | null> {
  return withLock(async () => (await readState()).assessments[conversationId] ?? null);
}

/** Finds an existing invoice (mail or scan) that matches the same invoice number, or supplier + number. */
export function findInvoiceDuplicate(supplier: string, invoiceNumber: string): Promise<MailAssessment | null> {
  return withLock(async () => {
    const number = invoiceNumber.trim().toLowerCase();
    if (!number) return null;
    const supplierNorm = supplier.trim().toLowerCase();
    const state = await readState();
    for (const item of Object.values(state.assessments)) {
      if (!item.invoice) continue;
      const itemNumber = (item.invoice.invoiceNumber ?? "").trim().toLowerCase();
      if (itemNumber && itemNumber === number) return item;
      const itemSupplier = (item.invoice.supplier ?? item.from ?? "").trim().toLowerCase();
      if (supplierNorm && itemSupplier && itemNumber === number && itemSupplier === supplierNorm) return item;
    }
    return null;
  });
}

/** Attaches a scan (and its owner) to an already-existing invoice, without creating a duplicate. */
export function attachScanToAssessment(
  conversationId: string,
  scan: { scanFileName: string; scanFilePath: string; scanMime: string; ownerId?: string },
): Promise<MailAssessment | null> {
  return withLock(async () => {
    const state = await readState();
    const existing = state.assessments[conversationId];
    if (!existing) return null;
    existing.source = "scan";
    existing.scanFileName = scan.scanFileName;
    existing.scanFilePath = scan.scanFilePath;
    existing.scanMime = scan.scanMime;
    if (scan.ownerId) existing.ownerId = scan.ownerId;
    existing.updatedAt = new Date().toISOString();
    await writeState(state);
    return existing;
  });
}

/** Assessments and meta from a single read, for the inbox first paint. */
export function restoreAssessment(item: MailAssessment): Promise<void> {
  return withLock(async () => {
    const state = await readState();
    state.assessments[item.conversationId] = item;
    await writeState(state);
  });
}

export function markArchivedByAgent(conversationIds: string[]): Promise<void> {
  if (conversationIds.length === 0) return Promise.resolve();
  return withLock(async () => {
    const state = await readState();
    const now = new Date().toISOString();
    let changed = false;
    for (const id of conversationIds) {
      const item = state.assessments[id];
      if (item && !item.archivedAt) {
        item.archivedAt = now;
        changed = true;
      }
    }
    if (changed) await writeState(state);
  });
}

export function applyArchiveCleanup(opts: {
  conversationId: string;
  action: "archive" | "trash";
  messageIds: string[];
  assessment: MailAssessment;
}): Promise<void> {
  return withLock(async () => {
    const state = await readState();

    // Undo snapshot, so the action can be reversed later.
    state.meta.lastAction = {
      conversationId: opts.conversationId,
      action: opts.action,
      messageIds: opts.messageIds,
      assessment: opts.assessment,
      at: new Date().toISOString(),
    };

    // Drop this card and every other card that points at the same messages.
    const targets = new Set<string>([opts.conversationId]);
    for (const [key, item] of Object.entries(state.assessments)) {
      if (item.sourceMessageId && opts.messageIds.includes(item.sourceMessageId)) targets.add(key);
    }
    for (const key of targets) delete state.assessments[key];

    await writeState(state);
  });
}

export function removeAssessments(conversationIds: string[]): Promise<void> {
  if (conversationIds.length === 0) return Promise.resolve();
  return withLock(async () => {
    const state = await readState();
    let changed = false;
    for (const id of conversationIds) {
      if (state.assessments[id]) {
        delete state.assessments[id];
        changed = true;
      }
    }
    if (changed) await writeState(state);
  });
}

export function readStateOnce(): Promise<{ assessments: MailAssessment[]; meta: AgentMeta }> {
  return withLock(async () => {
    const state = await readState();
    return { assessments: Object.values(state.assessments), meta: state.meta };
  });
}

export function readMeta(): Promise<AgentMeta> {
  return withLock(async () => (await readState()).meta);
}

/**
 * Merge the latest successful assessment per conversation. Repeated runs never
 * create duplicate cards; a failed run simply never reaches this function, so
 * prior assessments stay untouched.
 */
export function upsertAssessments(updates: MailAssessment[]): Promise<MailAssessment[]> {
  return withLock(async () => {
    const state = await readState();
    const next: MailAssessment[] = [];
    for (const update of updates) {
      const existing = state.assessments[update.conversationId];
      if (existing) {
        const isNewMessage = update.sourceMessageId !== existing.sourceMessageId;
        // A manual "afgehandeld" choice always survives a re-run.
        update.handledByUser = existing.handledByUser;
        update.handledAt = existing.handledAt;
        update.snoozedUntil = isNewMessage ? undefined : existing.snoozedUntil;
        if (!isNewMessage) {
          update.needsAttention = existing.needsAttention;
          update.attentionReason = existing.attentionReason;
        } else if (existing.handledByUser) {
          update.needsAttention = true;
          update.attentionReason = update.attentionReason ?? "Nieuw bericht in dit gesprek.";
        }
      }
      state.assessments[update.conversationId] = update;
      next.push(update);
    }
    await writeState(state);
    return next;
  });
}

export function markHandled(conversationId: string, handled: boolean): Promise<MailAssessment | null> {
  return withLock(async () => {
    const state = await readState();
    const existing = state.assessments[conversationId];
    if (!existing) return null;
    existing.handledByUser = handled;
    existing.handledAt = handled ? new Date().toISOString() : undefined;
    if (handled) {
      existing.needsAttention = false;
      existing.attentionReason = undefined;
    }
    await writeState(state);
    return existing;
  });
}

export function saveDraft(conversationId: string, draftReply: string): Promise<MailAssessment | null> {
  return withLock(async () => {
    const state = await readState();
    const existing = state.assessments[conversationId];
    if (!existing) return null;
    existing.draftReply = draftReply;
    await writeState(state);
    return existing;
  });
}

export function snoozeConversation(
  conversationId: string,
  until: string | null,
  tier?: "later" | "info" | null,
): Promise<MailAssessment | null> {
  return withLock(async () => {
    const state = await readState();
    const existing = state.assessments[conversationId];
    if (!existing) return null;
    existing.snoozedUntil = until ?? undefined;
    existing.snoozedTier = until ? tier ?? undefined : undefined;
    await writeState(state);
    return existing;
  });
}

export function setUnsubscribeStatus(
  conversationId: string,
  status: "sending" | "sent" | "error",
  message?: string,
): Promise<MailAssessment | null> {
  return withLock(async () => {
    const state = await readState();
    const existing = state.assessments[conversationId];
    if (!existing) return null;
    existing.unsubscribe = { ...(existing.unsubscribe ?? { kind: "manual" }), status, message };
    existing.updatedAt = new Date().toISOString();
    await writeState(state);
    return existing;
  });
}

export function saveConversation(conversationId: string, saved: boolean): Promise<MailAssessment | null> {
  return withLock(async () => {
    const state = await readState();
    const existing = state.assessments[conversationId];
    if (!existing) return null;
    if (saved) existing.savedAt = new Date().toISOString();
    else delete existing.savedAt;
    existing.updatedAt = new Date().toISOString();
    await writeState(state);
    return existing;
  });
}

export function setDeclaration(
  conversationId: string,
  declaration: "none" | "pending" | "declared" | null,
): Promise<MailAssessment | null> {
  return withLock(async () => {
    const state = await readState();
    const existing = state.assessments[conversationId];
    if (!existing) return null;
    if (declaration) existing.declaration = declaration;
    else delete existing.declaration;
    existing.updatedAt = new Date().toISOString();
    await writeState(state);
    return existing;
  });
}

export function markSent(conversationId: string): Promise<MailAssessment | null> {
  return withLock(async () => {
    const state = await readState();
    const existing = state.assessments[conversationId];
    if (!existing) return null;
    const now = new Date().toISOString();
    existing.sentAt = now;
    existing.handledByUser = true;
    existing.handledAt = now;
    existing.needsAttention = false;
    existing.attentionReason = undefined;
    await writeState(state);
    return existing;
  });
}

export function appendRun(record: RunRecord): Promise<void> {
  return withLock(async () => {
    const state = await readState();
    const runs = [record, ...(state.meta.runs ?? [])].slice(0, 100);
    state.meta.runs = runs;
    await writeState(state);
  });
}

export function updateMeta(patch: Partial<AgentMeta>): Promise<void> {
  return withLock(async () => {
    const state = await readState();
    state.meta = { ...state.meta, ...patch };
    await writeState(state);
  });
}

/** Clears everything; used by the verification harness to start from a clean slate. */
export function resetAgentStore(): Promise<void> {
  return withLock(async () => {
    await writeState({ assessments: {}, meta: { ...EMPTY_META } });
  });
}
