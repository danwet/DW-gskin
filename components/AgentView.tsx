"use client";

import { useState } from "react";
import { formatBriefDay, formatClock } from "@/lib/greeting";
import { useApp } from "./AppProvider";
import { useInbox } from "./AgentInbox";

function formatRunTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("nl-NL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const dtClass = "text-[11px] font-medium tracking-[0.14em] text-[var(--muted)]";
const ddClass = "mt-1 text-[16px] font-semibold text-[var(--ink)]";

export function AgentView() {
  const { brief, lastRun, ready, now, refresh, refreshing, runs } = useApp();
  const { meta, model } = useInbox();
  const [showRuns, setShowRuns] = useState(false);

  const earlierRuns = runs.slice(1);
  const modelDisplay = model === "rule" ? "Regel-gebaseerd" : model;
  const sourceDisplay = meta?.source === "gmail" ? "Gmail" : meta?.source === "fixtures" ? "Testdata" : "Niet verbonden";

  return (
    <div className="mx-auto max-w-[880px] px-6 py-7 sm:px-8 sm:py-8">
      <header className="mb-8">
        <p className="text-[11px] font-medium tracking-[0.16em] text-[var(--muted)] uppercase">AGENT</p>
        <h1 className="mt-1 text-[30px] font-bold tracking-[-0.03em] text-[var(--ink)]">Mail agent</h1>
      </header>

      <div className="space-y-4">
        <section className="glass-panel rounded-[22px] p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-[var(--ink)]">Mail triage</h2>
            <p className="pt-1 text-[13px] text-[var(--muted)]">Inactief</p>
          </div>
          <p className="text-[14px] leading-6 text-[var(--muted)]">
            Mail wordt per account opgeslagen. Er is geen mailbron gekoppeld, dus het dashboard haalt
            niets op, verstuurt niets en archiveert niets. Het overzicht toont wat er al is opgeslagen.
          </p>
          <dl className="mt-5 grid gap-4 sm:grid-cols-3">
            <div>
              <dt className={dtClass}>LAATSTE RUN</dt>
              <dd className={ddClass}>{ready && lastRun ? formatClock(new Date(lastRun)) : "—"}</dd>
              <dd className="text-[12px] text-[var(--muted)]">{ready && lastRun ? formatBriefDay(new Date(lastRun)) : ""}</dd>
            </div>
            <div>
              <dt className={dtClass}>KLOK NU</dt>
              <dd className={ddClass}>{ready ? formatClock(now) : "—"}</dd>
              <dd className="text-[12px] text-[var(--muted)]">Begroeting volgt deze klok</dd>
            </div>
            <div>
              <dt className={dtClass}>MAIL BRON</dt>
              <dd className={ddClass}>{sourceDisplay}</dd>
              <dd className="text-[12px] text-[var(--muted)]">Model: {modelDisplay}</dd>
            </div>
          </dl>
          <div className="mt-5">
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing || !ready}
              className="btn-primary focus-ring rounded-full px-4 py-2.5 text-[14px] font-medium disabled:opacity-60"
            >
              {refreshing ? "Bijwerken…" : "Bijwerken"}
            </button>
          </div>
        </section>

        <section className="glass-panel rounded-[22px] p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-[var(--ink)]">Deze run</h2>
            <p className="pt-1 text-[13px] text-[var(--muted)]">{brief.messageCount} berichten</p>
          </div>
          <ul className="space-y-3 text-[14px] leading-6 text-[var(--ink)]">
            <li>{brief.drafts.length} concepten opgesteld en klaargezet voor controle.</li>
            <li>{brief.quiet.length} berichten hebben geen reactie nodig.</li>
            <li>{brief.actions.length} acties zijn al afgehandeld.</li>
            <li>
              {brief.upcoming.length > 0
                ? `Agenda-notitie: ${brief.upcoming[0].title}, ${brief.upcoming[0].when}.`
                : "Geen nieuwe agenda-notitie."}
            </li>
          </ul>
        </section>

        <section className="glass-panel rounded-[22px] p-5">
          <button
            type="button"
            onClick={() => setShowRuns((value) => !value)}
            aria-expanded={showRuns}
            className="focus-ring flex w-full items-center justify-between gap-3 text-left"
          >
            <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-[var(--ink)]">Eerdere runs</h2>
            <span className="flex items-center gap-2 text-[13px] text-[var(--muted)]">
              {earlierRuns.length}
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className={`transition-transform ${showRuns ? "rotate-180" : ""}`}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </span>
          </button>
          {showRuns ? (
            earlierRuns.length === 0 ? (
              <p className="mt-4 border-t border-[var(--line)] pt-3 text-[13px] text-[var(--muted)]">Geen eerdere runs.</p>
            ) : (
              <ul className="mt-4 space-y-2 border-t border-[var(--line)] pt-3">
                {earlierRuns.map((run, index) => (
                  <li key={`${run.at}-${index}`} className="flex items-start justify-between gap-3 text-[13px]">
                    <span className="shrink-0 text-[var(--muted)]">{formatRunTime(run.at)}</span>
                    <span className="min-w-0 text-right leading-5 text-[var(--muted)]">
                      {run.drafts} concepten · {run.quiet} geen reactie · {run.actions} afgehandeld · {run.upcoming} agenda
                    </span>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </section>
      </div>
    </div>
  );
}
