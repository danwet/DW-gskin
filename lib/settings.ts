import type { Settings } from "./types";

export const SETTINGS_KEY = "brief-settings";
export const LAST_RUN_KEY = "brief-last-run";
export const CHECKED_KEY = "brief-checked-loops";
export const CHECKED_AT_KEY = "brief-checked-at";
export const SNOOZE_KEY = "brief-snoozed-invoices";
export const APPROVED_KEY = "brief-approved-drafts";
export const DRAFT_EDITS_KEY = "brief-draft-edits";

export const defaultSettings: Settings = {
  displayName: "Daniel",
  theme: "system",
  units: "c",
  locationMode: "auto",
  city: "",
  sidebarMode: "pinned",
};

export function loadSettings(): Settings {
  if (typeof window === "undefined") return defaultSettings;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const settings: Settings = { ...defaultSettings };
    for (const key of Object.keys(defaultSettings) as (keyof Settings)[]) {
      if (!(key in parsed)) continue;
      (settings as Record<string, unknown>)[key] = parsed[key];
    }
    const unknownKey = Object.keys(parsed).some((key) => !(key in defaultSettings));
    if (unknownKey) saveSettings(settings);
    return settings;
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(settings: Settings) {
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function seedLastRun(now = new Date()): string {
  const existing = window.localStorage.getItem(LAST_RUN_KEY);
  if (existing) return existing;

  const seeded = new Date(now);
  seeded.setHours(7, 42, 0, 0);
  if (seeded.getTime() > now.getTime()) seeded.setDate(seeded.getDate() - 1);
  const iso = seeded.toISOString();
  window.localStorage.setItem(LAST_RUN_KEY, iso);
  return iso;
}

export function writeLastRun(iso: string) {
  window.localStorage.setItem(LAST_RUN_KEY, iso);
}

export function loadChecked(): string[] {
  try {
    const raw = window.localStorage.getItem(CHECKED_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function saveChecked(ids: string[]) {
  window.localStorage.setItem(CHECKED_KEY, JSON.stringify(ids));
}

export function loadCheckedAt(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(CHECKED_AT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const next: Record<string, number> = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (typeof value === "number" && Number.isFinite(value)) next[id] = value;
    }
    return next;
  } catch {
    return {};
  }
}

export function saveCheckedAt(map: Record<string, number>) {
  window.localStorage.setItem(CHECKED_AT_KEY, JSON.stringify(map));
}

export function orderByCheckState<T extends { id: string }>(
  items: T[],
  checked: Set<string>,
  checkedAt: Record<string, number>,
  snoozed: Set<string> = new Set(),
  snoozedAt: Record<string, number> = {},
  urgentDue: Record<string, number> = {},
): T[] {
  const rank = (id: string) => {
    if (checked.has(id)) return 2;
    if (snoozed.has(id)) return 1;
    return 0;
  };
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const aRank = rank(a.item.id);
      const bRank = rank(b.item.id);
      if (aRank !== bRank) return aRank - bRank;
      if (aRank === 0) {
        const aDue = urgentDue[a.item.id];
        const bDue = urgentDue[b.item.id];
        const aUrgent = aDue != null;
        const bUrgent = bDue != null;
        if (aUrgent !== bUrgent) return aUrgent ? -1 : 1;
        if (aUrgent && bUrgent && aDue !== bDue) return aDue - bDue;
      }
      if (aRank === 1) {
        const at = snoozedAt[a.item.id] ?? 0;
        const bt = snoozedAt[b.item.id] ?? 0;
        if (at !== bt) return bt - at;
      }
      if (aRank === 2) {
        const at = checkedAt[a.item.id] ?? 0;
        const bt = checkedAt[b.item.id] ?? 0;
        if (at !== bt) return bt - at;
      }
      return a.index - b.index;
    })
    .map(({ item }) => item);
}

export type SnoozeLabel = "1 day" | "3 days" | "One week" | "Two weeks" | "One month";

export const SNOOZE_CHOICES: SnoozeLabel[] = ["1 day", "3 days", "One week", "Two weeks", "One month"];

export function snoozeUntil(label: SnoozeLabel, now = new Date()): string {
  const end = new Date(now.getTime());
  if (label === "1 day") end.setDate(end.getDate() + 1);
  else if (label === "3 days") end.setDate(end.getDate() + 3);
  else if (label === "One week") end.setDate(end.getDate() + 7);
  else if (label === "Two weeks") end.setDate(end.getDate() + 14);
  else end.setMonth(end.getMonth() + 1);
  // Ends in the morning, so a snooze never expires in the middle of the night.
  end.setHours(6, 0, 0, 0);
  return end.toISOString();
}

export function loadSnoozes(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(SNOOZE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const next: Record<string, string> = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (typeof value === "string" && Number.isFinite(Date.parse(value))) next[id] = value;
    }
    return next;
  } catch {
    return {};
  }
}

export function saveSnoozes(map: Record<string, string>) {
  window.localStorage.setItem(SNOOZE_KEY, JSON.stringify(map));
}

export function isSnoozeActive(until: string | undefined, now = new Date()): boolean {
  if (!until) return false;
  const end = Date.parse(until);
  return Number.isFinite(end) && end > now.getTime();
}

export function loadIdList(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function saveIdList(key: string, ids: string[]) {
  window.localStorage.setItem(key, JSON.stringify(ids));
}

export function loadDraftEdits(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(DRAFT_EDITS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveDraftEdits(edits: Record<string, string>) {
  window.localStorage.setItem(DRAFT_EDITS_KEY, JSON.stringify(edits));
}

export function loadLegacyUserState(): {
  checked: string[];
  checkedAt: Record<string, number>;
  snoozes: Record<string, string>;
  approved: string[];
  draftEdits: Record<string, string>;
} | null {
  const checked = loadChecked();
  const checkedAt = loadCheckedAt();
  const snoozes = loadSnoozes();
  const approved = loadIdList(APPROVED_KEY);
  const draftEdits = loadDraftEdits();
  const hasData =
    checked.length > 0 ||
    approved.length > 0 ||
    Object.keys(checkedAt).length > 0 ||
    Object.keys(snoozes).length > 0 ||
    Object.keys(draftEdits).length > 0;
  if (!hasData) return null;
  return { checked, checkedAt, snoozes, approved, draftEdits };
}

export function clearLegacyUserState() {
  if (typeof window === "undefined") return;
  for (const key of [CHECKED_KEY, CHECKED_AT_KEY, SNOOZE_KEY, APPROVED_KEY, "brief-sent-drafts", DRAFT_EDITS_KEY, "brief-mail-moves"]) {
    window.localStorage.removeItem(key);
  }
}

export function prefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveDark(theme: Settings["theme"]): boolean {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return prefersDark();
}
