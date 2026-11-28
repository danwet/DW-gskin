"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  enableNotifications,
  notificationPermission,
  notificationsSupported,
  setWantedOnThisDevice,
  wantedOnThisDevice,
} from "@/lib/desktop-notify";
import { timeZoneOf } from "./AgentInbox";
import { focusTabFor, InboxModal } from "./InboxGrid";
import { setFocusTab } from "@/lib/focus-tab";
import type { MailAssessment } from "@/lib/agent/types";

/**
 * Eén breedte voor alle schermen; het dashboard is daarin leidend. Zo ziet het
 * paneel er overal hetzelfde uit, ook op pagina's zonder rechterkolom.
 */
const PANEEL_BREEDTE = 316;

export function NotificationsBell({
  items,
  newItems = [],
  onToggleHandled,
  onDeclare,
  onOpenNewItem,
  onMarkAllNewRead,
  onRemoveItem,
  onReloadInbox,
  onInboxError,
}: {
  items: MailAssessment[];
  newItems?: MailAssessment[];
  onToggleHandled: (item: MailAssessment) => void;
  onDeclare: (item: MailAssessment, declaration: "none" | "pending" | "declared") => void;
  onOpenNewItem?: (item: MailAssessment) => void;
  onMarkAllNewRead?: () => void;
  onRemoveItem?: (conversationId: string) => void;
  onReloadInbox?: () => void;
  onInboxError?: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // Een portal mag pas na de eerste render: op de server bestaat document niet.
  const [gemonteerd, setGemonteerd] = useState(false);
  useEffect(() => setGemonteerd(true), []);
  const knopRef = useRef<HTMLButtonElement | null>(null);
  /** Positie van het paneel: rechts tegen de kantlijn, pijl onder het icoon. */
  const [plaats, setPlaat] = useState<{ top: number; right: number; pijl: number; breedte: number } | null>(null);
  const [selected, setSelected] = useState<MailAssessment | null>(null);
  const [desktop, setDesktop] = useState<NotificationPermission | "unsupported">("default");
  const [desktopWanted, setDesktopWanted] = useState(false);

  // De toestemming van de browser is de waarheid: staat hij op "granted", dan
  // zijn meldingen aan — ook als de lokale vlag ooit is blijven hangen.
  const syncPermission = useCallback(() => {
    if (typeof window === "undefined") return;
    const permission = notificationPermission();
    setDesktop(permission);
    if (permission === "granted") {
      setWantedOnThisDevice(true);
      setDesktopWanted(true);
    } else {
      setDesktopWanted(wantedOnThisDevice());
    }
  }, []);

  useEffect(() => {
    syncPermission();
    window.addEventListener("focus", syncPermission);
    return () => window.removeEventListener("focus", syncPermission);
  }, [syncPermission]);

  // Het paneel hangt vast aan het scherm: rechts tegen dezelfde kantlijn als de
  // topbalk, met de pijl precies onder het icoon. Bij een maatwijziging opnieuw.
  useEffect(() => {
    if (!open) return;
    const bereken = () => {
      const knop = knopRef.current;
      const rij = knop?.parentElement?.parentElement;
      if (!knop || !rij) return;
      const k = knop.getBoundingClientRect();

      // Op mobiel de volle breedte (met een kleine kantlijn), daarboven een
      // vaste breedte die rechts tegen de kantlijn van de pagina staat.
      const mobiel = window.matchMedia("(max-width: 767px)").matches;
      // Op mobiel dezelfde kantlijn als het icooneiland rechts heeft.
      const rand = 18;
      const breedte = mobiel
        ? Math.round(document.documentElement.clientWidth - rand * 2)
        : Math.min(PANEEL_BREEDTE, Math.max(220, Math.round(window.innerWidth - 48)));
      // Rechts uitlijnen tegen de kantlijn van de pagina. Die halen we uit de
      // rij van de topbalk zelf: dat is op elk scherm dezelfde rand, ook op
      // pagina's zonder rechterkolom.
      const rijVak = document.querySelector('[data-topbar-rij]')?.getBoundingClientRect();
      const kantlijn = Math.round(rijVak?.right ?? rij.getBoundingClientRect().right);
      const links = kantlijn - breedte;
      // clientWidth in plaats van innerWidth: zo valt de rand van het paneel
      // precies op de kantlijn, ook als er een scrollbar staat.
      const rechts = mobiel ? rand : Math.max(12, Math.round(document.documentElement.clientWidth - kantlijn));
      const pijl = Math.min(breedte - 20, Math.max(20, Math.round(k.left + k.width / 2 - links)));
      setPlaat({ top: Math.round(k.bottom + 15), right: rechts, pijl, breedte });
    };
    bereken();
    window.addEventListener("resize", bereken);
    window.addEventListener("scroll", bereken, { passive: true });
    return () => {
      window.removeEventListener("resize", bereken);
      window.removeEventListener("scroll", bereken);
    };
  }, [open]);

  // Klik buiten de popup (en buiten de bel zelf) sluit hem.
  const rootRef = useRef<HTMLDivElement | null>(null);
  // Het paneel hangt via een portal aan body en valt dus buiten rootRef; zonder
  // deze verwijzing sluit elke klik in het paneel hem meteen.
  const paneelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && (rootRef.current?.contains(target) || paneelRef.current?.contains(target))) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);
  // Het aanzetten van desktopmeldingen is een apparaatinstelling; die mag de
  // lijst en het bolletje nooit beïnvloeden. Nieuwe berichten blijven altijd
  // staan, ook als dit apparaat ze ook als systeemmelding toont.
  const desktopActive = desktop === "granted" && desktopWanted;
  const showNew = newItems.length > 0;
  const count = items.length + newItems.length;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        ref={knopRef}
        aria-label={`Notificaties (${count})`}
        aria-expanded={open}
        // !overflow-visible: de teller hangt boven de knop en mag niet afgeknipt
        // worden door de overflow van de glasstijl.
        className="focus-ring relative grid h-7 w-7 !overflow-visible place-items-center rounded-full text-[var(--ink)] hover:bg-black/[0.06] max-md:h-8 max-md:w-8"
      >
        <BellIcon />
        {count > 0 ? (
          <span className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--danger)] px-1 text-[10px] font-semibold text-white">
            {count}
          </span>
        ) : null}
      </button>

      {/* Het paneel hangt aan body: het glas-eiland heeft een backdrop-filter en
          dat maakt `fixed` ten opzichte van het eiland in plaats van het scherm. */}
      {open && gemonteerd
        ? createPortal(
            <>
          {/* Achtergrond die het paneel sluit; geen handje als cursor, want hier
              is niets om op te klikken behalve sluiten. */}
          <button
            type="button"
            aria-label="Sluiten"
            className="fixed inset-0 z-40 !cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            ref={paneelRef}
            className="glas-paneel fixed z-50 rounded-3xl p-2"
            style={
              plaats
                ? { top: plaats.top, right: plaats.right, width: plaats.breedte }
                : { top: 64, right: 24, width: PANEEL_BREEDTE }
            }
          >
            {plaats ? (
              <span className="glas-paneel-pijl max-md:hidden" style={{ left: plaats.pijl }} aria-hidden />
            ) : null}
            {items.length === 0 && !showNew ? (
              <p className="px-3 py-4 text-center text-[13px] text-[var(--muted)] max-md:text-[15px]">Geen notificaties.</p>
            ) : null}

            {showNew ? (
              <>
                <p className="px-3 pt-2 pb-1 text-[11px] font-medium tracking-[0.08em] text-[var(--muted)] max-md:text-[12px]">
                  {newItems.length === 1 ? "Nieuw bericht" : "Nieuwe berichten"}
                </p>
                <ul className="max-h-[240px] overflow-y-auto">
                  {newItems.map((item) => (
                    <li key={item.conversationId} className="border-t border-black/25 dark:border-[var(--line)]">
                      <button
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          // Land on the tab that holds this card and open it.
                          setFocusTab(focusTabFor(item));
                          setSelected(item);
                          onOpenNewItem?.(item);
                        }}
                        className="focus-ring w-full rounded-lg px-3 py-2 text-left transition-colors hover:bg-black/[0.045] dark:hover:bg-white/10"
                      >
                        <p className="truncate text-[13px] font-semibold text-[var(--ink)] max-md:text-[15px]">{item.from}</p>
                        <p className="truncate text-[12px] text-[var(--muted)] max-md:text-[13px]">{item.subject}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            {items.length > 0 ? (
              <>
                <p className="px-3 pt-2 pb-1 text-[11px] font-medium tracking-[0.08em] text-[var(--muted)] max-md:text-[12px]">Gemiste berichten</p>
                <ul className="max-h-[240px] overflow-y-auto">
                  {items.map((item) => (
                    <li key={item.conversationId} className="border-t border-black/55 dark:border-[var(--line)]">
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(item);
                          setOpen(false);
                        }}
                        className="focus-ring w-full rounded-lg px-3 py-2 text-left transition-colors hover:bg-black/[0.045] dark:hover:bg-white/10"
                      >
                        <p className="truncate text-[13px] font-semibold text-[var(--ink)] max-md:text-[15px]">{item.from}</p>
                        <p className="truncate text-[12px] text-[var(--muted)] max-md:text-[13px]">{item.subject}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            {/* Eén regel onderaan: links "gelezen" afvinken, rechts het
                belletje dat laat zien of meldingen aan staan. */}
            {notificationsSupported() || showNew ? (
              <div className="mt-2 flex items-center justify-between gap-2 border-t border-black/10 px-1 pt-2 dark:border-[var(--line)]">
                {showNew ? (
                  <button
                    type="button"
                    onClick={() => {
                      onMarkAllNewRead?.();
                      setOpen(false);
                    }}
                    title="Alles markeren als gelezen"
                    className="focus-ring flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium text-[var(--muted)] hover:text-[var(--ink)]"
                  >
                    <CheckIcon />
                    Gelezen
                  </button>
                ) : (
                  <span aria-hidden />
                )}

                {notificationsSupported() ? (
                  <button
                    type="button"
                    onClick={async () => {
                      // Alleen een apparaatinstelling: nooit iets als gelezen
                      // wegzetten en nooit de lijst of het bolletje verbergen.
                      if (desktopActive) return;
                      const result = await enableNotifications();
                      setDesktop(result);
                      setDesktopWanted(result === "granted");
                    }}
                    aria-label={
                      desktop === "denied"
                        ? "Meldingen zijn geblokkeerd in de browser"
                        : desktopActive
                          ? "Meldingen staan aan"
                          : "Meldingen aanzetten"
                    }
                    title={
                      desktop === "denied"
                        ? "Geblokkeerd in de browser"
                        : desktopActive
                          ? "Meldingen staan aan"
                          : "Meldingen aanzetten"
                    }
                    className={`focus-ring grid h-7 w-7 place-items-center rounded-full ${
                      desktopActive ? "text-[var(--ink)]" : "text-[var(--muted)] hover:text-[var(--ink)]"
                    }`}
                  >
                    {desktopActive ? <BellIcon /> : <BellOffIcon />}
                  </button>
                ) : null}
              </div>
            ) : null}

          </div>
            </>,
            document.body,
          )
        : null}

      {selected ? (
        <InboxModal
          item={selected}
          now={new Date()}
          timeZone={timeZoneOf()}
          onClose={() => setSelected(null)}
          onToggleHandled={onToggleHandled}
          onDeclare={onDeclare}
          onRemove={onRemoveItem}
          onReload={onReloadInbox}
          onError={onInboxError}
        />
      ) : null}
    </div>
  );
}

/** Vinkje voor de "gelezen"-actie. */
function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/** Bel met een streep erdoor: meldingen staan uit of zijn geblokkeerd. */
function BellOffIcon() {
  return (
    <svg className="max-md:h-[17px] max-md:w-[17px]" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
      <path d="M3 3l18 18" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}
