import { sessionUser, unauthorized } from "@/lib/api-auth";
import { todayCalendarEvents } from "@/lib/calendar";
import { validTimeZone } from "@/lib/calendar-events";

export const dynamic = "force-dynamic";

/**
 * Read-only diagnostic: shows exactly what the server retrieves for today's
 * calendar, so a missing test appointment can be traced without guessing.
 */
export async function GET(request: Request) {
  const user = await sessionUser();
  if (!user) return unauthorized();

  const url = new URL(request.url);
  const timeZone = validTimeZone(url.searchParams.get("timeZone"));
  const result = await todayCalendarEvents(request, timeZone);
  return Response.json({
    timeZone,
    now: new Date().toISOString(),
    events: result.events,
    error: result.error,
  });
}
