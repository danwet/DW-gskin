import type { CalendarEvent } from "./types";

const tones: CalendarEvent["tone"][] = ["blue", "green", "orange", "purple"];

export type GoogleCalendarEvent = {
  id?: string;
  iCalUID?: string;
  calendarColor?: string;
  calendarId?: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { date?: string; dateTime?: string };
};

export function validTimeZone(value: string | null): string {
  if (!value || value.length > 100) return "UTC";
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value });
    return value;
  } catch {
    return "UTC";
  }
}

export function zonedDay(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function offsetMs(timeZone: string, date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  let hour = pick("hour");
  if (hour === 24) hour = 0;
  const asUtc = Date.UTC(pick("year"), pick("month") - 1, pick("day"), hour, pick("minute"), pick("second"));
  return asUtc - date.getTime();
}

export function zonedTimeToUtc(local: string, timeZone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(local);
  if (!match) throw new Error("Invalid local time");
  const [, year, month, day, hour, minute, second] = match.map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  const utc = guess - offsetMs(timeZone, new Date(guess));
  return new Date(guess - offsetMs(timeZone, new Date(utc)));
}

export function dayWindow(
  timeZone: string,
  now = new Date(),
  dayOffset = 0,
): { start: Date; end: Date; day: string } {
  const day = zonedDay(timeZone, now);
  const [year, month, date] = day.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, date + dayOffset));
  const end = new Date(Date.UTC(year, month - 1, date + dayOffset + 1));
  const startDay = start.toISOString().slice(0, 10);
  const endDay = end.toISOString().slice(0, 10);
  return {
    day: startDay,
    start: zonedTimeToUtc(`${startDay}T00:00:00`, timeZone),
    end: zonedTimeToUtc(`${endDay}T00:00:00`, timeZone),
  };
}

function hourMinute(date: Date, timeZone: string): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  let hour = Number(parts.find((part) => part.type === "hour")?.value);
  if (hour === 24) hour = 0;
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  return { hour, minute };
}

function detailFor(event: GoogleCalendarEvent, allDay: boolean): string {
  const location = event.location?.trim();
  const description = event.description?.trim().split("\n")[0]?.trim().slice(0, 140);
  const bits: string[] = [];
  if (allDay) bits.push("All day");
  if (location) bits.push(location);
  else if (description) bits.push(description);
  return bits.join(" · ");
}

export function mapGoogleEvents(
  items: GoogleCalendarEvent[],
  timeZone: string,
  day: string,
): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  for (const item of items) {
    if (!item.id || item.status === "cancelled") continue;
    const allDay = Boolean(item.start?.date && !item.start.dateTime);
    if (allDay) {
      const start = item.start?.date;
      const end = item.end?.date;
      if (!start || !end || start > day || day >= end) continue;
      events.push({
        id: item.id,
        hour: 0,
        minute: 0,
        title: item.summary?.trim() || "(No title)",
        detail: detailFor(item, true),
        tone: tones[events.length % tones.length],
        color: item.calendarColor,
      });
      continue;
    }
    if (!item.start?.dateTime) continue;
    const start = new Date(item.start.dateTime);
    if (Number.isNaN(start.getTime()) || zonedDay(timeZone, start) !== day) continue;
    const clock = hourMinute(start, timeZone);
    events.push({
      id: item.id,
      hour: clock.hour,
      minute: clock.minute,
      title: item.summary?.trim() || "(No title)",
      detail: detailFor(item, false),
      tone: tones[events.length % tones.length],
      color: item.calendarColor,
    });
  }
  return events;
}
