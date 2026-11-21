"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { formatDueLabel, generateEPCQRString, isPastDue } from "@/lib/epc";
import { SNOOZE_CHOICES, snoozeUntil } from "@/lib/settings";
import { InvoicePreview } from "./InvoicePreview";
import { useApp } from "./AppProvider";

export function PaymentModal() {
  const { payment, setPayment, markInvoicePaid, snoozeLoop, unsnoozeLoop, isSnoozed } = useApp();
  const [snoozeOpen, setSnoozeOpen] = useState(false);

  useEffect(() => {
    setSnoozeOpen(false);
  }, [payment?.id]);

  useEffect(() => {
    if (!payment) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (snoozeOpen) {
        setSnoozeOpen(false);
        return;
      }
      setPayment(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [payment, setPayment, snoozeOpen]);

  if (!payment?.payment) return null;

  const invoice = payment.payment;
  const epcString = generateEPCQRString(invoice);
  const iban = invoice.iban.replace(/\s+/g, "").toUpperCase();
  const amount = `€${Number(invoice.amount || 0).toFixed(2)}`;
  const due = invoice.due_date;
  const overdue = due ? isPastDue(due) : false;
  const snoozed = isSnoozed(payment.id);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <button
        type="button"
        aria-label="Close payment"
        className="absolute inset-0 bg-[#12141c]/40"
        onClick={() => setPayment(null)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-title"
        className="relative flex max-h-[calc(100dvh-2rem)] w-full max-w-[960px] flex-col overflow-hidden rounded-[24px] border border-[var(--line)] bg-[var(--card)] shadow-[var(--shadow)] md:h-[min(780px,calc(100dvh-2rem))]"
      >
        <button
          type="button"
          onClick={() => setPayment(null)}
          aria-label="Close"
          className="absolute top-4 right-4 z-10 grid h-8 w-8 place-items-center rounded-full text-[18px] text-[var(--muted)] hover:bg-[var(--bg)]"
        >
          ×
        </button>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[minmax(0,1.2fr)_minmax(320px,400px)] md:overflow-hidden">
          <section className="flex min-h-0 flex-col gap-3 border-b border-[var(--line)] p-5 md:border-r md:border-b-0 md:p-6">
            {invoice.pdf_url ? (
              <InvoicePreview url={invoice.pdf_url} title={`${invoice.recipient_name} invoice`} />
            ) : (
              <p className="text-[14px] text-[var(--muted)]">No invoice PDF was attached.</p>
            )}
            {invoice.pdf_url ? (
              <a
                href={invoice.pdf_url}
                download={invoice.pdf_filename || "invoice.pdf"}
                className="inline-flex w-fit items-center justify-center rounded-full border border-[var(--line)] px-4 py-2 text-[14px] font-medium"
              >
                Download
              </a>
            ) : null}
          </section>

          <section className="flex min-h-0 flex-col overflow-y-auto px-5 pt-5 pb-5 md:px-6 md:pt-6 md:pr-14">
            <p className="text-[11px] font-medium tracking-[0.16em] text-[var(--muted)]">PAYMENT</p>
            <h2 id="payment-title" className="mt-3 text-[18px] font-semibold tracking-[-0.03em]">
              Pay invoice
            </h2>

            <dl className="mt-5 space-y-2 text-[14px]">
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted)]">Recipient</dt>
                <dd className="text-right font-medium">{invoice.recipient_name}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted)]">IBAN</dt>
                <dd className="text-right font-medium tracking-wide">{iban}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted)]">Amount</dt>
                <dd className="text-right font-medium">{amount}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted)]">Payment reference</dt>
                <dd className="text-right font-medium">{invoice.reference}</dd>
              </div>
              {due ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--muted)]">Due date</dt>
                  <dd className={`text-right font-medium ${overdue ? "text-[var(--danger)]" : ""}`}>
                    {formatDueLabel(due)}
                  </dd>
                </div>
              ) : null}
            </dl>

            <div className="mt-5 grid place-items-center rounded-2xl bg-white p-4">
              <QRCodeSVG value={epcString} size={220} level="M" aria-label="SEPA payment QR code" />
            </div>
            <p className="mt-3 text-[14px] leading-6 text-[var(--muted)]">
              Scan this QR code with your Knab (or bank) app to prepare the payment.
            </p>

            <div className="mt-5 border-t border-[var(--line)] pt-4 md:mt-auto">
              <p className="text-[13px] leading-5 text-[var(--muted)]">
                This moves the invoice in Dashboard. No transfer is sent from here.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <div className="relative">
                  {snoozed ? (
                    <button
                      type="button"
                      onClick={() => {
                        unsnoozeLoop(payment.id);
                        setPayment(null);
                      }}
                      className="shrink-0 rounded-full border border-[var(--line)] px-4 py-2 text-[14px] font-medium whitespace-nowrap"
                    >
                      Unsnooze
                    </button>
                  ) : (
                    <button
                      type="button"
                      aria-expanded={snoozeOpen}
                      aria-haspopup="menu"
                      onClick={() => setSnoozeOpen((open) => !open)}
                      className="shrink-0 rounded-full border border-[var(--line)] px-4 py-2 text-[14px] font-medium whitespace-nowrap"
                    >
                      Snooze
                    </button>
                  )}
                  {!snoozed && snoozeOpen ? (
                    <div
                      role="menu"
                      aria-label="Snooze invoice"
                      className="absolute bottom-full left-0 z-20 mb-2 w-40 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--card)] py-1 shadow-[var(--shadow)]"
                    >
                      {SNOOZE_CHOICES.map((label) => (
                        <button
                          key={label}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            snoozeLoop(payment.id, snoozeUntil(label));
                            setSnoozeOpen(false);
                            setPayment(null);
                          }}
                          className="block w-full px-3 py-2 text-left text-[14px] hover:bg-[var(--bg)]"
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    markInvoicePaid(payment);
                    setPayment(null);
                  }}
                  className="ml-auto shrink-0 rounded-full bg-[var(--accent)] px-4 py-2 text-[14px] font-medium whitespace-nowrap text-white"
                >
                  Mark as paid
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
