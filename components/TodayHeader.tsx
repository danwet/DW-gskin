"use client";

import { shiftToLogicalDay } from "@/lib/day-boundary";

/**
 * Page title for Focus. The notification/undo/sync/weather cluster lives in the
 * shell (TopBar) so it sits at the same spot on every page.
 */
export function TodayHeader() {
  // Before 05:00 the dashboard still shows the previous day.
  const dateText = shiftToLogicalDay().toLocaleDateString("nl-NL", {
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
    </header>
  );
}
