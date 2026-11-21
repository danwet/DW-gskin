import { defaultSettings } from "./settings";

function firstToken(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

export function greetingName(displayName: string, accountName: string | null | undefined): string {
  const custom = displayName.trim();
  const resolved =
    custom && custom !== defaultSettings.displayName ? custom : accountName?.trim() || custom || "there";
  return firstToken(resolved) || "there";
}

export function greetingFor(date: Date): { greeting: string; line: string } {
  const hour = date.getHours();

  if (hour >= 5 && hour < 12) {
    return {
      greeting: "Good morning",
      line: "Here's what deserves your attention today.",
    };
  }

  if (hour >= 12 && hour < 18) {
    return {
      greeting: "Good afternoon",
      line: "Here's what deserves your attention today.",
    };
  }

  if (hour >= 18 && hour < 22) {
    return {
      greeting: "Good evening",
      line: "Here's what still deserves your attention.",
    };
  }

  return {
    greeting: "Good night",
    line: "Here's what can wait until morning.",
  };
}

export function formatBriefDay(date: Date): string {
  return date
    .toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    })
    .toUpperCase();
}

export function formatClock(date: Date): string {
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  });
}

export function formatHourMinute(hour: number, minute: number): string {
  return formatClock(new Date(2000, 0, 1, hour, minute, 0, 0));
}
