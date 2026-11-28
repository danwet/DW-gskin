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
  toonActie = true,
}: {
  items: MailAssessment[];
  now: Date;
  timeZone: string;
  onOpen: (item: MailAssessment) => void;
  /** Bij "Hoeft niet" is er geen actie om te tonen. */
  toonActie?: boolean;
}) {
  return (
    <ul className="divide-y divide-[var(--line)]">
      {items.map((item) => {
        const urgentie = urgencyFor(item, now, timeZone);
        const toon = urgentie.tone;
        const bedrag = item.invoice?.amount;
        const declaratie = item.declaration === "pending";
        // In "Hoeft niet" is er geen actie, dus die regel vervalt helemaal.
        const actie = toonActie ? (declaratie ? declareLabel(item) : (item.nextAction ?? "")) : "";
        return (
          <li key={item.conversationId}>
            <button
              type="button"
              onClick={() => onOpen(item)}
              // Rechts ruimte houden: op het midden van het scherm hangt het
              // lipje, en daar mogen de regels niet onder schuiven.
              className="focus-ring flex w-full items-start gap-3 py-4 pr-2.5 text-left active:bg-black/[0.04] dark:active:bg-white/[0.06]"
            >
              <span
                aria-hidden
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                style={{ background: TOON[toon] }}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-[16px] font-semibold text-[var(--ink)]">{item.from}</span>
                  <span className="shrink-0 text-[13px] font-medium" style={{ color: TOON[toon] }}>
                    {urgentie.label}
                  </span>
                </span>
                <span className="mt-1 line-clamp-2 block text-[15px] leading-[1.35] text-[var(--muted)]">
                  {item.shortSubject || item.subject}
                </span>
                {actie || bedrag || item.invoice?.dueDate ? (
                  <span className="mt-1 flex items-baseline justify-between gap-3">
                    {/* Een pijltje voor de actie: het is iets wat je kunt
                        doen, geen omschrijving. */}
                    <span className="flex min-w-0 items-baseline gap-1.5">
                      {actie ? (
                        <span aria-hidden className="shrink-0 text-[14px] text-[var(--ink)]/50">
                          →
                        </span>
                      ) : null}
                      <span className="truncate text-[14px] text-[var(--ink)]/80">{actie}</span>
                    </span>
                    {declaratie && bedrag ? (
                      <span className="shrink-0 text-[14px] font-medium text-[var(--ink)]">
                        {bedragTekst(bedrag, item.invoice?.currency)}
                      </span>
                    ) : item.invoice?.dueDate ? (
                      <span className="shrink-0 text-[13px] text-[var(--muted)]">
                        {datumKort(item.invoice.dueDate, timeZone)}
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Plaatshouder in de vorm van de lijst, zodat er geen grote vlakken flitsen. */
export function LijstPlaceholder({ rijen = 5 }: { rijen?: number }) {
  return (
    <div aria-hidden className="space-y-1">
      {Array.from({ length: rijen }, (_, index) => (
        <div key={index} className="flex items-start gap-3 py-3.5">
          <span className="mt-1.5 h-2 w-2 shrink-0 animate-pulse rounded-full bg-[var(--line)]" />
          <span className="min-w-0 flex-1 space-y-2">
            <span className="block h-3 w-1/3 animate-pulse rounded bg-[var(--line)]" />
            <span className="block h-2.5 w-2/3 animate-pulse rounded bg-[var(--line)] opacity-70" />
            <span className="block h-2.5 w-1/2 animate-pulse rounded bg-[var(--line)] opacity-60" />
          </span>
        </div>
      ))}
    </div>
  );
}
