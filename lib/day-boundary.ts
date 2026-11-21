/**
 * The dashboard day rolls over at 05:00, not at midnight: mail that arrives
 * late at night still belongs to the day you are working in, and yesterday's
 * delivered orders stay visible until the morning.
 */
export const DAY_ROLLOVER_HOUR = 5;

/** Local time shifted back by the rollover, so 02:00 counts as the previous day. */
export function shiftToLogicalDay(now = new Date()): Date {
  const shifted = new Date(now);
  shifted.setHours(shifted.getHours() - DAY_ROLLOVER_HOUR);
  return shifted;
}

/** Midnight of the current logical day, in local time. */
export function startOfLogicalDay(now = new Date()): Date {
  const shifted = shiftToLogicalDay(now);
  shifted.setHours(0, 0, 0, 0);
  return shifted;
}

/** True when the given moment falls in the current logical day. */
export function isInLogicalToday(iso: string | undefined, now = new Date()): boolean {
  if (!iso) return false;
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return false;
  return time >= startOfLogicalDay(now).getTime();
}
