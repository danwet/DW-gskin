"use client";

import { useEffect } from "react";

type Sluier = "paneel" | "lade" | "sheet";

/**
 * Kleurt alles buiten het opengeklapte vlak mee met de sluier: de pagina-
 * achtergrond én de `theme-color`, zodat ook de strook in de veilige marge (en
 * de statusbalk op iOS) niet wit blijft.
 *
 * De kleur komt uit CSS (`color-mix` met `--page`), dus licht en donker volgen
 * de app vanzelf; hier wordt alleen het attribuut gezet en de gemeten kleur in
 * de meta-tag gekopieerd.
 */
export function useSluier(soort: Sluier | null): void {
  useEffect(() => {
    if (soort === null) return;
    const wortel = document.documentElement;
    wortel.dataset.sluier = soort;

    // De meta's moeten dezelfde kleur krijgen: Safari schildert de strook
    // bovenaan met theme-color, niet met de achtergrond van de pagina. Er zijn
    // er twee (licht en donker), dus allebei bijwerken.
    const metas = [...document.querySelectorAll('meta[name="theme-color"]')];
    const vorige = metas.map((meta) => meta.getAttribute("content"));
    const hex = naarHex(getComputedStyle(wortel).backgroundColor);
    if (hex) for (const meta of metas) meta.setAttribute("content", hex);

    return () => {
      delete wortel.dataset.sluier;
      const herstel = () => {
        metas.forEach((meta, index) => {
          const waarde = vorige[index];
          if (waarde === null) meta.removeAttribute("content");
          else meta.setAttribute("content", waarde);
        });
      };
      // iOS neemt de kleur van de strook met een vertraging over; daarom nog
      // een paar keer opnieuw zetten, anders blijft de oude kleur staan.
      herstel();
      window.setTimeout(herstel, 250);
      window.setTimeout(herstel, 900);
    };
  }, [soort]);
}

/** `color(srgb …)` en `rgb(…)` omzetten naar #rrggbb; anders null. */
function naarHex(waarde: string): string | null {
  const srgb = /color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/.exec(waarde);
  const rgb = /rgba?\((\d+), (\d+), (\d+)/.exec(waarde);
  const delen = srgb
    ? [Number(srgb[1]), Number(srgb[2]), Number(srgb[3])].map((v) => Math.round(v * 255))
    : rgb
      ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
      : null;
  if (!delen) return null;
  return `#${delen.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
