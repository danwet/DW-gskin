"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { QRCodeSVG } from "qrcode.react";
import { generateEPCQRString, isValidIban } from "@/lib/epc";
import { orderNewestFirst, urgencyFor, type UrgencyTone } from "@/lib/agent/urgency";
import type { AgentMeta, MailAssessment } from "@/lib/agent/types";
import { notificationPermission, showMailNotification, wantedOnThisDevice } from "@/lib/desktop-notify";
import { Avatar, Card, CardHeading } from "./ui";
import { useApp } from "./AppProvider";

export type PendingMessage = {
  conversationId: string;
  subject: string;
  from: string;
  fromEmail: string;
  receivedAt: string;
  snippet: string;
  messages: number;
};

export type InboxProgress = {
  phase: "idle" | "importing" | "triaging" | "done" | "error";
  imported: number;
  total: number | null;
  threadsImported: number;
  triaged: number;
  pending: number;
  lastError: string | null;
};

type InboxPayload = {
  items: MailAssessment[];
  pending?: PendingMessage[];
  progress?: InboxProgress | null;
  meta: AgentMeta;
  model: string;
  gmail?: { email: string; status: string } | null;
  undoable?: boolean;
  error?: string | null;
};

export type InboxFilter = "active" | "info" | "all";

const TONE_DOT: Record<UrgencyTone, string> = {
  red: "var(--danger)",
  orange: "var(--orange)",
  yellow: "var(--yellow)",
  blue: "var(--blue)",
  green: "var(--green)",
  grey: "var(--muted)",
};

const PAYMENT_LABEL: Record<string, string> = {
  unknown: "Onbekend",
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
  // Dutch notation: a space after the symbol and a comma as decimal separator.
  const formatted = amount.toFixed(2).replace(".", ",");
  return symbol === "€" ? `€ ${formatted}` : `${symbol}${formatted}`;
}

function formatDate(iso: string | undefined): string {
  if (!iso) return "Onbekend";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}

export function useInbox() {
  const { syncNonce, setSyncProgress, setTopBar } = useApp();
  const [items, setItems] = useState<MailAssessment[]>([]);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [progress, setProgress] = useState<InboxProgress | null>(null);
  const [gmail, setGmail] = useState<{ email: string; status: string } | null>(null);
  const [undoable, setUndoable] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
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
      setPending(data.pending ?? []);
      setProgress(data.progress ?? null);
      setGmail(data.gmail ?? null);
      setUndoable(Boolean(data.undoable));
      setSyncProgress(data.progress ?? null);
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
    // Instant feedback: the tally moves with the click, the database follows.
    if (item.invoice) {
      setMeta((current) => {
        if (!current) return current;
        const today = new Date().toLocaleDateString("sv-SE");
        const daily = current.dailyPaid?.date === today ? current.dailyPaid : { date: today, count: 0 };
        const next = Math.max(0, daily.count + (handled ? 1 : -1));
        return { ...current, dailyPaid: { date: today, count: next } };
      });
    }
    setItems((current) =>
      current.map((entry) =>
        entry.conversationId === item.conversationId
          ? {
              ...entry,
              handledByUser: handled,
              // The stamp makes the counter move right away; without it the
              // task only appears after the next full load.
              handledAt: handled ? new Date().toISOString() : undefined,
              needsAttention: handled ? false : entry.needsAttention,
            }
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
        const data = (await response.json()) as { item?: MailAssessment; meta?: AgentMeta };
        if (data.item) {
          setItems((current) =>
            current.map((entry) => (entry.conversationId === item.conversationId ? data.item! : entry)),
          );
        }
        if (data.meta) setMeta(data.meta);
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

  const snoozeItem = useCallback(async (item: MailAssessment, until: string, tier?: "later" | "info") => {
    setItems((current) =>
      current.map((entry) =>
        entry.conversationId === item.conversationId
          ? { ...entry, snoozedUntil: until, snoozedTier: tier }
          : entry,
      ),
    );
    try {
      const response = await fetch("/api/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: item.conversationId, snoozedUntil: until, snoozedTier: tier }),
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

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  const undo = useCallback(async () => {
    try {
      const response = await fetch("/api/gmail/undo", { method: "POST" });
      if (response.ok) await reload();
    } catch {
      // Nothing changed; the card simply stays away.
    }
  }, [reload]);

  const updateItem = useCallback((next: MailAssessment) => {
    setItems((current) => current.map((entry) => (entry.conversationId === next.conversationId ? next : entry)));
  }, []);

  const removeItem = useCallback((conversationId: string) => {
    setItems((current) => current.filter((entry) => entry.conversationId !== conversationId));
  }, []);

  // New mail since you last looked. Kept on the server so the badge is the same
  // on every device; the browser only mirrors it.
  const [notif, setNotif] = useState<{ since: string | null; read: string[] }>(() => ({
    since: null,
    read: [],
  }));
  const [notifLoaded, setNotifLoaded] = useState(false);

  // Bewaar de stand op de server; de browser is alleen een spiegel.
  const saveNotif = useCallback((next: { since?: string | null; read?: string[]; markAllRead?: boolean }) => {
    void fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const response = await fetch("/api/notifications", { cache: "no-store" });
        const data = (await response.json()) as { since?: string | null; read?: string[] };
        if (!alive) return;
        if (data.since || (data.read ?? []).length > 0) {
          setNotif({ since: data.since ?? null, read: Array.isArray(data.read) ? data.read : [] });
        } else {
          // Eerste keer op de server: neem de stand van dit apparaat over.
          try {
            const raw = window.localStorage.getItem("dw-notifications-v1");
            if (raw) {
              const parsed = JSON.parse(raw) as { since?: string | null; read?: string[] };
              const migrated = {
                since: parsed.since ?? null,
                read: Array.isArray(parsed.read) ? parsed.read : [],
              };
              setNotif(migrated);
              saveNotif(migrated);
            }
          } catch {
            // Geen lokale stand: de basislijn wordt hieronder gezet.
          }
        }
      } catch {
        // Zonder server: de lijst begint gewoon leeg.
      } finally {
        if (alive) setNotifLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [saveNotif]);

  useEffect(() => {
    if (!notifLoaded || notif.since !== null || items.length === 0) return;
    const newest = items.reduce((latest, item) => (item.receivedAt > latest ? item.receivedAt : latest), "");
    const next = { since: newest || new Date().toISOString(), read: notif.read };
    setNotif(next);
    saveNotif(next);
  }, [items, notif, notifLoaded, saveNotif]);

  const newItems = useMemo(() => {
    if (!notif.since) return [];
    return items
      .filter((item) => !item.archivedAt && !item.savedAt)
      .filter((item) => item.receivedAt > notif.since!)
      .filter((item) => !notif.read.includes(item.conversationId))
      .sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt));
  }, [items, notif]);

  // With desktop notifications on, keep the inbox fresh even while the window is
  // minimised: otherwise nothing new ever arrives to announce.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (notificationPermission() !== "granted" || !wantedOnThisDevice()) return;
      void reload();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [reload]);

  // Announce genuinely new conversations on the desktop, once each.
  const announced = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (newItems.length === 0) return;
    if (announced.current === null) {
      // First pass: what is already there when the app opens is not news.
      announced.current = new Set(newItems.map((item) => item.conversationId));
      return;
    }
    const fresh = newItems.filter((item) => !announced.current?.has(item.conversationId));
    if (fresh.length === 0) return;
    for (const item of fresh) announced.current.add(item.conversationId);
    showMailNotification({
      from: fresh[0].from,
      subject: fresh[0].subject,
      count: fresh.length,
    });
  }, [newItems]);

  const markNewRead = useCallback(
    (conversationId: string) => {
      setNotif((current) => {
        if (current.read.includes(conversationId)) return current;
        const next = { ...current, read: [...current.read, conversationId] };
        saveNotif({ read: next.read });
        return next;
      });
    },
    [saveNotif],
  );

  const markAllNewRead = useCallback(() => {
    setNotif({ since: new Date().toISOString(), read: [] });
    saveNotif({ markAllRead: true });
  }, [saveNotif]);

  const openNewItem = useCallback(
    (item: MailAssessment) => {
      markNewRead(item.conversationId);
    },
    [markNewRead],
  );

  // Publish the header data once, with stable callbacks: the shell renders it
  // so the cluster sits in the same place on every page.
  const handlersRef = useRef({ undo, toggleHandled, declareInvoice, openNewItem, markAllNewRead, markNewRead, removeItem, reload, setNotice });
  handlersRef.current = { undo, toggleHandled, declareInvoice, openNewItem, markAllNewRead, markNewRead, removeItem, reload, setNotice };

  useEffect(() => {
    setTopBar({
      missedItems: items.filter((item) => item.classification === "unclassified"),
      newItems,
      undoable,
      lastSyncAt: meta?.lastRunAt ?? null,
      undo: () => handlersRef.current.undo(),
      onToggleHandled: (item) => handlersRef.current.toggleHandled(item),
      onDeclare: (item, declaration) => handlersRef.current.declareInvoice(item, declaration),
      onOpenNewItem: (item) => handlersRef.current.openNewItem(item),
      onMarkAllNewRead: () => handlersRef.current.markAllNewRead(),
      onRemoveItem: (conversationId) => handlersRef.current.removeItem(conversationId),
      onReloadInbox: () => void handlersRef.current.reload(),
      onError: (message) => handlersRef.current.setNotice(message),
    });
  }, [items, newItems, undoable, meta?.lastRunAt, setTopBar]);

  useEffect(() => () => setTopBar(null), [setTopBar]);

  return { items, pending, progress, meta, model, gmail, undoable, undo, notice, setNotice, loading, error, reload, removeItem, updateItem, toggleHandled, snoozeItem, declareInvoice, saveItem };
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

  const ordered = orderNewestFirst(items);
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

      {footer ? <div className="mt-4 pt-3">{footer}</div> : null}
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
    <li className="pb-5 last:pb-0">
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
            <div className="flex gap-2 pr-3">
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

  // Korte regels: het vlak waar anders de QR staat is smal.
  const qrLines = ["Gegevens", "missen voor", "maken van", "een QR-code"];

  const qrNote = !invoice.iban
    ? "IBAN ontbreekt in deze mail."
    : !ibanValid
      ? "IBAN is ongeldig."
      : invoice.amount == null
        ? "Bedrag ontbreekt in deze mail."
        : "Geen eurofactuur.";

  return (
    <div className="relative mt-[2px] rounded-2xl bg-[var(--bg)] px-4 pt-3 pb-[32px]">
      {/* De QR ligt als losse laag boven het vlak, rechts uitgelijnd op de rand. */}
      <div className="min-w-0">
        <p className="relative -top-[2px] text-[11px] font-medium tracking-[0.14em] text-[var(--muted)]">FACTUURINFORMATIE</p>
        <div className="mt-2">
          <dl className="grid gap-x-0 gap-y-1 text-[13px] leading-5 sm:grid-cols-2">
            <Row label="Leverancier" value={invoice.supplier || item.from || "Onbekend"} />
            <Row label="Factuurnummer" value={invoice.invoiceNumber || "Onbekend"} />
            <Row label="Bedrag" value={formatMoney(invoice.amount, invoice.currency)} />
            <Row label="Vervaldatum" value={formatDate(invoice.dueDate)} />
            <Row label="IBAN" value={invoice.iban || "Onbekend"} />
            <Row label="Betaalstatus" value={PAYMENT_LABEL[invoice.paymentStatus] ?? "Onbekend"} />
            <Row label="Advies" value={invoice.paymentAdvice || "Controleer of factuur al betaald is"} />
          </dl>
          {invoice.unreadAttachment ? (
            <p className="mt-2 text-[12px] text-[var(--orange)]">Bijlage niet gelezen: {invoice.unreadAttachment}</p>
          ) : null}
        </div>
      </div>

      {epc ? (
        // Alleen om de QR een wit vlak: de scanner heeft contrast nodig.
        <div className="absolute top-[4px] right-[4px] z-10 rounded-2xl bg-white p-3 shadow-[0_6px_18px_-8px_rgba(16,24,40,0.35)]">
          <QRCodeSVG value={epc} size={128} level="M" aria-label="SEPA-betaling QR-code" />
        </div>
      ) : (
        // Zonder QR staat de uitleg in hetzelfde vlak, in korte regels.
        <div
          className="absolute top-[4px] right-[4px] z-10 flex h-[152px] w-[152px] flex-col items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--card)] p-3 text-center shadow-[0_6px_18px_-8px_rgba(16,24,40,0.35)]"
          title={qrNote}
        >
          {qrLines.map((line) => (
            <span key={line} className="block text-[12px] leading-4 text-[var(--muted)]">
              {line}
            </span>
          ))}
        </div>
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
