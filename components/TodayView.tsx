"use client";

import { AgendaPanel } from "./AgendaPanel";
import type { MailAssessment, ShipmentInfo } from "@/lib/agent/types";
import { useInbox } from "./AgentInbox";
import { InboxGrid } from "./InboxGrid";
import { LegacyLoopsCard } from "./LegacyLoopsCard";
import { TodayHeader } from "./TodayHeader";

export function TodayView() {
  const inbox = useInbox();
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
      <TodayHeader
        missedItems={missedItems}
        onToggleHandled={inbox.toggleHandled}
        onDeclare={inbox.declareInvoice}
      />
      <div className="mt-8 grid gap-0 lg:grid-cols-3 lg:gap-8">
        <div className="lg:col-span-2">
          <div className="mx-auto w-full max-w-[720px] space-y-6">
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
