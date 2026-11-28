"use client";

import { useEffect } from "react";

/**
 * Houdt `theme-color` gelijk aan de achtergrond van de pagina. Nodig omdat de
 * app zijn eigen thema kiest (los van het systeemthema): een media-query in de
 * meta geeft dan de verkeerde kleur, en dan blijft de strook boven de pagina
 * (en de statusbalk op iOS) wit.
 *
 * Is er een paneel, lade of sheet open, dan beheert `useSluier` de kleur en
 * laat deze component hem met rust.
 */
export function ThemeKleur(): null {
  useEffect(() => {
    const zet = () => {
      if (document.documentElement.dataset.sluier) return;
      const meta = document.querySelector('meta[name="theme-color"]');
      if (!meta) return;
      const kleur = getComputedStyle(document.documentElement).getPropertyValue("--page").trim();
      if (kleur) meta.setAttribute("content", kleur);
    };

    zet();
    const kijker = new MutationObserver(zet);
    kijker.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-sluier"],
    });
    return () => kijker.disconnect();
  }, []);

  return null;
}
