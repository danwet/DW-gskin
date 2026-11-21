"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { QRCodeSVG } from "qrcode.react";
import { generateEPCQRString, isValidIban } from "@/lib/epc";
import { orderByUrgency, urgencyFor, type UrgencyTone } from "@/lib/agent/urgency";
import type { AgentMeta, MailAssessment } from "@/lib/agent/types";
import { Avatar, Card, CardHeading } from "./ui";
import { useApp } from "./AppProvider";

type InboxPayload = {
  items: MailAssessment[];
  meta: AgentMeta;
  model: string;
  error?: string | null;
};

export type InboxFilter = "active" | "info" | "all";

const TONE_DOT: Record<UrgencyTone, string> = {
  red: "var(--danger)",
  orange: "var(--orange)",
  blue: "var(--blue)",
  grey: "var(--muted)",
};

const PAYMENT_LABEL: Record<string, string> = {
  unknown: "Betaalstatus onbekend",
  open_per_sender: "Openstaand volgens afzender",
  paid_confirmed: "Betaald bevestigd",
};

export function timeZoneOf(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Amsterdam";
  } catch {
    return "Europe/Amsterdam";
  }
}

export function formatRunAt(iso: string | null | undefined): string {
  if (!iso) return "Nog niet gedraaid";
  return new Date(iso).toLocaleString("nl-NL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(amount: number | undefined, currency: string | undefined): string {
  if (amount == null) return "Onbekend";
  const symbol = currency?.toUpperCase() === "USD" ? "$" : currency?.toUpperCase() === "GBP" ? "£" : "€";
  return `${symbol}${amount.toFixed(2)}`;
}

function formatDate(iso: string | undefined): string {
  if (!iso) return "Onbekend";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}

export function useInbox() {
  const { syncNonce } = useApp();
  const [items, setItems] = useState<MailAssessment[]>([]);
  const [meta, setMeta] = useState<AgentMeta | null>(null);
  const [model, setModel] = useState("rule");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/inbox");
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Inbox could not be loaded.");
      }
      const data = (await response.json()) as InboxPayload;
      setItems(data.items);
      setMeta(data.meta);
      setModel(data.model);
      if (data.error) setError(data.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Inbox could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, syncNonce]);

  const toggleHandled = useCallback(async (item: MailAssessment) => {
    const handled = !(item.handledByUser === true);
    setItems((current) =>
      current.map((entry) =>
        entry.conversationId === item.conversationId
          ? { ...entry, handledByUser: handled, needsAttention: handled ? false : entry.needsAttention }
          : entry,
      ),
    );
    try {
      const response = await fetch("/api/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: item.conversationId, handled }),
      });
      if (response.ok) {
        const data = (await response.json()) as { item?: MailAssessment };
        if (data.item) {
          setItems((current) =>
            current.map((entry) => (entry.conversationId === item.conversationId ? data.item! : entry)),
          );
        }
      }
    } catch {
      // Keep the optimistic state; a reload re-syncs with the server.
    }
  }, []);

  const declareInvoice = useCallback(
    async (item: MailAssessment, declaration: "none" | "pending" | "declared") => {
      setItems((current) =>
        current.map((entry) => (entry.conversationId === item.conversationId ? { ...entry, declaration } : entry)),
      );
      try {
        const response = await fetch("/api/inbox", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId: item.conversationId, declaration }),
        });
        if (response.ok) {
          const data = (await response.json()) as { item?: MailAssessment };
          if (data.item) {
            setItems((current) =>
              current.map((entry) => (entry.conversationId === item.conversationId ? data.item! : entry)),
            );
          }
        }
      } catch {
        // Keep the optimistic state; a reload re-syncs with the server.
      }
    },
    [],
  );

  const saveItem = useCallback(async (item: MailAssessment, saved: boolean) => {
    setItems((current) =>
      current.map((entry) => (entry.conversationId === item.conversationId ? { ...entry, savedAt: saved ? new Date().toISOString() : undefined } : entry)),
    );
    try {
      const response = await fetch("/api/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: item.conversationId, saved }),
      });
      if (response.ok) {
        const data = (await response.json()) as { item?: MailAssessment };
        if (data.item) {
          setItems((current) =>
            current.map((entry) => (entry.conversationId === item.conversationId ? data.item! : entry)),
          );
        }
      }
    } catch {
      // Keep the optimistic state; a reload re-syncs with the server.
    }
  }, []);

  const snoozeItem = useCallback(async (item: MailAssessment, until: string) => {
    setItems((current) =>
      current.map((entry) =>
        entry.conversationId === item.conversationId ? { ...entry, snoozedUntil: until } : entry,
      ),
    );
    try {
      const response = await fetch("/api/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: item.conversationId, snoozedUntil: until }),
      });
      if (response.ok) {
        const data = (await response.json()) as { item?: MailAssessment };
        if (data.item) {
          setItems((current) =>
            current.map((entry) => (entry.conversationId === item.conversationId ? data.item! : entry)),
          );
        }
      }
    } catch {
      // Keep the optimistic state; a reload re-syncs with the server.
    }
  }, []);

  return { items, meta, model, loading, error, reload, toggleHandled, snoozeItem, declareInvoice, saveItem };
}

export function InboxListCard({
  items,
  loading,
  error,
  meta,
  showFilters = false,
  onToggleHandled,
  footer,
  title = "Aandacht nodig",
}: {
  items: MailAssessment[];
  loading: boolean;
  error: string | null;
  meta: AgentMeta | null;
  showFilters?: boolean;
  onToggleHandled: (item: MailAssessment) => void;
  footer?: ReactNode;
  title?: string;
}) {
  const [filter, setFilter] = useState<InboxFilter>("active");
  const now = new Date();
  const timeZone = timeZoneOf();

  const ordered = orderByUrgency(items, now, timeZone);
  const infoCount = items.filter((item) => item.classification === "info").length;
  const activeCount = items.length - infoCount;
  const visible = ordered.filter((item) =>
    filter === "active"
      ? item.classification !== "info"
      : filter === "info"
        ? item.classification === "info"
        : true,
  );
  const emptyCopy =
    items.length === 0
      ? "Nog geen gesprekken beoordeeld."
      : filter === "info"
        ? "Geen berichten ter informatie."
        : filter === "all"
          ? "Geen gesprekken gevonden."
          : "Geen gesprekken die aandacht nodig hebben.";

  return (
    <Card>
      <CardHeading
        eyebrow={filter === "active" ? "FOCUS" : filter === "info" ? "TER INFORMATIE" : "ALLES"}
        title={filter === "active" ? title : filter === "info" ? "Ter informatie" : "Alle gesprekken"}
        meta={`${visible.length} emails`}
      />
      {showFilters ? (
        <div className="mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Filter gesprekken">
          <FilterButton active={filter === "active"} onClick={() => setFilter("active")}>
            Aandacht ({activeCount})
          </FilterButton>
          <FilterButton active={filter === "info"} onClick={() => setFilter("info")}>
            Ter informatie ({infoCount})
          </FilterButton>
          <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>
            Alles ({items.length})
          </FilterButton>
        </div>
      ) : null}

      {loading ? (
        <p className="text-[14px] leading-6 text-[var(--muted)]">Inbox wordt geladen…</p>
      ) : error ? (
        <p className="text-[14px] leading-6 text-[var(--muted)]">{error}</p>
      ) : visible.length === 0 ? (
        <p className="text-[14px] leading-6 text-[var(--muted)]">{emptyCopy}</p>
      ) : (
        <ul className="space-y-5">
          {visible.map((item) => (
            <InboxItem
              key={item.conversationId}
              item={item}
              now={now}
              timeZone={timeZone}
              onToggle={() => onToggleHandled(item)}
            />
          ))}
        </ul>
      )}

      {footer ? <div className="mt-4 border-t border-[var(--line)] pt-3">{footer}</div> : null}
    </Card>
  );
}

function InboxItem({
  item,
  now,
  timeZone,
  onToggle,
}: {
  item: MailAssessment;
  now: Date;
  timeZone: string;
  onToggle: () => void;
}) {
  const urgency = urgencyFor(item, now, timeZone);
  const handled = item.handledByUser === true;

  return (
    <li className="border-b border-[var(--line)] pb-5 last:border-0 last:pb-0">
      <div className="flex items-start gap-3">
        <Avatar name={item.from} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {item.link ? (
                <a href={item.link} target="_blank" rel="noreferrer" className="text-[15px] font-medium text-[var(--blue)] hover:underline">
                  {item.subject}
                </a>
              ) : (
                <p className="text-[15px] font-medium">{item.subject}</p>
              )}
              <p className="mt-0.5 truncate text-[13px] text-[var(--muted)]">
                {item.from}
                {item.fromEmail ? ` · ${item.fromEmail}` : ""}
              </p>
            </div>
            <UrgencyPill tone={urgency.tone} label={urgency.label} />
          </div>

          {item.needsAttention ? (
            <p className="mt-2 inline-block rounded-full bg-[var(--orange-soft)] px-2.5 py-1 text-[12px] font-medium text-[var(--orange)]">
              Opnieuw aandacht · {item.attentionReason ?? "Nieuw bericht"}
            </p>
          ) : null}

          <p className="mt-2 text-[14px] font-medium">{item.nextAction}</p>
          <p className="mt-0.5 text-[13px] leading-5 text-[var(--muted)]">{item.priorityReason}</p>

          <dl className="mt-3 space-y-1 text-[13px] leading-5">
            <div className="flex gap-2">
              <dt className="shrink-0 text-[var(--faint)]">Deadline</dt>
              <dd className={urgency.tone === "red" ? "font-medium text-[var(--danger)]" : "text-[var(--ink)]"}>
                {urgency.deadlineText}
              </dd>
            </div>
            {item.consequence?.senderSays ? (
              <div className="flex gap-2">
                <dt className="shrink-0 text-[var(--faint)]">Afzender meldt</dt>
                <dd>{item.consequence.senderSays}</dd>
              </div>
            ) : null}
            {item.consequence?.possible ? (
              <div className="flex gap-2">
                <dt className="shrink-0 text-[var(--faint)]">Mogelijk gevolg</dt>
                <dd>{item.consequence.possible}</dd>
              </div>
            ) : null}
          </dl>

          {item.invoice ? <InvoiceBlock item={item} /> : null}

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={onToggle}
              className={`rounded-full border px-3 py-1.5 text-[13px] font-medium ${
                handled
                  ? "border-[var(--line)] text-[var(--muted)]"
                  : "border-[var(--blue)] text-[var(--blue)]"
              }`}
            >
              {handled ? "Ongedaan maken" : "Afhandelen"}
            </button>
            {handled ? <span className="text-[12px] text-[var(--muted)]">Afgehandeld</span> : null}
          </div>
        </div>
      </div>
    </li>
  );
}

export function InvoiceBlock({ item }: { item: MailAssessment }) {
  const invoice = item.invoice!;
  const currency = invoice.currency?.trim().toUpperCase() || "";
  const ibanValid = Boolean(invoice.iban) && isValidIban(invoice.iban!);
  const canQr = ibanValid && invoice.amount != null && (currency === "" || currency === "EUR");
  const epc = canQr
    ? generateEPCQRString({
        id: item.conversationId,
        recipient_name: invoice.supplier || item.from,
        iban: invoice.iban!,
        amount: invoice.amount!,
        reference: invoice.invoiceNumber || "",
        due_date: invoice.dueDate,
      })
    : null;

  const qrNote = !invoice.iban
    ? "IBAN ontbreekt in deze mail."
    : !ibanValid
      ? "IBAN is ongeldig."
      : invoice.amount == null
        ? "Bedrag ontbreekt in deze mail."
        : "Geen eurofactuur.";

  return (
    <div className="mt-3 rounded-2xl bg-[var(--bg)] px-4 py-3">
      <p className="text-[11px] font-medium tracking-[0.14em] text-[var(--muted)]">FACTUUR</p>
      <dl className="mt-2 grid gap-x-4 gap-y-1 text-[13px] leading-5 sm:grid-cols-2">
        <Row label="Leverancier" value={invoice.supplier || item.from || "Onbekend"} />
        <Row label="Factuurnummer" value={invoice.invoiceNumber || "Onbekend"} />
        <Row label="Bedrag" value={formatMoney(invoice.amount, invoice.currency)} />
        <Row label="Vervaldatum" value={formatDate(invoice.dueDate)} />
        <Row label="IBAN" value={invoice.iban || "Onbekend"} />
        <Row label="Betaalstatus" value={PAYMENT_LABEL[invoice.paymentStatus] ?? "Onbekend"} />
        <Row label="Advies" value={invoice.paymentAdvice || "Controleer of deze factuur al betaald is"} />
      </dl>
      {invoice.unreadAttachment ? (
        <p className="mt-2 text-[12px] text-[var(--orange)]">Bijlage niet gelezen: {invoice.unreadAttachment}</p>
      ) : null}

      {epc ? (
        <div className="mt-3 flex items-center gap-4 rounded-2xl bg-white p-3">
          <QRCodeSVG value={epc} size={128} level="M" aria-label="SEPA-betaling QR-code" />
          <p className="text-[12px] leading-5 text-[var(--muted)]">
            Scan met je bank-app: naam, IBAN, bedrag en omschrijving staan dan al ingevuld en je hoeft alleen nog te
            bevestigen.
          </p>
        </div>
      ) : (
        <p className="mt-2 text-[12px] text-[var(--muted)]">QR-code niet beschikbaar: {qrNote}</p>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-[var(--faint)]">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </div>
  );
}

export function UrgencyPill({ tone, label }: { tone: UrgencyTone; label: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--line)] px-2.5 py-1 text-[12px] font-medium">
      <span className="h-2 w-2 rounded-full" style={{ background: TONE_DOT[tone] }} />
      {label}
    </span>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-[13px] font-medium ${
        active ? "bg-[var(--blue-soft)] text-[var(--blue)]" : "text-[var(--muted)] hover:bg-[var(--bg)]"
      }`}
    >
      {children}
    </button>
  );
}
