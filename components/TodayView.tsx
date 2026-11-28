"use client";

import { useEffect, useRef, useState } from "react";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";

import { AgendaPanel } from "./AgendaPanel";
import { startOfLogicalDay } from "@/lib/day-boundary";
import type { MailAssessment, ShipmentInfo } from "@/lib/agent/types";
import { useInbox, type InboxProgress } from "./AgentInbox";
import { useApp } from "./AppProvider";
import { useRandVeeg } from "@/lib/use-rand-veeg";
import { useMobielNav } from "./mobiel-nav";
import { InboxGrid } from "./InboxGrid";
import { LegacyLoopsCard } from "./LegacyLoopsCard";
import { ShipmentDialog, type TrailStep } from "./ShipmentDialog";
import { TodayHeader } from "./TodayHeader";
import { PAGINA_VAK } from "@/lib/page-layout";

const GMAIL_NOTICES: Record<string, { tone: "ok" | "warn"; text: string }> = {
  connected: { tone: "ok", text: "Gmail is gekoppeld. De eerste import start automatisch." },
  denied: { tone: "warn", text: "Je hebt geen toestemming gegeven voor Gmail. Koppel opnieuw om te proberen." },
  scope_rejected: {
    tone: "warn",
    text: "Gmail is niet gekoppeld: de alleen-lezen scope ontbreekt of er zijn ruimere Gmail-rechten verleend.",
  },
  no_refresh_token: { tone: "warn", text: "Google gaf geen langdurig token terug. Koppel opnieuw en sta offline toegang toe." },
  profile_error: { tone: "warn", text: "Het Gmail-adres kon niet worden opgehaald. Koppel opnieuw." },
  state_error: { tone: "warn", text: "De koppelpoging is verlopen. Koppel opnieuw." },
  exchange_error: { tone: "warn", text: "De koppeling met Google is mislukt. Probeer het opnieuw." },
  db_missing: {
    tone: "warn",
    text: "De Supabase-tabellen voor Gmail ontbreken nog. Voer supabase/migrate-gmail.sql uit in de Supabase SQL-editor en koppel daarna opnieuw.",
  },
  save_error: { tone: "warn", text: "De koppeling kon niet worden opgeslagen." },
  not_configured: { tone: "warn", text: "Google OAuth is niet geconfigureerd (AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET)." },
};

function GmailNotice() {
  const [notice, setNotice] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("gmail");
    if (!status) return;
    const reason = params.get("reason");
    const entry = GMAIL_NOTICES[status];
    if (entry) {
      setNotice(
        status === "scope_rejected" && reason ? { tone: "warn", text: `Gmail is niet gekoppeld: ${reason}` } : entry,
      );
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("gmail");
    url.searchParams.delete("reason");
    window.history.replaceState({}, "", url.toString());
  }, []);

  if (!notice) return null;
  return (
    <div
      className={`mb-4 rounded-2xl px-4 py-3 text-[13px] ${
        notice.tone === "ok" ? "bg-[var(--blue-soft)] text-[var(--active-ink)]" : "bg-[var(--danger-soft)] text-[var(--danger)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="leading-6">{notice.text}</p>
        <button type="button" onClick={() => setNotice(null)} className="shrink-0 text-[12px] font-medium underline">
          Sluiten
        </button>
      </div>
      {notice.tone === "warn" ? (
        <a href="/api/gmail/connect" className="mt-2 inline-block text-[12px] font-semibold underline">
          Opnieuw koppelen
        </a>
      ) : null}
    </div>
  );
}

/**
 * One card per invoice: a supplier that chases the same invoice in several
 * mails (reminder, final notice) must not fill the overview twice. The newest
 * message wins.
 */
function dedupeInvoices(items: MailAssessment[]): MailAssessment[] {
  const byInvoice = new Map<string, number>();
  const out: MailAssessment[] = [];

  for (const item of items) {
    const invoice = item.invoice;
    const key =
      invoice?.invoiceNumber && invoice?.supplier
        ? `${invoice.supplier.toLowerCase()}::${invoice.invoiceNumber.toLowerCase()}`
        : "";
    if (!key) {
      out.push(item);
      continue;
    }
    const existingIndex = byInvoice.get(key);
    if (existingIndex === undefined) {
      byInvoice.set(key, out.length);
      out.push(item);
      continue;
    }
    // Same invoice seen before: keep whichever message is newer.
    if (Date.parse(item.receivedAt) > Date.parse(out[existingIndex].receivedAt)) {
      out[existingIndex] = item;
    }
  }
  return out;
}

export function TodayView() {
  const { setSyncProgress } = useApp();
  const inbox = useInbox();
  const [progress, setProgress] = useState<InboxProgress | null>(inbox.progress);

  useEffect(() => {
    setProgress(inbox.progress);
  }, [inbox.progress]);

  const syncing = progress?.phase === "importing" || progress?.phase === "triaging";

  // Client-driven runner: repeats the resumable step until the import and the
  // triage are done, then reloads the cards. Every step is persisted in
  // Supabase, so closing the tab only pauses it.
  // Keep the loop alive across re-renders: only a phase change may stop it,
  // otherwise every progress update cancelled the runner halfway.
  const reloadRef = useRef(inbox.reload);
  useEffect(() => {
    reloadRef.current = inbox.reload;
  }, [inbox.reload]);

  useEffect(() => {
    if (!syncing) return;
    let cancelled = false;

    const run = async () => {
      while (!cancelled) {
        try {
          const response = await fetch("/api/gmail/import", { method: "POST" });
          const data = (await response.json().catch(() => null)) as { progress?: InboxProgress } | null;
          if (cancelled) return;
          if (data?.progress) {
            setProgress(data.progress);
            // The sidebar reads this from the app context; without it the bar
            // kept showing whatever the last inbox load reported.
            setSyncProgress(data.progress);
          }
          const phase = data?.progress?.phase;
          if (phase !== "importing" && phase !== "triaging") break;
          await new Promise((resolve) => setTimeout(resolve, 250));
        } catch {
          if (cancelled) return;
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      }
      if (!cancelled) void reloadRef.current();
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [syncing]);

  const nowMs = Date.now();
  // Bewaren moves a mail out of Focus, and order mail the agent archived itself
  // leaves too (it stays available for the shipments panel).
  const visibleItems = dedupeInvoices(inbox.items.filter((item) => !item.archivedAt && !item.savedAt));

  const activeItems = visibleItems.filter(
    (item) =>
      item.classification !== "info" &&
      item.classification !== "unclassified" &&
      item.handledByUser !== true,
  );
  const infoItems = visibleItems.filter(
    (item) => item.classification === "info" || (item.source === "scan" && item.handledByUser === true),
  );
  // A paid invoice that still has to be declared keeps its card, even though the
  // mail itself is already archived.
  // Alles wat op declareren staat hoort in dat tabblad, ook als de factuur-
  // gegevens (nog) niet compleet zijn. Anders kan een kaart stil verdwijnen.
  // Mobiel: de rechterkolom zit achter een zwart lipje aan de rand. De stand
  // van het paneel is één motion value, zodat het lipje en het paneel samen
  // met de vinger meebewegen in plaats van pas na het loslaten te springen.
  const [zijbalkOpen, setZijbalkOpen] = useState(false);
  const sleep = useMotionValue(0);
  const paneelRef = useRef<HTMLElement | null>(null);
  const paneelX = useTransform(sleep, (waarde) => `calc(100% - ${waarde}px)`);
  const sluierOpacity = useTransform(sleep, [0, 220], [0, 1]);
  // Eén lipje voor beide standen: het schuift mee met het paneel en klapt op
  // zijn plek om, in plaats van te verdwijnen en ergens anders terug te komen.
  const lipX = useTransform(sleep, (waarde) => -waarde);
  /** Schaduw van het paneel pas zodra het paneel echt in beeld komt. */
  const schaduwOpacity = useTransform(sleep, [0, 30], [0, 1]);

  /**
   * Op mobiel moet de zijbalk eerst dichtglijden voordat een agendascherm opent;
   * anders schuift dat scherm open achter een paneel dat nog in beeld is.
   */
  const { setOpen: zetLade } = useMobielNav();

  // Zolang het paneel open is, kleurt ook het gebied buiten het paneel mee;
  // anders blijft de veilige marge bovenaan wit op iOS.
  useEffect(() => {
    document.documentElement.dataset.zijbalk = zijbalkOpen ? "open" : "";
    return () => {
      delete document.documentElement.dataset.zijbalk;
    };
  }, [zijbalkOpen]);

  // Veeg vanaf de rechterrand opent het paneel, net als het lipje.
  useRandVeeg(
    "rechts",
    () => {
      // De lade en het paneel niet tegelijk open.
      zetLade(false);
      if (!zijbalkOpen) openZijbalk();
    },
  );

  const openVanuitZijbalk = (actie: () => void) => {
    if (!zijbalkOpen) {
      actie();
      return;
    }
    sluitZijbalk();
    window.setTimeout(actie, 380);
  };

  const openZijbalk = () => {
    const breedte = paneelRef.current?.offsetWidth ?? 300;
    setZijbalkOpen(true);
    void animate(sleep, breedte, { type: "spring", stiffness: 420, damping: 38, mass: 0.9 });
  };
  const sluitZijbalk = () => {
    setZijbalkOpen(false);
    void animate(sleep, 0, { type: "spring", stiffness: 420, damping: 38, mass: 0.9 });
  };
  const declareItems = inbox.items.filter((item) => item.declaration === "pending");
  const missedItems = visibleItems.filter((item) => item.classification === "unclassified");

  const zijbalk = (
    <>
      <AgendaPanel voorOpenen={openVanuitZijbalk} />
      <ShipmentsPanel items={inbox.items} />
      <DaySummary
        items={inbox.items}
        dailyChanges={inbox.meta?.dailyChanges}
        dailyPaid={inbox.meta?.dailyPaid}
        dailyAnswered={inbox.meta?.dailyAnswered}
      />
    </>
  );

  /**
   * Slepen met eigen pointer-afhandeling. Framer's drag zet zijn eigen
   * transform bovenop de stand die wij al bijhouden; die twee vochten om
   * dezelfde waarde en dat gaf zichtbaar geflikker.
   */
  const sleepSleep = useRef<{ startX: number; startY: number; basis: number; actief: boolean } | null>(null);
  // Na een echte sleep volgt er nog een klik; die mag het paneel niet meteen
  // weer sluiten.
  const sleepGesleept = useRef(false);

  const beginSleep = (event: React.PointerEvent) => {
    sleepSleep.current = { startX: event.clientX, startY: event.clientY, basis: sleep.get(), actief: true };
    sleepGesleept.current = false;
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  };

  const beweegSleep = (event: React.PointerEvent) => {
    const stand = sleepSleep.current;
    if (!stand?.actief) return;
    const dx = event.clientX - stand.startX;
    const dy = event.clientY - stand.startY;
    // Verticaal scrollen wint: dan laten we het paneel met rust.
    if (Math.abs(dy) > Math.abs(dx) * 1.2) {
      stand.actief = false;
      return;
    }
    if (Math.abs(dx) > 6) sleepGesleept.current = true;
    const breedte = paneelRef.current?.offsetWidth ?? 300;
    // Nooit verder dan het paneel breed is, anders laat het lipje los.
    sleep.set(Math.max(0, Math.min(breedte, stand.basis - dx)));
  };

  const eindSleep = () => {
    const stand = sleepSleep.current;
    sleepSleep.current = null;
    if (!stand?.actief) return;
    const breedte = paneelRef.current?.offsetWidth ?? 300;
    const stand0 = sleep.get();
    // Zeventig pixel is genoeg om te wisselen; minder veert terug.
    if (stand.basis > breedte / 2) {
      if (breedte - stand0 > 70) sluitZijbalk();
      else openZijbalk();
    } else if (stand0 > 70) {
      openZijbalk();
    } else {
      sluitZijbalk();
    }
  };

  /**
   * Het lipje: een tab tegen de schermrand met holle bochten naar de rand,
   * zoals een iOS-zijbalk. In open toestand verdwijnen die bochten, want dan
   * zit het lipje tegen het paneel aan.
   */
  const lipjeKnoppen = (open: boolean) => (
    <svg width={34} height={122} viewBox="-2 -10 34 122" aria-hidden className="lipje-vlak touch-pan-y">
      {/* Altijd dezelfde vorm: ook als het paneel open is blijft dit lipje
          hetzelfde, alleen de punt wijst dan de andere kant op. De holle
          bochten vallen dan over het paneel heen, in dezelfde kleur. */}
      <path
        d="M0 9 A9 9 0 0 1 9 0 L22 0 Q32 -1 32 -8 L32 112 Q32 105 22 104 L9 104 A9 9 0 0 1 0 95 Z"
        fill="#202326"
      />
      <path
        d={open ? "M13 45l7 9-7 9" : "M19 45l-7 9 7 9"}
        fill="none"
        stroke="rgba(255,255,255,0.85)"
        strokeWidth={3.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  return (
    <div className={PAGINA_VAK}>
        {inbox.notice ? (
          <div className="glass-float fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-2xl px-4 py-2.5 text-[13px] text-[var(--ink)]">
            {inbox.notice}
          </div>
        ) : null}
      <GmailNotice />
      <TodayHeader />
      <div className="grid gap-0 lg:grid-cols-3 lg:gap-8">
        <div className="lg:col-span-2">
          <div className="w-full space-y-6">
            <InboxGrid
              items={activeItems}
              infoItems={infoItems}
              declareItems={declareItems}
              loading={inbox.loading}
              error={inbox.error}
              onToggleHandled={inbox.toggleHandled}
              onSnooze={inbox.snoozeItem}
              onDeclare={inbox.declareInvoice}
              onSave={inbox.saveItem}
              onReload={inbox.reload}
              onRemove={inbox.removeItem}
              onUpdate={inbox.updateItem}
              onError={inbox.setNotice}
              onSeen={inbox.openNewItem}
              unreadIds={inbox.unreadIds}
            />

            <LegacyLoopsCard />
          </div>
        </div>
        {/* Desktop: de kolom rechts. Mobiel: diezelfde inhoud achter het lipje. */}
        <div className="hidden lg:flex lg:flex-col lg:border-l lg:border-[var(--line)] lg:pl-8">
          {zijbalk}
        </div>
      </div>

      {/* Mobiel: een zwart lipje aan de rechterrand, zoals iOS een beeld-in-beeld
          laat staan. Tikken opent dezelfde kolom als op de desktop. */}
      <motion.button
        type="button"
        onClick={() => {
          if (sleepGesleept.current) {
            sleepGesleept.current = false;
            return;
          }
          if (sleep.get() < 4) openZijbalk();
          else if (zijbalkOpen) sluitZijbalk();
        }}
        aria-label={zijbalkOpen ? "Zijbalk sluiten" : "Open de zijbalk met agenda, bestellingen en de dag"}
        data-zijbalk="lipje"
        onPointerDown={beginSleep}
        onPointerMove={beweegSleep}
        onPointerUp={eindSleep}
        onPointerCancel={eindSleep}
        style={{ x: lipX }}
        className="fixed top-1/2 right-0 z-50 -translate-y-1/2 touch-pan-y lg:hidden"
      >
        {lipjeKnoppen(zijbalkOpen)}
      </motion.button>

      <div className="lg:hidden">
        <motion.button
          type="button"
          aria-label="Sluiten"
          onClick={sluitZijbalk}
          style={{ opacity: sluierOpacity, pointerEvents: zijbalkOpen ? "auto" : "none" }}
          className="fixed inset-0 z-40 bg-black/35 !cursor-default backdrop-blur-[2px]"
        />
        <motion.aside
          ref={paneelRef}
          role="dialog"
          aria-hidden={!zijbalkOpen}
          aria-label="Zijbalk"
          data-zijbalk="paneel"
          onPointerDown={beginSleep}
          onPointerMove={beweegSleep}
          onPointerUp={eindSleep}
          onPointerCancel={eindSleep}
          style={{ x: paneelX, pointerEvents: zijbalkOpen ? "auto" : "none" }}
          className="zijvlak donker-paneel dark fixed inset-y-0 right-0 z-40 w-[74vw] max-w-[304px] touch-pan-y rounded-l-[22px] [&_h2]:!mt-5 [&_h2]:!text-[18px] [&_h2:first-of-type]:!mt-0 [&_p]:!text-[13px]"
        >
          {/* De schaduw zit op een eigen laag die meeschuift met de stand van het
              paneel: ingeklapt valt hij weg, anders zag je een schaduwband langs
              de schermrand zonder dat er iets te zien was. */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-l-[22px]"
            style={{ opacity: schaduwOpacity, boxShadow: "-10px 0 30px -18px rgba(0,0,0,0.35)" }}
          />
          <div className="h-full overflow-y-auto pt-7 pr-6 pb-[calc(2.5rem+env(safe-area-inset-bottom))] pl-8 [&_.truncate]:!whitespace-normal">
            {zijbalk}
          </div>
        </motion.aside>
      </div>
    </div>
  );
}

function item_archivedToday(supplier: string, items: MailAssessment[], startOfToday: Date): boolean {
  return items.some(
    (item) =>
      item.archivedAt &&
      Date.parse(item.archivedAt) >= startOfToday.getTime() &&
      (item.shipment?.supplier ?? item.from ?? "").toLowerCase().includes(supplier.toLowerCase()),
  );
}

function ShipmentsPanel({ items }: { items: MailAssessment[] }) {
  const byKey = new Map<string, { shipment: ShipmentInfo; receivedAt: string; key: string }>();
  // Every order update carries one status; together they form the trail.
  const trails = new Map<string, TrailStep[]>();
  for (const item of items) {
    if (!item.shipment) continue;
    // One trail per order: the agent's order key already spans carrier mails.
    const key =
      item.shipment.orderKey ||
      `${item.shipment.supplier.toLowerCase()}::${item.shipment.orderNumber.toLowerCase()}`;
    const existing = byKey.get(key);
    if (!existing || Date.parse(item.receivedAt) > Date.parse(existing.receivedAt)) {
      byKey.set(key, { shipment: item.shipment, receivedAt: item.receivedAt, key });
    }
    const steps = trails.get(key) ?? [];
    steps.push({
      at: item.receivedAt,
      status: item.shipment.status,
      detail: item.shipment.location ?? item.shipment.carrier ?? undefined,
    });
    trails.set(key, steps);
  }
  for (const steps of trails.values()) {
    steps.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  }
  // A delivered order is relevant until 05:00 the next morning; then the
  // dashboard day rolls over and it drops out of the panel.
  const startOfToday = startOfLogicalDay();

  // Payment confirmations sit in the same panel, grouped per supplier so a
  // second receipt shows as "Leverancier (2)".
  const payments = new Map<string, { supplier: string; count: number; receivedAt: string; amount?: number }>();
  for (const item of items) {
    if (!item.payment) continue;
    // Een betaalbevestiging hoort bij de dag dat hij binnenkwam: na de wissel
    // om 05:00 valt hij uit het paneel én uit het bedrag.
    if (Date.parse(item.receivedAt) < startOfToday.getTime()) continue;
    const key = item.payment.supplier.toLowerCase();
    const existing = payments.get(key);
    if (existing) {
      // Het bedrag telt op: meerdere betalingen aan dezelfde leverancier.
      existing.count += 1;
      existing.amount = Number(existing.amount ?? 0) + Number(item.payment.amount ?? 0);
      if (Date.parse(item.receivedAt) > Date.parse(existing.receivedAt)) existing.receivedAt = item.receivedAt;
    } else {
      payments.set(key, {
        supplier: item.payment.supplier,
        count: 1,
        receivedAt: item.receivedAt,
        amount: Number(item.payment.amount ?? 0),
      });
    }
  }
  // Iets dat gekocht is (licentie, abonnement, trial) hoort bij Bestellingen,
  // ook als er geen pakket bij komt kijken.
  // Eén regel per aankoop, niet per bevestiging: een payment provider stuurt
  // vaak meerdere ontvangstbewijzen voor hetzelfde bedrag. Dezelfde
  // transactiereferentie, of hetzelfde bedrag bij dezelfde winkel, is dezelfde
  // aankoop; het aantal komt achter de regel te staan.
  const purchaseGroups = new Map<
    string,
    { item: (typeof items)[number]; count: number; amount: number; receivedAt: string }
  >();
  for (const item of items) {
    // Een betaalbevestiging staat al bij "Betaald"; hier zou hij dubbel tellen.
    if (item.payment) continue;
    // Bestellingen horen bij de dag: ze verdwijnen pas bij de wissel om 05:00,
    // niet zodra de mail gearchiveerd wordt.
    if (Date.parse(item.receivedAt) < startOfToday.getTime()) continue;
    const p = item.purchase;
    if (!p) continue;
    const bedrag = Number(p.amount ?? 0);
    // Een gratis trial kost niets; dat mag hem niet uit de lijst halen.
    // Dezelfde aankoop herken je aan de transactiereferentie, anders aan
    // hetzelfde bedrag (of dezelfde einddatum) bij dezelfde winkel.
    const shop = (p.shop ?? item.from ?? "").toLowerCase().trim();
    const key = p.orderNumber
      ? `ref:${shop}:${p.orderNumber.toLowerCase()}`
      : `amt:${shop}:${bedrag > 0 ? bedrag : (p.endsAt ?? "geen")}`;
    const group = purchaseGroups.get(key);
    if (!group) {
      purchaseGroups.set(key, { item, count: 1, amount: bedrag, receivedAt: item.receivedAt });
    } else {
      group.count += 1;
      group.amount += bedrag;
      if (Date.parse(item.receivedAt) > Date.parse(group.receivedAt)) {
        group.item = item;
        group.receivedAt = item.receivedAt;
      }
    }
  }
  const purchaseEntries = [...purchaseGroups.values()]
    .sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt))
    .slice(0, 6);

  const paymentEntries = [...payments.values()].sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt));

  // Een zending die nog onderweg is mag blijven staan, ook als hij van gisteren
  // is. Al het andere hoort bij de dag: na de wissel om 05:00 valt het weg.
  const ONDERWEG = new Set(["Onderweg", "Vertraagd", "In behandeling", "Order bevestigd", "Verzonden"]);
  const shipments = [...byKey.values()]
    .filter((entry) => {
      const vandaag = Date.parse(entry.receivedAt) >= startOfToday.getTime();
      if (vandaag) return true;
      const archivedToday = item_archivedToday(entry.shipment.supplier, items, startOfToday);
      if (archivedToday) return true;
      // Een pakket dat nog loopt blijft zichtbaar tot het bezorgd is.
      return ONDERWEG.has(entry.shipment.status);
    })
    .sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt));

  const [openTrail, setOpenTrail] = useState<{ shipment: ShipmentInfo; trail: TrailStep[] } | null>(null);

  // Dezelfde stipkleuren als op de kaarten, zodat de zijbalk één taal spreekt.
  const statusColor = (status: string) =>
    status === "Geleverd"
      ? "var(--dot-green)"
      : status === "Onderweg"
        ? "var(--dot-blue)"
        : status === "Verzonden"
          ? "var(--dot-orange)"
          : "var(--muted)";

  const formatDate = (iso: string) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!match) return iso;
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).toLocaleDateString("nl-NL", {
      day: "numeric",
      month: "short",
    });
  };

  return (
    <section className="mt-6">
      <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--ink)]">Bestellingen</h2>
      {shipments.length === 0 && paymentEntries.length === 0 && purchaseEntries.length === 0 ? (
        <p className="mt-4 text-[14px] text-[var(--muted)]">Bestel maar</p>
      ) : (
      <ul className="mt-4 space-y-4">
        {shipments.map((entry, index) => {
          const s = entry.shipment;
          return (
            <li key={`${s.supplier}-${s.orderNumber}-${index}`}>
              <button
                type="button"
                onClick={() => setOpenTrail({ shipment: s, trail: trails.get(entry.key) ?? [] })}
                className="focus-ring flex w-full items-start gap-3 rounded-xl text-left"
              >
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: statusColor(s.status) }} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-[var(--ink)]">
                  {s.status}
                  {s.deliveredAt ? <span className="font-normal text-[var(--muted)]"> · {formatDate(s.deliveredAt)}</span> : null}
                </p>
                {s.location ? <p className="mt-0.5 text-[12px] text-[var(--blue)]">{s.location}</p> : null}
                <div className="mt-1 flex items-baseline justify-between gap-3">
                  <p className="truncate text-[13px] text-[var(--ink)]">{s.supplier}</p>
                  {s.carrier ? <p className="shrink-0 text-[12px] text-[var(--muted)]">{s.carrier}</p> : null}
                </div>
                {s.orderNumber ? <p className="truncate text-[12px] text-[var(--muted)]">Order {s.orderNumber}</p> : null}
              </div>
              </button>
            </li>
          );
        })}
        {purchaseEntries.map((entry) => {
          const item = entry.item;
          const p = item.purchase ?? { status: "unknown" as const };
          const label =
            p.status === "trial"
              ? `Proefperiode${p.endsAt ? ` t/m ${formatDate(p.endsAt)}` : ""}`
              : p.status === "paid" || p.status === "unknown"
                ? "Betaald"
                : p.status === "renewed"
                  ? "Verlengd"
                  : p.status === "refunded"
                    ? "Terugbetaald"
                    : p.status === "cancelled"
                      ? "Opgezegd"
                      : "Betaald";
          const kleur =
            p.status === "trial"
              ? "var(--dot-orange)"
              : p.status === "refunded" || p.status === "cancelled"
                ? "var(--muted)"
                : "var(--dot-green)";
          return (
            <li key={`aankoop-${item.conversationId}`} className="flex items-start gap-3">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: kleur }} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-[var(--ink)]">
                  {label}
                  {entry.count > 1 ? <span className="font-normal text-[var(--muted)]"> · {entry.count}×</span> : null}
                </p>
                <div className="mt-1 flex items-baseline justify-between gap-3">
                  <p className="truncate text-[13px] text-[var(--ink)]">
                    {p.shop ?? item.from}
                    {p.product && p.product !== p.shop ? <span className="text-[var(--muted)]"> · {p.product}</span> : null}
                  </p>
                  {entry.amount > 0 ? (
                    <p className="shrink-0 text-[12px] text-[var(--muted)]">
                      € {entry.amount.toFixed(2).replace(".", ",")}
                    </p>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
        {paymentEntries.map((entry, index) => (
          <li key={`betaald-${entry.supplier}-${index}`} className="flex items-start gap-3">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--dot-green)" }} />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-[var(--ink)]">Betaald</p>
              <div className="mt-1 flex items-baseline justify-between gap-3">
                <p className="truncate text-[13px] text-[var(--ink)]">
                  {entry.supplier}
                </p>
                {entry.amount != null ? (
                  <p className="shrink-0 text-[12px] text-[var(--muted)]">€ {entry.amount.toFixed(2).replace(".", ",")}</p>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
      )}
      {openTrail ? (
        <ShipmentDialog
          shipment={openTrail.shipment}
          trail={openTrail.trail}
          onClose={() => setOpenTrail(null)}
        />
      ) : null}
    </section>
  );
}

function DaySummary({
  items,
  dailyChanges,
  dailyPaid,
  dailyAnswered,
}: {
  items: MailAssessment[];
  dailyChanges?: { date: string; orderStatus: number; paymentStatus: number };
  dailyPaid?: { date: string; count: number };
  dailyAnswered?: { date: string; count: number };
}) {
  // Counters only apply to today; yesterday's numbers must not linger.
  const today = startOfLogicalDay().toLocaleDateString("sv-SE");
  const orderChanges = dailyChanges?.date === today ? dailyChanges.orderStatus : 0;
  const paymentChanges = dailyChanges?.date === today ? dailyChanges.paymentStatus : 0;

  const startOfToday = startOfLogicalDay();
  const isToday = (iso?: string) => Boolean(iso) && new Date(iso!).getTime() >= startOfToday.getTime();

  let beantwoord = 0;
  let betaald = 0;
  let afgehandeld = 0;
  let gescand = 0;
  let bestellingen = 0;

  for (const item of items) {
    if (item.source === "scan" && isToday(item.receivedAt)) gescand += 1;
    if (item.sentAt && isToday(item.sentAt)) beantwoord += 1;
    // Alleen bestellingen van vandaag: het moment van binnenkomen telt, niet
    // wanneer de app hem verwerkte. Een oude mail die vandaag gearchiveerd wordt
    // is geen bestelling van vandaag. Eén mail met zowel betaling als aankoop
    // blijft één bestelling.
    if ((item.purchase || item.payment) && isToday(item.receivedAt)) {
      bestellingen += 1;
    }
    if (item.handledByUser && isToday(item.handledAt ?? item.paidAt)) {
      if (item.invoice) {
        betaald += 1;
      } else {
        afgehandeld += 1;
      }
    }
  }

  // A card can leave the list after being paid or answered; the day counters
  // keep those actions counted.
  if (dailyPaid?.date === today) betaald = Math.max(betaald, dailyPaid.count);
  if (dailyAnswered?.date === today) beantwoord = Math.max(beantwoord, dailyAnswered.count);

  return (
    <section className="mt-6">
      <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--ink)]">Weggewerkt</h2>
      {beantwoord === 0 &&
      betaald === 0 &&
      bestellingen === 0 &&
      afgehandeld === 0 &&
      gescand === 0 &&
      orderChanges === 0 &&
      paymentChanges === 0 ? (
        <p className="mt-4 text-[14px] text-[var(--muted)]">Je hebt nog helemaal niks gedaan vandaag</p>
      ) : (
        <ul className="mt-4 space-y-2 text-[14px] leading-6 text-[var(--ink)]">
          {beantwoord > 0 ? (
            <li className="flex items-center gap-2.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--dot-blue)" }} />
              <span>{beantwoord} {beantwoord === 1 ? "bericht beantwoord" : "berichten beantwoord"}</span>
            </li>
          ) : null}
          {bestellingen > 0 ? (
            <li className="flex items-center gap-2.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--dot-green)" }} />
              <span>
                {bestellingen} {bestellingen === 1 ? "bestelling verwerkt" : "bestellingen verwerkt"}
              </span>
            </li>
          ) : null}
          {betaald > 0 ? (
            <li className="flex items-center gap-2.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--dot-green)" }} />
              <span>{betaald} {betaald === 1 ? "factuur betaald" : "facturen betaald"}</span>
            </li>
          ) : null}
          {afgehandeld > 0 ? (
            <li className="flex items-center gap-2.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--muted)" }} />
              <span>{afgehandeld} {afgehandeld === 1 ? "bericht afgehandeld" : "berichten afgehandeld"}</span>
            </li>
          ) : null}
          {orderChanges > 0 ? (
            <li className="flex items-center gap-2.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--dot-blue)" }} />
              <span>{orderChanges} orderstatus bijgewerkt</span>
            </li>
          ) : null}
          {paymentChanges > 0 ? (
            <li className="flex items-center gap-2.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--dot-green)" }} />
              <span>{paymentChanges} betaalstatus bijgewerkt</span>
            </li>
          ) : null}
          {gescand > 0 ? (
            <li className="flex items-center gap-2.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--dot-orange)" }} />
              <span>{gescand} {gescand === 1 ? "factuur gescand" : "facturen gescand"}</span>
            </li>
          ) : null}
        </ul>
      )}
    </section>
  );
}
