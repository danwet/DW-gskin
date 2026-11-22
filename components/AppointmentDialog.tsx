"use client";

import { useEffect, useState } from "react";
import type { CalendarEvent } from "@/lib/types";

type CalendarChoice = { id: string; name: string; primary: boolean };

const fieldClass =
  "w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--blue)]";
const labelClass = "text-[11px] font-medium tracking-[0.12em] text-[var(--muted)] uppercase";

function timeOf(iso?: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function dateOf(iso?: string): string {
  if (!iso) return new Date().toLocaleDateString("sv-SE");
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return new Date().toLocaleDateString("sv-SE");
  return date.toLocaleDateString("sv-SE");
}

/**
 * Create or change one appointment. The same dialog serves "new" and "edit", so
 * the fields never drift apart.
 */
export function AppointmentDialog({
  event,
  onClose,
  onSaved,
}: {
  event?: CalendarEvent | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = Boolean(event);
  const [calendars, setCalendars] = useState<CalendarChoice[]>([]);
  const [calendarId, setCalendarId] = useState(event?.calendarId ?? "");
  const [title, setTitle] = useState(event?.title ?? "");
  const [date, setDate] = useState(dateOf(event?.start));
  const [allDay, setAllDay] = useState(Boolean(event?.allDay));
  const [startTime, setStartTime] = useState(timeOf(event?.start) || "09:00");
  const [endTime, setEndTime] = useState(timeOf(event?.end) || "09:30");
  const [location, setLocation] = useState(event?.location ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [askScope, setAskScope] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const response = await fetch("/api/calendar/calendars", { cache: "no-store" });
        const data = (await response.json()) as { calendars?: CalendarChoice[]; error?: string };
        if (!alive) return;
        if (data.error) {
          setError(data.error);
          return;
        }
        const list = data.calendars ?? [];
        setCalendars(list);
        // The primary calendar is the sensible default for a new appointment.
        setCalendarId((current) => current || list.find((entry) => entry.primary)?.id || list[0]?.id || "");
      } catch {
        if (alive) setError("Agenda's konden niet worden opgehaald.");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const payload = () => ({
    calendarId,
    title,
    date,
    startTime,
    endTime,
    allDay,
    location,
    description,
  });

  const save = async () => {
    if (busy) return;
    if (!title.trim()) return setError("Geef de afspraak een titel.");
    if (!calendarId) return setError("Kies een agenda.");
    if (!allDay && endTime <= startTime) return setError("De eindtijd moet na de begintijd liggen.");
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/calendar/events", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { ...payload(), eventId: event?.id } : payload()),
      });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !data?.ok) {
        setError(data?.error ?? "Opslaan mislukt.");
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("Opslaan mislukt: geen verbinding.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (scope: "one" | "following") => {
    if (!event?.calendarId || !event.id) return;
    setBusy(true);
    setError(null);
    try {
      const query = new URLSearchParams({
        calendarId: event.calendarId,
        eventId: event.id,
        scope,
        occurrenceStart: event.start ?? "",
      });
      const response = await fetch(`/api/calendar/events?${query.toString()}`, { method: "DELETE" });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !data?.ok) {
        setError(data?.error ?? "Verwijderen mislukt.");
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("Verwijderen mislukt: geen verbinding.");
    } finally {
      setBusy(false);
      setAskScope(false);
    }
  };

  const readOnly = editing && event?.editable === false;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4">
      <button type="button" aria-label="Sluiten" className="absolute inset-0 bg-[#12141c]/45" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="appointment-title"
        className="relative w-full max-w-[480px] rounded-[24px] border border-[var(--line)] bg-[var(--card)] p-5 shadow-[var(--shadow)]"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="appointment-title" className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--ink)]">
            {editing ? "Afspraak" : "Nieuwe afspraak"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Sluiten"
            className="focus-ring rounded-full px-2 py-1 text-[16px] leading-none text-[var(--muted)] hover:text-[var(--ink)]"
          >
            ×
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className={labelClass} htmlFor="appointment-name">Titel</label>
            <input
              id="appointment-name"
              value={title}
              onChange={(entry) => setTitle(entry.target.value)}
              disabled={readOnly}
              placeholder="Tandarts"
              className={`mt-1 ${fieldClass}`}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} htmlFor="appointment-calendar">Agenda</label>
              <select
                id="appointment-calendar"
                value={calendarId}
                onChange={(entry) => setCalendarId(entry.target.value)}
                disabled={readOnly || calendars.length === 0}
                className={`mt-1 ${fieldClass}`}
              >
                {calendars.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="appointment-date">Datum</label>
              <input
                id="appointment-date"
                type="date"
                value={date}
                onChange={(entry) => setDate(entry.target.value)}
                disabled={readOnly}
                className={`mt-1 ${fieldClass}`}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-[13px] text-[var(--ink)]">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(entry) => setAllDay(entry.target.checked)}
              disabled={readOnly}
              className="h-4 w-4 rounded border-[var(--line)]"
            />
            Hele dag
          </label>

          {!allDay ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass} htmlFor="appointment-start">Begintijd</label>
                <input
                  id="appointment-start"
                  type="time"
                  value={startTime}
                  onChange={(entry) => setStartTime(entry.target.value)}
                  disabled={readOnly}
                  className={`mt-1 ${fieldClass}`}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="appointment-end">Eindtijd</label>
                <input
                  id="appointment-end"
                  type="time"
                  value={endTime}
                  onChange={(entry) => setEndTime(entry.target.value)}
                  disabled={readOnly}
                  className={`mt-1 ${fieldClass}`}
                />
              </div>
            </div>
          ) : null}

          <div>
            <label className={labelClass} htmlFor="appointment-location">Locatie</label>
            <input
              id="appointment-location"
              value={location}
              onChange={(entry) => setLocation(entry.target.value)}
              disabled={readOnly}
              className={`mt-1 ${fieldClass}`}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="appointment-note">Notitie</label>
            <textarea
              id="appointment-note"
              value={description}
              onChange={(entry) => setDescription(entry.target.value)}
              disabled={readOnly}
              rows={2}
              className={`mt-1 ${fieldClass}`}
            />
          </div>

          {readOnly ? (
            <p className="text-[12px] text-[var(--muted)]">Deze agenda is alleen-lezen.</p>
          ) : null}
          {error ? <p className="text-[12px] text-[var(--danger)]">{error}</p> : null}
        </div>

        {askScope ? (
          <div className="mt-4 rounded-2xl bg-[var(--bg)] p-3">
            <p className="text-[13px] font-medium text-[var(--ink)]">Deze afspraak herhaalt zich. Wat wil je verwijderen?</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void remove("one")}
                disabled={busy}
                className="btn-secondary focus-ring rounded-full px-3 py-1.5 text-[13px] font-medium"
              >
                Alleen deze
              </button>
              <button
                type="button"
                onClick={() => void remove("following")}
                disabled={busy}
                className="btn-secondary focus-ring rounded-full px-3 py-1.5 text-[13px] font-medium"
              >
                Deze en volgende
              </button>
              <button
                type="button"
                onClick={() => setAskScope(false)}
                className="focus-ring rounded-full px-3 py-1.5 text-[13px] text-[var(--muted)]"
              >
                Annuleren
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5 flex items-center justify-between gap-2">
            <div>
              {editing && !readOnly ? (
                <button
                  type="button"
                  onClick={() => (event?.recurring ? setAskScope(true) : void remove("one"))}
                  disabled={busy}
                  className="focus-ring rounded-full px-3 py-1.5 text-[13px] font-medium text-[var(--danger)] disabled:opacity-60"
                >
                  Verwijderen
                </button>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="btn-secondary focus-ring rounded-full px-4 py-2 text-[13px] font-medium"
              >
                Annuleren
              </button>
              {!readOnly ? (
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={busy}
                  className="btn-primary focus-ring rounded-full px-4 py-2 text-[13px] font-medium disabled:opacity-60"
                >
                  {busy ? "Bezig…" : "Opslaan"}
                </button>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
