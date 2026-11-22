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
const RUST_VULLING =
  "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.40) 6%, rgba(190,192,198,0.60) 28%, rgba(199,201,207,0.55) 72%, rgba(255,255,255,0.80) 100%)";

/**
 * Licht mode: de balk is daar bijna wit, dus een bijna-witte druppel valt weg.
 * Een koeler en iets dieper lichaam houdt hem zichtbaar, met dezelfde witte
 * randen als glans.
 */
const RUST_VULLING_LICHT =
  "linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(243,244,247,0.85) 6%, rgba(196,198,205,0.9) 28%, rgba(203,205,212,0.85) 72%, rgba(240,241,244,0.95) 100%)";

/** Licht mode: iets diepere schaduw, zodat hij echt boven de balk ligt. */
const RUST_SCHADUW_LICHT =
  "inset 0 1px 0 rgba(255,255,255,1), inset 0 -1px 1px rgba(0,0,0,0.18), inset 0 0 0 0.5px rgba(255,255,255,0.6), 0 1.5px 4px rgba(0,0,0,0.22)";

/** Tijdens de overgang: doorschijnend wit glas, met dezelfde stopstructuur. */
const GLAS_VULLING =
  "linear-gradient(180deg, rgba(255,255,255,0.66) 0%, rgba(255,255,255,0.34) 7%, rgba(255,255,255,0.26) 26%, rgba(255,255,255,0.24) 74%, rgba(255,255,255,0.42) 100%)";

/** Vier lagen, exact parallel aan GLAS_SCHADUW, zodat Framer Motion ze kan faden. */
// Rust: heldere rand boven, donkere rand onder, zachte gloed binnenin en een
// schaduw eronder — dat tilt hem van de balk af.
const RUST_SCHADUW =
  "inset 0 1px 0 rgba(255,255,255,1), inset 0 -1px 1px rgba(0,0,0,0.14), inset 0 0 0 0.5px rgba(255,255,255,0.55), 0 1px 3px rgba(0,0,0,0.16)";
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
          boxShadow: bezig ? GLAS_SCHADUW : rustSchaduw,
        }}
        style={{
          backdropFilter: bezig ? "url(#liquid-lens) blur(1px) contrast(1.05)" : "none",
          WebkitBackdropFilter: bezig ? "url(#liquid-lens) blur(1px) contrast(1.05)" : "none",
        }}
      />
    </motion.div>
  );
}
