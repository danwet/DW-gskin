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
 *
 * Bij het sluiten wordt de kleur opnieuw uit de pagina gemeten in plaats van
 * teruggezet naar een eerder bewaarde waarde. Anders kon een oude kleur blijven
 * hangen zodra er twee vlakken in beeld waren geweest.
 */
/**
 * Stapel van wat er open is. Sluit het bovenste vlak, dan neemt het vlak
 * eronder de kleur over; is alles dicht, dan gaat de kleur terug naar de pagina.
 */
const stapel: Sluier[] = [];

export function useSluier(soort: Sluier | null): void {
  useEffect(() => {
    if (soort === null) return;
    stapel.push(soort);
    pasToe();

    return () => {
      const index = stapel.lastIndexOf(soort);
      if (index >= 0) stapel.splice(index, 1);
      pasToe();
    };
  }, [soort]);
}

function pasToe(): void {
  const wortel = document.documentElement;
  const boven = stapel[stapel.length - 1];
  if (boven) wortel.dataset.sluier = boven;
  else delete wortel.dataset.sluier;
  zetMeta(kleurVan(wortel));
}

/**
 * De achtergrondkleur die nu op het document staat, als #rrggbb. Is de kleur
 * nog niet toegepast (transparant), dan liever niets dan zwart.
 */
function kleurVan(wortel: HTMLElement): string | null {
  const waarde = getComputedStyle(wortel).backgroundColor;
  if (/rgba\(0, 0, 0, 0\)|transparent/.test(waarde)) return null;
  return naarHex(waarde);
}

function zetMeta(hex: string | null): void {
  if (!hex) return;
  const metas = [...document.querySelectorAll('meta[name="theme-color"]')];
  // iOS neemt de kleur met een vertraging over; daarom een paar keer opnieuw.
  for (const meta of metas) meta.setAttribute("content", hex);
  window.setTimeout(() => {
    for (const meta of metas) meta.setAttribute("content", hex);
  }, 250);
  window.setTimeout(() => {
    for (const meta of metas) meta.setAttribute("content", hex);
  }, 900);
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
