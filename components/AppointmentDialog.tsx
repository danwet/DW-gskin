"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/kit/modal";
import { PlaceField } from "@/components/PlaceField";
import type { CalendarEvent } from "@/lib/types";

type CalendarChoice = { id: string; name: string; primary: boolean };

// Alleen een lijn onder het veld; de cursor maakt zichtbaar waar je typt.
const fieldClass =
  "mt-1 w-full rounded-none border-0 border-b border-hairline bg-transparent px-0 py-2 text-[15px] text-ink caret-[var(--blue)] outline-none transition-colors focus:border-[var(--blue)]!";
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

/** ISO (YYYY-MM-DD) naar wat de gebruiker ziet: dd / mm / yyyy. */
function isoToDisplay(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return "";
  return `${match[3]} / ${match[2]} / ${match[1]}`;
}

/** Wat de gebruiker typt (dd/mm/yyyy) terug naar ISO, of null als het geen datum is. */
function displayToIso(text: string): string | null {
  const digits = text.replace(/\D/g, "");
  if (digits.length !== 8) return null;
  const day = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const year = Number(digits.slice(4));
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const probe = new Date(year, month - 1, day, 12);
  if (probe.getFullYear() !== year || probe.getMonth() !== month - 1 || probe.getDate() !== day) return null;
  return `${digits.slice(4)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`;
}

/** "14", "14:00", "1400" en "14.00" worden allemaal 14:00; anders null. */
function normalizeTime(text: string): string | null {
  const match = /^(\d{1,2})[:.\s]?(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** Telt minuten bij een HH:MM-tijd op, met wraparound over middernacht. */
function addMinutes(time: string, minutes: number): string {
  const [hours, mins] = time.split(":").map(Number);
  const total = (hours * 60 + mins + minutes + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
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
  // Het datumveld toont dd / mm / yyyy, los van de landinstelling van de browser.
  const [dateText, setDateText] = useState(() => isoToDisplay(dateOf(event?.start)));
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
    date: displayToIso(dateText) ?? date,
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
    if (!displayToIso(dateText)) return setError("Vul de datum in als dd / mm / jjjj.");
    if (!allDay && !normalizeTime(startTime)) return setError("Vul een begintijd in als 14:00.");
    if (!allDay && !normalizeTime(endTime)) return setError("Vul een eindtijd in als 14:30.");
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
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={editing ? "Afspraak" : "Nieuwe afspraak"}
      voet={
        <div className="flex w-full flex-col items-center gap-2">
          {readOnly ? <p className="t-meta text-center text-ink-muted">Deze agenda is alleen-lezen.</p> : null}
          {error ? <p className="t-meta text-center text-[var(--danger)]">{error}</p> : null}
          <div className="flex items-center justify-center gap-2">
            {editing && !readOnly ? (
              <button
                type="button"
                onClick={() => (event?.recurring ? setAskScope(true) : void remove("one"))}
                disabled={busy}
                className="btn-secondary focus-ring rounded-full px-4 py-2 text-[13px] font-medium text-[var(--danger)] disabled:opacity-60"
              >
                Verwijderen
              </button>
            ) : null}
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
      }
    >
      <div className="flex flex-col gap-3">
        <div>
          <label className="text-[11px] font-medium tracking-[0.12em] text-ink-faint uppercase" htmlFor="appointment-name">Titel</label>
          <input
            id="appointment-name"
            value={title}
            onChange={(entry) => setTitle(entry.target.value)}
            disabled={readOnly}
            placeholder="Tandarts"
            className="veld-underline mt-1 h-9 px-0 py-0 text-[15px] text-ink"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-medium tracking-[0.12em] text-ink-faint uppercase" htmlFor="appointment-calendar">Agenda</label>
            <select
              id="appointment-calendar"
              value={calendarId}
              onChange={(entry) => setCalendarId(entry.target.value)}
              disabled={readOnly || calendars.length === 0}
              className="veld-underline mt-1 h-9 px-0 py-0 text-[15px] text-ink"
            >
              {calendars.map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium tracking-[0.12em] text-ink-faint uppercase" htmlFor="appointment-date">Datum</label>
            <input
              id="appointment-date"
              type="text"
              inputMode="numeric"
              placeholder="dd / mm / jjjj"
              value={dateText}
              onChange={(entry) => {
                setDateText(entry.target.value);
                const iso = displayToIso(entry.target.value);
                if (iso) setDate(iso);
              }}
              onBlur={() => {
                const iso = displayToIso(dateText);
                if (!iso) return;
                // Het veld zet zichzelf netjes op dd / mm / jjjj.
                setDate(iso);
                setDateText(isoToDisplay(iso));
              }}
              disabled={readOnly}
              className="veld-underline mt-1 h-9 px-0 py-0 text-[15px] text-ink"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-[13px] text-ink">
          <input type="checkbox" checked={allDay} onChange={(entry) => setAllDay(entry.target.checked)} disabled={readOnly} className="h-4 w-4 rounded border-hairline" />
          Hele dag
        </label>

        {!allDay ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium tracking-[0.12em] text-ink-faint uppercase" htmlFor="appointment-start">Begintijd</label>
              <input
                id="appointment-start"
                type="text"
                inputMode="numeric"
                placeholder="14:00"
                value={startTime}
                onChange={(entry) => setStartTime(entry.target.value)}
                onBlur={() => {
                  const normalized = normalizeTime(startTime);
                  if (!normalized) return;
                  setStartTime(normalized);
                  // De eindtijd stelt de eerstvolgende dertig minuten voor.
                  const current = normalizeTime(endTime);
                  if (!current || current <= normalized) setEndTime(addMinutes(normalized, 30));
                }}
                disabled={readOnly}
                className="veld-underline mt-1 h-9 px-0 py-0 text-[15px] text-ink"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium tracking-[0.12em] text-ink-faint uppercase" htmlFor="appointment-end">Eindtijd</label>
              <input
                id="appointment-end"
                type="text"
                inputMode="numeric"
                placeholder="14:30"
                value={endTime}
                onChange={(entry) => setEndTime(entry.target.value)}
                onBlur={() => {
                  const normalized = normalizeTime(endTime);
                  if (normalized) setEndTime(normalized);
                }}
                disabled={readOnly}
                className="veld-underline mt-1 h-9 px-0 py-0 text-[15px] text-ink"
              />
            </div>
          </div>
        ) : null}

        <div>
          <label className="text-[11px] font-medium tracking-[0.12em] text-ink-faint uppercase" htmlFor="appointment-location">Locatie</label>
          <PlaceField
            id="appointment-location"
            value={location}
            onChange={(next) => setLocation(next)}
            disabled={readOnly}
            className="veld-underline mt-1 h-9 px-0 py-0 text-[15px] text-ink"
          />
        </div>

        <div>
          <label className="text-[11px] font-medium tracking-[0.12em] text-ink-faint uppercase" htmlFor="appointment-note">Notitie</label>
          <textarea id="appointment-note" value={description} onChange={(entry) => setDescription(entry.target.value)} disabled={readOnly} rows={2} className="veld-underline mt-1 px-0 py-2 text-[15px] text-ink" />
        </div>

        {askScope ? (
          <div className="rounded-2xl bg-bg p-3">
            <p className="text-[13px] font-medium text-ink">Deze afspraak herhaalt zich. Wat wil je verwijderen?</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => void remove("one")} disabled={busy} className="rounded-full bg-[var(--line)] px-3 py-1.5 text-[13px] font-medium text-ink">Alleen deze</button>
              <button type="button" onClick={() => void remove("following")} disabled={busy} className="rounded-full bg-[var(--line)] px-3 py-1.5 text-[13px] font-medium text-ink">Deze en volgende</button>
              <button type="button" onClick={() => setAskScope(false)} className="rounded-full px-3 py-1.5 text-[13px] text-ink-muted">Annuleren</button>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}