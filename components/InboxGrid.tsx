"use client";

import { useEffect, useRef, useState } from "react";
import { orderByUrgency, urgencyFor, type UrgencyTone } from "@/lib/agent/urgency";
import type { MailAssessment } from "@/lib/agent/types";
import { InvoiceBlock, timeZoneOf, UrgencyPill } from "./AgentInbox";

const TONE_TEXT: Record<UrgencyTone, string> = {
  red: "text-[var(--danger)]",
  orange: "text-[var(--orange)]",
  blue: "text-[var(--blue)]",
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
}: {
  items: MailAssessment[];
  infoItems: MailAssessment[];
  declareItems: MailAssessment[];
  loading: boolean;
  error: string | null;
  onToggleHandled: (item: MailAssessment) => void;
  onSnooze: (item: MailAssessment, until: string) => void;
  onDeclare: (item: MailAssessment, declaration: "none" | "pending" | "declared") => void;
  onSave: (item: MailAssessment, saved: boolean) => void;
}) {
  const [selected, setSelected] = useState<MailAssessment | null>(null);
  const [activeTab, setActiveTab] = useState<"urgent" | "later" | "info" | "declare">("urgent");
  const [clock, setClock] = useState(() => new Date());
  const now = clock;
  const timeZone = timeZoneOf();
  const ordered = orderByUrgency(items, now, timeZone);
  const orderedInfo = orderByUrgency(
    infoItems.filter((item) => !item.snoozedUntil || Date.parse(item.snoozedUntil) <= Date.now()),
    now,
    timeZone,
  );
  const orderedDeclare = orderByUrgency(
    declareItems.filter((item) => !item.snoozedUntil || Date.parse(item.snoozedUntil) <= Date.now()),
    now,
    timeZone,
  );

  const urgent: MailAssessment[] = [];
  const later: MailAssessment[] = [];
  for (const item of ordered) {
    const tone = urgencyFor(item, now, timeZone).tone;
    if (tone === "red" || tone === "orange") urgent.push(item);
    else later.push(item);
  }

  const isEmpty = ordered.length === 0 && orderedInfo.length === 0 && orderedDeclare.length === 0;

  const declareTotal = orderedDeclare.reduce((sum, item) => sum + (item.invoice?.amount ?? 0), 0);
  const declareLabel = `€ ${declareTotal % 1 === 0 ? declareTotal : declareTotal.toFixed(2)}`;

  const tabs: { id: "urgent" | "later" | "info" | "declare"; label: string; count: number | string }[] = [
    { id: "urgent", label: "Moet", count: urgent.length },
    { id: "later", label: "Mag", count: later.length },
    { id: "info", label: "Hoeft niet", count: orderedInfo.length },
    { id: "declare", label: "Declareren", count: declareLabel },
  ];
  const activeCards =
    activeTab === "urgent" ? urgent : activeTab === "later" ? later : activeTab === "info" ? orderedInfo : orderedDeclare;

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
        current === "urgent" ? urgent : current === "later" ? later : current === "info" ? orderedInfo : orderedDeclare;
      if (currentCards.length > 0) return current;
      if (urgent.length > 0) return "urgent";
      if (later.length > 0) return "later";
      if (orderedInfo.length > 0) return "info";
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
        <p className="text-[14px] leading-6 text-[var(--muted)]">Inbox wordt geladen…</p>
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
          onSnooze={onSnooze}
          onDeclare={onDeclare}
          onOpen={(item) => setSelected(item)}
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
          onSave={onSave}
        />
      ) : null}
    </section>
  );
}

function CardGrid({
  items,
  now,
  timeZone,
  onSnooze,
  onDeclare,
  onOpen,
}: {
  items: MailAssessment[];
  now: Date;
  timeZone: string;
  onSnooze: (item: MailAssessment, until: string) => void;
  onDeclare: (item: MailAssessment, declaration: "none" | "pending" | "declared") => void;
  onOpen: (item: MailAssessment) => void;
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
          onSnooze={onSnooze}
          onDeclare={onDeclare}
          onClick={() => onOpen(item)}
        />
      ))}
    </div>
  );
}

function preparedLabel(item: MailAssessment): string {
  if (item.preparedAction) return item.preparedAction;
  if (item.invoice?.iban) return "QR-code aangemaakt";
  if (item.invoice) return "Factuurgegevens voorbereid";
  if (item.classification === "reply_needed") return "Concept gemaakt";
  if (item.classification === "info") return "Gefilterd";
  if (item.classification === "waiting") return "Wacht op reactie";
  return "Actie voorbereid";
}

function ctaLabel(item: MailAssessment): string {
  if (item.declaration === "pending") return "Gedeclareerd";
  if (item.source === "scan") return "Bekijk scan";
  if (item.invoice) return item.handledByUser ? "Betaald" : "Betalen";
  if (item.classification === "reply_needed") return "Goedkeuren";
  if (item.classification === "action_needed") return "Afhandelen";
  return "Bekijken";
}

function isPrimaryCta(item: MailAssessment): boolean {
  return Boolean(item.invoice) || item.classification === "reply_needed";
}

function balanceTwoLines(text: string): [string, string | null] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 3) return [words.join(" "), null];
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

export function InboxCard({
  item,
  index,
  now,
  timeZone,
  onSnooze,
  onDeclare,
  onClick,
}: {
  item: MailAssessment;
  index: number;
  now: Date;
  timeZone: string;
  onSnooze: (item: MailAssessment, until: string) => void;
  onDeclare: (item: MailAssessment, declaration: "none" | "pending" | "declared") => void;
  onClick: () => void;
}) {
  const urgency = urgencyFor(item, now, timeZone);
  const tilts = ["rotate-[2.5deg]", "-rotate-[1.5deg]", "-rotate-[3deg]", "rotate-[2deg]"];
  const tilt = tilts[index % tilts.length];
  const overlap = index % 2 === 1 ? (index % 4 === 3 ? "sm:-ml-8" : "sm:-ml-4") : "";
  const rowOverlap = index >= 2 ? "sm:-mt-6" : "";
  const zIndex = Math.min(2 + index, 39);
  const consequence = item.consequence?.senderSays ?? item.consequence?.possible;
  const prepared = preparedLabel(item);
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
      className={`glass-panel focus-ring relative z-[var(--card-z)] flex min-h-[270px] cursor-pointer flex-col items-center rounded-2xl px-4 pt-4 pb-6 text-center transition-transform hover:z-40 hover:-translate-y-0.5 hover:rotate-0 sm:min-h-[410px] ${tilt} ${overlap} ${rowOverlap}`}
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
              className="flex min-h-[40px] w-full flex-col justify-center text-[16px] font-semibold leading-5 text-[var(--ink)]"
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
          <p className="text-[12px] font-medium text-[var(--muted)]">{prepared}</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  openCta();
                }}
                className={`focus-ring relative flex-1 rounded-full px-3 py-2 text-[13px] font-medium ${
                  isPrimaryCta(item)
                    ? "glass-active"
                    : "glass-chip text-[var(--ink)]"
                }`}
              >
                {cta}
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  const until = new Date();
                  until.setDate(until.getDate() + 1);
                  until.setHours(0, 0, 0, 0);
                  onSnooze(item, until.toISOString());
                }}
                className="glass-chip focus-ring shrink-0 rounded-full px-3 py-2 text-[13px] font-medium text-[var(--ink)]"
              >
                Snooze
              </button>
            </div>
          </div>
      </div>
    </div>
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
  onSave,
}: {
  item: MailAssessment;
  now: Date;
  timeZone: string;
  onClose: () => void;
  onToggleHandled: (item: MailAssessment) => void;
  onDeclare: (item: MailAssessment, declaration: "none" | "pending" | "declared") => void;
  onSave?: (item: MailAssessment, saved: boolean) => void;
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
  const doneLabel = item.invoice ? "Betaald" : "Afhandelen";
  const isNewsletter =
    Boolean(item.unsubscribe) || item.classification === "info" || item.classification === "unclassified";

  const unsub = item.unsubscribe;
  const [unsubState, setUnsubState] = useState<"idle" | "sending" | "sent" | "error">(unsub?.status ?? "idle");
  const [unsubMessage, setUnsubMessage] = useState<string | null>(unsub?.message ?? null);

  const handleUnsubscribe = async () => {
    if (!unsub) return;
    setUnsubState("sending");
    setUnsubMessage(null);
    try {
      const response = await fetch("/api/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: item.sourceMessageId }),
      });
      const data = (await response.json().catch(() => null)) as { status?: string; message?: string } | null;
      if (response.ok && data?.status === "sent") {
        setUnsubState("sent");
      } else {
        setUnsubState("error");
        setUnsubMessage(data?.message ?? "Afmelden is niet gelukt.");
      }
    } catch {
      setUnsubState("error");
      setUnsubMessage("Afmelden is niet gelukt.");
    }
  };

  const onUnsubscribe = () => {
    if (!unsub) return;
    if (unsub.kind === "manual" || unsubState === "error") {
      if (unsub.url) window.open(unsub.url, "_blank", "noopener,noreferrer");
      return;
    }
    if (unsub.kind === "mailto") {
      if (item.link) window.open(item.link, "_blank", "noopener,noreferrer");
      return;
    }
    if (unsubState === "sending" || unsubState === "sent") return;
    void handleUnsubscribe();
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

  async function sendDraft() {
    if (!draft.trim() || sending || sent) return;
    setSending(true);
    setSendMessage(null);
    try {
      const body = new FormData();
      body.append("conversationId", item.conversationId);
      body.append("body", draft);
      for (const file of attachments) body.append("files", file);
      const response = await fetch("/api/agent/send", { method: "POST", body });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (response.ok && data?.ok) {
        setSent(true);
        setHandled(true);
        if (!item.handledByUser) onToggleHandled(item);
        setSendMessage("Verzonden.");
      } else {
        setSendMessage(data?.message ?? "Versturen is niet gelukt.");
      }
    } catch {
      setSendMessage("Versturen is niet gelukt.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <button type="button" aria-label="Sluiten" onClick={onClose} className="absolute inset-0 bg-[#12141c]/40" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="inbox-detail-title"
        className="relative max-h-[calc(100dvh-2rem)] w-full max-w-[560px] overflow-y-auto rounded-[24px] border border-[var(--line)] bg-[var(--card)] p-6 shadow-[var(--shadow)]"
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
              {item.invoice ? "Uiterste betaaldatum" : "Uiterste reactiedatum"}
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

        {item.invoice ? (
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
                  className="glass-chip focus-ring rounded-full px-3 py-1.5 text-[12px] font-medium text-[var(--ink)]"
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
                onClick={() => void sendDraft()}
                disabled={sending || sent || !draft.trim()}
                className="glass-active relative rounded-full px-4 py-2 text-[13px] font-medium disabled:opacity-50"
              >
                {sent ? "Verzonden" : sending ? "Versturen…" : "Verstuur"}
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = !saved;
                  setSaved(next);
                  onSave?.(item, next);
                }}
                className="glass-chip focus-ring rounded-full px-4 py-2 text-[13px] font-medium text-[var(--ink)]"
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
                  className="glass-chip focus-ring rounded-full px-3 py-1.5 text-[13px] font-medium text-[var(--ink)]"
                >
                  {handled ? "Ongedaan maken" : "Afhandelen"}
                </button>
              ) : null}
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                const next = !handled;
                setHandled(next);
                onToggleHandled(item);
                if (next && item.invoice && !declaration) setShowDeclarePrompt(true);
              }}
              className={`focus-ring relative rounded-full px-3 py-1.5 text-[13px] font-medium ${
                handled ? "glass-chip text-[var(--muted)]" : "glass-active"
              }`}
            >
              {handled ? "Ongedaan maken" : doneLabel}
            </button>
          )}
          {unsub ? (
            <button
              type="button"
              onClick={onUnsubscribe}
              disabled={unsubState === "sending" || unsubState === "sent"}
              className="glass-chip focus-ring rounded-full px-3 py-1.5 text-[13px] font-medium text-[var(--ink)] disabled:opacity-60"
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
              className="glass-chip focus-ring rounded-full px-3 py-1.5 text-[13px] font-medium text-[var(--ink)]"
            >
              Gedeclareerd
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
                className="glass-active focus-ring rounded-full px-4 py-1.5 text-[13px] font-medium"
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
                className="glass-chip focus-ring rounded-full px-4 py-1.5 text-[13px] font-medium text-[var(--ink)]"
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
