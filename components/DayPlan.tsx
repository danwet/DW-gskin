"use client";

import { dueTime, formatDueLabel, isDueUrgent } from "@/lib/epc";
import { mailListCopy } from "@/lib/empty-brief";
import { formatHourMinute } from "@/lib/greeting";
import { orderByCheckState } from "@/lib/settings";
import { PageHeader } from "./PageHeader";
import { useApp } from "./AppProvider";
import { Card, CardHeading } from "./ui";

const tones = {
  blue: "var(--blue)",
  green: "var(--green)",
  orange: "var(--orange)",
  purple: "var(--purple)",
};

export function DayPlan() {
  const { brief, checked, checkedAt, isSnoozed, ready, calendarError, mailError } = useApp();
  const emptyCopy = mailListCopy(ready, mailError);
  const urgentDue: Record<string, number> = {};
  for (const loop of brief.loops) {
    const iso = loop.payment?.due_date;
    if (!iso || !isDueUrgent(iso)) continue;
    const at = dueTime(iso);
    if (at != null) urgentDue[loop.id] = at;
  }
  const ordered = orderByCheckState(
    brief.loops.filter((loop) => !isSnoozed(loop.id)),
    checked,
    checkedAt,
    new Set(),
    {},
    urgentDue,
  );
  const open = ordered.filter((loop) => !checked.has(loop.id));

  return (
    <div className="mx-auto max-w-[880px] px-4 py-6 sm:px-8 sm:py-8">
      <PageHeader action="none" />
      <div className="mt-6 grid gap-4">
        <Card>
          <CardHeading eyebrow="TODAY" title="Calendar" meta={`${brief.events.length} events`} />
          {!ready ? (
            <p className="text-[14px] text-[var(--muted)]">Loading your calendar.</p>
          ) : calendarError ? (
            <p className="text-[14px] text-[var(--muted)]">{calendarError}</p>
          ) : brief.events.length === 0 ? (
            <p className="text-[14px] text-[var(--muted)]">Nothing on your calendar today.</p>
          ) : (
          <ol className="space-y-0">
            {brief.events.map((event, index) => (
              <li key={event.id} className="flex gap-4">
                <div className="flex w-14 shrink-0 flex-col items-end">
                  <p className="text-[13px] font-semibold">{formatHourMinute(event.hour, event.minute)}</p>
                  {index < brief.events.length - 1 ? (
                    <span className="mt-2 w-px flex-1 bg-[var(--line)]" />
                  ) : null}
                </div>
                <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: tones[event.tone] }} />
                <div className="pb-6">
                  <p className="text-[16px] font-medium">{event.title}</p>
                  <p className="mt-1 text-[14px] text-[var(--muted)]">{event.detail}</p>
                </div>
              </li>
            ))}
          </ol>
          )}
        </Card>

        {brief.upcoming.length > 0 ? (
          <Card>
            <CardHeading eyebrow="LATER" title="Held from email" meta={`${brief.upcoming.length} upcoming`} />
            <ul className="space-y-3">
              {brief.upcoming.map((item) => (
                <li key={item.id}>
                  <p className="text-[12px] font-medium tracking-wide text-[var(--orange)]">{item.when}</p>
                  <p className="mt-1 text-[15px] font-medium">{item.title}</p>
                  <p className="text-[13px] text-[var(--muted)]">{item.detail}</p>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <Card>
          <CardHeading eyebrow="STILL OPEN" title="Before the day moves on" meta={`${open.length} left`} />
          {brief.loops.length === 0 ? (
            <p className="text-[14px] leading-6 text-[var(--muted)]">{emptyCopy}</p>
          ) : open.length === 0 ? (
            <p className="text-[14px] text-[var(--muted)]">Everything from this triage is checked off.</p>
          ) : (
            <ul className="space-y-3">
              {open.map((loop) => (
                <li key={loop.id} className="px-2 py-1">
                  <p className="text-[15px] font-medium">{loop.title}</p>
                  <p className="text-[13px] text-[var(--muted)]">{loop.detail}</p>
                  {loop.payment?.due_date ? (
                    <p
                      className={`text-[13px] ${
                        isDueUrgent(loop.payment.due_date) ? "text-[var(--danger)]" : "text-[var(--muted)]"
                      }`}
                    >
                      Due {formatDueLabel(loop.payment.due_date)}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
