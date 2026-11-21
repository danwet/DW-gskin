import type { MailAssessment } from "./types";

export type UrgencyTone = "red" | "orange" | "blue" | "grey";

export const DEFAULT_TIME_ZONE = "Europe/Amsterdam";

export type Urgency = {
  tone: UrgencyTone;
  label: string;
  /** Deadline as a date at local midnight, for sorting within a tone. */
  deadlineValue: number | null;
  /** Human deadline text, or the "no deadline" fallback. */
  deadlineText: string;
};

const TONE_ORDER: Record<UrgencyTone, number> = {
  red: 0,
  orange: 1,
  blue: 2,
  grey: 3,
};

function startOfDayInZone(timeZone: string, now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return new Date(pick("year"), pick("month") - 1, pick("day"));
}

export function parseDeadline(deadline: string | null | undefined): Date | null {
  if (!deadline) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(deadline.trim());
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function daysBetween(then: Date, now: Date): number {
  const thenMidnight = new Date(then.getFullYear(), then.getMonth(), then.getDate());
  const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((thenMidnight.getTime() - nowMidnight.getTime()) / 86_400_000);
}

function formatDeadline(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Deterministic urgency from deadline + status, recomputed each time the data
 * is loaded so an open item can turn red tomorrow without a new mail or model call.
 */
export function urgencyFor(
  assessment: MailAssessment,
  now: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
): Urgency {
  const handled = assessment.handledByUser === true;
  const needsAttention = assessment.needsAttention === true;
  const invoice = assessment.invoice;
  const deadline = parseDeadline(assessment.deadline);
  const today = startOfDayInZone(timeZone, now);

  if (handled && !needsAttention) {
    return { tone: "grey", label: "Afgehandeld", deadlineValue: deadline?.getTime() ?? null, deadlineText: deadlineText(deadline) };
  }
  if (invoice?.paymentStatus === "paid_confirmed" && !needsAttention) {
    return { tone: "grey", label: "Betaald bevestigd", deadlineValue: deadline?.getTime() ?? null, deadlineText: deadlineText(deadline) };
  }
  if (assessment.classification === "unclassified") {
    return { tone: "grey", label: "Gemist", deadlineValue: deadline?.getTime() ?? null, deadlineText: deadlineText(deadline) };
  }
  if (assessment.classification === "info") {
    return { tone: "grey", label: "Ter informatie", deadlineValue: deadline?.getTime() ?? null, deadlineText: deadlineText(deadline) };
  }
  if (assessment.classification === "waiting") {
    return { tone: "grey", label: "Wacht op reactie", deadlineValue: deadline?.getTime() ?? null, deadlineText: deadlineText(deadline) };
  }

  if (deadline) {
    const diff = daysBetween(deadline, today);
    if (diff < 0) {
      return { tone: "red", label: "Deadline verstreken", deadlineValue: deadline.getTime(), deadlineText: deadlineText(deadline) };
    }
    if (diff === 0) {
      return { tone: "red", label: "Vandaag", deadlineValue: deadline.getTime(), deadlineText: deadlineText(deadline) };
    }
    if (diff <= 3) {
      return { tone: "orange", label: "Binnen 3 dagen", deadlineValue: deadline.getTime(), deadlineText: deadlineText(deadline) };
    }
    return { tone: "blue", label: "Geen directe tijdsdruk", deadlineValue: deadline.getTime(), deadlineText: deadlineText(deadline) };
  }

  if (invoice?.paymentStatus === "unknown") {
    return { tone: "blue", label: "Betaalstatus controleren", deadlineValue: null, deadlineText: deadlineText(null) };
  }
  if (invoice?.paymentStatus === "open_per_sender") {
    return { tone: "blue", label: "Openstaand volgens afzender", deadlineValue: null, deadlineText: deadlineText(null) };
  }
  return { tone: "blue", label: "Actie nodig", deadlineValue: null, deadlineText: deadlineText(null) };
}

function deadlineText(deadline: Date | null): string {
  return deadline ? formatDeadline(deadline) : "Geen deadline gevonden";
}

/** Order by tone, then by earliest deadline, then most recent message. */
/**
 * Newest mail first. The urgency pill still shows per card, but it no longer
 * drives the order: the list reads like a chronological inbox.
 */
export function orderNewestFirst(items: MailAssessment[]): MailAssessment[] {
  return [...items].sort((a, b) => {
    const aTime = Date.parse(a.receivedAt || "");
    const bTime = Date.parse(b.receivedAt || "");
    if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0;
    if (Number.isNaN(aTime)) return 1;
    if (Number.isNaN(bTime)) return -1;
    return bTime - aTime;
  });
}

