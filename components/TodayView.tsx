"use client";

import { useEffect, useRef, useState } from "react";

import { AgendaPanel } from "./AgendaPanel";
import { startOfLogicalDay } from "@/lib/day-boundary";
import type { MailAssessment, ShipmentInfo } from "@/lib/agent/types";
import { useInbox, type InboxProgress } from "./AgentInbox";
import { useApp } from "./AppProvider";
import { InboxGrid } from "./InboxGrid";
import { LegacyLoopsCard } from "./LegacyLoopsCard";
import { ShipmentDialog, type TrailStep } from "./ShipmentDialog";
import { TodayHeader } from "./TodayHeader";

const GMAIL_NOTICES: Record<string, { tone: "ok" | "warn"; text: string }> = {
  connected: { tone: "ok", text: "Gmail is gekoppeld. De eerste import start automatisch." },
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

/**
 * One card per invoice: a supplier that chases the same invoice in several
 * mails (reminder, final notice) must not fill the overview twice. The newest
 * message wins.
 */
function dedupeInvoices(items: MailAssessment[]): MailAssessment[] {
  const byInvoice = new Map<string, number>();
  const out: MailAssessment[] = [];

  for (const item of items) {
    const invoice = item.invoice;
    const key =
      invoice?.invoiceNumber && invoice?.supplier
        ? `${invoice.supplier.toLowerCase()}::${invoice.invoiceNumber.toLowerCase()}`
        : "";
    if (!key) {
      out.push(item);
      continue;
    }
    const existingIndex = byInvoice.get(key);
    if (existingIndex === undefined) {
      byInvoice.set(key, out.length);
      out.push(item);
      continue;
    }
    // Same invoice seen before: keep whichever message is newer.
    if (Date.parse(item.receivedAt) > Date.parse(out[existingIndex].receivedAt)) {
      out[existingIndex] = item;
    }
  }
  return out;
}

export function TodayView() {
  const { setSyncProgress } = useApp();
  const inbox = useInbox();
  const [progress, setProgress] = useState<InboxProgress | null>(inbox.progress);

  useEffect(() => {
    setProgress(inbox.progress);
  }, [inbox.progress]);

  const syncing = progress?.phase === "importing" || progress?.phase === "triaging";

  // Client-driven runner: repeats the resumable step until the import and the
  // triage are done, then reloads the cards. Every step is persisted in
  // Supabase, so closing the tab only pauses it.
  // Keep the loop alive across re-renders: only a phase change may stop it,
  // otherwise every progress update cancelled the runner halfway.
  const reloadRef = useRef(inbox.reload);
  useEffect(() => {
    reloadRef.current = inbox.reload;
  }, [inbox.reload]);

  useEffect(() => {
    if (!syncing) return;
    let cancelled = false;

    const run = async () => {
      while (!cancelled) {
        try {
          const response = await fetch("/api/gmail/import", { method: "POST" });
          const data = (await response.json().catch(() => null)) as { progress?: InboxProgress } | null;
          if (cancelled) return;
          if (data?.progress) {
            setProgress(data.progress);
            // The sidebar reads this from the app context; without it the bar
            // kept showing whatever the last inbox load reported.
            setSyncProgress(data.progress);
          }
          const phase = data?.progress?.phase;
          if (phase !== "importing" && phase !== "triaging") break;
          await new Promise((resolve) => setTimeout(resolve, 250));
        } catch {
          if (cancelled) return;
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      }
      if (!cancelled) void reloadRef.current();
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [syncing]);

  const nowMs = Date.now();
  // Bewaren moves a mail out of Focus, and order mail the agent archived itself
  // leaves too (it stays available for the shipments panel).
  const visibleItems = dedupeInvoices(inbox.items.filter((item) => !item.archivedAt && !item.savedAt));

  const activeItems = visibleItems.filter(
    (item) =>
      item.classification !== "info" &&
      item.classification !== "unclassified" &&
      item.handledByUser !== true,
  );
  const infoItems = visibleItems.filter(
    (item) => item.classification === "info" || (item.source === "scan" && item.handledByUser === true),
  );
  // A paid invoice that still has to be declared keeps its card, even though the
  // mail itself is already archived.
  const declareItems = inbox.items.filter((item) => item.invoice && item.declaration === "pending");
  const missedItems = visibleItems.filter((item) => item.classification === "unclassified");

  return (
    <div className="mx-auto max-w-[1180px] px-6 pt-1 pb-7 sm:px-8 sm:pt-2 sm:pb-8 md:pt-4 md:pb-14">
        {inbox.notice ? (
          <div className="glass-float fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-2xl px-4 py-2.5 text-[13px] text-[var(--ink)]">
            {inbox.notice}
          </div>
        ) : null}
      <GmailNotice />
      <TodayHeader />
      <div className="mt-8 grid gap-0 lg:grid-cols-3 lg:gap-8">
        <div className="lg:col-span-2">
          <div className="mx-auto w-full max-w-[680px] space-y-6">
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
              onReload={inbox.reload}
              onRemove={inbox.removeItem}
              onUpdate={inbox.updateItem}
              onError={inbox.setNotice}
            />

            <LegacyLoopsCard />
          </div>
        </div>
        <div className="mt-8 border-t border-[var(--line)] pt-6 lg:mt-0 lg:flex lg:flex-col lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
          <AgendaPanel />
          <ShipmentsPanel items={inbox.items} />
          <DaySummary
            items={inbox.items}
            dailyChanges={inbox.meta?.dailyChanges}
            dailyPaid={inbox.meta?.dailyPaid}
            dailyAnswered={inbox.meta?.dailyAnswered}
          />
        </div>
      </div>
    </div>
  );
}

function item_archivedToday(supplier: string, items: MailAssessment[], startOfToday: Date): boolean {
  return items.some(
    (item) =>
      item.archivedAt &&
      Date.parse(item.archivedAt) >= startOfToday.getTime() &&
      (item.shipment?.supplier ?? item.from ?? "").toLowerCase().includes(supplier.toLowerCase()),
  );
}

function ShipmentsPanel({ items }: { items: MailAssessment[] }) {
  const byKey = new Map<string, { shipment: ShipmentInfo; receivedAt: string; key: string }>();
  // Every order update carries one status; together they form the trail.
  const trails = new Map<string, TrailStep[]>();
  for (const item of items) {
    if (!item.shipment) continue;
    // One trail per order: the agent's order key already spans carrier mails.
    const key =
      item.shipment.orderKey ||
      `${item.shipment.supplier.toLowerCase()}::${item.shipment.orderNumber.toLowerCase()}`;
    const existing = byKey.get(key);
    if (!existing || Date.parse(item.receivedAt) > Date.parse(existing.receivedAt)) {
      byKey.set(key, { shipment: item.shipment, receivedAt: item.receivedAt, key });
    }
    const steps = trails.get(key) ?? [];
    steps.push({
      at: item.receivedAt,
      status: item.shipment.status,
      detail: item.shipment.location ?? item.shipment.carrier ?? undefined,
    });
    trails.set(key, steps);
  }
  for (const steps of trails.values()) {
    steps.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  }
  // A delivered order is relevant until 05:00 the next morning; then the
  // dashboard day rolls over and it drops out of the panel.
  const startOfToday = startOfLogicalDay();

  // Payment confirmations sit in the same panel, grouped per supplier so a
  // second receipt shows as "Leverancier (2)".
  const payments = new Map<string, { supplier: string; count: number; receivedAt: string; amount?: number }>();
  for (const item of items) {
    if (!item.payment) continue;
    // A payment confirmation is news on the day it arrives; after the 05:00
    // rollover it drops out, exactly like a delivered order.
    if (Date.parse(item.receivedAt) < startOfToday.getTime()) continue;
    const key = item.payment.supplier.toLowerCase();
    const existing = payments.get(key);
    if (existing) {
      existing.count += 1;
      if (Date.parse(item.receivedAt) > Date.parse(existing.receivedAt)) existing.receivedAt = item.receivedAt;
    } else {
      payments.set(key, {
        supplier: item.payment.supplier,
        count: 1,
        receivedAt: item.receivedAt,
        amount: item.payment.amount,
      });
    }
  }
  const paymentEntries = [...payments.values()].sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt));

  const shipments = [...byKey.values()]
    .filter((entry) => {
      if (entry.shipment.status !== "Geleverd") return true;
      // Today's delivery, or one the agent processed today, stays visible.
      const archivedToday = item_archivedToday(entry.shipment.supplier, items, startOfToday);
      return archivedToday || Date.parse(entry.receivedAt) >= startOfToday.getTime();
    })
    .sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt));

  const [openTrail, setOpenTrail] = useState<{ shipment: ShipmentInfo; trail: TrailStep[] } | null>(null);

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
      <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--ink)]">Bestellingen</h2>
      {shipments.length === 0 && paymentEntries.length === 0 ? (
        <p className="mt-4 text-[14px] text-[var(--muted)]">Bestel maar</p>
      ) : (
      <ul className="mt-4 space-y-4">
        {shipments.map((entry, index) => {
          const s = entry.shipment;
          return (
            <li key={`${s.supplier}-${s.orderNumber}-${index}`}>
              <button
                type="button"
                onClick={() => setOpenTrail({ shipment: s, trail: trails.get(entry.key) ?? [] })}
                className="focus-ring flex w-full items-start gap-3 rounded-xl text-left"
              >
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
              </button>
            </li>
          );
        })}
        {paymentEntries.map((entry, index) => (
          <li key={`betaald-${entry.supplier}-${index}`} className="flex items-start gap-3">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--green)" }} />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-[var(--ink)]">Betaald</p>
              <div className="mt-1 flex items-baseline justify-between gap-3">
                <p className="truncate text-[13px] text-[var(--ink)]">
                  {entry.supplier}
                  {entry.count > 1 ? <span className="text-[var(--muted)]"> ({entry.count})</span> : null}
                </p>
                {entry.amount != null ? (
                  <p className="shrink-0 text-[12px] text-[var(--muted)]">€ {entry.amount.toFixed(2).replace(".", ",")}</p>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
      )}
      {openTrail ? (
        <ShipmentDialog
          shipment={openTrail.shipment}
          trail={openTrail.trail}
          onClose={() => setOpenTrail(null)}
        />
      ) : null}
    </section>
  );
}

function DaySummary({
  items,
  dailyChanges,
  dailyPaid,
  dailyAnswered,
}: {
  items: MailAssessment[];
  dailyChanges?: { date: string; orderStatus: number; paymentStatus: number };
  dailyPaid?: { date: string; count: number };
  dailyAnswered?: { date: string; count: number };
}) {
  // Counters only apply to today; yesterday's numbers must not linger.
  const today = startOfLogicalDay().toLocaleDateString("sv-SE");
  const orderChanges = dailyChanges?.date === today ? dailyChanges.orderStatus : 0;
  const paymentChanges = dailyChanges?.date === today ? dailyChanges.paymentStatus : 0;

  const startOfToday = startOfLogicalDay();
  const isToday = (iso?: string) => Boolean(iso) && new Date(iso!).getTime() >= startOfToday.getTime();

  let beantwoord = 0;
  let betaald = 0;
  let afgehandeld = 0;
  let gescand = 0;

  for (const item of items) {
    if (item.source === "scan" && isToday(item.receivedAt)) gescand += 1;
    if (item.sentAt && isToday(item.sentAt)) beantwoord += 1;
    if (item.handledByUser && isToday(item.handledAt ?? item.paidAt)) {
      if (item.invoice) {
        betaald += 1;
      } else {
        afgehandeld += 1;
      }
    }
  }

  // A card can leave the list after being paid or answered; the day counters
  // keep those actions counted.
  if (dailyPaid?.date === today) betaald = Math.max(betaald, dailyPaid.count);
  if (dailyAnswered?.date === today) beantwoord = Math.max(beantwoord, dailyAnswered.count);

  return (
    <section className="mt-6">
      <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--ink)]">Weggewerkt</h2>
      {beantwoord === 0 &&
      betaald === 0 &&
      afgehandeld === 0 &&
      gescand === 0 &&
      orderChanges === 0 &&
      paymentChanges === 0 ? (
        <p className="mt-4 text-[14px] text-[var(--muted)]">Je hebt nog helemaal niks gedaan vandaag</p>
      ) : (
        <ul className="mt-4 space-y-2 text-[14px] leading-6 text-[var(--ink)]">
          {beantwoord > 0 ? (
            <li className="flex items-center gap-2.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--blue)" }} />
              <span>{beantwoord} {beantwoord === 1 ? "bericht beantwoord" : "berichten beantwoord"}</span>
            </li>
          ) : null}
          {betaald > 0 ? (
            <li className="flex items-center gap-2.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--green)" }} />
              <span>{betaald} {betaald === 1 ? "factuur betaald" : "facturen betaald"}</span>
            </li>
          ) : null}
          {afgehandeld > 0 ? (
            <li className="flex items-center gap-2.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--muted)" }} />
              <span>{afgehandeld} {afgehandeld === 1 ? "bericht afgehandeld" : "berichten afgehandeld"}</span>
            </li>
          ) : null}
          {orderChanges > 0 ? (
            <li className="flex items-center gap-2.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--blue)" }} />
              <span>{orderChanges} orderstatus bijgewerkt</span>
            </li>
          ) : null}
          {paymentChanges > 0 ? (
            <li className="flex items-center gap-2.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--green)" }} />
              <span>{paymentChanges} betaalstatus bijgewerkt</span>
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
