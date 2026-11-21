"use client";

import { useState } from "react";
import { formatClock } from "@/lib/greeting";
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
  const { ready, now, refresh, refreshing } = useApp();
  const { meta, model, gmail } = useInbox();
  const [showRuns, setShowRuns] = useState(false);

  // The agent keeps its own run log in Supabase (meta.runs), not the brief.
  const runs = meta?.runs ?? [];
  const lastRun = meta?.lastRunAt ?? null;
  const earlierRuns = runs.slice(1);
  const modelDisplay = model === "rule" ? "Regel-gebaseerd" : model;
  // The linked mailbox is the source; meta.source only records the last run.
  const connected = gmail?.status === "connected";
  const sourceDisplay = connected ? "Gmail" : meta?.source === "fixtures" ? "Testdata" : "Niet verbonden";
  const active = connected;

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
            <p className="pt-1 text-[13px] text-[var(--muted)]">{active ? "Actief" : "Inactief"}</p>
          </div>
          <p className="text-[14px] leading-6 text-[var(--muted)]">
            {active
              ? "De agent leest je Gmail alleen-lezen, beoordeelt nieuwe gesprekken en zet voorstellen klaar. Er wordt niets verstuurd of verplaatst."
              : "Er is geen Gmail-koppeling actief. Koppel Gmail bij Instellingen → Verbindingen om de agent te laten draaien."}
          </p>
          <dl className="mt-5 grid gap-4 sm:grid-cols-3">
            <div>
              <dt className={dtClass}>LAATSTE RUN</dt>
              <dd className={ddClass}>{lastRun ? formatClock(new Date(lastRun)) : "—"}</dd>
              <dd className="text-[12px] text-[var(--muted)]">{lastRun ? formatRunTime(lastRun) : ""}</dd>
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
          {meta?.lastError ? (
            <p className="mt-3 text-[12px] leading-5 text-[var(--danger)]">{meta.lastError}</p>
          ) : null}
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
            <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-[var(--ink)]">Laatste run</h2>
            <p className="pt-1 text-[13px] text-[var(--muted)]">{runs[0]?.ok === false ? "Mislukt" : "Geslaagd"}</p>
          </div>
          {runs.length === 0 ? (
            <p className="text-[14px] leading-6 text-[var(--muted)]">Nog geen run uitgevoerd.</p>
          ) : (
            <ul className="space-y-3 text-[14px] leading-6 text-[var(--ink)]">
              <li>{Math.max(runs[0].conversations - (runs[0].skipped ?? 0), 0)} gesprekken beoordeeld.</li>
              <li>{runs[0].skipped ?? 0} gesprekken overgeslagen (al beoordeeld).</li>
              <li>{runs[0].messages} berichten gelezen.</li>
              {runs[0].error ? <li className="text-[var(--danger)]">{runs[0].error}</li> : null}
              <li className="text-[var(--muted)]">
                Bron: {runs[0].source === "gmail" ? "Gmail" : "Testdata"} · model: {runs[0].model}
              </li>
            </ul>
          )}
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
                      {run.ok ? "" : "mislukt · "}
                      {run.conversations} gesprekken · {run.messages} berichten
                      {run.skipped ? ` · ${run.skipped} overgeslagen` : ""}
                      {run.error ? ` · ${run.error}` : ""}
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
