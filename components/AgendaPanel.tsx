"use client";

import { formatHourMinute } from "@/lib/greeting";
import { useApp } from "./AppProvider";

export function AgendaPanel() {
  const { brief, ready, calendarError } = useApp();
  const events = [...brief.events].sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
  const tomorrow = [...(brief.tomorrowEvents ?? [])].sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));

  return (
    <section aria-label="Agenda">
      <p className="text-[11px] font-medium tracking-[0.16em] text-[var(--muted)] uppercase">Op de agenda</p>
      <h2 className="mt-1 text-[22px] font-semibold tracking-[-0.02em] text-[var(--ink)]">Vandaag</h2>
      {!ready ? (
        <p className="mt-3 text-[14px] text-[var(--muted)]">Agenda wordt geladen…</p>
      ) : calendarError ? (
        <p className="mt-3 text-[14px] text-[var(--muted)]">{calendarError}</p>
      ) : events.length === 0 ? (
        <p className="mt-3 text-[14px] text-[var(--muted)]">Lekker niks</p>
      ) : (
        <ol className="mt-4 space-y-5 border-l border-[var(--line)] pl-5">
          {events.map((event) => (
            <li key={event.id} className="relative">
              <span
                className="absolute top-1 -left-[25px] h-2 w-2 rounded-full"
                style={{ background: event.color ?? "var(--blue)" }}
              />
              <p className="tnum text-[13px] text-[var(--muted)]">
                {formatHourMinute(event.hour, event.minute)}
              </p>
              <p className="mt-0.5 text-[17px] font-semibold text-[var(--ink)]">{event.title}</p>
              {event.detail ? (
                <p className="mt-0.5 text-[14px] leading-5 text-[var(--muted)]">{event.detail}</p>
              ) : null}
            </li>
          ))}
        </ol>
      )}

      <h2 className="mt-8 text-[22px] font-semibold tracking-[-0.02em] text-[var(--ink)]">Morgen</h2>
      {!ready ? (
        <p className="mt-3 text-[14px] text-[var(--muted)]">Agenda wordt geladen…</p>
      ) : tomorrow.length === 0 ? (
        <p className="mt-3 text-[14px] text-[var(--muted)]">Lekker niks</p>
      ) : (
        <ol className="mt-4 space-y-5 border-l border-[var(--line)] pl-5">
          {tomorrow.map((event) => (
            <li key={event.id} className="relative">
              <span
                className="absolute top-1 -left-[25px] h-2 w-2 rounded-full"
                style={{ background: event.color ?? "var(--blue)" }}
              />
              <p className="tnum text-[13px] text-[var(--muted)]">
                {formatHourMinute(event.hour, event.minute)}
              </p>
              <p className="mt-0.5 text-[17px] font-semibold text-[var(--ink)]">{event.title}</p>
              {event.detail ? (
                <p className="mt-0.5 text-[14px] leading-5 text-[var(--muted)]">{event.detail}</p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
