"use client";

import { useState } from "react";
import { timeZoneOf, useInbox } from "./AgentInbox";
import { InboxCard, InboxModal } from "./InboxGrid";
import type { MailAssessment } from "@/lib/agent/types";

export function BewarenView() {
  const inbox = useInbox();
  const [selected, setSelected] = useState<MailAssessment | null>(null);
  const now = new Date();
  const timeZone = timeZoneOf();

  const saved = inbox.items
    .filter((item) => Boolean(item.savedAt))
    .sort((a, b) => Date.parse(b.savedAt!) - Date.parse(a.savedAt!));

  const groups: { key: string; label: string; items: MailAssessment[] }[] = [];
  for (const item of saved) {
    const date = new Date(item.savedAt!);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    const label = date.toLocaleDateString("nl-NL", { month: "long", year: "numeric" });
    const group = groups.find((g) => g.key === key);
    if (group) group.items.push(item);
    else groups.push({ key, label, items: [item] });
  }

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-7 sm:px-8 sm:py-8 md:pt-14 md:pb-14">
      <header className="mb-8">
        <p className="text-[11px] font-medium tracking-[0.16em] text-[var(--muted)] uppercase">Bewaren</p>
        <h1 className="mt-1 text-[30px] font-bold tracking-[-0.03em] text-[var(--ink)]">Bewaren</h1>
        <p className="mt-2 text-[14px] text-[var(--muted)]">E-mails die je hebt bewaard voor later.</p>
      </header>

      {inbox.loading ? (
        <p className="text-[14px] text-[var(--muted)]">Laden…</p>
      ) : inbox.error ? (
        <p className="text-[14px] text-[var(--muted)]">{inbox.error}</p>
      ) : saved.length === 0 ? (
        <p className="text-[14px] text-[var(--muted)]">Nog niets bewaard.</p>
      ) : (
        <div className="space-y-10">
          {groups.map((group) => (
            <section key={group.key}>
              <h2 className="mb-4 text-[17px] font-semibold tracking-[-0.02em] text-[var(--ink)] capitalize">{group.label}</h2>
              <div className="grid gap-x-3 gap-y-0 sm:grid-cols-2">
                {group.items.map((item, index) => (
                  <InboxCard
                    key={item.conversationId}
                    item={item}
                    index={index}
                    now={now}
                    timeZone={timeZone}
                    onSnooze={inbox.snoozeItem}
                    onDeclare={inbox.declareInvoice}
                    onClick={() => setSelected(item)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {selected ? (
        <InboxModal
          item={selected}
          now={now}
          timeZone={timeZone}
          onClose={() => setSelected(null)}
          onToggleHandled={inbox.toggleHandled}
          onDeclare={inbox.declareInvoice}
          onSave={inbox.saveItem}
        />
      ) : null}
    </div>
  );
}
