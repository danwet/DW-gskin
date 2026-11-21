"use client";

import { useEffect, useState } from "react";

import { AgendaPanel } from "./AgendaPanel";
import type { MailAssessment, ShipmentInfo } from "@/lib/agent/types";
import { useInbox, type InboxProgress } from "./AgentInbox";
import { InboxGrid } from "./InboxGrid";
import { LegacyLoopsCard } from "./LegacyLoopsCard";
import { TodayHeader } from "./TodayHeader";

const GMAIL_NOTICES: Record<string, { tone: "ok" | "warn"; text: string }> = {
  connected: { tone: "ok", text: "Gmail is gekoppeld (alleen lezen). De eerste import start automatisch." },
  denied: { tone: "warn", text: "Je hebt geen toestemming gegeven voor Gmail. Koppel opnieuw om te proberen." },
  scope_rejected: {
    tone: "warn",
    text: "Gmail is niet gekoppeld: de alleen-lezen scope ontbreekt of er zijn ruimere Gmail-rechten verleend.",
  },
  no_refresh_token: { tone: "warn", text: "Google gaf geen langdurig token terug. Koppel opnieuw en sta offline toegang toe." },
  profile_error: { tone: "warn", text: "Het Gmail-adres kon niet worden opgehaald. Koppel opnieuw." },
  state_error: { tone: "warn", text: "De koppelpoging is verlopen. Koppel opnieuw." },
  exchange_error: { tone: "warn", text: "De koppeling met Google is mislukt. Probeer het opnieuw." },
  db_missing: {
    tone: "warn",
    text: "De Supabase-tabellen voor Gmail ontbreken nog. Voer supabase/migrate-gmail.sql uit in de Supabase SQL-editor en koppel daarna opnieuw.",
  },
  save_error: { tone: "warn", text: "De koppeling kon niet worden opgeslagen." },
  not_configured: { tone: "warn", text: "Google OAuth is niet geconfigureerd (AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET)." },
};

function GmailNotice() {
  const [notice, setNotice] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("gmail");
    if (!status) return;
    const reason = params.get("reason");
    const entry = GMAIL_NOTICES[status];
    if (entry) {
      setNotice(
        status === "scope_rejected" && reason ? { tone: "warn", text: `Gmail is niet gekoppeld: ${reason}` } : entry,
      );
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("gmail");
    url.searchParams.delete("reason");
    window.history.replaceState({}, "", url.toString());
  }, []);

  if (!notice) return null;
  return (
    <div
      className={`mb-4 rounded-2xl px-4 py-3 text-[13px] ${
        notice.tone === "ok" ? "bg-[var(--blue-soft)] text-[var(--active-ink)]" : "bg-[var(--danger-soft)] text-[var(--danger)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="leading-6">{notice.text}</p>
        <button type="button" onClick={() => setNotice(null)} className="shrink-0 text-[12px] font-medium underline">
          Sluiten
        </button>
      </div>
      {notice.tone === "warn" ? (
        <a href="/api/gmail/connect" className="mt-2 inline-block text-[12px] font-semibold underline">
          Opnieuw koppelen
        </a>
      ) : null}
    </div>
  );
}

export function TodayView() {
  const inbox = useInbox();
  const [progress, setProgress] = useState<InboxProgress | null>(inbox.progress);

  useEffect(() => {
    setProgress(inbox.progress);
  }, [inbox.progress]);

  const syncing = progress?.phase === "importing" || progress?.phase === "triaging";

  // Client-driven runner: repeats the resumable step until the import and the
  // triage are done, then reloads the cards. Every step is persisted in
  // Supabase, so closing the tab only pauses it.
  useEffect(() => {
    if (!syncing) return;
    let cancelled = false;

    const run = async () => {
      while (!cancelled) {
        try {
          const response = await fetch("/api/gmail/import", { method: "POST" });
          const data = (await response.json().catch(() => null)) as { progress?: InboxProgress } | null;
          if (cancelled) return;
          if (data?.progress) setProgress(data.progress);
          const phase = data?.progress?.phase;
          if (phase !== "importing" && phase !== "triaging") break;
          await new Promise((resolve) => setTimeout(resolve, 250));
        } catch {
          if (cancelled) return;
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      }
      if (!cancelled) void inbox.reload();
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [syncing, inbox.reload]);

  const nowMs = Date.now();
  const activeItems = inbox.items.filter(
    (item) =>
      item.classification !== "info" &&
      item.classification !== "unclassified" &&
      item.handledByUser !== true &&
      !(item.snoozedUntil && Date.parse(item.snoozedUntil) > nowMs),
  );
  const infoItems = inbox.items.filter(
    (item) => item.classification === "info" || (item.source === "scan" && item.handledByUser === true),
  );
  const declareItems = inbox.items.filter((item) => item.invoice && item.declaration === "pending");
  const missedItems = inbox.items.filter((item) => item.classification === "unclassified");

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-7 sm:px-8 sm:py-8 md:pt-14 md:pb-14">
      <GmailNotice />
      <TodayHeader
        missedItems={missedItems}
        lastSyncAt={inbox.meta?.lastRunAt ?? null}
        onToggleHandled={inbox.toggleHandled}
        onDeclare={inbox.declareInvoice}
      />
      <div className="mt-8 grid gap-0 lg:grid-cols-3 lg:gap-8">
        <div className="lg:col-span-2">
          <div className="mx-auto w-full max-w-[720px] space-y-6">
            {syncing && progress ? (
              <div className="card-surface rounded-2xl px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-[13px] font-semibold text-[var(--ink)]">
                    {progress.phase === "importing" ? "Inbox ophalen…" : "Beoordelen…"}
                  </p>
                  <p className="text-[12px] text-[var(--muted)]">
                    Ophalen: {progress.imported}
                    {progress.total ? ` van ~${progress.total}` : ""} · Beoordeeld: {progress.triaged} · Nog te
                    beoordelen: {progress.pending}
                  </p>
                </div>
                <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[var(--line)]">
                  <div
                    className="h-1 rounded-full bg-[var(--accent)] transition-[width] duration-500"
                    style={{
                      width: `${
                        progress.phase === "importing"
                          ? progress.total
                            ? Math.min(100, Math.round((progress.imported / progress.total) * 100))
                            : 30
                          : progress.threadsImported
                            ? Math.min(100, Math.round((progress.triaged / progress.threadsImported) * 100))
                            : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
            ) : null}

            {inbox.pending.length > 0 ? (
              <section>
                <p className="mb-3 text-[13px] font-medium text-[var(--muted)]">
                  Nog te beoordelen ({inbox.pending.length})
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {inbox.pending.slice(0, 12).map((item) => (
                    <div key={item.conversationId} className="card-surface rounded-2xl px-4 py-3">
                      <p className="truncate text-[14px] font-semibold text-[var(--ink)]">{item.subject}</p>
                      <p className="truncate text-[12px] text-[var(--muted)]">{item.from}</p>
                      <span className="mt-2 inline-block rounded-full bg-[var(--blue-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--active-ink)]">
                        Nog te beoordelen
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <InboxGrid
              items={activeItems}
              infoItems={infoItems}
              declareItems={declareItems}
              loading={inbox.loading}
              error={inbox.error}
              onToggleHandled={inbox.toggleHandled}
              onSnooze={inbox.snoozeItem}
              onDeclare={inbox.declareInvoice}
              onSave={inbox.saveItem}
            />

            <LegacyLoopsCard />
          </div>
        </div>
        <div className="mt-8 border-t border-[var(--line)] pt-6 lg:mt-0 lg:flex lg:flex-col lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
          <AgendaPanel />
          <ShipmentsPanel items={inbox.items} />
          <DaySummary items={inbox.items} />
        </div>
      </div>
    </div>
  );
}

function ShipmentsPanel({ items }: { items: MailAssessment[] }) {
  const byKey = new Map<string, { shipment: ShipmentInfo; receivedAt: string }>();
  for (const item of items) {
    if (!item.shipment) continue;
    const key = `${item.shipment.supplier.toLowerCase()}::${item.shipment.orderNumber.toLowerCase()}`;
    const existing = byKey.get(key);
    if (!existing || Date.parse(item.receivedAt) > Date.parse(existing.receivedAt)) {
      byKey.set(key, { shipment: item.shipment, receivedAt: item.receivedAt });
    }
  }
  const shipments = [...byKey.values()].sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt));

  const statusColor = (status: string) =>
    status === "Geleverd"
      ? "var(--green)"
      : status === "Onderweg"
        ? "var(--blue)"
        : status === "Verzonden"
          ? "var(--orange)"
          : "var(--muted)";

  const formatDate = (iso: string) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!match) return iso;
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).toLocaleDateString("nl-NL", {
      day: "numeric",
      month: "short",
    });
  };

  return (
    <section className="mt-6">
      <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--ink)]">Onderweg</h2>
      {shipments.length === 0 ? (
        <p className="mt-4 text-[14px] text-[var(--muted)]">Bestel maar</p>
      ) : (
      <ul className="mt-4 space-y-4">
        {shipments.map((entry, index) => {
          const s = entry.shipment;
          return (
            <li key={`${s.supplier}-${s.orderNumber}-${index}`} className="flex items-start gap-3">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: statusColor(s.status) }} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-[var(--ink)]">
                  {s.status}
                  {s.deliveredAt ? <span className="font-normal text-[var(--muted)]"> · {formatDate(s.deliveredAt)}</span> : null}
                </p>
                {s.location ? <p className="mt-0.5 text-[12px] text-[var(--blue)]">{s.location}</p> : null}
                <div className="mt-1 flex items-baseline justify-between gap-3">
                  <p className="truncate text-[13px] text-[var(--ink)]">{s.supplier}</p>
                  {s.carrier ? <p className="shrink-0 text-[12px] text-[var(--muted)]">{s.carrier}</p> : null}
                </div>
                {s.orderNumber ? <p className="truncate text-[12px] text-[var(--muted)]">Order {s.orderNumber}</p> : null}
              </div>
            </li>
          );
        })}
      </ul>
      )}
    </section>
  );
}

function DaySummary({ items }: { items: MailAssessment[] }) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const isToday = (iso?: string) => Boolean(iso) && new Date(iso!).getTime() >= startOfToday.getTime();

  let beantwoord = 0;
  let betaald = 0;
  let betaaldBedrag = 0;
  let afgehandeld = 0;
  let gescand = 0;

  for (const item of items) {
    if (item.source === "scan" && isToday(item.receivedAt)) gescand += 1;
    if (item.sentAt && isToday(item.sentAt)) beantwoord += 1;
    if (item.handledByUser && isToday(item.handledAt ?? item.paidAt)) {
      if (item.invoice) {
        betaald += 1;
        betaaldBedrag += item.invoice.amount ?? 0;
      } else {
        afgehandeld += 1;
      }
    }
  }

  const bedrag = betaaldBedrag > 0 ? ` €${betaaldBedrag % 1 === 0 ? betaaldBedrag : betaaldBedrag.toFixed(2)}` : "";

  return (
    <section className="mt-6">
      <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--ink)]">Weggewerkt</h2>
      {beantwoord === 0 && betaald === 0 && afgehandeld === 0 && gescand === 0 ? (
        <p className="mt-4 text-[14px] text-[var(--muted)]">Je hebt nog helemaal niks gedaan vandaag</p>
      ) : (
        <ul className="mt-4 space-y-2 text-[14px] leading-6 text-[var(--ink)]">
          {beantwoord > 0 ? (
            <li className="flex items-center gap-2.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--blue)" }} />
              <span>{beantwoord} {beantwoord === 1 ? "email beantwoord" : "emails beantwoord"}</span>
            </li>
          ) : null}
          {betaald > 0 ? (
            <li className="flex items-center gap-2.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--green)" }} />
              <span>{betaald} {betaald === 1 ? "factuur betaald" : "facturen betaald"}{bedrag}</span>
            </li>
          ) : null}
          {afgehandeld > 0 ? (
            <li className="flex items-center gap-2.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--muted)" }} />
              <span>{afgehandeld} {afgehandeld === 1 ? "email afgehandeld" : "emails afgehandeld"}</span>
            </li>
          ) : null}
          {gescand > 0 ? (
            <li className="flex items-center gap-2.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--orange)" }} />
              <span>{gescand} {gescand === 1 ? "factuur gescand" : "facturen gescand"}</span>
            </li>
          ) : null}
        </ul>
      )}
    </section>
  );
}
