"use client";

import type { MailAssessment } from "@/lib/agent/types";
import { urgencyFor, type UrgencyTone } from "@/lib/agent/urgency";
import { bedragTekst, declareLabel } from "@/lib/declare-label";

/** Kleur per urgentie, dezelfde als de pil op de kaarten. */
const TOON: Record<UrgencyTone, string> = {
  red: "var(--danger)",
  orange: "var(--orange)",
  yellow: "var(--yellow)",
  blue: "var(--blue)",
  green: "var(--green)",
  grey: "var(--muted)",
};

function datumKort(iso: string | undefined, timeZone: string): string {
  if (!iso) return "";
  const datum = new Date(iso);
  if (Number.isNaN(datum.getTime())) return "";
  return datum.toLocaleDateString("nl-NL", { day: "numeric", month: "short", timeZone });
}

/**
 * De mobiele weergave per focus: geen grote kaarten maar regels die je snel
 * scant. Tikken opent dezelfde sheet als op de desktop, dus alle acties blijven
 * waar ze waren.
 */
export function MobieleLijst({
  items,
  now,
  timeZone,
  onOpen,
}: {
  items: MailAssessment[];
  now: Date;
  timeZone: string;
  onOpen: (item: MailAssessment) => void;
}) {
  return (
    <ul className="divide-y divide-[var(--line)]">
      {items.map((item) => {
        const urgentie = urgencyFor(item, now, timeZone);
        const toon = urgentie.tone;
        const bedrag = item.invoice?.amount;
        const declaratie = item.declaration === "pending";
        return (
          <li key={item.conversationId}>
            <button
              type="button"
              onClick={() => onOpen(item)}
              className="focus-ring flex w-full items-start gap-3 py-3.5 text-left active:bg-black/[0.04] dark:active:bg-white/[0.06]"
            >
              <span
                aria-hidden
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                style={{ background: TOON[toon] }}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-[15px] font-semibold text-[var(--ink)]">{item.from}</span>
                  <span className="shrink-0 text-[12px] font-medium" style={{ color: TOON[toon] }}>
                    {urgentie.label}
                  </span>
                </span>
                <span className="mt-1 line-clamp-2 block text-[14px] leading-[1.35] text-[var(--muted)]">
                  {item.shortSubject || item.subject}
                </span>
                <span className="mt-1 flex items-baseline justify-between gap-3">
                  <span className="truncate text-[13px] text-[var(--ink)]/80">
                    {declaratie ? declareLabel(item) : (item.nextAction ?? "")}
                  </span>
                  {declaratie && bedrag ? (
                    <span className="shrink-0 text-[13px] font-medium text-[var(--ink)]">{bedragTekst(bedrag, item.invoice?.currency)}</span>
                  ) : item.invoice?.dueDate ? (
                    <span className="shrink-0 text-[12px] text-[var(--muted)]">
                      {datumKort(item.invoice.dueDate, timeZone)}
                    </span>
                  ) : null}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
