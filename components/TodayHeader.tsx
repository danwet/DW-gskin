"use client";

import { shiftToLogicalDay } from "@/lib/day-boundary";
import { PageTitle } from "./PageTitle";

/**
 * Kop van het dashboard. Voor 05:00 toont hij nog de vorige dag.
 */
export function TodayHeader() {
  const dateText = shiftToLogicalDay().toLocaleDateString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return <PageTitle eyebrow={dateText} title="Wat verdient mijn aandacht" />;
}
