import "server-only";

const API = "https://www.googleapis.com/calendar/v3";
const TIME_ZONE = "Europe/Amsterdam";

export type EventInput = {
  calendarId: string;
  title: string;
  /** Local date, YYYY-MM-DD. */
  date: string;
  /** Local time, HH:MM. Ignored when allDay is true. */
  startTime?: string;
  endTime?: string;
  allDay?: boolean;
  location?: string;
  description?: string;
};

type Failure = { ok: false; error: string; status: number };
type Success = { ok: true; id: string };
export type WriteResult = Success | Failure;

function body(input: EventInput): Record<string, unknown> {
  if (input.allDay) {
    // An all-day event ends the day after, exclusive.
    const [year, month, day] = input.date.split("-").map(Number);
    const next = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
    return {
      summary: input.title,
      location: input.location || undefined,
      description: input.description || undefined,
      start: { date: input.date },
      end: { date: next },
    };
  }
  return {
    summary: input.title,
    location: input.location || undefined,
    description: input.description || undefined,
    // Without an offset Google reads these in the given time zone, which keeps
    // daylight saving correct.
    start: { dateTime: `${input.date}T${input.startTime ?? "09:00"}:00`, timeZone: TIME_ZONE },
    end: { dateTime: `${input.date}T${input.endTime ?? "09:30"}:00`, timeZone: TIME_ZONE },
  };
}

async function call(
  token: string,
  path: string,
  init: RequestInit,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> | null }> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  return { ok: response.ok, status: response.status, data };
}

function explain(status: number): string {
  if (status === 401) return "Log opnieuw in om de agenda te gebruiken.";
  if (status === 403) return "De koppeling mag nog niet schrijven. Koppel opnieuw om afspraken te kunnen maken.";
  if (status === 404) return "Deze afspraak bestaat niet meer.";
  if (status === 400) return "De agenda begreep de invoer niet. Controleer datum en tijden.";
  return "De agenda kon de wijziging niet verwerken.";
}

export async function createCalendarEvent(token: string, input: EventInput): Promise<WriteResult> {
  const result = await call(token, `/calendars/${encodeURIComponent(input.calendarId)}/events`, {
    method: "POST",
    body: JSON.stringify(body(input)),
  });
  if (!result.ok) return { ok: false, error: explain(result.status), status: result.status };
  return { ok: true, id: String(result.data?.id ?? "") };
}

export async function updateCalendarEvent(
  token: string,
  eventId: string,
  input: EventInput,
): Promise<WriteResult> {
  const result = await call(
    token,
    `/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "PATCH", body: JSON.stringify(body(input)) },
  );
  if (!result.ok) return { ok: false, error: explain(result.status), status: result.status };
  return { ok: true, id: String(result.data?.id ?? eventId) };
}

/** Deletes one occurrence, or everything from this occurrence onwards. */
export async function deleteCalendarEvent(
  token: string,
  calendarId: string,
  eventId: string,
): Promise<WriteResult> {
  const result = await call(
    token,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE" },
  );
  if (!result.ok && result.status !== 410) {
    return { ok: false, error: explain(result.status), status: result.status };
  }
  return { ok: true, id: eventId };
}

/**
 * Ends a recurring series before the given occurrence, which is what "this and
 * following" means in iOS Calendar.
 */
export async function truncateSeries(
  token: string,
  calendarId: string,
  masterEventId: string,
  occurrenceStart: string,
): Promise<WriteResult> {
  const path = `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(masterEventId)}`;
  const current = await call(token, path, { method: "GET" });
  if (!current.ok) return { ok: false, error: explain(current.status), status: current.status };

  const rules = Array.isArray(current.data?.recurrence) ? (current.data?.recurrence as string[]) : [];
  const until = occurrenceStart.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const next = rules.map((rule) =>
    rule.startsWith("RRULE:")
      ? `${rule.replace(/;?UNTIL=[^;]*/i, "")};UNTIL=${until}`
      : rule,
  );
  if (next.length === 0) {
    return { ok: false, error: "Deze afspraak herhaalt niet.", status: 400 };
  }
  const result = await call(token, path, { method: "PATCH", body: JSON.stringify({ recurrence: next }) });
  if (!result.ok) return { ok: false, error: explain(result.status), status: result.status };
  return { ok: true, id: masterEventId };
}
