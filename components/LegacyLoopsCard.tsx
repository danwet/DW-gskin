"use client";

import { dueTime, formatDueLabel, isDueUrgent } from "@/lib/epc";
import { mailListCopy } from "@/lib/empty-brief";
import { orderByCheckState } from "@/lib/settings";
import { useApp } from "./AppProvider";
import { Card, CardHeading, Checkbox, DonePill } from "./ui";

/**
 * Legacy "Still needs you" loops (payments, reply drafts, Thursday hold) with
 * their existing actions: mark paid, restore, approve, snooze, open detail.
 * Rendered below the agent attention list on the Vandaag page.
 */
export function LegacyLoopsCard() {
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
    mailError,
  } = useApp();

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
  const draftsById = new Map(brief.drafts.map((item) => [item.id, item]));
  const emptyCopy = mailListCopy(ready, mailError);

  if (brief.loops.length === 0 && brief.drafts.length === 0) return null;

  return (
    <Card>
      <CardHeading eyebrow="ACTIES" title="Openstaand" meta={`${brief.loops.length}`} />
      {openLoops.length === 0 ? (
        <p className="text-[14px] leading-6 text-[var(--muted)]">{emptyCopy}</p>
      ) : (
        <ul className="space-y-4">
          {openLoops.map((loop) => {
            const on = checked.has(loop.id);
            const draft = loop.draftId ? draftsById.get(loop.draftId) : undefined;
            const isApproved = draft ? approved.has(draft.id) : false;
            const snoozedHere = heldSnoozes.has(loop.id) && isSnoozed(loop.id);
            const review = on || snoozedHere;
            return (
              <li key={loop.id} className="relative flex flex-wrap items-start gap-x-3 gap-y-2">
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
                      className={`tnum mt-0.5 text-[13px] leading-5 ${
                        isDueUrgent(loop.payment.due_date) ? "text-[var(--danger)]" : "text-[var(--muted)]"
                      }`}
                    >
                      Vervalt {formatDueLabel(loop.payment.due_date, "nl-NL")}
                    </p>
                  ) : null}
                </div>
                {loop.payment ? (
                  <div className="ml-7 flex shrink-0 items-center gap-3 sm:ml-0">
                    {snoozedHere ? <DonePill tone="orange">Snoozed</DonePill> : null}
                    {on ? <DonePill>Betaald</DonePill> : null}
                    <button
                      type="button"
                      onClick={() => openLoop(loop)}
                      className="focus-ring inline-flex w-[5.5rem] justify-center rounded-full border border-[var(--line)] px-3 py-1.5 text-[13px] font-medium text-[var(--blue)]"
                    >
                      {review ? "Bekijk" : "Betalen"}
                    </button>
                  </div>
                ) : draft ? (
                  <div className="ml-7 flex shrink-0 items-center gap-3 sm:ml-0">
                    {isApproved ? <DonePill>Goedgekeurd</DonePill> : null}
                    <button
                      type="button"
                      onClick={() => openLoop(loop)}
                      className="focus-ring inline-flex w-[5.5rem] justify-center rounded-full border border-[var(--line)] px-3 py-1.5 text-[13px] font-medium text-[var(--blue)]"
                    >
                      {isApproved ? "Bekijk" : "Antwoorden"}
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
