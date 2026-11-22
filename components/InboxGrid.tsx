"use client";

import { useEffect, useRef, useState } from "react";
import { subscribeFocusTab } from "@/lib/focus-tab";
import { orderNewestFirst, urgencyFor, type UrgencyTone } from "@/lib/agent/urgency";
import type { MailAssessment } from "@/lib/agent/types";
import { InvoiceBlock, timeZoneOf, UrgencyPill } from "./AgentInbox";
import { Modal } from "@/components/kit/modal";

/** No deadline is neutral: grey, not the urgency colour. */
function deadlineClass(urgency: { tone: UrgencyTone; deadlineText: string }): string {
  if (!urgency.deadlineText || urgency.deadlineText === "Geen deadline") return "text-[var(--muted)]";
  return TONE_TEXT[urgency.tone];
}

const TONE_TEXT: Record<UrgencyTone, string> = {
  red: "text-[var(--danger)]",
  orange: "text-[var(--orange)]",
  yellow: "text-[var(--yellow)]",
  blue: "text-[var(--blue)]",
  green: "text-[var(--green)]",
  grey: "text-[var(--muted)]",
};

export function InboxGrid({
  items,
  infoItems,
  declareItems,
  loading,
  error,
  onToggleHandled,
  onSnooze,
  onDeclare,
  onSave,
  onReload,
  onRemove,
  onUpdate,
  onError,
}: {
  items: MailAssessment[];
  infoItems: MailAssessment[];
  declareItems: MailAssessment[];
  loading: boolean;
  error: string | null;
  onToggleHandled: (item: MailAssessment) => void;
  onSnooze: (item: MailAssessment, until: string, tier?: "later" | "info") => void;
  onDeclare: (item: MailAssessment, declaration: "none" | "pending" | "declared") => void;
  onSave: (item: MailAssessment, saved: boolean) => void;
  onReload?: () => void;
  onRemove?: (conversationId: string) => void;
  onUpdate?: (item: MailAssessment) => void;
  onError?: (message: string) => void;
}) {
  const [selected, setSelected] = useState<MailAssessment | null>(null);

  // A notification in the header asks for a tab; nothing else needs to know.
  useEffect(() => subscribeFocusTab((tab) => setActiveTab(tab)), []);
  // Trash straight from the card, without opening it.
  const trashFromCard = (item: MailAssessment) => {
    onRemove?.(item.conversationId);
    enqueueAction(async () => {
      try {
        const response = await fetch("/api/gmail/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId: item.conversationId, action: "trash" }),
        });
        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as { error?: string } | null;
          onError?.(data?.error ?? "Verwijderen mislukt.");
          onReload?.();
        }
      } catch {
        onError?.("Verwijderen mislukt: geen verbinding.");
        onReload?.();
      }
    });
  };
  const [activeTab, setActiveTab] = useState<"urgent" | "later" | "info" | "declare">("urgent");
  const [clock, setClock] = useState(() => new Date());
  const now = clock;
  const timeZone = timeZoneOf();
  const ordered = orderNewestFirst(items);
  const orderedInfo = orderNewestFirst(
    infoItems.filter((item) => !item.snoozedUntil || Date.parse(item.snoozedUntil) <= Date.now()),
  );
  const orderedDeclare = orderNewestFirst(
    declareItems.filter((item) => !item.snoozedUntil || Date.parse(item.snoozedUntil) <= Date.now()),
  );

  const nowMs = Date.now();
  const urgent: MailAssessment[] = [];
  const later: MailAssessment[] = [];
  const snoozedIntoInfo: MailAssessment[] = [];
  for (const item of ordered) {
    // "Moet" = something is expected from you, regardless of whether the
    // sender set a hard deadline. Snoozed cards sit one tier lower.
    const tier = cardTier(item, nowMs);
    if (tier === "urgent") urgent.push(item);
    else if (tier === "later") later.push(item);
    else snoozedIntoInfo.push(item);
  }

  const infoTab = [...orderedInfo, ...orderNewestFirst(snoozedIntoInfo)];

  const isEmpty = ordered.length === 0 && orderedInfo.length === 0 && orderedDeclare.length === 0;

  const declareTotal = orderedDeclare.reduce((sum, item) => sum + (item.invoice?.amount ?? 0), 0);
  const declareLabel = `€ ${declareTotal % 1 === 0 ? declareTotal : declareTotal.toFixed(2)}`;

  const tabs: { id: "urgent" | "later" | "info" | "declare"; label: string; count: number | string }[] = [
    { id: "urgent", label: "Moet", count: urgent.length },
    { id: "later", label: "Mag", count: later.length },
    { id: "info", label: "Hoeft niet", count: infoTab.length },
    { id: "declare", label: "Declareren", count: declareLabel },
  ];
  const activeCards =
    activeTab === "urgent" ? urgent : activeTab === "later" ? later : activeTab === "info" ? infoTab : orderedDeclare;

  const emptyMessage =
    activeTab === "urgent"
      ? "Ik moet helemaal niks"
      : activeTab === "later"
        ? "Niks moet, alles mocht"
        : activeTab === "info"
          ? "Dat had nou niet gehoeven"
          : "Declareren kun je leren";

  useEffect(() => {
    setActiveTab((current) => {
      const currentCards =
        current === "urgent" ? urgent : current === "later" ? later : current === "info" ? infoTab : orderedDeclare;
      if (currentCards.length > 0) return current;
      if (urgent.length > 0) return "urgent";
      if (later.length > 0) return "later";
      if (infoTab.length > 0) return "info";
      if (orderedDeclare.length > 0) return "declare";
      return current;
    });
  }, [urgent.length, later.length, orderedInfo.length, orderedDeclare.length]);

  useEffect(() => {
    const tick = () => setClock(new Date());
    const untilMorning = (() => {
      const next = new Date();
      next.setHours(6, 0, 0, 0);
      if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
      return next.getTime() - Date.now() + 1000;
    })();
    const timer = window.setTimeout(tick, untilMorning);
    const onVisibility = () => {
      if (document.visibilityState === "visible") tick();
    };
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <section>
      <div className="mb-12 flex flex-wrap gap-[11px]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            aria-pressed={activeTab === tab.id}
            className={`focus-ring rounded-full px-4 py-2 text-[13px] font-medium ${
              activeTab === tab.id ? "glass-active" : "glass-chip text-[var(--ink)]"
            }`}
          >
            {tab.label}
            <span className="ml-2 text-[12px] opacity-70">{tab.count}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid gap-x-3 gap-y-4 sm:grid-cols-2" aria-hidden="true">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="card-surface h-[270px] animate-pulse rounded-2xl opacity-70 sm:h-[410px]" />
          ))}
        </div>
      ) : error ? (
        <p className="text-[14px] leading-6 text-[var(--muted)]">{error}</p>
      ) : activeCards.length === 0 ? (
        <div className="flex min-h-[320px] items-center justify-center text-center">
          <p className="text-[15px] font-medium text-[var(--ink)]">{emptyMessage}</p>
        </div>
      ) : (
        <CardGrid
          items={activeCards}
          now={now}
          timeZone={timeZone}
          onDeclare={onDeclare}
          onOpen={(item) => setSelected(item)}
          onTrash={trashFromCard}
        />
      )}

      {selected ? (
        <InboxModal
          item={selected}
          now={now}
          timeZone={timeZone}
          onClose={() => setSelected(null)}
          onToggleHandled={onToggleHandled}
          onDeclare={onDeclare}
          onSnooze={onSnooze}
          onSave={onSave}
          onRemove={onRemove}
          onUpdate={onUpdate}
          onReload={onReload}
          onError={onError}
        />
      ) : null}

    </section>
  );
}

function CardGrid({
  items,
  now,
  timeZone,
  onDeclare,
  onOpen,
  onTrash,
}: {
  items: MailAssessment[];
  now: Date;
  timeZone: string;
  onDeclare: (item: MailAssessment, declaration: "none" | "pending" | "declared") => void;
  onOpen: (item: MailAssessment) => void;
  onTrash?: (item: MailAssessment) => void;
}) {
  return (
    <div className="grid gap-x-3 gap-y-0 sm:grid-cols-2">
      {items.map((item, index) => (
        <InboxCard
          key={item.conversationId}
          item={item}
          index={index}
          now={now}
          timeZone={timeZone}
          onDeclare={onDeclare}
          onClick={() => onOpen(item)}
          onTrash={onTrash ? () => onTrash(item) : undefined}
        />
      ))}
    </div>
  );
}

/**
 * An invoice only drives the card when the mail actually expects action.
 * Informational mail (security alerts, newsletters, order confirmations) must
 * never show a pay button, even if the model attached invoice fields.
 */
function hasPayableInvoice(item: MailAssessment): boolean {
  if (!item.invoice) return false;
  return item.classification !== "info" && item.classification !== "unclassified";
}

/**
 * Which column a card belongs to right now. A snoozed card drops one tier for
 * a day and returns to its own tier automatically when the snooze expires.
 */
/** Which Focus tab a card belongs to, so a notification can jump straight there. */
export function focusTabFor(item: MailAssessment, nowMs = Date.now()): "urgent" | "later" | "info" | "declare" {
  if (item.invoice && item.declaration === "pending") return "declare";
  return cardTier(item, nowMs);
}

function cardTier(item: MailAssessment, nowMs: number): "urgent" | "later" | "info" {
  if (item.snoozedUntil && Date.parse(item.snoozedUntil) > nowMs) {
    return item.snoozedTier ?? "later";
  }
  if (item.classification === "info" || item.classification === "unclassified") return "info";
  if (item.classification === "action_needed" || item.classification === "reply_needed") return "urgent";
  return "later";
}

function preparedLabel(item: MailAssessment): string {
  if (item.preparedAction) return item.preparedAction;
  if (hasPayableInvoice(item) && item.invoice?.iban) return "QR-code aangemaakt";
  if (hasPayableInvoice(item)) return "Factuurgegevens voorbereid";
  if (item.classification === "reply_needed") return "Concept gemaakt";
  if (item.classification === "info") return "Gefilterd";
  if (item.classification === "waiting") return "Wacht op reactie";
  return "Actie voorbereid";
}

function ctaLabel(item: MailAssessment): string {
  if (item.declaration === "pending") return "Declareer";
  if (item.source === "scan") return "Bekijk scan";
  if (hasPayableInvoice(item)) {
    // A receipt for a payment that already went through is never payable.
    const settled = item.invoice?.paymentStatus === "paid_confirmed" || item.handledByUser;
    return settled ? "Betaald" : "Betalen";
  }
  if (item.classification === "reply_needed") return "Concept";
  if (item.classification === "action_needed") return "Afhandelen";
  return "Bekijken";
}

function isPrimaryCta(item: MailAssessment): boolean {
  if (item.invoice?.paymentStatus === "paid_confirmed") return false;
  return hasPayableInvoice(item) || item.classification === "reply_needed";
}

function balanceTwoLines(text: string): [string, string | null] {
  // Keep "€ 12,34" together: a currency symbol alone on a line reads wrong.
  const glued = text
    .trim()
    .replace(/([€$£])\s+(\d)/g, "$1\u00A0$2")
    .replace(/(\d)\s+([€$£])/g, "$1\u00A0$2");
  // Split on whitespace but never on the non-breaking space we just inserted.
  const words = glued.split(/[^\S\u00A0]+/).filter(Boolean);
  // Two lines are balanced for any multi-word action, so short actions line up
  // with long ones instead of sitting on a single line. "Geen actie" is simply
  // too short for that and stays on one line.
  if (words.length <= 1 || /^geen actie$/i.test(text.trim())) return [words.join(" "), null];
  let bestIndex = Math.ceil(words.length / 2);
  let bestDiff = Number.POSITIVE_INFINITY;
  for (let i = 1; i < words.length; i += 1) {
    const left = words.slice(0, i).join(" ");
    const right = words.slice(i).join(" ");
    const diff = Math.abs(left.length - right.length);
    if (diff <= bestDiff) {
      bestDiff = diff;
      bestIndex = i;
    }
  }
  const tidy = (value: string) => value.replace(/\u00A0/g, " ");
  return [tidy(words.slice(0, bestIndex).join(" ")), tidy(words.slice(bestIndex).join(" "))];
}

function BalancedText({ text, className }: { text: string; className: string }) {
  const [line1, line2] = balanceTwoLines(text);
  return (
    <p className={className}>
      <span className="block truncate">{line1}</span>
      {line2 ? <span className="block truncate">{line2}</span> : null}
    </p>
  );
}

// Every action rewrites the same agent document, so run them one at a time.
// Firing several at once let a later write undo an earlier removal.
let actionQueue: Promise<unknown> = Promise.resolve();
function enqueueAction(task: () => Promise<void>): void {
  actionQueue = actionQueue.then(task, task);
}

export function InboxCard({
  item,
  index,
  now,
  timeZone,
  onDeclare,
  onClick,
  onTrash,
  flat,
}: {
  item: MailAssessment;
  index: number;
  now: Date;
  timeZone: string;
  onDeclare: (item: MailAssessment, declaration: "none" | "pending" | "declared") => void;
  onClick: () => void;
  onTrash?: () => void;
  /** Straight, non-overlapping card for multi-column overviews. */
  flat?: boolean;
}) {
  const urgency = urgencyFor(item, now, timeZone);
  const tilts = ["rotate-[2.5deg]", "-rotate-[1.5deg]", "-rotate-[3deg]", "rotate-[2deg]"];
  const tilt = flat ? "" : tilts[index % tilts.length];
  const overlap = flat ? "" : index % 2 === 1 ? (index % 4 === 3 ? "sm:-ml-8" : "sm:-ml-4") : "";
  const rowOverlap = flat ? "" : index >= 2 ? "sm:-mt-6" : "";
  const zIndex = Math.min(2 + index, 39);
  const consequence = item.consequence?.senderSays ?? item.consequence?.possible;
  const cta = ctaLabel(item);

  const isScan = item.source === "scan";
  const isNewsletter =
    Boolean(item.unsubscribe) || item.classification === "info" || item.classification === "unclassified";
  const openCta = () => {
    if (isScan) window.open(`/api/scan/${item.conversationId}/file`, "_blank", "noopener,noreferrer");
    else if (item.declaration === "pending") onDeclare(item, "declared");
    else onClick();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      style={{ "--card-z": zIndex } as React.CSSProperties}
      className={`card-surface focus-ring relative z-[var(--card-z)] flex min-h-[270px] cursor-pointer flex-col items-center rounded-2xl px-4 pt-4 pb-6 text-center transition-transform hover:z-40 hover:-translate-y-0.5 hover:rotate-0 sm:min-h-[410px] ${tilt} ${overlap} ${rowOverlap}`}
    >
      <div className="absolute top-3 right-3 z-10">
        <UrgencyPill tone={urgency.tone} label={urgency.label} />
      </div>
      {item.logoUrl && !isNewsletter ? (
        <img
          src={item.logoUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="absolute top-[15px] left-[15px] z-10 h-6 w-auto max-w-[88px] object-contain"
        />
      ) : null}

      {item.needsAttention ? (
        <span
          className={`absolute left-3 rounded-full bg-[var(--orange-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--orange)] ${
            item.logoUrl && !isNewsletter ? "top-11" : "top-3"
          }`}
        >
          Opnieuw
        </span>
      ) : isScan ? (
        <span
          className={`absolute left-3 rounded-full bg-[var(--blue-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--blue)] ${
            item.logoUrl && !isNewsletter ? "top-11" : "top-3"
          }`}
        >
          Papieren factuur
        </span>
      ) : null}

      <div className="flex w-full flex-col items-center gap-2 pt-12">
        <p className="w-full truncate text-[22px] leading-7 font-semibold text-[var(--ink)]">{item.from}</p>
        <BalancedText
          text={item.subject}
          className="flex min-h-[40px] w-full flex-col justify-start text-[14px] leading-5 text-[var(--muted)]"
        />
      </div>

      {item.logoUrl && isNewsletter ? (
        // Centred in the free space between the subject and the buttons below.
        <div className="flex w-full flex-1 items-center justify-center py-2">
          <img
            src={item.logoUrl}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="max-h-12 w-1/2 object-contain"
          />
        </div>
      ) : null}

      <div className="flex w-full flex-1 flex-col justify-between py-4">
        {!isNewsletter ? (
          <div className="flex w-full flex-col items-center gap-1 rounded-2xl border-2 border-[var(--ink)]/30 bg-[var(--bg)] px-3 py-2.5 shadow-[0_2px_8px_rgba(16,24,40,0.12)]">
            <p className="text-[11px] font-semibold tracking-[0.08em] text-[var(--muted)]">Actie:</p>
            <BalancedText
              text={item.declaration === "pending" ? "Declareer factuur" : item.nextAction}
              className="flex min-h-[40px] w-full flex-col justify-start text-[16px] font-semibold leading-5 text-[var(--ink)]"
            />
          </div>
        ) : null}

        {!isNewsletter && urgency.deadlineValue != null ? (
          <div className="flex w-full flex-col items-center gap-1">
            <p className="translate-y-[7px] text-[11px] font-medium tracking-[0.08em] text-[var(--faint)]">Uiterste datum:</p>
            <p className={`tnum text-[13px] font-medium ${deadlineClass(urgency)}`}>{urgency.deadlineText}</p>
          </div>
        ) : null}

        <div className={isNewsletter && !item.logoUrl ? "mt-auto w-full" : "w-full"}>
            <div className="mt-3 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  openCta();
                }}
                className={`focus-ring relative w-[60%] rounded-full px-3 py-2 text-[13px] font-medium ${
                  isPrimaryCta(item) ? "btn-primary" : "btn-secondary"
                }`}
              >
                {cta}
              </button>
              {isNewsletter && onTrash ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onTrash();
                  }}
                  aria-label="Naar de prullenbak"
                  title="Naar de prullenbak"
                  className="glass-chip focus-ring grid h-[42px] w-[42px] shrink-0 place-items-center rounded-full text-[var(--muted)] hover:text-[var(--danger)]"
                >
                  <TrashIcon />
                </button>
              ) : null}
            </div>
          </div>
      </div>
    </div>
  );
}

function TrashIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6" />
      <path d="M18.5 6 17.6 19a1.7 1.7 0 0 1-1.7 1.6H8.1A1.7 1.7 0 0 1 6.4 19L5.5 6" />
      <path d="M10 10.5v6M14 10.5v6" />
    </svg>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mx-[5%]">
      <dt className="text-[11px] font-medium tracking-[0.08em] text-[var(--faint)]">{label}</dt>
      <dd className="mt-0.5 text-[15px] leading-5 font-semibold text-[var(--ink)]">{children}</dd>
    </div>
  );
}

function extractImages(html: string): string[] {
  const urls: string[] = [];
  const pattern = /<img[^>]+src=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    const url = match[1].trim();
    if (/^https:\/\//i.test(url)) urls.push(url);
  }
  return urls.slice(0, 20);
}

export function InboxModal({
  item,
  now,
  timeZone,
  onClose,
  onToggleHandled,
  onDeclare,
  onSnooze,
  onSave,
  onRemove,
  onUpdate,
  onReload,
  onError,
}: {
  item: MailAssessment;
  now: Date;
  timeZone: string;
  onClose: () => void;
  onToggleHandled: (item: MailAssessment) => void;
  onDeclare: (item: MailAssessment, declaration: "none" | "pending" | "declared") => void;
  onSnooze?: (item: MailAssessment, until: string, tier?: "later" | "info") => void;
  onSave?: (item: MailAssessment, saved: boolean) => void;
  onRemove?: (conversationId: string) => void;
  onUpdate?: (item: MailAssessment) => void;
  onReload?: () => void;
  onError?: (message: string) => void;
}) {
  const urgency = urgencyFor(item, now, timeZone);
  const [handled, setHandled] = useState(item.handledByUser === true);
  const [declaration, setDeclaration] = useState(item.declaration);
  const [saved, setSaved] = useState(Boolean(item.savedAt));
  const [showDeclarePrompt, setShowDeclarePrompt] = useState(false);
  const [copied, setCopied] = useState(false);
  const [draft, setDraft] = useState(item.draftReply ?? "");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(Boolean(item.sentAt));
  const [sendMessage, setSendMessage] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const addFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setAttachments((current) => [...current, ...Array.from(files)]);
  };
  const removeFile = (index: number) => {
    setAttachments((current) => current.filter((_, i) => i !== index));
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const prepared = preparedLabel(item);
  const impactText = (item.impact ?? "").trim();
  const doneLabel = hasPayableInvoice(item) ? "Betaald" : "Afhandelen";
  const isNewsletter =
    Boolean(item.unsubscribe) || item.classification === "info" || item.classification === "unclassified";

  const unsub = item.unsubscribe;
  const [unsubState, setUnsubState] = useState<"idle" | "sending" | "sent" | "error">(unsub?.status ?? "idle");
  const [unsubMessage, setUnsubMessage] = useState<string | null>(unsub?.message ?? null);

  const onUnsubscribe = () => {
    if (unsub?.url) window.open(unsub.url, "_blank", "noopener,noreferrer");
  };

  const unsubLabel = (u: NonNullable<typeof unsub>) => {
    if (unsubState === "sending") return "Bezig met afmelden";
    if (unsubState === "sent") return "Afmeldverzoek verstuurd";
    if (unsubState === "error") return "Afmeldpagina openen";
    if (u.kind === "manual") return `Afmeldpagina openen${u.domain ? ` · ${u.domain}` : ""}`;
    if (u.kind === "mailto") return "Afmelden via Gmail";
    return "Afmelden";
  };

  const newsletterImages = item.bodyHtml ? extractImages(item.bodyHtml) : [];

  // The newsletter HTML is fetched when the popup opens: keep the inbox light,
  // and fall back to the plain text when there is nothing to render.
  const canPreview = Boolean(item.hasHtml && item.sourceMessageId && item.source !== "scan");
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);

  useEffect(() => {
    if (!canPreview || !item.sourceMessageId) return;
    let alive = true;
    void (async () => {
      try {
        const response = await fetch(`/api/inbox/preview?id=${encodeURIComponent(item.sourceMessageId ?? "")}`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("geen inhoud");
        const html = await response.text();
        if (alive && html.trim()) setPreviewHtml(html);
        else if (alive) setPreviewFailed(true);
      } catch {
        if (alive) setPreviewFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [canPreview, item.sourceMessageId]);

  // Snoozing drops the card exactly one tier for a day.
  const tier = cardTier(item, Date.now());
  const nextTier: "later" | "info" | null = tier === "urgent" ? "later" : tier === "later" ? "info" : null;

  const snoozeTomorrow = () => {
    if (!onSnooze || !nextTier) return;
    // A snooze ends in the morning, not at midnight: 06:00.
    const until = new Date();
    until.setDate(until.getDate() + 1);
    until.setHours(6, 0, 0, 0);
    onSnooze(item, until.toISOString(), nextTier);
    onClose();
  };

  const [busyAction, setBusyAction] = useState<"archive" | "trash" | null>(null);

  // Sending is a deliberate click on Verstuur; no extra confirmation step.
  const sendReply = async () => {
    if (sending || !draft.trim()) return;
    setSending(true);
    try {
      const form = new FormData();
      form.set("conversationId", item.conversationId);
      form.set("body", draft);
      for (const file of attachments) form.append("files", file);

      const response = await fetch("/api/agent/send", { method: "POST", body: form });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; item?: MailAssessment } | null;
      if (!response.ok || !data?.ok) {
        onError?.(data?.error ?? "Versturen mislukt.");
        return;
      }
      // Show the reply as sent straight away: the counter moves with it.
      if (data.item) onUpdate?.(data.item);
      onReload?.();
      onClose();
    } catch {
      onError?.("Versturen mislukt: geen verbinding.");
    } finally {
      setSending(false);
    }
  };

  // This one does reach Gmail: archive removes the INBOX label, trash moves it
  // to the prullenbak (recoverable for 30 days).
  // Optimistic: close and drop the card at once; Gmail syncs in the background.
  const runAction = (action: "archive" | "trash") => {
    if (busyAction) return;
    setBusyAction(action);

    // Close and drop the card right away, but leave the eye a short beat so the
    // click is acknowledged before the popup disappears.
    setTimeout(() => {
      onClose();
      onRemove?.(item.conversationId);
    }, 140);

    enqueueAction(async () => {
      try {
        const response = await fetch("/api/gmail/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId: item.conversationId, action }),
        });
        const data = (await response.json().catch(() => null)) as
          | { error?: string; cleanupError?: string | null }
          | null;
        if (!response.ok) {
          onError?.(data?.error ?? "Actie mislukt.");
          onReload?.();
          return;
        }
        // The mail moved but the bookkeeping did not; say so instead of silence.
        if (data?.cleanupError) {
          onError?.("Mail verplaatst, maar de administratie bijwerken mislukte.");
          onReload?.();
        }
      } catch {
        onError?.("Actie mislukt: geen verbinding.");
        onReload?.();
      }
    });
  };

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={item.from}
      beschrijvingKlasse=""
      beschrijving={
        <span className="flex flex-col items-center gap-1">
          {item.fromEmail ? <span className="text-[12px] text-ink-muted">{item.fromEmail}</span> : null}
          <span className="mt-2.5 text-center text-balance text-[17px] leading-snug font-semibold tracking-[-0.01em] text-ink">
            {item.subject}
          </span>
        </span>
      }
      className="max-w-4xl"
      vastHoogte
      linksboven={
        <>
          <UrgencyPill tone={urgency.tone} label={urgency.label} />
          {item.needsAttention ? (
            <p className="rounded-full bg-[var(--orange-soft)] px-2.5 py-1 text-[12px] font-medium text-[var(--orange)]">
              Opnieuw aandacht
            </p>
          ) : null}
        </>
      }
    >

        <div className="flex flex-col gap-3">
          {urgency.deadlineText !== "Geen deadline" ? (
            <p className={`tnum text-[13px] font-medium ${deadlineClass(urgency)}`}>
              {hasPayableInvoice(item) ? "Uiterste betaaldatum" : "Uiterste datum"} · {urgency.deadlineText}
            </p>
          ) : null}

        {!isNewsletter ? (
          <div className="mx-[5%] mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-[var(--bg)] px-4 py-3">
              <p className="text-[11px] font-medium tracking-[0.08em] text-[var(--faint)]">Actie</p>
              <p className="mt-1 text-[15px] font-semibold text-[var(--ink)]">{item.nextAction}</p>
            </div>
            <div className="rounded-2xl bg-[var(--bg)] px-4 py-3">
              <p className="text-[11px] font-medium tracking-[0.08em] text-[var(--faint)]">Waarom</p>
              <p className="mt-1 text-[15px] leading-5 font-semibold text-[var(--ink)]">{item.priorityReason}</p>
            </div>
          </div>
        ) : null}

        {canPreview ? (
          <section className="mt-5">
            <p className="ml-[5%] text-[11px] font-medium tracking-[0.14em] text-[var(--muted)] uppercase">Nieuwsbrief</p>
            {previewHtml ? (
              // Rendered as sent, so the layout and images survive.
              <iframe
                title={`Nieuwsbrief: ${item.subject}`}
                srcDoc={previewHtml}
                sandbox=""
                className="mt-2 mx-auto h-[440px] w-[90%] rounded-2xl border border-[var(--line)] bg-white"
              />
            ) : (
              <div className="mt-2 mx-auto grid h-[440px] w-[90%] place-items-center rounded-2xl border border-[var(--line)] bg-[var(--bg)]">
                {previewFailed ? (
                  <p className="px-6 text-center text-[13px] text-[var(--muted)]">De opmaak kon niet worden geladen.</p>
                ) : (
                  <div className="flex items-center gap-2" role="status" aria-label="Nieuwsbrief wordt geladen">
                    {[0, 1, 2].map((dot) => (
                      <span
                        key={dot}
                        className="dw-dot h-2.5 w-2.5 rounded-full bg-[var(--muted)]"
                        style={{ animationDelay: `${dot * 0.16}s` }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
            {item.link ? (
              <div className="mt-3 text-center">
                <a
                  href={item.link}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block text-[13px] font-medium text-[var(--blue)]"
                >
                  Open in Gmail →
                </a>
              </div>
            ) : null}
          </section>
        ) : null}

        {(!canPreview || previewFailed) &&
        (item.unsubscribe ||
          item.classification === "info" ||
          item.classification === "unclassified" ||
          // A reply needs the original text above the concept, otherwise you
          // are writing blind.
          Boolean(item.draftReply)) &&
        item.body ? (
          <section className="mt-5">
            <p className="text-[11px] font-medium tracking-[0.14em] text-[var(--muted)] uppercase">
              {item.draftReply ? "Oorspronkelijk bericht" : "Bericht"}
            </p>
            <div
              className={`mt-2 space-y-3 text-[14px] leading-6 text-[var(--ink)] ${
                item.draftReply ? "max-h-[220px] overflow-y-auto rounded-2xl bg-[var(--bg)] px-4 py-3" : ""
              }`}
            >
              {item.body.split(/\n{2,}/).map((paragraph, index) => (
                <p key={index} className="whitespace-pre-line">{paragraph.trim()}</p>
              ))}
            </div>
            {newsletterImages.length > 0 ? (
              <div className="mt-4 grid gap-2">
                {newsletterImages.map((src, index) => (
                  <img key={index} src={src} alt={`Afbeelding ${index + 1}`} className="w-full rounded-2xl" />
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {!isNewsletter ? (
          <dl className="mt-4 space-y-3">
            <div className="mx-[5%] flex items-start justify-between gap-4">
              {/* Zonder impact is de hele regel "Wat als je niks doet" overbodig. */}
              {impactText ? (
                <div className="min-w-0">
                  <dt className="text-[11px] font-medium tracking-[0.08em] text-[var(--faint)]">Wat als je niks doet</dt>
                  <dd className="mt-0.5 text-[15px] leading-5 font-semibold text-[var(--ink)]">{impactText}</dd>
                </div>
              ) : null}
              {/* Zonder de impact-regel staat "Voorbereid" gecentreerd. */}
              <div className={`min-w-0 ${impactText ? "text-right" : "mt-[10px] flex-1 text-center"}`}>
                <dt className="text-[11px] font-medium tracking-[0.08em] text-[var(--faint)]">Voorbereid</dt>
                <dd className="mt-0.5 text-[13px] leading-5 text-[var(--ink)]">{prepared}</dd>
              </div>
            </div>
            {item.consequence?.senderSays ? (
              <DetailRow label="Afzender meldt">{item.consequence.senderSays}</DetailRow>
            ) : null}
            {/* Identical to "Wat als je niks doet" is pure repetition. */}
            {item.consequence?.possible &&
            item.consequence.possible.trim().toLowerCase() !== (item.impact ?? "").trim().toLowerCase() ? (
              <DetailRow label="Mogelijk gevolg">{item.consequence.possible}</DetailRow>
            ) : null}
          </dl>
        ) : null}

        {hasPayableInvoice(item) ? (
          <div className="mx-[5%] mt-4">
            <InvoiceBlock item={item} />
          </div>
        ) : null}

        {item.source === "scan" && item.scanFilePath ? (
          <a
            href={`/api/scan/${item.conversationId}/file`}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-block text-[13px] font-medium text-[var(--blue)]"
          >
            Bekijk scan →
          </a>
        ) : null}

        {item.thread && item.thread.length > 1 ? (
          <details className="mt-4">
            <summary className="cursor-pointer text-[12px] font-medium text-[var(--blue)]">
              E-mailstring ({item.thread.length} berichten)
            </summary>
            <div className="mt-2 space-y-3 rounded-2xl bg-[var(--bg)] p-3">
              {item.thread.map((msg, index) => (
                <div key={index} className="pb-2 last:pb-0">
                  <p className="text-[12px] font-semibold text-[var(--ink)]">
                    {msg.from}
                    <span className="font-normal text-[var(--muted)]">
                      {" "}
                      ·{" "}
                      {new Date(msg.receivedAt).toLocaleString("nl-NL", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </p>
                  {msg.body ? <p className="mt-1 whitespace-pre-wrap text-[12px] leading-5 text-[var(--ink)]">{msg.body}</p> : null}
                </div>
              ))}
            </div>
          </details>
        ) : null}

        {item.draftReply ? (
          <div className="mt-4">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium tracking-[0.14em] text-[var(--muted)]">CONCEPT</p>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(draft);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1500);
                  } catch {
                    setCopied(false);
                  }
                }}
                className="focus-ring rounded-md text-[12px] font-medium text-[var(--blue)]"
              >
                {copied ? "Gekopieerd" : "Kopieer"}
              </button>
            </div>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={8}
                aria-label="Concept e-mail"
                className="min-h-[160px] flex-1 resize-y rounded-2xl border border-[var(--line)] bg-[var(--bg)] p-4 text-[13px] leading-6 text-[var(--ink)] outline-none focus:border-[var(--blue)]"
              />
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragOver(false);
                  addFiles(event.dataTransfer.files);
                }}
                className={`flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-4 text-center transition-colors sm:w-[190px] ${
                  dragOver ? "border-[var(--blue)] bg-[var(--blue-soft)]" : "border-[var(--line)]"
                }`}
              >
                <p className="text-[12px] text-[var(--muted)]">Sleep bestanden hierheen</p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-secondary focus-ring rounded-full px-3 py-1.5 text-[12px] font-medium"
                >
                  Kies bestanden
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(event) => addFiles(event.target.files)}
                />
                {attachments.length > 0 ? (
                  <ul className="mt-1 max-h-[80px] w-full space-y-1 overflow-y-auto text-left text-[12px] text-[var(--ink)]">
                    {attachments.map((file, index) => (
                      <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate">{file.name}</span>
                        <button
                          type="button"
                          onClick={() => removeFile(index)}
                          className="shrink-0 text-[var(--muted)]"
                          aria-label="Bijlage verwijderen"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
            <p className="mt-1 text-[12px] text-[var(--muted)]">Bewerk het concept voordat je verstuurt.</p>
          </div>
        ) : null}

        {/* Zonder preview staat de link hier; met preview staat hij eronder. */}
        {item.link && !canPreview ? (
          <div className="mt-4 text-center">
            <a
              href={item.link}
              target="_blank"
              rel="noreferrer"
              className="inline-block text-[13px] font-medium text-[var(--blue)]"
            >
              Open in Gmail →
            </a>
          </div>
        ) : null}

        <div className="mx-[5%] mt-5 flex flex-wrap items-center justify-center gap-2">
          {declaration === "pending" ? (
            <button
              type="button"
              onClick={() => {
                setDeclaration("declared");
                onDeclare(item, "declared");
                // Gedeclareerd is klaar: de mail gaat naar het archief.
                runAction("archive");
              }}
              className="btn-primary focus-ring rounded-full px-3 py-1.5 text-[13px] font-medium"
            >
              Gedeclareerd
            </button>
          ) : null}
          {item.draftReply ? (
            <>
              <button
                type="button"
                onClick={() => void sendReply()}
                disabled={sending || !draft.trim()}
                className="btn-primary relative rounded-full px-4 py-2 text-[13px] font-medium disabled:opacity-60"
              >
                {sending ? "Versturen…" : "Verstuur"}
              </button>
              <button
                type="button"
                onClick={() => void runAction("archive")}
                disabled={Boolean(busyAction)}
                className="btn-secondary focus-ring rounded-full px-3 py-1.5 text-[13px] font-medium"
              >
                Archiveren
              </button>
              <button
                type="button"
                onClick={() => void runAction("trash")}
                disabled={Boolean(busyAction)}
                className="btn-secondary focus-ring rounded-full px-3 py-1.5 text-[13px] font-medium"
              >
                Verwijderen
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = !saved;
                  setSaved(next);
                  onSave?.(item, next);
                  // Saving moves the mail out of Focus, so the popup can go.
                  if (next) onClose();
                }}
                className="btn-secondary focus-ring ml-auto rounded-full px-4 py-2 text-[13px] font-medium"
              >
                {saved ? "Bewaard" : "Bewaren"}
              </button>
              {saved ? (
                <button
                  type="button"
                  onClick={() => {
                    setHandled((value) => !value);
                    onToggleHandled(item);
                  }}
                  className="btn-secondary focus-ring rounded-full px-3 py-1.5 text-[13px] font-medium"
                >
                  {handled ? "Ongedaan maken" : "Afhandelen"}
                </button>
              ) : null}
            </>
          ) : tier === "later" || (tier === "urgent" && !hasPayableInvoice(item)) ? (
            <>
              <button
                type="button"
                onClick={() => void runAction("archive")}
                disabled={Boolean(busyAction)}
                className="btn-secondary focus-ring rounded-full px-3 py-1.5 text-[13px] font-medium"
              >
                Archiveren
              </button>
              <button
                type="button"
                onClick={() => void runAction("trash")}
                disabled={Boolean(busyAction)}
                className="btn-secondary focus-ring rounded-full px-3 py-1.5 text-[13px] font-medium"
              >
                Verwijderen
              </button>
            </>
          ) : tier === "urgent" ? (
            <>
              {/* Een betaalde factuur blijft betaald: geen "ongedaan maken". */}
              {handled && hasPayableInvoice(item) ? null : (
                <button
                  type="button"
                  onClick={() => {
                    const next = !handled;
                    setHandled(next);
                    onToggleHandled(item);
                    if (next && hasPayableInvoice(item) && !declaration) setShowDeclarePrompt(true);
                    if (!next) setShowDeclarePrompt(false);
                  }}
                  className={`focus-ring relative rounded-full px-3 py-1.5 text-[13px] font-medium ${
                    handled ? "btn-secondary text-[var(--muted)]" : "btn-primary"
                  }`}
                >
                  {handled ? "Ongedaan maken" : doneLabel}
                </button>
              )}
              {handled && hasPayableInvoice(item) ? null : (
                <>
                  <button
                    type="button"
                    onClick={() => void runAction("archive")}
                    disabled={Boolean(busyAction)}
                    className="btn-secondary focus-ring rounded-full px-3 py-1.5 text-[13px] font-medium"
                  >
                    Archiveren
                  </button>
                  <button
                    type="button"
                    onClick={() => void runAction("trash")}
                    disabled={Boolean(busyAction)}
                    className="btn-secondary focus-ring rounded-full px-3 py-1.5 text-[13px] font-medium"
                  >
                    Verwijderen
                  </button>
                </>
              )}
            </>
          ) : null}
          {tier === "info" && !item.draftReply ? (
            <>
              <button
                type="button"
                onClick={() => void runAction("archive")}
                disabled={Boolean(busyAction)}
                className="btn-secondary focus-ring rounded-full px-3 py-1.5 text-[13px] font-medium"
              >
                Archiveren
              </button>
              <button
                type="button"
                onClick={() => void runAction("trash")}
                disabled={Boolean(busyAction)}
                className="btn-secondary focus-ring rounded-full px-3 py-1.5 text-[13px] font-medium"
              >
                Verwijderen
              </button>
            </>
          ) : null}
          {unsub ? (
            <button
              type="button"
              onClick={onUnsubscribe}
              disabled={unsubState === "sending" || unsubState === "sent"}
              className="btn-secondary focus-ring rounded-full px-3 py-1.5 text-[13px] font-medium disabled:opacity-60"
            >
              {unsubLabel(unsub)}
            </button>
          ) : null}
          {unsubState === "error" && unsubMessage ? (
            <p className="w-full text-[12px] leading-5 text-[var(--danger)]">{unsubMessage}</p>
          ) : null}
          {!item.draftReply && onSave && tier !== "info" ? (
            <button
              type="button"
              onClick={() => {
                const next = !saved;
                setSaved(next);
                onSave(item, next);
                // Saving moves the mail out of Focus, so the popup can go.
                if (next) onClose();
              }}
              className="btn-secondary focus-ring ml-auto rounded-full px-4 py-2 text-[13px] font-medium"
            >
              {saved ? "Bewaard" : "Bewaren"}
            </button>
          ) : null}
          {nextTier && onSnooze && !handled ? (
            <button
              type="button"
              onClick={snoozeTomorrow}
              className={`btn-secondary focus-ring rounded-full px-3 py-1.5 text-[13px] font-medium ${
                item.draftReply || (onSave && tier !== "info") ? "" : "ml-auto"
              }`}
            >
              Snooze
            </button>
          ) : null}
          {sendMessage ? <p className="w-full text-[12px] leading-5 text-[var(--muted)]">{sendMessage}</p> : null}
        </div>
        {showDeclarePrompt ? (
          <div className="mt-3 rounded-2xl bg-[var(--bg)] p-3">
            <p className="text-[13px] font-medium text-[var(--ink)]">Declareren?</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setDeclaration("pending");
                  onDeclare(item, "pending");
                  setShowDeclarePrompt(false);
                  // Paid and answered: the mail itself is done. runAction closes
                  // the popup, drops the card and archives it as read.
                  runAction("archive");
                }}
                className="btn-primary focus-ring rounded-full px-4 py-1.5 text-[13px] font-medium"
              >
                Ja, declareren
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeclaration("none");
                  onDeclare(item, "none");
                  setShowDeclarePrompt(false);
                  runAction("archive");
                }}
                className="btn-secondary focus-ring rounded-full px-4 py-1.5 text-[13px] font-medium"
              >
                Nee
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
