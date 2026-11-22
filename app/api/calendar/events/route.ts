import { sessionUser, unauthorized } from "@/lib/api-auth";
import { calendarAccess } from "@/lib/calendar";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  truncateSeries,
  updateCalendarEvent,
  type EventInput,
} from "@/lib/calendar-write";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Body = Partial<EventInput> & {
  eventId?: string;
  /** "one" deletes this occurrence, "following" ends the series here. */
  scope?: "one" | "following";
  occurrenceStart?: string;
};

function readInput(body: Body): EventInput | null {
  if (!body.calendarId || !body.title || !body.date) return null;
  return {
    calendarId: body.calendarId,
    title: body.title.trim(),
    date: body.date,
    startTime: body.startTime,
    endTime: body.endTime,
    allDay: Boolean(body.allDay),
    location: body.location?.trim() || undefined,
    description: body.description?.trim() || undefined,
  };
}

function invalid(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

/** Times must move forward, or the calendar rejects the event anyway. */
function timesAreSane(input: EventInput): boolean {
  if (input.allDay) return true;
  const start = input.startTime ?? "09:00";
  const end = input.endTime ?? "09:30";
  return end > start;
}

export async function POST(request: Request) {
  const user = await sessionUser();
  if (!user) return unauthorized();

  const input = readInput((await request.json().catch(() => null)) as Body);
  if (!input) return invalid("Agenda, titel en datum zijn verplicht.");
  if (!timesAreSane(input)) return invalid("De eindtijd moet na de begintijd liggen.");

  const access = await calendarAccess(request);
  if ("error" in access) return Response.json({ error: access.error }, { status: access.status });

  const result = await createCalendarEvent(access.token, input);
  return Response.json(result, { status: result.ok ? 200 : result.status });
}

export async function PATCH(request: Request) {
  const user = await sessionUser();
  if (!user) return unauthorized();

  const body = (await request.json().catch(() => null)) as Body | null;
  const input = readInput(body ?? {});
  const eventId = body?.eventId?.trim();
  if (!input || !eventId) return invalid("Agenda, titel, datum en afspraak zijn verplicht.");
  if (!timesAreSane(input)) return invalid("De eindtijd moet na de begintijd liggen.");

  const access = await calendarAccess(request);
  if ("error" in access) return Response.json({ error: access.error }, { status: access.status });

  // "Deze en volgende" edits the series too, so the occurrence keeps its place.
  if (body?.scope === "following" && body.occurrenceStart) {
    const truncated = await truncateSeries(
      access.token,
      input.calendarId,
      eventId.split("_")[0],
      body.occurrenceStart,
    );
    if (!truncated.ok) return Response.json(truncated, { status: truncated.status });
    const created = await createCalendarEvent(access.token, input);
    return Response.json(created, { status: created.ok ? 200 : created.status });
  }

  const result = await updateCalendarEvent(access.token, eventId, input);
  return Response.json(result, { status: result.ok ? 200 : result.status });
}

export async function DELETE(request: Request) {
  const user = await sessionUser();
  if (!user) return unauthorized();

  const url = new URL(request.url);
  const calendarId = url.searchParams.get("calendarId") ?? "";
  const eventId = url.searchParams.get("eventId") ?? "";
  const scope = url.searchParams.get("scope") === "following" ? "following" : "one";
  const occurrenceStart = url.searchParams.get("occurrenceStart") ?? "";
  if (!calendarId || !eventId) return invalid("Agenda en afspraak zijn verplicht.");

  const access = await calendarAccess(request);
  if ("error" in access) return Response.json({ error: access.error }, { status: access.status });

  if (scope === "following") {
    if (!occurrenceStart) return invalid("De begintijd van deze afspraak ontbreekt.");
    const result = await truncateSeries(access.token, calendarId, eventId.split("_")[0], occurrenceStart);
    return Response.json(result, { status: result.ok ? 200 : result.status });
  }

  const result = await deleteCalendarEvent(access.token, calendarId, eventId);
  return Response.json(result, { status: result.ok ? 200 : result.status });
}
