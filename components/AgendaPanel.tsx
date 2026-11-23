"use client";

import { useState } from "react";
import { formatHourMinute } from "@/lib/greeting";
import type { CalendarEvent } from "@/lib/types";
import { AppointmentDialog } from "./AppointmentDialog";
import { useApp } from "./AppProvider";

export function AgendaPanel() {
  const { brief, ready, calendarError, refreshCalendar } = useApp();
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [creating, setCreating] = useState(false);
  const events = [...brief.events].sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
  const tomorrow = [...(brief.tomorrowEvents ?? [])].sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));

  return (
    <section aria-label="Agenda">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-medium tracking-[0.16em] text-[var(--muted)] uppercase">Op de agenda</p>
        <button
          type="button"
          onClick={() => setCreating(true)}
          aria-label="Afspraak toevoegen"
          title="Afspraak toevoegen"
          className="btn-primary focus-ring grid h-7 w-7 shrink-0 place-items-center rounded-full text-[var(--ink)]"
        >
          <PlusIcon />
        </button>
      </div>
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
                style={{ background: event.color ?? "var(--dot-blue)" }}
              />
              <button
                type="button"
                onClick={() => setEditing(event)}
                className="focus-ring w-full rounded-xl text-left"
              >
                <p className="tnum text-[13px] text-[var(--muted)]">
                  {formatHourMinute(event.hour, event.minute)}
                </p>
                <p className="mt-0.5 text-[17px] font-semibold text-[var(--ink)]">{event.title}</p>
                {event.detail ? (
                  <p className="mt-0.5 text-[14px] leading-5 text-[var(--muted)]">{event.detail}</p>
                ) : null}
              </button>
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
                style={{ background: event.color ?? "var(--dot-blue)" }}
              />
              <button
                type="button"
                onClick={() => setEditing(event)}
                className="focus-ring w-full rounded-xl text-left"
              >
                <p className="tnum text-[13px] text-[var(--muted)]">
                  {formatHourMinute(event.hour, event.minute)}
                </p>
                <p className="mt-0.5 text-[17px] font-semibold text-[var(--ink)]">{event.title}</p>
                {event.detail ? (
                  <p className="mt-0.5 text-[14px] leading-5 text-[var(--muted)]">{event.detail}</p>
                ) : null}
              </button>
            </li>
          ))}
        </ol>
      )}

      {creating ? (
        <AppointmentDialog onClose={() => setCreating(false)} onSaved={() => void refreshCalendar()} />
      ) : null}
      {editing ? (
        <AppointmentDialog
          event={editing}
          onClose={() => setEditing(null)}
          onSaved={() => void refreshCalendar()}
        />
      ) : null}
    </section>
  );
}

function PlusIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M8 3.2v9.6M3.2 8h9.6" />
    </svg>
  );
}
