"use client";

import { useState } from "react";
import type { MailAssessment } from "@/lib/agent/types";

export type AttentionCategory = "attention" | "invoices" | "replies";

export function useAttentionFilter(items: MailAssessment[]) {
  const [selected, setSelected] = useState<AttentionCategory | null>(null);

  const now = Date.now();
  const isSnoozed = (item: MailAssessment) =>
    Boolean(item.snoozedUntil && Date.parse(item.snoozedUntil) > now);
  const active = items.filter(
    (item) => item.classification !== "info" && item.handledByUser !== true && !isSnoozed(item),
  );
  const invoices = active.filter((item) => item.invoice);
  const replies = active.filter((item) => item.classification === "reply_needed");

  const visibleItems =
    selected === "invoices" ? invoices : selected === "replies" ? replies : active;

  const listTitle = selected === "invoices" ? "Facturen" : selected === "replies" ? "Te beantwoorden" : "Vraagt je aandacht";

  const tileOn = (id: AttentionCategory) => selected === null || selected === id;
  const toggleTile = (id: AttentionCategory) => setSelected((current) => (current === id ? null : id));

  return { active, invoices, replies, selected, visibleItems, listTitle, tileOn, toggleTile };
}

export function StatusTile({
  value,
  label,
  tone,
  active,
  onClick,
}: {
  value: number;
  label: string;
  tone: "red" | "blue" | "orange";
  active: boolean;
  onClick: () => void;
}) {
  const color =
    tone === "red" ? "var(--danger)" : tone === "blue" ? "var(--blue)" : "var(--orange)";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`glass-chip focus-ring rounded-2xl px-4 py-4 text-left transition-opacity ${
        active ? "opacity-100" : "opacity-45"
      }`}
    >
      <p className="tnum text-[32px] leading-none font-semibold tracking-[-0.03em]" style={{ color }}>
        {value}
      </p>
      <p className="mt-1.5 text-[12px] font-medium tracking-[0.08em] text-[var(--muted)]">{label}</p>
    </button>
  );
}
