"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useDragControls, useMotionValue } from "framer-motion";
import { X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useScrollShadow } from "@/hooks/use-scroll-shadow";
import { cn } from "@/lib/utils";

/**
 * Eén modal voor de hele app: sheet-stijl (schuift van onderen omhoog,
 * afgeronde bovenhoeken, grabber om weg te vegen). Achtergrond wit.
 * Met `kop` blijft de titel staan als dekkend vlak; de schaduw verschijnt
 * pas als de lijst niet meer bovenaan staat.
 */
export function Modal({
  open,
  onOpenChange,
  title,
  beschrijving,
  beschrijvingKlasse = "t-meta",
  children,
  className,
  kop,
  voet,
  onOpenAutoFocus,
  gecentreerd = false,
  waarschuwing = false,
  icon,
  linksboven,
  rechtsboven,
  bottomPadding = 0,
  vastHoogte = false,
  vasteHoogte = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Lege string = geen titel tonen (wel voor screenreaders). */
  title: string;
  /** Weglaten als de dialoog geen ondertitel heeft. */
  beschrijving?: React.ReactNode;
  /** Type-rol van de regel onder de titel. Standaard `t-meta`. */
  beschrijvingKlasse?: string;
  children?: React.ReactNode;
  className?: string;
  /** Blijft bij de titel staan, boven de scrollende children. */
  kop?: React.ReactNode;
  /** Blijft onder de scrollende lijst staan. */
  voet?: React.ReactNode;
  onOpenAutoFocus?: (event: Event) => void;
  /** Ruime, gecentreerde bevestigingssheet: alle tekst gecentreerd en groter. */
  gecentreerd?: boolean;
  /** Grote donkergroene waarschuwingsdriehoek met uitroepteken boven de titel. */
  waarschuwing?: boolean;
  /** Optioneel icoon boven de titel, zoals een vinkje of waarschuwing. */
  icon?: React.ReactNode;
  /** Vrij element linksboven op de sheet, naast de sluitknop. */
  linksboven?: React.ReactNode;
  /** Vrij element rechtsboven, links van de sluitknop. */
  rechtsboven?: React.ReactNode;
  /** Extra witte ruimte onderaan de content (in px). */
  bottomPadding?: number;
  /**
   * Vul de maximale hoogte vanaf de eerste render. Nodig als de inhoud pas
   * later komt: anders groeit de sheet zichtbaar zodra de lijst laadt.
   */
  vastHoogte?: boolean;
  /** Vaste hoge sheet zonder de 50%-naar-80%-beweging (agenda, leveringen). */
  vasteHoogte?: boolean;
}) {
  const gesplitst = kop !== undefined;
  const [lijst, setLijst] = useState<HTMLDivElement | null>(null);
  // In de eenvoudige modus scrolt de hele inhoud; die container bepaalt de gradient.
  const [lijstEenvoudig, setLijstEenvoudig] = useState<HTMLDivElement | null>(null);
  const schaduw = useScrollShadow(gesplitst ? lijst : lijstEenvoudig);
  const dragControls = useDragControls();

  // De sheet begint op de helft van het scherm. Scrollen laat hem meegroeien met
  // de beweging tot hij past (max 90% van het scherm); pas daarna scrolt de
  // inhoud. Past de inhoud al bij 60%, dan stopt hij daar en scrolt er niets.
  const groeiRef = useRef<HTMLDivElement | null>(null);
  const lijstRef = useRef<HTMLDivElement | null>(null);
  const [heeftVak, setHeeftVak] = useState(false);

  const scherm = typeof window === "undefined" ? 800 : window.innerHeight;
  const minHoogte = Math.round(scherm * 0.5);
  const maxHoogte = Math.round(scherm * 0.9);
  const hoogte = useMotionValue(minHoogte);

  // Hoe hoog moet de sheet zijn om de inhoud te laten passen? De bovenbalk
  // (h-14) zit buiten het scrollvak, dus die telt erbij.
  const pastHoogte = () => {
    const lijst = lijstRef.current;
    if (!lijst) return maxHoogte;
    return Math.min(maxHoogte, Math.max(minHoogte, lijst.scrollHeight + 56));
  };

  useEffect(() => {
    const vak = groeiRef.current;
    if (!vak || vasteHoogte) return;

    const groei = (delta: number, event: Event) => {
      const doel = pastHoogte();
      const huidig = hoogte.get();
      const volgende = Math.max(minHoogte, Math.min(doel, huidig + delta));
      const lijst = lijstRef.current;
      const bovenaan = !lijst || lijst.scrollTop <= 0;
      // Groeien doet de sheet alleen zolang de inhoud bovenaan staat; terug
      // scrollen gaat eerst door de inhoud en pas bovenaan krimpt de sheet.
      if (!bovenaan) return;
      const kanGroeien = delta > 0 ? huidig < doel - 0.5 : huidig > minHoogte + 0.5;
      if (!kanGroeien) return;
      event.preventDefault();
      hoogte.set(volgende);
    };

    const bijWiel = (event: WheelEvent) => groei(event.deltaY * 1.4, event);

    let startY: number | null = null;
    let startHoogte = 0;
    const bijAanraak = (event: TouchEvent) => {
      startY = event.touches[0]?.clientY ?? null;
      startHoogte = hoogte.get();
    };
    const bijBeweeg = (event: TouchEvent) => {
      const nu = event.touches[0]?.clientY ?? null;
      if (startY === null || nu === null) return;
      const doel = pastHoogte();
      const volgende = Math.max(minHoogte, Math.min(doel, startHoogte + (startY - nu)));
      const lijst = lijstRef.current;
      const bovenaan = !lijst || lijst.scrollTop <= 0;
      if (!bovenaan) return;
      const kanGroeien = startY - nu > 0 ? hoogte.get() < doel - 0.5 : hoogte.get() > minHoogte + 0.5;
      if (!kanGroeien) return;
      event.preventDefault();
      hoogte.set(volgende);
    };

    vak.addEventListener("wheel", bijWiel, { passive: false });
    vak.addEventListener("touchstart", bijAanraak, { passive: true });
    vak.addEventListener("touchmove", bijBeweeg, { passive: false });
    return () => {
      vak.removeEventListener("wheel", bijWiel);
      vak.removeEventListener("touchstart", bijAanraak);
      vak.removeEventListener("touchmove", bijBeweeg);
    };
  }, [vasteHoogte, heeftVak, hoogte, minHoogte, maxHoogte]);

  function bijVeeg(
    _event: MouseEvent | TouchEvent | PointerEvent,
    info: { offset: { y: number }; velocity: { y: number } },
  ) {
    // Omlaag trekken sluit de sheet; de hoogte volgt het scrollen.

    if (info.offset.y > 120 || info.velocity.y > 700) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        variant="sheet"
        onOpenAutoFocus={onOpenAutoFocus}
        {...(beschrijving === undefined ? { "aria-describedby": undefined } : {})}
        className={cn("bg-transparent p-0", className)}
      >
        <motion.div
          // iOS presenteert een sheet met een veer: stiffness 180, damping 22 is
          // de standaard die iOS 26 voor sheet-presentatie gebruikt (~0,82 damping,
          // gelijk aan Apple's spring(response: 0.5, dampingFraction: 0.825)).
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          transition={{ type: "spring", stiffness: 180, damping: 22, mass: 1 }}
          drag="y"
          dragListener={false}
          dragControls={dragControls}
          ref={(element) => {
            groeiRef.current = element;
            if (element && !heeftVak) setHeeftVak(true);
          }}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0.5, bottom: 0.6 }}
          onDragEnd={bijVeeg}
          style={{ height: vasteHoogte ? "85dvh" : hoogte }}
          className={cn(
            "sheet-licht relative flex w-full flex-col overflow-hidden rounded-t-[2.25rem] border border-hairline bg-[var(--bg)] text-ink",
          )}
        >
          {/* Bovenbalk: grabber, actie-pil links en de glazen sluitknop rechts.
              De inhoud schuift eronderdoor; de gradient verschijnt zodra er
              gescrold is. */}
          <div
            data-kleef-band="boven"
            data-schaduw={schaduw ? "aan" : "uit"}
            className={cn(
              "kleef pointer-events-none absolute inset-x-0 top-0 z-30 h-14",
              schaduw && "kleef-schaduw",
            )}
            style={{ ["--kleef-vlak" as string]: "var(--bg)" }}
          >
            <div
              aria-hidden
              onPointerDown={(event) => dragControls.start(event)}
              className="pointer-events-auto absolute inset-x-0 top-[9px] flex cursor-grab touch-none justify-center pt-[5px] pb-[7px] select-none"
            >
              <div className="h-1 w-9 rounded-full bg-black/20 dark:bg-white/25" />
            </div>

            <div className="pointer-events-none absolute inset-x-0 top-2.5 flex items-start justify-between px-4">
              <div className="pointer-events-auto flex items-center gap-2">{linksboven}</div>
              <div className="pointer-events-auto flex items-center gap-2">
                {rechtsboven}
                {/* Zelfde glas als de nieuwe-mail-knop. */}
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  aria-label="Sluiten"
                  className="btn-primary focus-ring grid h-8 w-8 place-items-center rounded-full text-[var(--ink)] max-md:h-9 max-md:w-9"
                >
                  <X aria-hidden className="size-4 max-md:size-[18px]" strokeWidth={2.5} />
                </button>
              </div>
            </div>
          </div>

          {gesplitst ? (
            <>
              <div
                data-kleef=""
                data-kleef-band="titel"
                data-schaduw={schaduw ? "aan" : "uit"}
                className={cn(
                  "kleef kleef-titel relative z-20 shrink-0 px-5 pt-16",
                  schaduw && "kleef-schaduw",
                )}
                style={{ ["--kleef-vlak" as string]: "var(--bg)" }}
              >
                <div className="flex flex-col gap-1 pb-4">
                  {waarschuwing && (
                    <div className="mb-2 flex justify-center" aria-hidden>
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        className="size-16 text-[var(--accent-fill)]"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path d="M12 3.34L2 20.66h20L12 3.34z" strokeLinejoin="round" />
                        <path d="M12 10v4M12 17h.01" strokeLinecap="round" strokeWidth={2.5} />
                      </svg>
                    </div>
                  )}
                  {icon && (
                    <div className="mb-2 flex justify-center" aria-hidden>
                      {icon}
                    </div>
                  )}
                  <DialogTitle className="t-title text-center text-ink">{title}</DialogTitle>
                  {beschrijving !== undefined && (
                    <DialogDescription className={cn(beschrijvingKlasse, "text-ink-muted")}>
                      {beschrijving}
                    </DialogDescription>
                  )}
                </div>
              </div>
              <div
                ref={(element) => {
                  setLijst(element);
                  lijstRef.current = element;
                }}
                className="relative flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain"
              >
                {kop !== undefined && (
                  <div
                    data-kleef-band="glas"
                    className="sticky top-0 z-10 shrink-0 bg-transparent px-5 pb-5"
                  >
                    {kop}
                  </div>
                )}
                <div className="flex min-h-full flex-col gap-5 px-5 pb-2">{children}</div>
              </div>
              {voet !== undefined && (
                <div className="mx-[5%] flex shrink-0 justify-center px-5 pt-2 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
                  {voet}
                </div>
              )}
            </>
          ) : (
            <>
              <div
                ref={(element) => {
                  setLijstEenvoudig(element);
                  lijstRef.current = element;
                }}
                className={cn(
                  "flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain",
                  gecentreerd ? "gap-6 px-6 pt-16 pb-4 text-center" : "gap-4 px-5 pt-16 pb-4",
                )}
              >
                {title !== "" || beschrijving !== undefined ? (
                  <div
                    className={cn("flex flex-col", gecentreerd ? "gap-2 pb-4" : "gap-1 pb-4")}
                    style={{ paddingBottom: `${bottomPadding}px` }}
                  >
                    {waarschuwing && (
                      <div className="mb-3 flex justify-center" aria-hidden>
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          className="size-16 text-[var(--accent-fill)]"
                          stroke="currentColor"
                          strokeWidth={3}
                        >
                          <path d="M12 3.34L2 20.66h20L12 3.34z" strokeLinejoin="round" />
                          <path d="M12 10v4M12 17h.01" strokeLinecap="round" strokeWidth={2.5} />
                        </svg>
                      </div>
                    )}
                    {icon && (
                      <div className="mb-3 flex justify-center" aria-hidden>
                        {icon}
                      </div>
                    )}
                    {title !== "" && (
                      <DialogTitle className="t-title text-center text-ink">{title}</DialogTitle>
                    )}
                    {beschrijving !== undefined && (
                      <DialogDescription
                        className={cn(
                          gecentreerd ? "t-body text-center" : beschrijvingKlasse,
                          "text-ink-muted",
                        )}
                      >
                        {beschrijving}
                      </DialogDescription>
                    )}
                  </div>
                ) : (
                  <DialogTitle className="sr-only">Dialoog</DialogTitle>
                )}
                {children}
              </div>
              {voet !== undefined && (
                <div className="mx-[5%] flex shrink-0 justify-center px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
                  {voet}
                </div>
              )}
            </>
          )}
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
