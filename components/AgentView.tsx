"use client";

import { useEffect, useRef, useState } from "react";
import { formatClock } from "@/lib/greeting";
import { useApp } from "./AppProvider";
import { useInbox } from "./AgentInbox";
import { useLiveMeta } from "./use-live-meta";
import { PageTitle } from "./PageTitle";
import { PAGINA_VAK } from "@/lib/page-layout";

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
  const { meta: rawMeta, model, gmail } = useInbox();
  // De log volgt de hoogte van "Laatste run": even hoog, met eigen scroll.
  const laatsteRef = useRef<HTMLElement | null>(null);
  const [logHoogte, setLogHoogte] = useState<number | null>(null);
  useEffect(() => {
    const vak = laatsteRef.current;
    if (!vak) return;
    const meet = () => {
      // Alleen naast elkaar (lg); op mobiel staan ze onder elkaar en is er
      // geen hoogte om te delen.
      setLogHoogte(window.matchMedia("(min-width: 1024px)").matches ? Math.round(vak.getBoundingClientRect().height) : null);
    };
    meet();
    const observer = new ResizeObserver(meet);
    observer.observe(vak);
    window.addEventListener("resize", meet);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", meet);
    };
  }, []);

  // Follow the server while the page is open: a new run must show up without
  // reloading anything.
  const meta = useLiveMeta(rawMeta);

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
    <div className={PAGINA_VAK}>
      <PageTitle eyebrow="Agent" title="Mail agent" />

      <div className="space-y-4">
        <section className="glass-panel rounded-[22px] p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-[var(--ink)]">Mail triage</h2>
            <p className="pt-1 text-[13px] text-[var(--muted)]">{active ? "Actief" : "Inactief"}</p>
          </div>
          <p className="text-[14px] leading-6 text-[var(--muted)]">
            {active
              ? "De agent leest je Gmail, beoordeelt nieuwe gesprekken, archiveert of verwijdert mail die je afhandelt en verstuurt je antwoorden. Je ziet en bevestigt alles zelf."
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
              <dd className="text-[12px] text-[var(--muted)]">Systeemtijd</dd>
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
              className="btn-primary focus-ring rounded-full px-4 py-2.5 text-[14px] disabled:opacity-60"
            >
              {refreshing ? "Bijwerken…" : "Bijwerken"}
            </button>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
          <section ref={laatsteRef} className="glass-panel rounded-[22px] p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-[var(--ink)]">Laatste run</h2>
              <p className="pt-1 text-[13px] text-[var(--muted)]">{runs[0]?.ok === false ? "Mislukt" : "Geslaagd"}</p>
            </div>
            {runs.length === 0 ? (
              <p className="text-[14px] leading-6 text-[var(--muted)]">Nog geen run uitgevoerd.</p>
            ) : (
              <ul className="space-y-3 text-[14px] leading-6 text-[var(--ink)]">
                <li>{runs[0].conversations} gesprekken beoordeeld.</li>
                <li>{runs[0].skipped ?? 0} gesprekken wachten nog op een beoordeling.</li>
                <li>{runs[0].messages} nieuwe berichten gelezen.</li>
                {runs[0].error ? <li className="text-[var(--danger)]">{runs[0].error}</li> : null}
                <li className="text-[var(--muted)]">
                  Bron: {runs[0].source === "gmail" ? "Gmail" : "Testdata"} · model: {runs[0].model}
                </li>
              </ul>
            )}
          </section>
          <section
            className="glass-panel flex min-h-0 flex-col rounded-[22px] p-5"
            style={logHoogte ? { height: logHoogte } : undefined}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-[var(--ink)]">Log eerdere runs</h2>
              <span className="pt-1 text-[13px] text-[var(--muted)]">{earlierRuns.length}</span>
            </div>
            {earlierRuns.length === 0 ? (
              <p className="border-t border-[var(--line)] pt-3 text-[13px] text-[var(--muted)]">Geen eerdere runs.</p>
            ) : (
              <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto border-t border-[var(--line)] pt-3 pr-1">
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
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
