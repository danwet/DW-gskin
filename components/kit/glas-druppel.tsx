"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Strakke spring voor de glasdruppel (positie). */
const DRUPPEL_LENTE = { type: "spring", stiffness: 420, damping: 30, mass: 0.85 } as const;

/** Vloeiende schaal: korte lift, rustige terugkeer. */
const SCHAAL_LENTE = { type: "spring", stiffness: 380, damping: 32, mass: 0.75 } as const;

/** Kleur/schaduw faden even vloeiend mee. */
const VLOEI = { duration: 0.2, ease: "easeInOut" } as const;

/** Hoe lang de druppel 'wit en groot' blijft voordat hij terugkrimpt. */
const GROOT_MS = 140;

/**
 * Ruststand: subtiel verticaal verloop van donkerder bovenaan (#DFDDDE) naar
 * #E2E0E1 / #E3E1E2 — de actieve selectiepil.
 */
// Ruststand = exact het glas van de actieknoppen (.btn-primary), zodat de
// selectie er hetzelfde uitziet als de knoppen en menu-items. De beweging zit
// in de tussenstand hieronder, niet in een afwijkende rustkleur.
const RUST_VULLING =
  "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.35) 14%, rgba(255,255,255,0.16) 55%, rgba(255,255,255,0.35) 100%)";

// Light variant van de donkere pil: exact dezelfde opbouw (fel wit bovenin,
// doorzichtige buik, lichte onderrand) maar met een iets koelere tint in de
// buik, zodat hij op een bijna-witte balk toch als glas leest.
const RUST_VULLING_LICHT =
  "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.42) 14%, rgba(226,232,241,0.30) 55%, rgba(255,255,255,0.46) 100%)";

/** Licht mode: dezelfde schaduw als .btn-primary in licht mode. */
// Zelfde vier lagen als donker mode, met de rollen omgedraaid: heldere rand
// boven, donkere rand onder, rim en een schaduw die hem optilt.
const RUST_SCHADUW_LICHT =
  "inset 0 1px 0 rgba(255,255,255,1), inset 0 -1px 0 rgba(120,132,152,0.35), inset 0 0 0 1px rgba(255,255,255,0.85), 0 1px 1px rgba(16,24,40,0.05), 0 3px 8px rgba(16,24,40,0.04)";

/** Tijdens de overgang: doorschijnend wit glas, met dezelfde stopstructuur. */
const GLAS_VULLING =
  "linear-gradient(180deg, rgba(255,255,255,0.66) 0%, rgba(255,255,255,0.34) 7%, rgba(255,255,255,0.26) 26%, rgba(255,255,255,0.24) 74%, rgba(255,255,255,0.42) 100%)";

/** Vier lagen, exact parallel aan GLAS_SCHADUW, zodat Framer Motion ze kan faden. */
// Rust: heldere rand boven, donkere rand onder, zachte gloed binnenin en een
// schaduw eronder — dat tilt hem van de balk af.
/** Donker mode: dezelfde schaduw als .btn-primary in donker mode. */
const RUST_SCHADUW =
  "inset 0 1px 0 rgba(255,255,255,0.75), inset 0 -1px 0 rgba(255,255,255,0.3), inset 0 0 0 1px rgba(255,255,255,0.22), 0 1px 2px rgba(0,0,0,0.35), 0 8px 20px rgba(0,0,0,0.3)";
const GLAS_SCHADUW =
  "inset 0 1.5px 2px rgba(255,255,255,0.95), inset 2px 0 3px rgba(0,175,255,0.35), inset -2px 0 3px rgba(255,75,0,0.35), 0 8px 22px rgba(0,0,0,0.15)";

/**
 * De iOS Liquid Glass-druppel. Tijdens de overgang tilt hij op en wordt hij
 * een zwevende glazen druppel; na `GROOT_MS` krimpt hij vloeiend terug naar de
 * vlakke ruststand.
 *
 * In `layoutId`-stand is dit een gedeeld element dat tussen de vakjes glijdt.
 * `layoutId` moet uniek zijn per selectiebalk.
 *
 * De buitenste laag doet alleen de positie; schaal en glas zitten op de
 * binnenlaag, zodat de scale-animatie niet met de positie vecht.
 */
/** Volgt de donkere modus van deze app (klasse op <html>, geen media query). */
function useIsDark() {
  const [donker, setDonker] = useState(false);
  useEffect(() => {
    const lees = () => setDonker(document.documentElement.classList.contains("dark"));
    lees();
    const kijker = new MutationObserver(lees);
    kijker.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => kijker.disconnect();
  }, []);
  return donker;
}

export function GlasDruppel({
  layoutId,
  className,
}: {
  layoutId: string;
  className?: string;
}) {
  const [bezig, setBezig] = useState(false);
  const donker = useIsDark();
  const rustVulling = donker ? RUST_VULLING : RUST_VULLING_LICHT;
  const rustSchaduw = donker ? RUST_SCHADUW : RUST_SCHADUW_LICHT;
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  function tilOp() {
    setBezig(true);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setBezig(false), GROOT_MS);
  }

  return (
    <motion.div
      layoutId={layoutId}
      className={cn("absolute", className)}
      initial={false}
      transition={DRUPPEL_LENTE}
      onLayoutAnimationStart={tilOp}
      onLayoutAnimationComplete={() => setBezig(false)}
    >
      <motion.div
        className="h-full w-full rounded-full"
        initial={false}
        transition={{
          ...SCHAAL_LENTE,
          backgroundImage: VLOEI,
          boxShadow: VLOEI,
        }}
        animate={{
          scaleY: bezig ? 1.24 : 1,
          scaleX: bezig ? 1.12 : 1,
          backgroundImage: bezig ? GLAS_VULLING : rustVulling,
          // In donker mode een lichte ondergrond onder het verloop, net als de
          // menukeuze: zo blijft de pil licht en de donkere tekst leesbaar.
          // Zelfde ondertint als .btn-primary: 0.08 in donker, 0.06 in licht.
          backgroundColor: bezig
            ? undefined
            : donker
              ? "rgba(255,255,255,0.08)"
              : // Een heel lichte grijze tint: daardoor leest de pil als glas op
                // een witte balk in plaats van als een wit vlak.
                "rgba(148,163,184,0.14)",
          boxShadow: bezig ? GLAS_SCHADUW : rustSchaduw,
        }}
        style={{
          // In rust hetzelfde glasfilter als de knoppen; tijdens de beweging de
          // lens die het liquid-effect geeft.
          backdropFilter: bezig
            ? "url(#liquid-lens) blur(1px) contrast(1.05)"
            : "blur(22px) saturate(1.9)",
          WebkitBackdropFilter: bezig
            ? "url(#liquid-lens) blur(1px) contrast(1.05)"
            : "blur(22px) saturate(1.9)",
        }}
      />
    </motion.div>
  );
}
