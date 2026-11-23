"use client";

import { useInbox } from "./AgentInbox";
import { PageTitle } from "./PageTitle";

export function GemistView() {
  const { items, loading, error } = useInbox();
  const missed = items.filter((item) => item.classification === "unclassified");

  return (
    <div className="mx-auto max-w-[880px] px-6 pt-9 pb-7 sm:px-8 sm:pb-8 md:pb-14">
      <PageTitle eyebrow="Gemist" title="Gemist" />

      {loading ? (
        <p className="text-[14px] text-[var(--muted)]">Laden…</p>
      ) : error ? (
        <p className="text-[14px] text-[var(--muted)]">{error}</p>
      ) : missed.length === 0 ? (
        <p className="text-[14px] text-[var(--muted)]">Niets gemist.</p>
      ) : (
        <ul className="space-y-3">
          {missed.map((item) => (
            <li key={item.conversationId} className="glass-panel rounded-2xl p-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="truncate text-[14px] font-semibold text-[var(--ink)]">{item.from}</p>
                <p className="shrink-0 text-[12px] text-[var(--muted)]">{item.fromEmail}</p>
              </div>
              <p className="mt-0.5 text-[13px] text-[var(--ink)]">{item.subject}</p>
              {item.body ? <p className="mt-1 text-[12px] text-[var(--muted)]">{item.body.slice(0, 200)}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
