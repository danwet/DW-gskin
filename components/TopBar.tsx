"use client";

import { formatClock } from "@/lib/greeting";
import { useApp } from "./AppProvider";
import { NotificationsBell } from "./NotificationsBell";
import { WeatherChip } from "./WeatherChip";

/**
 * Notification, undo, sync and weather. It lives in the shell so it sits at the
 * same spot on every page; the page that owns the inbox publishes the data.
 */
export function TopBar() {
  const { topBar, ready, lastRun, refreshing, refresh } = useApp();
  // Whichever is newer: the page's own data or the polled server time.
  const shownSync = (() => {
    const candidates = [topBar?.lastSyncAt, lastRun].filter((value): value is string => Boolean(value));
    if (candidates.length === 0) return null;
    return candidates.sort((a, b) => Date.parse(a) - Date.parse(b)).at(-1) ?? null;
  })();
  const undoable = Boolean(topBar?.undoable);

  return (
    <div className="flex flex-wrap items-center gap-5">
      <button
        type="button"
        onClick={() => void topBar?.undo()}
        disabled={!undoable}
        aria-label="Laatste actie terugzetten"
        title={undoable ? "Laatste actie terugzetten" : "Nog niets om terug te zetten"}
        className="glass-chip focus-ring grid h-8 w-8 place-items-center rounded-full text-[var(--ink)] disabled:opacity-40"
      >
        <UndoIcon />
      </button>

      {topBar ? (
        <NotificationsBell
          items={topBar.missedItems}
          onToggleHandled={topBar.onToggleHandled}
          onDeclare={topBar.onDeclare}
        />
      ) : (
        <span className="glass-chip grid h-8 w-8 place-items-center rounded-full text-[var(--muted)]" aria-hidden="true">
          <BellIconMuted />
        </span>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing || !ready}
          aria-label="Bijwerken"
          className="glass-chip focus-ring grid h-8 w-8 place-items-center rounded-full text-[var(--ink)] disabled:opacity-60"
        >
          <RefreshIcon spinning={refreshing} />
        </button>
        <span className="tnum text-[12px] leading-none text-[var(--muted)]">
          {refreshing ? "…" : shownSync ? formatClock(new Date(shownSync)) : "—"}
        </span>
      </div>

      <WeatherChip />
    </div>
  );
}

function UndoIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H9" />
    </svg>
  );
}

function BellIconMuted() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6" />
      <path d="M10.5 20a2 2 0 0 0 3 0" />
    </svg>
  );
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={spinning ? "animate-spin" : ""}
    >
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}
