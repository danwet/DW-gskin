"use client";

import type { ShipmentInfo } from "@/lib/agent/types";

export type TrailStep = { at: string; status: string; detail?: string };

/**
 * The status trail of one order, newest first. The agent adds a step each time
 * an order update arrives, so this reads like the history of the shipment.
 */
export function ShipmentDialog({
  shipment,
  trail,
  onClose,
}: {
  shipment: ShipmentInfo;
  trail: TrailStep[];
  onClose: () => void;
}) {
  const dotFor = (status: string): string => {
    const value = status.toLowerCase();
    if (/geleverd|bezorgd|afgeleverd/.test(value)) return "var(--green)";
    if (/bevestig|besteld|order geplaatst|aangemaakt/.test(value)) return "var(--blue)";
    return "var(--orange)";
  };

  const dateLabel = (iso: string): string => {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (!match) return iso;
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).toLocaleDateString("nl-NL", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4">
      <button type="button" aria-label="Sluiten" className="absolute inset-0 bg-[#12141c]/45" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shipment-title"
        className="relative w-full max-w-[420px] rounded-[24px] border border-[var(--line)] bg-[var(--card)] p-5 shadow-[var(--shadow)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium tracking-[0.14em] text-[var(--muted)] uppercase">Bestelling</p>
            <h2 id="shipment-title" className="mt-1 truncate text-[20px] font-semibold tracking-[-0.02em] text-[var(--ink)]">
              {shipment.supplier}
            </h2>
            {shipment.orderNumber ? (
              <p className="mt-0.5 truncate text-[12px] text-[var(--muted)]">Order {shipment.orderNumber}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Sluiten"
            className="focus-ring rounded-full px-2 py-1 text-[16px] leading-none text-[var(--muted)] hover:text-[var(--ink)]"
          >
            ×
          </button>
        </div>

        <table className="mt-5 w-full border-collapse text-left">
          <thead>
            <tr>
              <th className="pb-2 text-[11px] font-medium tracking-[0.12em] text-[var(--muted)] uppercase">Datum</th>
              <th className="pb-2 text-[11px] font-medium tracking-[0.12em] text-[var(--muted)] uppercase">Status</th>
            </tr>
          </thead>
          <tbody>
            {trail.map((step, index) => (
              <tr key={`${step.at}-${index}`}>
                <td className="py-2 pr-3 align-top text-[13px] whitespace-nowrap text-[var(--muted)]">
                  {dateLabel(step.at)}
                </td>
                <td className="py-2 align-top">
                  <span className="flex items-start gap-2">
                    <span
                      className="mt-[6px] h-2 w-2 shrink-0 rounded-full"
                      style={{ background: dotFor(step.status) }}
                    />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-[var(--ink)]">{step.status}</span>
                      {step.detail ? (
                        <span className="mt-0.5 block text-[12px] text-[var(--muted)]">{step.detail}</span>
                      ) : null}
                    </span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
