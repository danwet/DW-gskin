import { sessionUser, unauthorized } from "@/lib/api-auth";
import { calendarAccess, listWritableCalendars } from "@/lib/calendar";

export const dynamic = "force-dynamic";

/** Only the calendars you may write to, for the appointment dialog. */
export async function GET(request: Request) {
  const user = await sessionUser();
  if (!user) return unauthorized();

  const access = await calendarAccess(request);
  if ("error" in access) return Response.json({ error: access.error }, { status: access.status });

  const result = await listWritableCalendars(access.token);
  if ("error" in result) return Response.json({ error: result.error }, { status: 502 });

  const primary = result.calendars.find((entry) => entry.primary) ?? result.calendars[0];
  return Response.json({
    calendars: result.calendars.map((entry) => ({
      id: entry.id,
      name: entry.summary ?? "Agenda",
      color: entry.backgroundColor ?? null,
      primary: entry.id === primary?.id,
    })),
  });
}
