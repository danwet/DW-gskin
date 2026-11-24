"use client";

import { useRouter } from "next/navigation";
import { useApp } from "./AppProvider";
import { NotificationsBell } from "./NotificationsBell";
import { useNotificaties } from "./use-notificaties";
import { WeatherChip } from "./WeatherChip";

/**
 * Notification, undo, sync and weather. It lives in the shell so it sits at the
 * same spot on every page; the page that owns the inbox publishes the data.
 */
export function TopBar() {
  const { topBar, ready, refreshing, refresh } = useApp();
  const router = useRouter();
  // Op schermen zonder inbox (zoals Uploaden) haalt de bel zelf de berichten op,
  // zodat de knop overal hetzelfde werkt.
  const eigen = useNotificaties(!topBar);
  const undoable = Boolean(topBar?.undoable);

  return (
    <div data-topbar-rij className="flex flex-wrap items-center gap-5">
      {/* Eén glas-eiland voor de drie bedieningen, zoals in macOS. */}
      <div className="glas-balk mx-auto flex items-center gap-1 rounded-full p-1">
        <button
          type="button"
          onClick={() => {
            if (topBar) {
              void topBar.undo();
              return;
            }
            // Geen inbox op dit scherm: vraag het de server en werk daarna bij.
            void fetch("/api/gmail/undo", { method: "POST" })
              .then(() => refresh())
              .catch(() => undefined);
          }}
          disabled={topBar ? !undoable : !ready}
          aria-label="Laatste actie terugzetten"
          title={undoable || !topBar ? "Laatste actie terugzetten" : "Nog niets om terug te zetten"}
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

        <NotificationsBell
          items={topBar ? topBar.missedItems : eigen.gemist}
          newItems={topBar ? topBar.newItems : eigen.nieuw}
          onToggleHandled={
            topBar
              ? topBar.onToggleHandled
              : (item) => {
                  void fetch("/api/inbox", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ conversationId: item.conversationId, handled: true }),
                  }).then(() => eigen.laad());
                }
          }
          onDeclare={
            topBar
              ? topBar.onDeclare
              : (item, declaration) => {
                  void fetch("/api/inbox", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ conversationId: item.conversationId, declaration }),
                  }).then(() => eigen.laad());
                }
          }
          onOpenNewItem={
            topBar
              ? topBar.onOpenNewItem
              : (item) => {
                  eigen.markeerGelezen(item.conversationId);
                  router.push("/");
                }
          }
          onMarkAllNewRead={topBar ? topBar.onMarkAllNewRead : eigen.markeerAllesGelezen}
          onRemoveItem={
            topBar
              ? topBar.onRemoveItem
              : (conversationId) => {
                  void fetch("/api/gmail/action", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ conversationId, action: "trash" }),
                  }).then(() => eigen.laad());
                }
          }
          onReloadInbox={topBar ? topBar.onReloadInbox : () => void eigen.laad()}
          onInboxError={() => undefined}
        />
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
