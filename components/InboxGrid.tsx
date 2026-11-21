"use client";

import { useEffect, useRef, useState } from "react";
import { orderNewestFirst, urgencyFor, type UrgencyTone } from "@/lib/agent/urgency";
import type { MailAssessment } from "@/lib/agent/types";
import { InvoiceBlock, timeZoneOf, UrgencyPill } from "./AgentInbox";
import { ProposalDialog } from "./ProposalDialog";

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
  onError?: (message: string) => void;
}) {
  const [selected, setSelected] = useState<MailAssessment | null>(null);

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
  const [proposalId, setProposalId] = useState<string | null>(null);
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
    const untilMidnight = (() => {
      const next = new Date();
      next.setHours(24, 0, 0, 0);
      return next.getTime() - Date.now() + 1000;
    })();
    const timer = window.setTimeout(tick, untilMidnight);
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
          onOpenProposal={(id) => {
            setSelected(null);
            setProposalId(id);
          }}
          onRemove={onRemove}
          onReload={onReload}
          onError={onError}
        />
      ) : null}

      {proposalId ? <ProposalDialog proposalId={proposalId} onClose={() => setProposalId(null)} /> : null}
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
  if (item.declaration === "pending") return "Gedeclareerd";
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
  const words = text.trim().split(/\s+/).filter(Boolean);
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
  return [words.slice(0, bestIndex).join(" "), words.slice(bestIndex).join(" ")];
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
}: {
  item: MailAssessment;
  index: number;
  now: Date;
  timeZone: string;
  onDeclare: (item: MailAssessment, declaration: "none" | "pending" | "declared") => void;
  onClick: () => void;
  onTrash?: () => void;
}) {
  const urgency = urgencyFor(item, now, timeZone);
  const tilts = ["rotate-[2.5deg]", "-rotate-[1.5deg]", "-rotate-[3deg]", "rotate-[2deg]"];
  const tilt = tilts[index % tilts.length];
  const overlap = index % 2 === 1 ? (index % 4 === 3 ? "sm:-ml-8" : "sm:-ml-4") : "";
  const rowOverlap = index >= 2 ? "sm:-mt-6" : "";
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
      {item.needsAttention ? (
        <span className="absolute top-3 left-3 rounded-full bg-[var(--orange-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--orange)]">
          Opnieuw
        </span>
      ) : isScan ? (
        <span className="absolute top-3 left-3 rounded-full bg-[var(--blue-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--blue)]">
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

      <div className="flex w-full flex-1 flex-col justify-between py-4">
        {!isNewsletter ? (
          <div className="flex flex-col items-center gap-1">
            <p className="text-[11px] font-medium tracking-[0.08em] text-[var(--faint)]">Actie:</p>
            <BalancedText
              text={item.nextAction}
              className="flex min-h-[40px] w-full flex-col justify-start text-[16px] font-semibold leading-5 text-[var(--ink)]"
            />
          </div>
        ) : null}

        {!isNewsletter ? (
          <div className="flex w-full flex-col items-center gap-1">
            <p className="text-[11px] font-medium tracking-[0.08em] text-[var(--faint)]">Uiterste reactiedatum:</p>
            <p className={`tnum text-[13px] font-medium ${TONE_TEXT[urgency.tone]}`}>{urgency.deadlineText}</p>
          </div>
        ) : null}

        <div className={isNewsletter ? "mt-auto w-full" : "w-full"}>
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
    <div>
      <dt className="text-[11px] font-medium tracking-[0.08em] text-[var(--faint)]">{label}</dt>
      <dd className="mt-0.5 text-[13px] leading-5 text-[var(--ink)]">{children}</dd>
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
  onOpenProposal,
  onRemove,
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
  onOpenProposal?: (id: string) => void;
  onRemove?: (conversationId: string) => void;
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
  const doneLabel = hasPayableInvoice(item) ? "Betaald" : "Afhandelen";
  const isNewsletter =
    Boolean(item.unsubscribe) || item.classification === "info" || item.classification === "unclassified";

  const unsub = item.unsubscribe;
  const [unsubState, setUnsubState] = useState<"idle" | "sending" | "sent" | "error">(unsub?.status ?? "idle");
  const [unsubMessage, setUnsubMessage] = useState<string | null>(unsub?.message ?? null);

  const onUnsubscribe = () => {
    // Read-only phase: never send an unsubscribe request. Show the proposal
    // so the user can record an approval instead.
    if (item.proposal && onOpenProposal) {
      onOpenProposal(item.proposal.id);
      return;
    }
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

  // Read-only phase: sending is blocked server-side, so the draft action opens
  // the reply proposal and records the decision instead.
  const openReplyProposal = () => {
    if (item.proposal && onOpenProposal) onOpenProposal(item.proposal.id);
  };

  // Snoozing drops the card exactly one tier for a day.
  const tier = cardTier(item, Date.now());
  const nextTier: "later" | "info" | null = tier === "urgent" ? "later" : tier === "later" ? "info" : null;

  const snoozeTomorrow = () => {
    if (!onSnooze || !nextTier) return;
    const until = new Date();
    until.setDate(until.getDate() + 1);
    until.setHours(0, 0, 0, 0);
    onSnooze(item, until.toISOString(), nextTier);
    onClose();
  };

  const [busyAction, setBusyAction] = useState<"archive" | "trash" | null>(null);

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
        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as { error?: string } | null;
          onError?.(data?.error ?? "Actie mislukt.");
          onReload?.();
        }
      } catch {
        onError?.("Actie mislukt: geen verbinding.");
        onReload?.();
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <button type="button" aria-label="Sluiten" onClick={onClose} className="absolute inset-0 bg-[#12141c]/40" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="inbox-detail-title"
        className="relative max-h-[calc(100dvh-2rem)] w-full max-w-[760px] overflow-y-auto rounded-[24px] border border-[var(--line)] bg-[var(--card)] p-6 shadow-[var(--shadow)]"
      >
        <div className="flex items-start justify-between gap-3">
          <UrgencyPill tone={urgency.tone} label={urgency.label} />
          <button
            type="button"
            onClick={onClose}
            aria-label="Sluiten"
            className="focus-ring grid h-8 w-8 place-items-center rounded-full text-[18px] text-[var(--muted)] hover:bg-[var(--bg)]"
          >
            ×
          </button>
        </div>

        {item.needsAttention ? (
          <p className="mt-3 inline-block rounded-full bg-[var(--orange-soft)] px-2.5 py-1 text-[12px] font-medium text-[var(--orange)]">
            Opnieuw aandacht · {item.attentionReason ?? "Nieuw bericht"}
          </p>
        ) : null}

        <div className="mt-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium tracking-[0.08em] text-[var(--faint)]">{item.source === "scan" ? "Leverancier" : "Afzender"}</p>
            <p className="mt-0.5 truncate text-[16px] font-semibold text-[var(--ink)]">{item.from}</p>
            {item.fromEmail ? (
              <p className="truncate text-[12px] text-[var(--muted)]">{item.fromEmail}</p>
            ) : null}
          </div>
          <div className="min-w-0 text-right">
            <p className="text-[11px] font-medium tracking-[0.08em] text-[var(--faint)]">Onderwerp</p>
            <p id="inbox-detail-title" className="mt-0.5 line-clamp-2 text-[14px] font-medium text-[var(--ink)]">
              {item.subject}
            </p>
            <p className="mt-3 text-[11px] font-medium tracking-[0.08em] text-[var(--faint)]">
              {hasPayableInvoice(item) ? "Uiterste betaaldatum" : "Uiterste reactiedatum"}
            </p>
            <p className={`tnum mt-0.5 text-[13px] font-medium ${TONE_TEXT[urgency.tone]}`}>{urgency.deadlineText}</p>
          </div>
        </div>

        {!isNewsletter ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-[var(--bg)] px-4 py-3">
              <p className="text-[11px] font-medium tracking-[0.08em] text-[var(--faint)]">Actie</p>
              <p className="mt-1 text-[15px] font-semibold text-[var(--ink)]">{item.nextAction}</p>
            </div>
            <div className="rounded-2xl bg-[var(--bg)] px-4 py-3">
              <p className="text-[11px] font-medium tracking-[0.08em] text-[var(--faint)]">Waarom</p>
              <p className="mt-1 text-[13px] leading-5 text-[var(--ink)]">{item.priorityReason}</p>
            </div>
          </div>
        ) : null}

        {(item.unsubscribe || item.classification === "info" || item.classification === "unclassified") && item.body ? (
          <section className="mt-5">
            <p className="text-[11px] font-medium tracking-[0.14em] text-[var(--muted)] uppercase">Bericht</p>
            <div className="mt-2 space-y-3 text-[14px] leading-6 text-[var(--ink)]">
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
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <dt className="text-[11px] font-medium tracking-[0.08em] text-[var(--faint)]">Wat als je niks doet</dt>
                <dd className="mt-0.5 text-[13px] leading-5 text-[var(--ink)]">{item.impact ?? "—"}</dd>
              </div>
              <div className="min-w-0 text-right">
                <dt className="text-[11px] font-medium tracking-[0.08em] text-[var(--faint)]">Voorbereid</dt>
                <dd className="mt-0.5 text-[13px] leading-5 text-[var(--ink)]">{prepared}</dd>
              </div>
            </div>
            {item.consequence?.senderSays ? (
              <DetailRow label="Afzender meldt">{item.consequence.senderSays}</DetailRow>
            ) : null}
            {item.consequence?.possible ? (
              <DetailRow label="Mogelijk gevolg">{item.consequence.possible}</DetailRow>
            ) : null}
          </dl>
        ) : null}

        {hasPayableInvoice(item) ? (
          <div className="mt-4">
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
                <div key={index} className="border-b border-[var(--line)] pb-2 last:border-0 last:pb-0">
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

        {item.link ? (
          <a
            href={item.link}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-block text-[13px] font-medium text-[var(--blue)]"
          >
            Open in Gmail →
          </a>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-4">
          {item.draftReply ? (
            <>
              <button
                type="button"
                onClick={openReplyProposal}
                disabled={!item.proposal || !onOpenProposal}
                className="btn-primary relative rounded-full px-4 py-2 text-[13px] font-medium"
              >
                Verstuur
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
          {tier === "info" && !item.draftReply && onOpenProposal ? (
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
          {declaration === "pending" ? (
            <button
              type="button"
              onClick={() => {
                setDeclaration("declared");
                onDeclare(item, "declared");
              }}
              className="btn-secondary focus-ring rounded-full px-3 py-1.5 text-[13px] font-medium"
            >
              Gedeclareerd
            </button>
          ) : null}
          {!item.draftReply && onSave && tier !== "info" ? (
            <button
              type="button"
              onClick={() => {
                const next = !saved;
                setSaved(next);
                onSave(item, next);
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
          {handled ? <span className="text-[12px] text-[var(--muted)]">Afgehandeld</span> : null}
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
                }}
                className="btn-secondary focus-ring rounded-full px-4 py-1.5 text-[13px] font-medium"
              >
                Nee
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
