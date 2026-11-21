"use client";

import { formatClock } from "@/lib/greeting";
import type { MailAssessment } from "@/lib/agent/types";
import { NotificationsBell } from "./NotificationsBell";
import { useApp } from "./AppProvider";
import { WeatherChip } from "./WeatherChip";

export function TodayHeader({
  missedItems,
  lastSyncAt,
  onToggleHandled,
  onDeclare,
}: {
  missedItems: MailAssessment[];
  /** Last successful agent run, read from Supabase (meta.lastRunAt). */
  lastSyncAt?: string | null;
  onToggleHandled: (item: MailAssessment) => void;
  onDeclare: (item: MailAssessment, declaration: "none" | "pending" | "declared") => void;
}) {
  const { ready, lastRun, refreshing, refresh } = useApp();
  const shownSync = lastSyncAt ?? lastRun;
  const dateText = new Date().toLocaleDateString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="w-fit">
        <h1 className="text-[36px] leading-[1.05] font-bold tracking-[-0.03em] text-[var(--ink)]">Wat verdient mijn aandacht</h1>
        <p className="mt-1.5 text-right text-[15px] text-[var(--muted)]">{dateText}</p>
      </div>
      <div className="flex flex-wrap items-start gap-5 sm:mt-0.5">
        <NotificationsBell items={missedItems} onToggleHandled={onToggleHandled} onDeclare={onDeclare} />
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
    </header>
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
