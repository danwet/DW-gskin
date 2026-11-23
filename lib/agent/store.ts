import "server-only";

import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import { missingTableError, requireSupabase, supabaseReadJson, supabaseWriteJson } from "../supabase/kv";
import type { LastMailAction } from "./types";
import type { AgentMeta, MailAssessment, RunRecord } from "./types";

type AgentState = {
  assessments: Record<string, MailAssessment>;
  /** User decisions, kept apart so indexing can never overwrite them. */
  userState: Record<string, UserMailState>;
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

/** Everything the user decides about a mail. Indexing never touches this. */
export type UserMailState = {
  handledByUser?: boolean;
  handledAt?: string;
  declaration?: "none" | "pending" | "declared";
  savedAt?: string;
  archivedAt?: string;
  paidAt?: string;
  sentAt?: string;
  snoozedUntil?: string;
  snoozedTier?: "later" | "info";
};

/** Applies the user layer on top of a freshly indexed assessment. */
function withUserState(item: MailAssessment, user?: UserMailState): MailAssessment {
  if (!user) return item;
  return {
    ...item,
    ...(user.handledByUser !== undefined ? { handledByUser: user.handledByUser } : {}),
    ...(user.handledAt ? { handledAt: user.handledAt } : {}),
    ...(user.declaration ? { declaration: user.declaration } : {}),
    ...(user.savedAt ? { savedAt: user.savedAt } : {}),
    ...(user.archivedAt ? { archivedAt: user.archivedAt } : {}),
    ...(user.paidAt ? { paidAt: user.paidAt } : {}),
    ...(user.sentAt ? { sentAt: user.sentAt } : {}),
    ...(user.snoozedUntil ? { snoozedUntil: user.snoozedUntil } : {}),
    ...(user.snoozedTier ? { snoozedTier: user.snoozedTier } : {}),
  };
}

function parseState(raw: unknown): AgentState {
  const parsed = (raw ?? {}) as Partial<AgentState>;
  const assessments: Record<string, MailAssessment> = {};
  if (parsed.assessments && typeof parsed.assessments === "object") {
    for (const [key, value] of Object.entries(parsed.assessments)) {
      if (value && typeof value === "object") assessments[key] = value as MailAssessment;
    }
  }
  const userState: Record<string, UserMailState> = {};
  if (parsed.userState && typeof parsed.userState === "object") {
    for (const [key, value] of Object.entries(parsed.userState)) {
      if (value && typeof value === "object") userState[key] = value as UserMailState;
    }
  }
  return {
    assessments,
    userState,
    meta: parsed.meta ? { ...EMPTY_META, ...parsed.meta } : { ...EMPTY_META },
  };
}

async function readStateFromFile(): Promise<AgentState> {
  try {
    const raw = await readFile(stateFile(), "utf8");
    return parseState(JSON.parse(raw));
  } catch {
    return { assessments: {}, userState: {}, meta: { ...EMPTY_META } };
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
  return withLock(async () => {
    const state = await readState();
    return Object.values(state.assessments).map((item) => withUserState(item, state.userState?.[item.conversationId]));
  });
}

export function readAssessment(conversationId: string): Promise<MailAssessment | null> {
  return withLock(async () => {
    const state = await readState();
    const item = state.assessments[conversationId];
    return item ? withUserState(item, state.userState?.[conversationId]) : null;
  });
}

/** Finds an existing invoice (mail or scan) that matches the same invoice number, or supplier + number. */
export function findInvoiceDuplicate(supplier: string, invoiceNumber: string): Promise<MailAssessment | null> {
  return withLock(async () => {
    const number = invoiceNumber.trim().toLowerCase();
    if (!number) return null;
    const supplierNorm = supplier.trim().toLowerCase();
    const state = await readState();
    for (const raw of Object.values(state.assessments)) {
      const item = withUserState(raw, state.userState?.[raw.conversationId]);
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

/** Puts the declaration and handled state back to what they were. */
export function revertDeclaration(
  conversationId: string,
  previous: { declaration?: "none" | "pending" | "declared"; handledByUser?: boolean; handledAt?: string },
): Promise<void> {
  return withLock(async () => {
    const state = await readState();
    const user = (state.userState[conversationId] ??= {});
    if (previous.declaration) user.declaration = previous.declaration;
    else delete user.declaration;
    if (previous.handledByUser) user.handledByUser = true;
    else delete user.handledByUser;
    if (previous.handledAt) user.handledAt = previous.handledAt;
    else delete user.handledAt;
    await writeState(state);
  });
}

/** Drops the archived flag so a restored card is visible again. */
export function unarchiveConversation(conversationId: string): Promise<void> {
  return withLock(async () => {
    const state = await readState();
    const user = state.userState[conversationId];
    if (!user || !user.archivedAt) return;
    delete user.archivedAt;
    await writeState(state);
  });
}

/** Onthoudt dat er een antwoord van jou in deze threads staat. */
export function setUserReplied(conversationIds: string[], value: boolean): Promise<void> {
  if (conversationIds.length === 0) return Promise.resolve();
  return withLock(async () => {
    const state = await readState();
    let changed = false;
    for (const id of conversationIds) {
      const item = state.assessments[id];
      if (!item || Boolean(item.userReplied) === value) continue;
      if (value) item.userReplied = true;
      else delete item.userReplied;
      changed = true;
    }
    if (changed) await writeState(state);
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
      if (!item) continue;
      const user = (state.userState[id] ??= {});
      if (!user.archivedAt) {
        user.archivedAt = now;
        changed = true;
      }
    }
    if (changed) await writeState(state);
  });
}

/** Writes the undo record before Gmail is touched, so a restore is always possible. */
export function recordMailAction(snapshot: LastMailAction): Promise<void> {
  return withLock(async () => {
    const state = await readState();
    state.meta.lastAction = snapshot;
    await writeState(state);
  });
}

export function clearMailAction(): Promise<void> {
  return withLock(async () => {
    const state = await readState();
    if (!state.meta.lastAction) return;
    state.meta.lastAction = null;
    await writeState(state);
  });
}

export function applyArchiveCleanup(opts: {
  conversationId: string;
  action: "archive" | "trash";
  messageIds: string[];
  /** Skip the undo snapshot when it was already written up front. */
  keepSnapshot?: boolean;
  assessment?: MailAssessment;
}): Promise<void> {
  return withLock(async () => {
    const state = await readState();

    if (!opts.keepSnapshot) {
      state.meta.lastAction = {
        conversationId: opts.conversationId,
        action: opts.action,
        messageIds: opts.messageIds,
        assessment: opts.assessment,
        at: new Date().toISOString(),
      };
    }

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
    for (const id of conversationIds) delete state.userState[id];
    if (changed) await writeState(state);
  });
}

export function readStateOnce(): Promise<{ assessments: MailAssessment[]; meta: AgentMeta }> {
  return withLock(async () => {
    const state = await readState();
    // Same merge as readAssessments: the route that builds the inbox uses this.
    return {
      assessments: Object.values(state.assessments).map((item) =>
        withUserState(item, state.userState?.[item.conversationId]),
      ),
      meta: state.meta,
    };
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

        // Only a genuine change counts: the previous status must differ.
        const today = new Date().toLocaleDateString("sv-SE");
        const changes = state.meta.dailyChanges?.date === today
          ? state.meta.dailyChanges
          : { date: today, orderStatus: 0, paymentStatus: 0 };
        let touched = false;

        const prevOrder = existing.shipment?.status;
        const nextOrder = update.shipment?.status;
        if (prevOrder && nextOrder && prevOrder !== nextOrder) {
          changes.orderStatus += 1;
          touched = true;
        }
        const prevPay = existing.invoice?.paymentStatus;
        const nextPay = update.invoice?.paymentStatus;
        if (prevPay && nextPay && prevPay !== nextPay) {
          changes.paymentStatus += 1;
          touched = true;
        }
        if (touched) state.meta.dailyChanges = changes;
        // User decisions live in their own layer, so nothing to copy here.
        if (!isNewMessage) {
          update.needsAttention = existing.needsAttention;
          update.attentionReason = existing.attentionReason;
        } else if (state.userState[update.conversationId]?.handledByUser) {
          // A new message in a conversation the user had handled deserves a nudge.
          update.needsAttention = true;
          update.attentionReason = update.attentionReason ?? "Nieuw bericht in dit gesprek.";
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
    const user = (state.userState[conversationId] ??= {});
    const wasHandled = Boolean(user.handledByUser);
    user.handledByUser = handled;
    user.handledAt = handled ? new Date().toISOString() : undefined;

    // A paid invoice stays counted for the day even when the card is archived
    // away or the mail is purged, so local and server agree.
    if (existing.invoice) {
      const today = new Date().toLocaleDateString("sv-SE");
      const daily = state.meta.dailyPaid?.date === today ? state.meta.dailyPaid : { date: today, count: 0 };
      if (handled && !wasHandled) daily.count += 1;
      if (!handled && wasHandled) daily.count = Math.max(0, daily.count - 1);
      state.meta.dailyPaid = daily;
    }
    if (handled) {
      existing.needsAttention = false;
      existing.attentionReason = undefined;
    }
    await writeState(state);
    return withUserState(existing, user);
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
    const user = (state.userState[conversationId] ??= {});
    user.snoozedUntil = until ?? undefined;
    user.snoozedTier = until ? tier ?? undefined : undefined;
    await writeState(state);
    return withUserState(existing, user);
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
    const user = (state.userState[conversationId] ??= {});
    if (saved) user.savedAt = new Date().toISOString();
    else delete user.savedAt;
    await writeState(state);
    return withUserState(existing, user);
  });
}

/** Onthoudt dat deze berichten bewust uit de inbox verdwenen. */
export function rememberHiddenMessages(ids: string[]): Promise<void> {
  if (ids.length === 0) return Promise.resolve();
  return withLock(async () => {
    const state = await readState();
    const huidig = new Set(state.meta.hiddenMessageIds ?? []);
    for (const id of ids) huidig.add(id);
    // Alleen de recente onthouden: ouder dan dit komt toch niet meer binnen.
    state.meta.hiddenMessageIds = [...huidig].slice(-500);
    await writeState(state);
  });
}

/** Een bericht kwam terug in de inbox: niet langer verborgen. */
export function forgetHiddenMessages(ids: string[]): Promise<void> {
  if (ids.length === 0) return Promise.resolve();
  return withLock(async () => {
    const state = await readState();
    const weg = new Set(ids);
    state.meta.hiddenMessageIds = (state.meta.hiddenMessageIds ?? []).filter((id) => !weg.has(id));
    await writeState(state);
  });
}

/** Bewaaroordeel van het model: is het gesprek klaar of wacht er nog actie? */
export function setSavedVerdict(
  conversationId: string,
  verdict: { stopped: boolean; reason?: string; at: string } | null,
): Promise<void> {
  return withLock(async () => {
    const state = await readState();
    const item = state.assessments[conversationId];
    if (!item) return;
    if (verdict) item.savedVerdict = verdict;
    else delete item.savedVerdict;
    await writeState(state);
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
    const user = (state.userState[conversationId] ??= {});

    // Declaring leaves the mail where it is, so it needs its own undo record.
    state.meta.lastAction = {
      conversationId,
      action: "declare",
      previous: {
        declaration: user.declaration,
        handledByUser: user.handledByUser,
        handledAt: user.handledAt,
      },
      assessment: withUserState(existing, user),
      at: new Date().toISOString(),
    };

    if (declaration) user.declaration = declaration;
    else delete user.declaration;
    await writeState(state);
    return withUserState(existing, user);
  });
}

/** Stores which order each shipment mail belongs to, in one write. */
export function setOrderKeys(keys: Record<string, string>): Promise<void> {
  return withLock(async () => {
    const state = await readState();
    let changed = false;
    for (const [conversationId, orderKey] of Object.entries(keys)) {
      const item = state.assessments[conversationId];
      if (!item?.shipment) continue;
      if (item.shipment.orderKey === orderKey) continue;
      item.shipment.orderKey = orderKey;
      changed = true;
    }
    if (changed) await writeState(state);
  });
}

export function markSent(conversationId: string): Promise<MailAssessment | null> {
  return withLock(async () => {
    const state = await readState();
    const existing = state.assessments[conversationId];
    if (!existing) return null;
    const now = new Date().toISOString();
    const today = new Date().toLocaleDateString("sv-SE");
    const daily = state.meta.dailyAnswered?.date === today ? state.meta.dailyAnswered : { date: today, count: 0 };
    if (!existing.sentAt) daily.count += 1;
    state.meta.dailyAnswered = daily;

    // Sent is a user decision, so it belongs in their layer.
    const user = (state.userState[conversationId] ??= {});
    user.sentAt = now;
    user.handledByUser = true;
    user.handledAt = now;
    existing.needsAttention = false;
    existing.attentionReason = undefined;
    await writeState(state);
    return withUserState(existing, user);
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

/** Vult de uiterste betaaldatum aan op een bestaande factuurkaart. */
export function setInvoiceDueDate(
  conversationId: string,
  dueDate: string,
  tier?: "moet" | "mag" | "hoeft_niet",
): Promise<void> {
  return withLock(async () => {
    const state = await readState();
    const item = state.assessments[conversationId];
    if (!item?.invoice || item.invoice.dueDate === dueDate) return;
    item.invoice.dueDate = dueDate;
    if (tier) item.tier = tier;
    await writeState(state);
  });
}

/** Zet alleen het urgentie-oordeel van het model op een bestaande kaart. */
export function setAssessmentTier(conversationId: string, tier: "moet" | "mag" | "hoeft_niet"): Promise<void> {
  return withLock(async () => {
    const state = await readState();
    const item = state.assessments[conversationId];
    if (!item || item.tier === tier) return;
    item.tier = tier;
    await writeState(state);
  });
}

/** Leest de gelezen-status van de notificaties (server-side, per account). */
export async function readNotificationState(): Promise<{ since: string | null; read: string[] }> {
  const state = await readState();
  const stored = state.meta.notifications;
  return {
    since: stored?.since ?? null,
    read: Array.isArray(stored?.read) ? stored.read.slice(-500) : [],
  };
}

/** Schrijft de gelezen-status weg, zodat elk apparaat hetzelfde bolletje ziet. */
export function writeNotificationState(next: {
  since?: string | null;
  read?: string[];
}): Promise<void> {
  return withLock(async () => {
    const state = await readState();
    const current = state.meta.notifications ?? { since: null, read: [] };
    state.meta.notifications = {
      since: next.since !== undefined ? next.since : current.since,
      // Bewaar alleen de laatste 500, anders groeit dit voor altijd door.
      read: (next.read !== undefined ? next.read : current.read).slice(-500),
    };
    await writeState(state);
  });
}

/** Clears everything; used by the verification harness to start from a clean slate. */
export function resetAgentStore(): Promise<void> {
  return withLock(async () => {
    await writeState({ assessments: {}, userState: {}, meta: { ...EMPTY_META } });
  });
}

/**
 * Records that something tried to start a run without the right secret. Without
 * this a wrong Supabase header looks exactly like "the cron does not run".
 */
export async function noteCronRejected(detail?: {
  hadHeader: boolean;
  headerScheme: string | null;
  headerLength: number;
  hadKey: boolean;
  keyLength: number;
  method?: string;
  presentedLength?: number;
  presentedHash?: string;
  expectedHash?: string;
  expectedLength?: number;
}): Promise<void> {
  await withLock(async () => {
    const state = await readState();
    const last = state.meta.cronRejectedAt ? Date.parse(state.meta.cronRejectedAt) : 0;
    // Throttle: no more than one write every two minutes.
    if (Date.now() - last < 2 * 60 * 1000) return;
    const at = new Date().toISOString();
    state.meta.cronRejectedAt = at;
    state.meta.cronRejectedCount = (state.meta.cronRejectedCount ?? 0) + 1;
    state.meta.cronReject = detail ? { at, ...detail } : null;
    await writeState(state);
  });
}
