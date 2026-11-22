import "server-only";

import { getToken } from "next-auth/jwt";
import {
  dayWindow,
  mapGoogleEvents,
  type GoogleCalendarEvent,
} from "./calendar-events";
import { refreshGoogleAccessToken } from "./google-token";
import type { CalendarEvent } from "./types";

const SIGN_IN_ERROR = "Google Calendar could not be read with this sign-in.";
const RECONSENT_ERROR =
  "Google Calendar could not be read with this sign-in. Sign out and sign in again to allow calendar read access.";
const API_DISABLED_ERROR =
  "Google Calendar API is turned off for this Google Cloud project. Enable the Calendar API, then refresh.";
const UNAVAILABLE_ERROR = "Google Calendar could not be read right now.";

type Listed = GoogleCalendarEvent[] | { kind: "auth" | "down"; status: number; reason: string };

function googleFailure(status: number, body: string): { kind: "auth" | "down"; status: number; reason: string } {
  let reason = "";
  try {
    const data = JSON.parse(body) as {
      error?: { message?: string; status?: string; errors?: { reason?: string }[] };
    };
    const error = data.error;
    const code = error?.errors?.[0]?.reason || error?.status || "";
    const message = error?.message || "";
    reason = [code, message].filter(Boolean).join(": ").slice(0, 220);
  } catch {
    reason = "";
  }
  const kind = status === 401 || status === 403 ? "auth" : "down";
  return { kind, status, reason };
}

async function grantedScopes(accessToken: string): Promise<string[] | null> {
  try {
    const response = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
    );
    if (!response.ok) return null;
    const data = (await response.json()) as { scope?: unknown };
    return typeof data.scope === "string" ? data.scope.split(" ") : null;
  } catch {
    return null;
  }
}

export type CalendarListEntry = {
  id?: string;
  summary?: string;
  accessRole?: string;
  backgroundColor?: string;
  primary?: boolean;
  deleted?: boolean;
};

type CalendarListResult =
  | CalendarListEntry[]
  | { kind: "auth" | "down"; status: number; reason: string };

const MAX_CALENDARS = 50;
const MAX_PAGES_PER_CALENDAR = 2;

async function listCalendars(accessToken: string): Promise<CalendarListResult> {
  const entries: CalendarListEntry[] = [];
  let pageToken = "";
  for (let page = 0; page < 3; page += 1) {
    const url = new URL("https://www.googleapis.com/calendar/v3/users/me/calendarList");
    url.searchParams.set("maxResults", "250");
    url.searchParams.set("minAccessRole", "reader");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    let response: Response;
    try {
      response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    } catch {
      return { kind: "down", status: 0, reason: "network" };
    }
    if (!response.ok) return googleFailure(response.status, await response.text());

    const data = (await response.json()) as { items?: CalendarListEntry[]; nextPageToken?: string };
    if (Array.isArray(data.items)) entries.push(...data.items);
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return entries.filter((entry) => Boolean(entry.id) && !entry.deleted);
}

async function listCalendarEvents(
  accessToken: string,
  calendarId: string,
  start: Date,
  end: Date,
): Promise<Listed> {
  const items: GoogleCalendarEvent[] = [];
  let pageToken = "";
  for (let page = 0; page < MAX_PAGES_PER_CALENDAR; page += 1) {
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    );
    url.searchParams.set("timeMin", start.toISOString());
    url.searchParams.set("timeMax", end.toISOString());
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("maxResults", "50");
    url.searchParams.set("showDeleted", "false");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    let response: Response;
    try {
      response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    } catch {
      return { kind: "down", status: 0, reason: "network" };
    }
    if (!response.ok) return googleFailure(response.status, await response.text());

    const data = (await response.json()) as { items?: GoogleCalendarEvent[]; nextPageToken?: string };
    if (Array.isArray(data.items)) items.push(...data.items);
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return items;
}

function dedupeEvents(items: GoogleCalendarEvent[]): GoogleCalendarEvent[] {
  const seen = new Set<string>();
  const next: GoogleCalendarEvent[] = [];
  for (const item of items) {
    const key = item.iCalUID ?? item.id;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    next.push(item);
  }
  return next;
}

async function listAllEvents(accessToken: string, start: Date, end: Date): Promise<Listed> {
  const calendars = await listCalendars(accessToken);
  if (!Array.isArray(calendars)) return calendars;
  if (calendars.length === 0) return [];

  const list = calendars.slice(0, MAX_CALENDARS);
  const results = await Promise.all(
    list.map(async (calendar) => {
      const events = await listCalendarEvents(accessToken, calendar.id ?? "", start, end);
      // Tag each event with its calendar so the dialog can write it back.
      return Array.isArray(events) ? events.map((event) => ({ ...event, calendarId: calendar.id })) : events;
    }),
  );

  const merged: GoogleCalendarEvent[] = [];
  let authFailures = 0;
  let otherFailures = 0;
  results.forEach((result, index) => {
    if (Array.isArray(result)) {
      const color = list[index]?.backgroundColor;
      const name = list[index]?.summary ?? undefined;
      const editable = list[index]?.accessRole === "owner" || list[index]?.accessRole === "writer";
      for (const item of result) merged.push({ ...item, calendarColor: color, calendarName: name, editable });
    } else if (result.kind === "auth") {
      authFailures += 1;
    } else {
      otherFailures += 1;
    }
  });

  if (merged.length === 0 && authFailures > 0 && authFailures === results.length) {
    return { kind: "auth", status: 401, reason: "calendar auth failed" };
  }
  if (merged.length === 0 && otherFailures === results.length && results.length > 0) {
    return { kind: "down", status: 0, reason: "all calendars failed" };
  }

  return dedupeEvents(merged);
}

async function accessTokenFor(
  request: Request,
): Promise<{ token: string; refresh: string | null } | { missing: string }> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return { missing: "no-auth-secret" };
  const secureCookie = request.url.startsWith("https://");
  const token = await getToken({
    req: request,
    secret,
    secureCookie,
    cookieName: secureCookie ? "__Secure-authjs.session-token" : "authjs.session-token",
    salt: secureCookie ? "__Secure-authjs.session-token" : "authjs.session-token",
  });
  if (!token) {
    const cookie = request.headers.get("cookie") ?? "";
    const present = cookie.includes("authjs.session-token");
    return { missing: present ? "token-undecodable" : "no-session-cookie" };
  }
  const refresh = typeof token.refreshToken === "string" ? token.refreshToken : null;
  const expiresAt = typeof token.expiresAt === "number" ? token.expiresAt : 0;
  let access = typeof token.accessToken === "string" ? token.accessToken : null;
  if (!access || Date.now() >= expiresAt * 1000 - 60_000) {
    if (!refresh) return { missing: access ? "expired-no-refresh" : "no-access-token" };
    const refreshed = await refreshGoogleAccessToken(refresh);
    if (!refreshed) return { missing: "refresh-failed" };
    access = refreshed.access_token;
  }
  return { token: access, refresh };
}

function explainFailure(
  failure: { status: number; reason: string },
  hasCalendar: boolean | null,
): string {
  const reason = failure.reason.toLowerCase();
  const apiOff =
    reason.includes("accessnotconfigured") ||
    reason.includes("service_disabled") ||
    reason.includes("has not been used") ||
    reason.includes("is disabled");
  const scopeMissing =
    hasCalendar === false || reason.includes("insufficientpermissions") || reason.includes("insufficient authentication");
  if (apiOff && scopeMissing) {
    return "Google Calendar API is turned off for this Google Cloud project. Enable the Calendar API, then sign out and sign in again.";
  }
  if (apiOff) return API_DISABLED_ERROR;
  if (scopeMissing || failure.status === 401) return RECONSENT_ERROR;
  if (failure.status === 403) return SIGN_IN_ERROR;
  return UNAVAILABLE_ERROR;
}

export async function todayCalendarEvents(
  request: Request,
  timeZone: string,
): Promise<{ events: CalendarEvent[]; error: string | null }> {
  return calendarEventsFor(request, timeZone, dayWindow(timeZone));
}

export async function tomorrowCalendarEvents(
  request: Request,
  timeZone: string,
): Promise<{ events: CalendarEvent[]; error: string | null }> {
  return calendarEventsFor(request, timeZone, dayWindow(timeZone, new Date(), 1));
}

async function calendarEventsFor(
  request: Request,
  timeZone: string,
  window: { start: Date; end: Date; day: string },
): Promise<{ events: CalendarEvent[]; error: string | null }> {
  const access = await accessTokenFor(request);
  if ("missing" in access) {
    const needsSignIn = access.missing === "refresh-failed" || access.missing === "no-access-token" || access.missing === "expired-no-refresh";
    return { events: [], error: needsSignIn ? RECONSENT_ERROR : SIGN_IN_ERROR };
  }
  let listed = await listAllEvents(access.token, window.start, window.end);
  if (!Array.isArray(listed) && listed.kind === "auth" && access.refresh) {
    const refreshed = await refreshGoogleAccessToken(access.refresh);
    if (!refreshed) return { events: [], error: RECONSENT_ERROR };
    listed = await listAllEvents(refreshed.access_token, window.start, window.end);
  }
  if (!Array.isArray(listed) && listed.kind === "auth") {
    const scopes = await grantedScopes(access.token);
    const hasCalendar = scopes?.some((scope) => scope.includes("/auth/calendar")) ?? null;
    return { events: [], error: explainFailure(listed, hasCalendar) };
  }
  if (!Array.isArray(listed)) return { events: [], error: UNAVAILABLE_ERROR };
  return { events: mapGoogleEvents(listed, timeZone, window.day), error: null };
}

/** Schrijfbare agenda's: owner en writer, nooit alleen-lezen. */
export async function listWritableCalendars(
  accessToken: string,
): Promise<{ calendars: CalendarListEntry[] } | { error: string }> {
  const listed = await listCalendars(accessToken);
  if (!Array.isArray(listed)) {
    return { error: "Agenda's konden niet worden opgehaald." };
  }
  const writable = listed.filter(
    (entry) => entry.accessRole === "owner" || entry.accessRole === "writer",
  );
  return { calendars: writable };
}

/** Access token plus a friendly error, for the calendar routes. */
export async function calendarAccess(
  request: Request,
): Promise<{ token: string } | { error: string; status: number }> {
  const access = await accessTokenFor(request);
  if ("missing" in access) {
    return { error: "Log opnieuw in om de agenda te gebruiken.", status: 401 };
  }
  return { token: access.token };
}
