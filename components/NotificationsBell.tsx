"use client";

import { useState } from "react";
import { timeZoneOf } from "./AgentInbox";
import { focusTabFor, InboxModal } from "./InboxGrid";
import { setFocusTab } from "@/lib/focus-tab";
import type { MailAssessment } from "@/lib/agent/types";

export function NotificationsBell({
  items,
  newItems = [],
  onToggleHandled,
  onDeclare,
  onOpenNewItem,
  onMarkAllNewRead,
  onRemoveItem,
  onReloadInbox,
  onInboxError,
}: {
  items: MailAssessment[];
  newItems?: MailAssessment[];
  onToggleHandled: (item: MailAssessment) => void;
  onDeclare: (item: MailAssessment, declaration: "none" | "pending" | "declared") => void;
  onOpenNewItem?: (item: MailAssessment) => void;
  onMarkAllNewRead?: () => void;
  onRemoveItem?: (conversationId: string) => void;
  onReloadInbox?: () => void;
  onInboxError?: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<MailAssessment | null>(null);
  const count = items.length + newItems.length;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={`Notificaties (${count})`}
        aria-expanded={open}
        className="glass-chip focus-ring relative grid h-8 w-8 place-items-center rounded-full text-[var(--ink)]"
      >
        <BellIcon />
        {count > 0 ? (
          <span className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--danger)] px-1 text-[10px] font-semibold text-white">
            {count}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <button type="button" aria-label="Sluiten" className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-10 right-0 z-50 w-[320px] rounded-2xl border border-[var(--line)] bg-[var(--card)] p-2 shadow-[var(--shadow)]">
            {items.length === 0 && newItems.length === 0 ? (
              <p className="px-3 py-4 text-center text-[13px] text-[var(--muted)]">Geen notificaties.</p>
            ) : null}

            {newItems.length > 0 ? (
              <>
                <p className="px-3 pt-2 pb-1 text-[11px] font-medium tracking-[0.08em] text-[var(--muted)]">
                  {newItems.length === 1 ? "Nieuw bericht" : "Nieuwe berichten"}
                </p>
                <ul className="max-h-[240px] space-y-1 overflow-y-auto">
                  {newItems.map((item) => (
                    <li key={item.conversationId}>
                      <button
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          // Land on the tab that holds this card and open it.
                          setFocusTab(focusTabFor(item));
                          setSelected(item);
                          onOpenNewItem?.(item);
                        }}
                        className="focus-ring w-full rounded-xl px-3 py-2 text-left hover:bg-[var(--bg)]"
                      >
                        <p className="truncate text-[13px] font-semibold text-[var(--ink)]">{item.from}</p>
                        <p className="truncate text-[12px] text-[var(--muted)]">{item.subject}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            {items.length > 0 ? (
              <>
                <p className="px-3 pt-2 pb-1 text-[11px] font-medium tracking-[0.08em] text-[var(--muted)]">Gemiste berichten</p>
                <ul className="max-h-[240px] space-y-1 overflow-y-auto">
                  {items.map((item) => (
                    <li key={item.conversationId}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(item);
                          setOpen(false);
                        }}
                        className="focus-ring w-full rounded-xl px-3 py-2 text-left hover:bg-[var(--bg)]"
                      >
                        <p className="truncate text-[13px] font-semibold text-[var(--ink)]">{item.from}</p>
                        <p className="truncate text-[12px] text-[var(--muted)]">{item.subject}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            {newItems.length > 0 ? (
              <div className="mt-1 border-t border-[var(--line)] px-1 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    onMarkAllNewRead?.();
                    setOpen(false);
                  }}
                  className="focus-ring w-full rounded-xl px-3 py-2 text-left text-[12px] font-medium text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--ink)]"
                >
                  Alles markeren als gelezen
                </button>
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      {selected ? (
        <InboxModal
          item={selected}
          now={new Date()}
          timeZone={timeZoneOf()}
          onClose={() => setSelected(null)}
          onToggleHandled={onToggleHandled}
          onDeclare={onDeclare}
          onRemove={onRemoveItem}
          onReload={onReloadInbox}
          onError={onInboxError}
        />
      ) : null}
    </div>
  );
}

function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}
