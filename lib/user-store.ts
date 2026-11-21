import "server-only";

import { createHash } from "crypto";
import { mkdir, readdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import { missingTableError, requireSupabase, supabaseReadJson, supabaseWriteJson } from "./supabase/kv";
import type { InvoiceData } from "./epc";
import type { BriefRun, RawMessage, UserWorkspace } from "./types";

export type UserRecord = UserWorkspace & {
  userId: string;
  email: string;
};

export type UserStatePatch = Partial<
  Pick<
    UserWorkspace,
    "checked" | "checkedAt" | "snoozes" | "snoozedAt" | "approved" | "draftEdits"
  >
>;

const locks = new Map<string, Promise<unknown>>();
const MAX_ITEMS = 400;
const MAX_ID = 180;
const MAX_EDIT = 20_000;
const PLACEHOLDER_USER_ID = "1";
const PLACEHOLDER_EMAIL = "user@example.com";

let directoryOverride: string | null = null;

export function setUserStoreDirectoryForTests(dir: string | null) {
  directoryOverride = dir;
}

function directory() {
  return directoryOverride ?? path.join(process.cwd(), "data", "users");
}

function fileFor(userId: string) {
  return path.join(directory(), `${createHash("sha256").update(userId).digest("hex")}.json`);
}

function blank(userId: string, email: string): UserRecord {
  return {
    userId,
    email,
    checked: [],
    checkedAt: {},
    snoozes: {},
    snoozedAt: {},
    approved: [],
    draftEdits: {},
    messages: [],
    invoices: [],
    lastRun: null,
    runs: [],
    migrated: false,
  };
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_ID;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isId).slice(0, MAX_ITEMS);
}

function numberMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const next: Record<string, number> = {};
  for (const [key, item] of Object.entries(value).slice(0, MAX_ITEMS)) {
    if (!isId(key) || typeof item !== "number" || !Number.isFinite(item)) continue;
    next[key] = item;
  }
  return next;
}

function isoMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const next: Record<string, string> = {};
  for (const [key, item] of Object.entries(value).slice(0, MAX_ITEMS)) {
    if (!isId(key) || typeof item !== "string" || !Number.isFinite(Date.parse(item))) continue;
    next[key] = item;
  }
  return next;
}

function editsMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const next: Record<string, string> = {};
  for (const [key, item] of Object.entries(value).slice(0, 100)) {
    if (!isId(key) || typeof item !== "string") continue;
    next[key] = item.slice(0, MAX_EDIT);
  }
  return next;
}

function messageList(value: unknown): RawMessage[] {
  if (!Array.isArray(value)) return [];
  const next: RawMessage[] = [];
  for (const item of value.slice(0, MAX_ITEMS)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<RawMessage>;
    if (!isId(row.id) || typeof row.from !== "string" || typeof row.fromEmail !== "string") continue;
    if (typeof row.subject !== "string" || typeof row.receivedAt !== "string") continue;
    next.push({
      id: row.id,
      from: row.from.slice(0, 300),
      fromEmail: row.fromEmail.slice(0, 300),
      subject: row.subject.slice(0, 500),
      snippet: typeof row.snippet === "string" ? row.snippet.slice(0, 2000) : "",
      body: typeof row.body === "string" ? row.body.slice(0, MAX_EDIT) : undefined,
      receivedAt: row.receivedAt,
      attachmentUrl: typeof row.attachmentUrl === "string" ? row.attachmentUrl.slice(0, 2000) : undefined,
      attachmentName: typeof row.attachmentName === "string" ? row.attachmentName.slice(0, 300) : undefined,
    });
  }
  return next;
}

function briefRunList(value: unknown): BriefRun[] {
  if (!Array.isArray(value)) return [];
  const next: BriefRun[] = [];
  for (const item of value.slice(0, 50)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<BriefRun>;
    if (typeof row.at !== "string" || !Number.isFinite(Date.parse(row.at))) continue;
    const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
    next.push({
      at: row.at,
      messageCount: count(row.messageCount),
      drafts: count(row.drafts),
      quiet: count(row.quiet),
      actions: count(row.actions),
      upcoming: count(row.upcoming),
    });
  }
  return next;
}

function invoiceList(value: unknown): InvoiceData[] {
  if (!Array.isArray(value)) return [];
  const next: InvoiceData[] = [];
  for (const item of value.slice(0, 40)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<InvoiceData>;
    if (!isId(row.id) || typeof row.recipient_name !== "string") continue;
    if (typeof row.amount !== "number" || !Number.isFinite(row.amount) || row.amount <= 0) continue;
    const due = typeof row.due_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.due_date) ? row.due_date : undefined;
    next.push({
      id: row.id,
      recipient_name: row.recipient_name.slice(0, 300),
      iban: typeof row.iban === "string" ? row.iban.replace(/\s+/g, "").toUpperCase().slice(0, 42) : "",
      amount: Math.round(row.amount * 100) / 100,
      reference: typeof row.reference === "string" ? row.reference.slice(0, 140) : "",
      due_date: due,
      pdf_url: typeof row.pdf_url === "string" && row.pdf_url.trim() ? row.pdf_url.trim().slice(0, 2000) : undefined,
      pdf_filename:
        typeof row.pdf_filename === "string" && row.pdf_filename.trim()
          ? row.pdf_filename.trim().slice(0, 300)
          : undefined,
    });
  }
  return next;
}

function normalize(parsed: Partial<UserRecord>, userId: string, email: string): UserRecord {
  const base = blank(userId, email);
  return {
    ...base,
    userId,
    email,
    checked: stringList(parsed.checked),
    checkedAt: numberMap(parsed.checkedAt),
    snoozes: isoMap(parsed.snoozes),
    snoozedAt: numberMap(parsed.snoozedAt),
    approved: stringList(parsed.approved),
    draftEdits: editsMap(parsed.draftEdits),
    messages: messageList(parsed.messages),
    invoices: invoiceList(parsed.invoices),
    lastRun: typeof parsed.lastRun === "string" ? parsed.lastRun : null,
    runs: briefRunList(parsed.runs),
    migrated: parsed.migrated === true,
  };
}

export function toWorkspace(record: UserRecord): UserWorkspace {
  return {
    checked: record.checked,
    checkedAt: record.checkedAt,
    snoozes: record.snoozes,
    snoozedAt: record.snoozedAt,
    approved: record.approved,
    draftEdits: record.draftEdits,
    messages: record.messages,
    invoices: record.invoices,
    lastRun: record.lastRun,
    runs: record.runs,
    migrated: record.migrated,
  };
}

async function readRecordFromFile(userId: string, email: string): Promise<UserRecord> {
  try {
    const raw = await readFile(fileFor(userId), "utf8");
    const parsed = JSON.parse(raw) as Partial<UserRecord>;
    return normalize(parsed, userId, email);
  } catch {
    return blank(userId, email);
  }
}

async function writeRecordToFile(record: UserRecord) {
  try {
    const folder = directory();
    await mkdir(folder, { recursive: true });
    const target = fileFor(record.userId);
    const temp = `${target}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(record), "utf8");
    await rename(temp, target);
  } catch {
    // Read-only filesystems (e.g. Vercel without Supabase) should not crash the request.
  }
}

async function readRecord(userId: string, email: string): Promise<UserRecord> {
  // The verification harness sets an explicit directory; everything else must use Supabase.
  if (directoryOverride !== null) return readRecordFromFile(userId, email);
  requireSupabase();
  const doc = await supabaseReadJson("dw_user_state", "user_id", userId);
  if (!doc.ok) throw missingTableError("dw_user_state");
  const parsed = (doc.value ?? {}) as Partial<UserRecord>;
  return normalize(parsed, userId, email);
}

async function writeRecord(record: UserRecord) {
  if (directoryOverride !== null) {
    await writeRecordToFile(record);
    return;
  }
  requireSupabase();
  const written = await supabaseWriteJson("dw_user_state", "user_id", record.userId, record);
  if (!written) throw missingTableError("dw_user_state");
}

function enqueue<T>(userId: string, task: () => Promise<T>): Promise<T> {
  const previous = locks.get(userId) ?? Promise.resolve();
  const run = previous.then(task, task);
  locks.set(
    userId,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

export async function listStoredUsers(): Promise<{ userId: string; email: string }[]> {
  let names: string[];
  try {
    names = await readdir(directory());
  } catch {
    return [];
  }
  const users: { userId: string; email: string }[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    try {
      const parsed = JSON.parse(await readFile(path.join(directory(), name), "utf8")) as Partial<UserRecord>;
      if (typeof parsed.userId !== "string" || typeof parsed.email !== "string") continue;
      if (!parsed.userId || !parsed.email) continue;
      users.push({ userId: parsed.userId, email: parsed.email });
    } catch {
      continue;
    }
  }
  return users;
}

export async function resolveStoredUser(hintedUserId = ""): Promise<{ userId: string; email: string } | null> {
  const stored = await listStoredUsers();
  const hint = hintedUserId.trim();
  if (hint && hint !== PLACEHOLDER_USER_ID) {
    const match = stored.find((user) => user.userId === hint && user.email !== PLACEHOLDER_EMAIL);
    if (match) return match;
  }
  const real = stored.filter((user) => user.userId !== PLACEHOLDER_USER_ID && user.email !== PLACEHOLDER_EMAIL);
  const candidates = real.length > 0 ? real : stored;
  if (candidates.length === 1) return candidates[0];
  return null;
}

export function readUser(userId: string, email: string): Promise<UserRecord> {
  return enqueue(userId, () => readRecord(userId, email));
}

export function updateUser(
  userId: string,
  email: string,
  mutate: (record: UserRecord) => void,
): Promise<UserRecord> {
  return enqueue(userId, async () => {
    const record = await readRecord(userId, email);
    mutate(record);
    record.userId = userId;
    record.email = email;
    await writeRecord(record);
    return record;
  });
}

export function applyClientPatch(record: UserRecord, patch: UserStatePatch, migrate: boolean) {
  if (migrate && record.migrated) return;
  if ("checked" in patch) record.checked = stringList(patch.checked);
  if ("checkedAt" in patch) record.checkedAt = numberMap(patch.checkedAt);
  if ("snoozes" in patch) record.snoozes = isoMap(patch.snoozes);
  if ("snoozedAt" in patch) record.snoozedAt = numberMap(patch.snoozedAt);
  if ("approved" in patch) record.approved = stringList(patch.approved);
  if ("draftEdits" in patch) record.draftEdits = editsMap(patch.draftEdits);
  if (migrate) record.migrated = true;
}
