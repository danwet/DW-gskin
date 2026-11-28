"use client";

import { useEffect, useRef } from "react";

type Kant = "links" | "rechts";

type RandVeeg = {
  /** Aangeroepen zodra er vanaf de rand wordt gesleept, met de afstand vanaf die rand. */
  onStart?: (afstand: number) => void;
  /** Tijdens het slepen: afstand vanaf de rand, in pixels. */
  onMove?: (afstand: number) => void;
  /** Bij loslaten: hoeveel er vanaf de rand is afgelegd en of het genoeg was. */
  onEnd?: (afstand: number, genoeg: boolean) => void;
};

/**
 * Veeg vanaf een schermrand naar binnen. Het vlak volgt de vinger: `onMove`
 * krijgt de afstand tot de rand, zodat het paneel of de lade meeschuift in
 * plaats van pas bij loslaten open te klappen.
 */
export function useRandVeeg(kant: Kant, veger: RandVeeg, zone = 18): void {
  // De callbacks veranderen bij elke render; via een ref blijven de luisteraars
  // staan in plaats van bij elke render opnieuw te worden aangehangen.
  const ref = useRef(veger);
  ref.current = veger;

  useEffect(() => {
    if (!window.matchMedia("(max-width: 767px)").matches) return;
    const vlak = document.querySelector("main");
    if (!vlak) return;

    let sleep: { start: number; laatste: number; actief: boolean } | null = null;

    const inZone = (x: number) => (kant === "links" ? x <= zone : x >= window.innerWidth - zone);
    const afstandVan = (x: number) => (kant === "links" ? x : window.innerWidth - x);

    const begin = (event: TouchEvent) => {
      const raak = event.touches[0];
      if (!raak) return;
      // In een sheet (of ander dialoog) doet de randveeg niet mee.
      const doel = event.target as Element | null;
      if (doel?.closest?.('[role="dialog"], [data-slot="dialog-content"]')) {
        sleep = null;
        return;
      }
      if (!inZone(raak.clientX)) {
        sleep = null;
        return;
      }
      sleep = { start: afstandVan(raak.clientX), laatste: afstandVan(raak.clientX), actief: true };
      ref.current.onStart?.(sleep.start);
    };

    const schuif = (event: TouchEvent) => {
      if (!sleep?.actief) return;
      const raak = event.touches[0];
      if (!raak) return;
      const afstand = afstandVan(raak.clientX);
      // Terug naar de rand toe: dan weer afbreken.
      if (afstand < 8 && Math.abs(afstand - sleep.start) > 24) {
        sleep.actief = false;
        return;
      }
      sleep.laatste = afstand;
      ref.current.onMove?.(afstand);
    };

    const eindig = () => {
      const stand = sleep;
      sleep = null;
      if (!stand?.actief) return;
      ref.current.onEnd?.(stand.laatste, stand.laatste >= 70);
    };

    vlak.addEventListener("touchstart", begin, { passive: true });
    vlak.addEventListener("touchmove", schuif, { passive: true });
    vlak.addEventListener("touchend", eindig, { passive: true });
    vlak.addEventListener("touchcancel", eindig, { passive: true });
    return () => {
      vlak.removeEventListener("touchstart", begin);
      vlak.removeEventListener("touchmove", schuif);
      vlak.removeEventListener("touchend", eindig);
      vlak.removeEventListener("touchcancel", eindig);
    };
  }, [kant, zone]);
}
