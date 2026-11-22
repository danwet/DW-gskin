"use client";

import { Modal } from "@/components/kit/modal";
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
    <Modal open onOpenChange={(open) => !open && onClose()} title={shipment.supplier}>
      <div className="flex flex-col gap-1 pb-[25px]">
        {shipment.orderNumber ? (
          <p className="t-meta text-ink-muted">Order {shipment.orderNumber}</p>
        ) : null}
        <table className="mt-3 w-full border-collapse text-left">
          <thead>
            <tr>
              <th className="pb-2 text-[11px] font-medium tracking-[0.12em] text-ink-faint uppercase">Datum</th>
              <th className="pb-2 text-[11px] font-medium tracking-[0.12em] text-ink-faint uppercase">Status</th>
            </tr>
          </thead>
          <tbody>
            {trail.map((step, index) => (
              <tr key={`${step.at}-${index}`}>
                <td className="py-2 pr-3 align-top text-[13px] whitespace-nowrap text-ink-muted">
                  {dateLabel(step.at)}
                </td>
                <td className="py-2 align-top">
                  <span className="flex items-start gap-2">
                    <span className="mt-[6px] h-2 w-2 shrink-0 rounded-full" style={{ background: dotFor(step.status) }} />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-ink">{step.status}</span>
                      {step.detail ? <span className="mt-0.5 block text-[12px] text-ink-muted">{step.detail}</span> : null}
                    </span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}