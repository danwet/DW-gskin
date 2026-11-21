import { sessionUser, unauthorized } from "@/lib/api-auth";
import { todayCalendarEvents } from "@/lib/calendar";
import { validTimeZone } from "@/lib/calendar-events";
import { NO_MAIL_SOURCE } from "@/lib/empty-brief";
import { briefFromMailbox, type MailboxRead } from "@/lib/mailbox";
import { readUser, toWorkspace, updateUser } from "@/lib/user-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await sessionUser();
  if (!user) return unauthorized();

  const url = new URL(request.url);
  const timeZone = validTimeZone(url.searchParams.get("timeZone"));
  const refresh = url.searchParams.get("refresh") === "1";
  const record = refresh
    ? await updateUser(user.id, user.email, (current) => {
        current.lastRun = new Date().toISOString();
      })
    : await readUser(user.id, user.email);

  const calendar = await todayCalendarEvents(request, timeZone);
  const empty = record.messages.length === 0 && record.invoices.length === 0;
  const mailbox: MailboxRead = {
    messages: record.messages,
    invoices: record.invoices,
    error: empty ? NO_MAIL_SOURCE : null,
  };
  const brief = briefFromMailbox(mailbox, user.name || "there");
  brief.events = calendar.events;

  let finalRecord = record;
  if (refresh) {
    finalRecord = await updateUser(user.id, user.email, (current) => {
      current.runs = [
        {
          at: new Date().toISOString(),
          messageCount: brief.messageCount,
          drafts: brief.drafts.length,
          quiet: brief.quiet.length,
          actions: brief.actions.length,
          upcoming: brief.upcoming.length,
        },
        ...(current.runs ?? []),
      ].slice(0, 50);
    });
  }

  return Response.json({
    brief,
    calendarError: calendar.error,
    mailError: mailbox.error,
    account: { name: user.name, email: user.email },
    state: toWorkspace(finalRecord),
  });
}
