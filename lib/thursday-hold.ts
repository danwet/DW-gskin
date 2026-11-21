import type { Brief, CalendarEvent, ProactiveAction, Upcoming } from "./types";

export const HOLD_LOOP_ID = "loop-hold";
const HOLD_CHOICE_KEY = "brief-thursday-hold";
const HOLD_ACTION_TITLE = "Thursday hold placed";
const LOCAL_HOLD_IDS = new Set(["u1", "thursday-hold", "agent-hold"]);

type HoldChoice = "kept" | "removed";

type Hold = { title: string; when: string; detail: string };

export function loadHoldChoice(): HoldChoice | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(HOLD_CHOICE_KEY);
    if (value === "kept" || value === "removed") return value;
    return null;
  } catch {
    return null;
  }
}

export function saveHoldChoice(choice: HoldChoice) {
  try {
    window.localStorage.setItem(HOLD_CHOICE_KEY, choice);
  } catch {
    // The checked list is still saved with the workspace.
  }
}

export function resolveHoldChecks(ids: readonly string[]): { ids: string[]; changed: boolean } {
  const choice = loadHoldChoice();
  const has = ids.includes(HOLD_LOOP_ID);
  if (choice === "removed") {
    if (!has) return { ids: [...ids], changed: false };
    return { ids: ids.filter((id) => id !== HOLD_LOOP_ID), changed: true };
  }
  if ((choice === "kept" || ids.length === 0) && !has) {
    return { ids: [...ids, HOLD_LOOP_ID], changed: true };
  }
  return { ids: [...ids], changed: false };
}

function isHoldAction(action: ProactiveAction): boolean {
  return action.localHold === true || action.id === "thursday-hold" || action.title === HOLD_ACTION_TITLE;
}

function isLocalHoldUpcoming(item: Upcoming, hold: Hold): boolean {
  if (item.localHold === true || item.id === "u1" || item.id === "thursday-hold") return true;
  return item.title === hold.title && item.when === hold.when && item.detail === hold.detail;
}

function isLocalHoldEvent(event: CalendarEvent, hold: Hold): boolean {
  if (event.localHold === true || LOCAL_HOLD_IDS.has(event.id)) return true;
  return event.title === hold.title && event.detail === hold.detail;
}

function holdAction(from: string | undefined): ProactiveAction {
  const name = from?.trim() || "the sender";
  return {
    id: "thursday-hold",
    title: HOLD_ACTION_TITLE,
    detail: `11:00 held from ${name}'s note`,
    status: "Done",
    localHold: true,
  };
}

function insertHoldAction(actions: ProactiveAction[], action: ProactiveAction): ProactiveAction[] {
  const index = actions.findIndex(
    (item) => item.id === "inbox-triaged" || item.id === "a1" || item.title === "Inbox triaged",
  );
  const at = index === -1 ? 0 : index + 1;
  return [...actions.slice(0, at), action, ...actions.slice(at)];
}

export function applyThursdayHold(brief: Brief, kept: boolean): Brief {
  const loop = brief.loops.find((item) => item.id === HOLD_LOOP_ID);
  const hold = loop?.hold;
  if (!loop || !hold) return brief;

  if (!kept) {
    return {
      ...brief,
      events: brief.events.filter((event) => !isLocalHoldEvent(event, hold)),
      upcoming: brief.upcoming.filter((item) => !isLocalHoldUpcoming(item, hold)),
      actions: brief.actions.filter((action) => !isHoldAction(action)),
    };
  }

  const upcoming = brief.upcoming.some((item) => isLocalHoldUpcoming(item, hold))
    ? brief.upcoming
    : [
        ...brief.upcoming,
        {
          id: "u1",
          title: hold.title,
          when: hold.when,
          detail: hold.detail,
          localHold: true,
        },
      ];
  const actions = brief.actions.some(isHoldAction)
    ? brief.actions
    : insertHoldAction(brief.actions, holdAction(loop.mail?.from));

  return { ...brief, upcoming, actions };
}
