import type { Brief } from "./types";

export const NO_MAIL_SOURCE = "No mail source is connected.";

export function emptyBrief(detail = "Loading your inbox."): Brief {
  return {
    source: "user",
    messageCount: 0,
    insight: {
      title: "Nothing needs you yet.",
      detail,
    },
    events: [],
    tomorrowEvents: [],
    upcoming: [],
    drafts: [],
    quiet: [],
    actions: [],
    loops: [],
  };
}

export function mailEmptyCopy(ready: boolean, mailError: string | null): string {
  if (!ready) return "Loading your inbox.";
  if (mailError) return mailError;
  return "Nothing is waiting yet.";
}

export function mailListCopy(ready: boolean, mailError: string | null): string {
  return mailEmptyCopy(ready, mailError);
}
