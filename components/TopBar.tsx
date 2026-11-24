"use client";

import { useApp } from "./AppProvider";
import { NotificationsBell } from "./NotificationsBell";
import { WeatherChip } from "./WeatherChip";

/**
 * Notification, undo, sync and weather. It lives in the shell so it sits at the
 * same spot on every page; the page that owns the inbox publishes the data.
 */
export function TopBar() {
  const { topBar, ready, refreshing, refresh } = useApp();
  const undoable = Boolean(topBar?.undoable);

  return (
    <div className="flex flex-wrap items-center gap-5">
      {/* Eén glas-eiland voor de drie bedieningen, zoals in macOS. */}
      <div className="glas-balk mx-auto flex items-center gap-1 rounded-full p-1">
        <button
          type="button"
          onClick={() => void topBar?.undo()}
          disabled={!undoable}
          aria-label="Laatste actie terugzetten"
          title={undoable ? "Laatste actie terugzetten" : "Nog niets om terug te zetten"}
          className="focus-ring grid h-7 w-7 place-items-center rounded-full text-[var(--ink)] hover:bg-black/[0.06] disabled:opacity-40"
        >
          <UndoIcon />
        </button>

        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing || !ready}
          aria-label="Bijwerken"
          className="focus-ring grid h-7 w-7 place-items-center rounded-full text-[var(--ink)] hover:bg-black/[0.06] disabled:opacity-60"
        >
          <RefreshIcon spinning={refreshing} />
        </button>

        {topBar ? (
          <NotificationsBell
            items={topBar.missedItems}
            newItems={topBar.newItems}
            onToggleHandled={topBar.onToggleHandled}
            onDeclare={topBar.onDeclare}
            onOpenNewItem={topBar.onOpenNewItem}
            onMarkAllNewRead={topBar.onMarkAllNewRead}
            onRemoveItem={topBar.onRemoveItem}
            onReloadInbox={topBar.onReloadInbox}
            onInboxError={topBar.onError}
          />
        ) : (
          <span className="grid h-7 w-7 place-items-center rounded-full text-[var(--ink)]" aria-hidden="true">
            <BellIconMuted />
          </span>
        )}
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
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Zelfde bel als in de klikbare knop, anders valt het icoon net
          kleiner uit dan op de pagina's waar hij wel klikbaar is. */}
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
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
