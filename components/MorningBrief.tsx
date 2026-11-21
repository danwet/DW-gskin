"use client";

import { useLayoutEffect, useRef } from "react";
import { dueTime, formatDueLabel, isDueUrgent } from "@/lib/epc";
import { mailListCopy } from "@/lib/empty-brief";
import { formatHourMinute } from "@/lib/greeting";
import { orderByCheckState } from "@/lib/settings";
import { PageHeader } from "./PageHeader";
import { useApp } from "./AppProvider";
import { Card, CardHeading, Checkbox, DonePill } from "./ui";

const tones = {
  blue: "var(--blue)",
  green: "var(--green)",
  orange: "var(--orange)",
  purple: "var(--purple)",
};

const SLIDE_MS = 1200;
const SLIDE_EASE = "cubic-bezier(0, 0.75, 0.2, 1)";

export function MorningBrief() {
  const {
    brief,
    ready,
    checked,
    checkedAt,
    toggleLoop,
    markInvoicePaid,
    restoreInvoice,
    openLoop,
    approved,
    approveDraft,
    isSnoozed,
    heldSnoozes,
    snoozedAt,
    slideFocusId,
    calendarError,
    mailError,
  } = useApp();
  const done = brief.loops.filter((loop) => checked.has(loop.id)).length;
  const progress = brief.loops.length ? Math.round((done / brief.loops.length) * 100) : 0;
  const snoozed = new Set<string>();
  for (const id of heldSnoozes) {
    if (isSnoozed(id) && !checked.has(id)) snoozed.add(id);
  }
  const urgentDue: Record<string, number> = {};
  for (const loop of brief.loops) {
    const iso = loop.payment?.due_date;
    if (!iso || !isDueUrgent(iso)) continue;
    const at = dueTime(iso);
    if (at != null) urgentDue[loop.id] = at;
  }
  const openLoops = orderByCheckState(
    brief.loops.filter((loop) => !isSnoozed(loop.id) || heldSnoozes.has(loop.id)),
    checked,
    checkedAt,
    snoozed,
    snoozedAt,
    urgentDue,
  );
  const invoicesDue = brief.loops.filter((loop) => loop.payment && !checked.has(loop.id) && !isSnoozed(loop.id)).length;
  const draftsById = new Map(brief.drafts.map((item) => [item.id, item]));
  const emptyCopy = mailListCopy(ready, mailError);
  const paidLoops = brief.loops.filter((loop) => loop.payment && checked.has(loop.id));
  const listRef = useRef<HTMLUListElement>(null);
  const offsets = useRef<Map<string, number>>(new Map());
  const primed = useRef(false);
  const slideGeneration = useRef(0);
  const animatedKey = useRef("");
  const orderKey = openLoops.map((loop) => loop.id).join("\n");

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const rows = [...list.querySelectorAll<HTMLElement>("[data-loop-id]")];
    if (animatedKey.current === orderKey && rows.some((row) => row.getAnimations().length > 0)) return;

    const clearSlide = (row: HTMLElement) => {
      row.getAnimations().forEach((animation) => animation.cancel());
      row.style.transition = "";
      row.style.transform = "";
      row.style.zIndex = "";
      row.style.background = "";
      row.style.borderRadius = "";
      row.style.boxShadow = "";
      row.style.paddingLeft = "";
      row.style.paddingRight = "";
      row.style.marginLeft = "";
      row.style.marginRight = "";
    };

    for (const row of rows) row.getAnimations().forEach((animation) => animation.cancel());
    for (const row of rows) row.style.transform = "none";
    const base = list.getBoundingClientRect().top;
    const next = new Map<string, number>();
    for (const row of rows) {
      const id = row.dataset.loopId;
      if (!id) continue;
      next.set(id, row.getBoundingClientRect().top - base);
    }
    for (const row of rows) row.style.transform = "";

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const previous = offsets.current;
    if (!ready || !primed.current || reduce) {
      if (ready) primed.current = true;
      offsets.current = next;
      for (const row of rows) clearSlide(row);
      return;
    }

    const generation = ++slideGeneration.current;
    const surface = document.documentElement.classList.contains("dark") ? "var(--card)" : "#fff";
    const moving: { el: HTMLElement; dy: number }[] = [];
    for (const row of rows) {
      const id = row.dataset.loopId;
      if (!id) continue;
      const before = previous.get(id);
      const after = next.get(id);
      if (before == null || after == null) continue;
      const dy = before - after;
      if (Math.abs(dy) < 1) continue;
      moving.push({ el: row, dy });
    }
    offsets.current = next;
    if (moving.length === 0) return;
    animatedKey.current = orderKey;

    const focus =
      moving.find((item) => item.el.dataset.loopId === slideFocusId) ??
      moving.reduce((best, item) => (Math.abs(item.dy) > Math.abs(best.dy) ? item : best));
    for (const item of moving) {
      const front = item === focus;
      item.el.style.zIndex = front ? "40" : "1";
      item.el.style.background = surface;
      item.el.style.borderRadius = "12px";
      item.el.style.boxShadow = `0 0 0 8px ${surface}`;
      item.el.style.paddingLeft = "8px";
      item.el.style.paddingRight = "8px";
      item.el.style.marginLeft = "-8px";
      item.el.style.marginRight = "-8px";
      const animation = item.el.animate(
        [{ transform: `translateY(${item.dy}px)` }, { transform: "translateY(0px)" }],
        { duration: SLIDE_MS, easing: SLIDE_EASE, fill: "both" },
      );
      animation.onfinish = () => {
        if (slideGeneration.current !== generation) return;
        clearSlide(item.el);
      };
    }
  }, [orderKey, ready, slideFocusId]);

  return (
    <div className="mx-auto max-w-[1180px] px-4 py-6 sm:px-8 sm:py-8">
      <PageHeader />

      <Card className="mt-6 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--blue-soft)] text-[var(--blue)]">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="8" cy="8" r="3" fill="currentColor" />
              <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </span>
          <div>
            <h2 className="text-[16px] font-semibold">{brief.insight.title}</h2>
            <p className="mt-1 max-w-[34rem] text-[14px] leading-5 text-[var(--muted)]">
              {brief.insight.detail}
              {mailError ? "" : ` ${invoicesWaiting(invoicesDue)}`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-6 sm:gap-8">
          <Stat value={invoicesDue} label="INVOICES" color="var(--danger)" />
          <Stat value={brief.drafts.length} label="DRAFTS" color="var(--orange)" />
          <Stat value={brief.events.length} label="EVENTS" color="var(--blue)" />
          <Stat value={brief.actions.length} label="HANDLED" color="var(--green)" />
        </div>
      </Card>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeading eyebrow="TODAY" title="Calendar" meta={`${brief.events.length} events`} />
          {!ready ? (
            <p className="text-[14px] text-[var(--muted)]">Loading your calendar.</p>
          ) : calendarError ? (
            <p className="text-[14px] text-[var(--muted)]">{calendarError}</p>
          ) : brief.events.length === 0 ? (
            <p className="text-[14px] text-[var(--muted)]">Nothing on your calendar today.</p>
          ) : (
          <ul className="space-y-4">
            {brief.events.map((event) => (
              <li key={event.id} className="flex gap-3">
                <div className="w-12 shrink-0">
                  <p className="text-[13px] font-semibold">{formatHourMinute(event.hour, event.minute)}</p>
                </div>
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: tones[event.tone] }} />
                <div>
                  <p className="text-[14px] font-medium">{event.title}</p>
                  <p className="text-[13px] text-[var(--muted)]">{event.detail}</p>
                </div>
              </li>
            ))}
          </ul>
          )}
          {brief.upcoming.length > 0 ? (
            <p className="mt-4 border-t border-[var(--line)] pt-3 text-[12px] text-[var(--muted)]">
              Also held: {brief.upcoming[0].title} · {brief.upcoming[0].when}
            </p>
          ) : null}
        </Card>

        <Card className="md:col-span-2 xl:col-span-2">
          <CardHeading eyebrow="FOCUS" title="Still needs you" meta={`${progress}%`} />
          {openLoops.length === 0 ? (
            <p className="text-[14px] leading-6 text-[var(--muted)]">{emptyCopy}</p>
          ) : (
          <ul ref={listRef} className="space-y-4">
            {openLoops.map((loop) => {
              const on = checked.has(loop.id);
              const draft = loop.draftId ? draftsById.get(loop.draftId) : undefined;
              const isApproved = draft ? approved.has(draft.id) : false;
              const snoozedHere = heldSnoozes.has(loop.id) && isSnoozed(loop.id);
              const review = on || snoozedHere;
              return (
                <li key={loop.id} data-loop-id={loop.id} className="relative flex flex-wrap items-start gap-x-3 gap-y-2">
                  <span className="mt-1">
                    <Checkbox
                      checked={on}
                      onChange={() => {
                        if (loop.payment) {
                          if (on) restoreInvoice(loop);
                          else markInvoicePaid(loop);
                        } else if (draft && isApproved) approveDraft(draft.id);
                        else toggleLoop(loop.id);
                      }}
                      label={loop.title}
                    />
                  </span>
                  <div className="min-w-0 flex-1 basis-[14rem] px-1 py-0.5">
                    <p className={`text-[14px] font-medium ${on ? "text-[var(--muted)] line-through" : ""}`}>
                      {loop.title}
                    </p>
                    <p className="mt-0.5 text-[13px] leading-5 text-[var(--muted)]">{loop.detail}</p>
                    {loop.payment?.due_date ? (
                      <p
                        className={`mt-0.5 text-[13px] leading-5 ${
                          isDueUrgent(loop.payment.due_date) ? "text-[var(--danger)]" : "text-[var(--muted)]"
                        }`}
                      >
                        Due {formatDueLabel(loop.payment.due_date)}
                      </p>
                    ) : null}
                  </div>
                  {loop.payment ? (
                    <div className="ml-7 flex shrink-0 items-center gap-3 sm:ml-0">
                      {snoozedHere ? <DonePill tone="orange">Snoozed</DonePill> : null}
                      {on ? <DonePill>Paid</DonePill> : null}
                      <button
                        type="button"
                        onClick={() => openLoop(loop)}
                        className="inline-flex w-[5.5rem] justify-center rounded-full border border-[var(--line)] px-3 py-1.5 text-[13px] font-medium text-[var(--blue)]"
                      >
                        {review ? "Review" : "Pay"}
                      </button>
                    </div>
                  ) : draft ? (
                    <div className="ml-7 flex shrink-0 items-center gap-3 sm:ml-0">
                      {isApproved ? <DonePill>Approved</DonePill> : null}
                      <button
                        type="button"
                        onClick={() => openLoop(loop)}
                        className="inline-flex w-[5.5rem] justify-center rounded-full border border-[var(--line)] px-3 py-1.5 text-[13px] font-medium text-[var(--blue)]"
                      >
                        {isApproved ? "Review" : "Reply"}
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          )}
        </Card>

        <Card>
          <CardHeading eyebrow="WHILE YOU WERE AWAY" title="Handled for you" />
          {brief.actions.length === 0 && paidLoops.length === 0 ? (
            <p className="text-[14px] leading-6 text-[var(--muted)]">{emptyCopy}</p>
          ) : (
          <ol className="space-y-4">
            {brief.actions.map((action, index) => (
              <li key={action.id} className="flex items-start gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--green-soft)] text-[11px] font-semibold text-[var(--green)]">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium">{action.title}</p>
                  <p className="text-[13px] text-[var(--muted)]">{action.detail}</p>
                </div>
                <DonePill>{action.status}</DonePill>
              </li>
            ))}
            {paidLoops.map((loop, index) => (
                <li key={loop.id} className="flex items-start gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--green-soft)] text-[11px] font-semibold text-[var(--green)]">
                    {String(brief.actions.length + index + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-medium">{loop.payment?.recipient_name}</p>
                    <p className="text-[13px] text-[var(--muted)]">
                      €{Number(loop.payment?.amount || 0).toFixed(2)} · {loop.payment?.reference}. Marked paid here. No transfer was sent.
                    </p>
                  </div>
                <DonePill>Done</DonePill>
              </li>
            ))}
          </ol>
          )}
        </Card>

        <Card>
          <CardHeading eyebrow="FOR AWARENESS" title="No reply needed" />
          {brief.quiet.length === 0 ? (
            <p className="text-[14px] leading-6 text-[var(--muted)]">{emptyCopy}</p>
          ) : (
          <ul className="space-y-4">
            {brief.quiet.map((item) => (
              <li key={item.id} className="flex gap-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--faint)]" />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium">{item.from}</p>
                  <p className="text-[13px] text-[var(--muted)]">{item.subject}</p>
                  <p className="text-[12px] text-[var(--faint)]">{item.reason}</p>
                </div>
                <span className="shrink-0 text-[12px] text-[var(--muted)]">{item.when}</span>
              </li>
            ))}
          </ul>
          )}
        </Card>

        <Card>
          <CardHeading eyebrow="AGENT" title="This triage" />
          <ul className="space-y-4">
            <AgentRow title="Inbox sorted" detail={`${brief.messageCount} messages classified`} />
            <AgentRow title="Invoices to pay" detail={invoicesFound(brief.loops.filter((loop) => loop.payment).length)} />
            <AgentRow title="Replies drafted" detail={`${brief.drafts.length} waiting for your review`} />
            <AgentRow title="Left alone" detail={`${brief.quiet.length} need nothing from you`} />
            <AgentRow title="Next scheduled run" detail="No scheduled run configured" />
          </ul>
        </Card>
      </div>
    </div>
  );
}

function invoicesWaiting(count: number): string {
  if (count === 0) return "There are no invoices to pay.";
  if (count === 1) return "1 invoice is waiting to be paid.";
  return `${count} invoices are waiting to be paid.`;
}

function invoicesFound(count: number): string {
  if (count === 1) return "1 found to pay";
  return `${count} found to pay`;
}

function Stat({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="min-w-[64px]">
      <p className="text-[28px] leading-none font-semibold tracking-[-0.04em]" style={{ color }}>
        {value}
      </p>
      <p className="mt-1 text-[10px] font-medium tracking-[0.14em] text-[var(--muted)]">{label}</p>
    </div>
  );
}

function AgentRow({ title, detail }: { title: string; detail: string }) {
  return (
    <li>
      <p className="text-[14px] font-medium">{title}</p>
      <p className="text-[13px] text-[var(--muted)]">{detail}</p>
    </li>
  );
}
