"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { briefInFlight, holdBrief } from "@/lib/brief-flight";
import { emptyBrief } from "@/lib/empty-brief";
import type { TopBarState } from "@/lib/top-bar";
import { applyThursdayHold, HOLD_LOOP_ID, resolveHoldChecks, saveHoldChoice } from "@/lib/thursday-hold";
import {
  clearLegacyUserState,
  defaultSettings,
  isSnoozeActive,
  loadLegacyUserState,
  loadSettings,
  resolveDark,
  saveSettings,
} from "@/lib/settings";
import { toFahrenheit } from "@/lib/weather";
import type { Brief, BriefRun, ConnectionStatus, DraftReply, OpenLoop, Settings, UserWorkspace, WeatherNow } from "@/lib/types";

export type SyncProgressView = {
  phase: "idle" | "importing" | "triaging" | "done" | "error";
  imported: number;
  total: number | null;
  threadsImported: number;
  triaged: number;
  pending: number;
  lastError: string | null;
};

type AppContextValue = {
  ready: boolean;
  now: Date;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  brief: Brief;
  lastRun: string | null;
  runs: BriefRun[];
  refreshing: boolean;
  /** Increments after a manual sync so the inbox reloads its cards. */
  syncNonce: number;
  /** Live Gmail import progress, shown in the sidebar. */
  syncProgress: SyncProgressView | null;
  setSyncProgress: (value: SyncProgressView | null) => void;
  /** Header cluster published by whichever page owns the inbox. */
  topBar: TopBarState | null;
  setTopBar: (value: TopBarState | null) => void;
  refresh: () => Promise<void>;
  weather: WeatherNow | null;
  weatherError: string | null;
  connections: ConnectionStatus | null;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  draft: DraftReply | null;
  setDraft: (draft: DraftReply | null) => void;
  checked: Set<string>;
  checkedAt: Record<string, number>;
  toggleLoop: (id: string) => void;
  completeLoop: (id: string) => void;
  markInvoicePaid: (loop: OpenLoop) => void;
  restoreInvoice: (loop: OpenLoop) => void;
  snoozeLoop: (id: string, until: string) => void;
  unsnoozeLoop: (id: string) => void;
  isSnoozed: (id: string) => boolean;
  heldSnoozes: Set<string>;
  snoozedAt: Record<string, number>;
  slideFocusId: string | null;
  openLoop: (loop: OpenLoop) => void;
  preview: OpenLoop | null;
  setPreview: (loop: OpenLoop | null) => void;
  payment: OpenLoop | null;
  setPayment: (loop: OpenLoop | null) => void;
  approved: Set<string>;
  approveDraft: (id: string) => void;
  updateDraftBody: (id: string, text: string) => void;
  account: { name: string | null; email: string } | null;
  calendarError: string | null;
  mailError: string | null;
};

const AppContext = createContext<AppContextValue | null>(null);

type Account = { name: string | null; email: string };

type BriefPayload = {
  brief: Brief;
  calendarError: string | null;
  mailError: string | null;
  account: Account;
  state: UserWorkspace;
};

type StatePatch = Partial<
  Pick<
    UserWorkspace,
    "checked" | "checkedAt" | "snoozes" | "snoozedAt" | "approved" | "draftEdits"
  >
>;

const emptyConnections: ConnectionStatus = {
  cronSecret: false,
  agentApiKey: false,
};

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [runs, setRuns] = useState<BriefRun[]>([]);
  const [refreshing, setRefreshing] = useState(() => briefInFlight());
  const [syncNonce, setSyncNonce] = useState(0);
  const [syncProgress, setSyncProgress] = useState<SyncProgressView | null>(null);
  const [topBar, setTopBar] = useState<TopBarState | null>(null);
  const [sourceBrief, setSourceBrief] = useState<Brief>(emptyBrief());
  const [account, setAccount] = useState<Account | null>(null);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [mailError, setMailError] = useState<string | null>(null);
  const [weather, setWeather] = useState<WeatherNow | null>(null);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [connections, setConnections] = useState<ConnectionStatus | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState<DraftReply | null>(null);
  const [preview, setPreview] = useState<OpenLoop | null>(null);
  const [payment, setPayment] = useState<OpenLoop | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [checkedAt, setCheckedAt] = useState<Record<string, number>>({});
  const [snoozes, setSnoozes] = useState<Record<string, string>>({});
  const [heldSnoozes, setHeldSnoozes] = useState<Set<string>>(new Set());
  const [snoozedAt, setSnoozedAt] = useState<Record<string, number>>({});
  const [slideFocusId, setSlideFocusId] = useState<string | null>(null);
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const [draftEdits, setDraftEdits] = useState<Record<string, string>>({});

  const brief = useMemo(() => {
    const withEdits: Brief = {
      ...sourceBrief,
      drafts: sourceBrief.drafts.map((item) =>
        draftEdits[item.id] == null ? item : { ...item, draft: draftEdits[item.id] },
      ),
    };
    return applyThursdayHold(withEdits, checked.has(HOLD_LOOP_ID));
  }, [checked, draftEdits, sourceBrief]);

  const pendingState = useRef<StatePatch>({});
  const saveTimer = useRef<number | null>(null);

  const flushSave = useCallback(async () => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const body = pendingState.current;
    pendingState.current = {};
    if (Object.keys(body).length === 0) return;
    await fetch("/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }, []);

  const queueSave = useCallback((patch: StatePatch) => {
    pendingState.current = { ...pendingState.current, ...patch };
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void flushSave();
    }, 200);
  }, [flushSave]);

  const applyWorkspace = useCallback((state: UserWorkspace) => {
    const resolved = resolveHoldChecks(state.checked);
    setChecked(new Set(resolved.ids));
    if (resolved.changed) queueSave({ checked: resolved.ids });
    setCheckedAt(state.checkedAt);
    setApproved(new Set(state.approved));
    setDraftEdits(state.draftEdits);
    setSnoozes(state.snoozes);
    setSnoozedAt(state.snoozedAt);
    setLastRun(state.lastRun);
    setRuns(state.runs ?? []);
  }, [queueSave]);

  useLayoutEffect(() => {
    setSettings(loadSettings());
  }, []);

  useEffect(() => {
    let ignore = false;

    async function boot() {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const held = holdBrief({ timeZone, refresh: false });
      held.start();
      setRefreshing(true);
      try {
        const result = await held.promise;
        if (ignore) return;
        if (result.status === 401) {
          window.location.assign("/login");
          return;
        }
        if (!result.ok || !result.data) {
          const message =
            (result.data as { error?: string } | null)?.error ?? "Dashboard could not be loaded.";
          setSourceBrief(emptyBrief(message));
          setCalendarError(message);
          setMailError(message);
          setReady(true);
          return;
        }
        const data = result.data as BriefPayload;
        let state = data.state;
        if (!state.migrated) {
          const legacy = loadLegacyUserState();
          const saved = await fetch("/api/state", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(legacy ? { migrate: true, ...legacy } : { migrate: true }),
          });
          clearLegacyUserState();
          if (saved.ok) {
            const body = (await saved.json()) as { state: UserWorkspace };
            state = body.state;
          }
        } else {
          clearLegacyUserState();
        }
        if (ignore) return;
        applyWorkspace(state);
        setSourceBrief(data.brief);
        setCalendarError(data.calendarError);
        setMailError(data.mailError);
        setAccount(data.account);
        setReady(true);
      } catch {
        if (ignore) return;
        setSourceBrief(emptyBrief("Dashboard could not be loaded."));
        setCalendarError("Dashboard could not be loaded.");
        setMailError("Dashboard could not be loaded.");
        setReady(true);
      } finally {
        if (!ignore) setRefreshing(false);
      }
    }

    void boot();
    return () => {
      ignore = true;
    };
  }, [applyWorkspace]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolveDark(settings.theme));
    if (!ready) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.classList.toggle("dark", resolveDark(settings.theme));
    };
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [settings.theme, ready]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let ignore = false;

    async function loadWeather() {
      setWeatherError(null);
      const params = new URLSearchParams();

      if (settings.locationMode === "city" && settings.city.trim()) {
        params.set("city", settings.city.trim());
      } else {
        const coords = await new Promise<{ lat: number; lon: number } | null>((resolve) => {
          if (!("geolocation" in navigator)) {
            resolve(null);
            return;
          }
          navigator.geolocation.getCurrentPosition(
            (position) =>
              resolve({
                lat: position.coords.latitude,
                lon: position.coords.longitude,
              }),
            () => resolve(null),
            { enableHighAccuracy: false, timeout: 6000, maximumAge: 15 * 60 * 1000 },
          );
        });
        if (coords) {
          params.set("lat", String(coords.lat));
          params.set("lon", String(coords.lon));
        }
      }

      try {
        const response = await fetch(`/api/weather?${params.toString()}`);
        if (!response.ok) throw new Error("unavailable");
        const data = (await response.json()) as {
          celsius: number;
          condition: string;
          city: string | null;
          source: WeatherNow["source"];
        };
        if (ignore) return;
        const unit = settings.units === "f" ? "F" : "C";
        setWeather({
          temperature:
            unit === "F" ? toFahrenheit(data.celsius) : Math.round(data.celsius),
          unit,
          condition: data.condition,
          city: data.city,
          source: data.source,
        });
      } catch {
        if (!ignore) {
          setWeather(null);
          setWeatherError("Weather is unavailable right now.");
        }
      }
    }

    if (ready) void loadWeather();
    return () => {
      ignore = true;
    };
  }, [ready, settings.locationMode, settings.city, settings.units]);

  useEffect(() => {
    if (!ready) return;
    void fetch("/api/connections")
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("unauthorized"))))
      .then((data: ConnectionStatus) => setConnections(data))
      .catch(() => setConnections(emptyConnections));
  }, [ready, settingsOpen]);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const held = holdBrief({ timeZone, refresh: true });
    if (!held.owned) return;
    setRefreshing(true);
    // The spinner is a short acknowledgement: it stops after a few seconds while
    // the actual sync keeps running in the background.
    const spinnerTimer = setTimeout(() => setRefreshing(false), 3000);
    // Follow the run while it happens: the cheap progress endpoint feeds the
    // sidebar bar, which otherwise only updates after everything is done.
    const progressPoll = setInterval(async () => {
      try {
        const response = await fetch("/api/gmail/import", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { progress?: SyncProgressView | null };
        if (data.progress) setSyncProgress(data.progress);
      } catch {
        // Polling is best effort.
      }
    }, 1200);
    try {
      await flushSave();
      // Run the mail agent too, so the button is a real sync (incremental).
      try {
        await fetch("/api/inbox/refresh", { method: "POST" });
      } catch {
        // The inbox surfaces its own error; the brief refresh continues.
      }
      setSyncNonce((value) => value + 1);
      held.start();
      const result = await held.promise;
      if (result.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (!result.ok || !result.data) return;
      const data = result.data as BriefPayload;
      setSourceBrief(data.brief);
      setCalendarError(data.calendarError);
      setMailError(data.mailError);
      setAccount(data.account);
      applyWorkspace(data.state);
    } catch {
      held.cancel();
    } finally {
      clearTimeout(spinnerTimer);
      clearInterval(progressPoll);
      setRefreshing(false);
      setHeldSnoozes(new Set());
    }
  }, [applyWorkspace, flushSave, setSyncProgress]);

  // Opening the dashboard syncs Gmail when the schedule skipped a tick: the
  // cron runs every five minutes, so six minutes without a run means one was
  // missed and the app catches up.
  const MISSED_RUN_AFTER_MS = 6 * 60 * 1000;
  const bootSynced = useRef(false);
  useEffect(() => {
    if (!ready || bootSynced.current) return;
    bootSynced.current = true;
    const last = lastRun ? Date.parse(lastRun) : 0;
    if (Date.now() - last > MISSED_RUN_AFTER_MS) void refresh();
  }, [ready, lastRun, refresh]);

  // The sync time should follow the server, also when the sync ran elsewhere
  // (background run, cron or another tab).
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/api/gmail/import", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { lastRunAt?: string | null };
        if (!alive || !data.lastRunAt) return;
        setLastRun((current) => {
          const next = Date.parse(data.lastRunAt ?? "");
          const now = current ? Date.parse(current) : 0;
          return Number.isFinite(next) && next > now ? (data.lastRunAt as string) : current;
        });
      } catch {
        // Best effort.
      }
    };
    void tick();
    const timer = setInterval(tick, 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ready]);

  // Appointments moved, added or deleted elsewhere (phone, web) should show up
  // without a refresh, so the agenda is polled every minute.
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const response = await fetch(`/api/calendar/status?timeZone=${encodeURIComponent(timeZone)}`, {
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = (await response.json()) as {
          events?: Brief["events"];
          tomorrowEvents?: Brief["events"];
          error?: string | null;
        };
        if (!alive || !Array.isArray(data.events)) return;
        setSourceBrief((current) => ({
          ...current,
          events: data.events ?? current.events,
          tomorrowEvents: data.tomorrowEvents ?? current.tomorrowEvents,
        }));
      } catch {
        // Best effort: the agenda keeps what it had.
      }
    };
    void tick();
    const timer = setInterval(tick, 60 * 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ready]);

  const stampChecked = useCallback((id: string) => {
    setCheckedAt((current) => {
      const next = { ...current, [id]: Date.now() };
      queueSave({ checkedAt: next });
      return next;
    });
  }, [queueSave]);

  const clearCheckedAt = useCallback((id: string) => {
    setCheckedAt((current) => {
      if (current[id] == null) return current;
      const next = { ...current };
      delete next[id];
      queueSave({ checkedAt: next });
      return next;
    });
  }, [queueSave]);

  const completeLoop = useCallback((id: string) => {
    setSlideFocusId(id);
    setChecked((current) => {
      if (current.has(id)) return current;
      const next = new Set(current);
      next.add(id);
      if (id === HOLD_LOOP_ID) saveHoldChoice("kept");
      queueSave({ checked: [...next] });
      stampChecked(id);
      return next;
    });
    setSnoozes((current) => {
      if (!current[id]) return current;
      const next = { ...current };
      delete next[id];
      queueSave({ snoozes: next });
      return next;
    });
    setHeldSnoozes((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }, [queueSave, stampChecked]);

  const snoozeLoop = useCallback((id: string, until: string) => {
    setSlideFocusId(id);
    setHeldSnoozes((current) => {
      const next = new Set(current);
      next.add(id);
      return next;
    });
    setSnoozedAt((current) => {
      const next = { ...current, [id]: Date.now() };
      queueSave({ snoozedAt: next });
      return next;
    });
    setSnoozes((current) => {
      const next = { ...current, [id]: until };
      queueSave({ snoozes: next });
      return next;
    });
  }, [queueSave]);

  const unsnoozeLoop = useCallback((id: string) => {
    setSlideFocusId(id);
    setHeldSnoozes((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    setSnoozedAt((current) => {
      if (current[id] == null) return current;
      const next = { ...current };
      delete next[id];
      queueSave({ snoozedAt: next });
      return next;
    });
    setSnoozes((current) => {
      if (!current[id]) return current;
      const next = { ...current };
      delete next[id];
      queueSave({ snoozes: next });
      return next;
    });
  }, [queueSave]);

  const isSnoozed = useCallback(
    (id: string) => isSnoozeActive(snoozes[id], now),
    [now, snoozes],
  );

  const updateDraftBody = useCallback((id: string, text: string) => {
    setDraftEdits((current) => {
      const next = { ...current, [id]: text };
      queueSave({ draftEdits: next });
      return next;
    });
    setDraft((current) => (current?.id === id ? { ...current, draft: text } : current));
  }, [queueSave]);

  const approveDraft = useCallback(
    (id: string) => {
      const removing = approved.has(id);
      setApproved((current) => {
        const next = new Set(current);
        if (removing) next.delete(id);
        else next.add(id);
        queueSave({ approved: [...next] });
        return next;
      });
      if (removing) {
        const loopId = `loop-${id}`;
        setChecked((current) => {
          if (!current.has(loopId)) return current;
          const next = new Set(current);
          next.delete(loopId);
          queueSave({ checked: [...next] });
          return next;
        });
        clearCheckedAt(loopId);
        return;
      }
      completeLoop(`loop-${id}`);
    },
    [approved, clearCheckedAt, completeLoop, queueSave],
  );

  const openLoop = useCallback(
    (loop: OpenLoop) => {
      if (loop.payment) {
        setDraft(null);
        setPreview(null);
        setPayment(loop);
        return;
      }
      setPayment(null);
      if (loop.draftId) {
        const match = brief.drafts.find((item) => item.id === loop.draftId);
        if (match) {
          setPreview(null);
          setDraft(match);
          return;
        }
      }
      setDraft(null);
      setPreview(loop);
    },
    [brief.drafts],
  );

  useEffect(() => {
    if (!ready) return;
    const loopIds = brief.drafts.filter((item) => approved.has(item.id)).map((item) => `loop-${item.id}`);
    if (loopIds.length === 0) return;
    setChecked((current) => {
      const missing = loopIds.filter((id) => !current.has(id));
      if (missing.length === 0) return current;
      const next = new Set(current);
      for (const id of missing) next.add(id);
      queueSave({ checked: [...next] });
      const now = Date.now();
      setCheckedAt((times) => {
        const stamped = { ...times };
        missing.forEach((id, index) => {
          if (stamped[id] == null) stamped[id] = now + index;
        });
        queueSave({ checkedAt: stamped });
        return stamped;
      });
      return next;
    });
  }, [approved, brief.drafts, queueSave, ready]);

  const toggleLoop = useCallback((id: string) => {
    setSlideFocusId(id);
    const removing = checked.has(id);
    if (id === HOLD_LOOP_ID) saveHoldChoice(removing ? "removed" : "kept");
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      queueSave({ checked: [...next] });
      return next;
    });
    if (removing) clearCheckedAt(id);
    else stampChecked(id);
  }, [checked, clearCheckedAt, queueSave, stampChecked]);

  const markInvoicePaid = useCallback(
    (loop: OpenLoop) => {
      completeLoop(loop.id);
    },
    [completeLoop],
  );

  const restoreInvoice = useCallback(
    (loop: OpenLoop) => {
      if (!checked.has(loop.id)) return;
      toggleLoop(loop.id);
    },
    [checked, toggleLoop],
  );

  const value: AppContextValue = {
    ready,
    now,
    settings,
    updateSettings,
    brief,
    lastRun,
    runs,
    refreshing,
    syncNonce,
    syncProgress,
    setSyncProgress,
    topBar,
    setTopBar,
    refresh,
    weather,
    weatherError,
    connections,
    settingsOpen,
    setSettingsOpen,
    draft,
    setDraft,
    checked,
    checkedAt,
    toggleLoop,
    completeLoop,
    markInvoicePaid,
    restoreInvoice,
    snoozeLoop,
    unsnoozeLoop,
    isSnoozed,
    heldSnoozes,
    snoozedAt,
    slideFocusId,
    openLoop,
    preview,
    setPreview,
    payment,
    setPayment,
    approved,
    approveDraft,
    updateDraftBody,
    account,
    calendarError,
    mailError,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp must be used inside AppProvider");
  return value;
}
