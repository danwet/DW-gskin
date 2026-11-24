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
  "linear-gradient(180deg, #747678 0%, #6e7071 55%, #6a6c6e 100%)";

// Licht mode volgt het macOS-segment: geen verloop, geen glans, één egale
// grijstint die iets donkerder is dan het eiland eronder.
const RUST_VULLING_LICHT =
  "linear-gradient(180deg, #e4e4e4 0%, #e6e6e6 55%, #e9e9e9 100%)";

/** Licht mode: dezelfde schaduw als .btn-primary in licht mode. */
// Zelfde vier lagen als donker mode, met de rollen omgedraaid: heldere rand
// boven, donkere rand onder, rim en een schaduw die hem optilt.
const RUST_SCHADUW_LICHT =
  "inset 0 1px 0 rgba(255,255,255,0.65), inset 0 -1px 0 rgba(255,255,255,0.5), 0 0.5px 1px rgba(0,0,0,0.05)";

/**
 * Tijdens de overgang: hetzelfde segment, iets doorschijnender. In licht mode
 * wit, in donker mode de donkere tint — anders flitst de pil in dark mode wit
 * door het beeld.
 */
const GLAS_VULLING =
  "linear-gradient(180deg, rgba(255,255,255,0.66) 0%, rgba(255,255,255,0.34) 7%, rgba(255,255,255,0.26) 26%, rgba(255,255,255,0.24) 74%, rgba(255,255,255,0.42) 100%)";
const GLAS_VULLING_DONKER =
  "linear-gradient(180deg, rgba(116,118,120,0.92) 0%, rgba(110,112,113,0.9) 55%, rgba(106,108,110,0.92) 100%)";

/** Vier lagen, exact parallel aan GLAS_SCHADUW, zodat Framer Motion ze kan faden. */
// Rust: heldere rand boven, donkere rand onder, zachte gloed binnenin en een
// schaduw eronder — dat tilt hem van de balk af.
/** Donker mode: dezelfde schaduw als .btn-primary in donker mode. */
const RUST_SCHADUW =
  "inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -1px 0 rgba(0,0,0,0.2)";
const GLAS_SCHADUW =
  "inset 0 1.5px 2px rgba(255,255,255,0.95), inset 2px 0 3px rgba(0,175,255,0.35), inset -2px 0 3px rgba(255,75,0,0.35), 0 8px 22px rgba(0,0,0,0.15)";
/** Zelfde bewegingstand, maar zonder de witte glans: donker blijft donker. */
const GLAS_SCHADUW_DONKER =
  "inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -1px 0 rgba(0,0,0,0.2), 0 8px 22px rgba(0,0,0,0.45)";

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
  // Meteen de juiste stand lezen: anders rendert de pil één frame in de lichte
  // variant en flitst hij bij het wisselen van tab in donker mode wit op.
  const [donker, setDonker] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  );
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
          backgroundImage: bezig ? (donker ? GLAS_VULLING_DONKER : GLAS_VULLING) : rustVulling,
          // De vulling komt volledig uit het verloop; een extra ondertint zou het
          // segment lichter maken dan bedoeld.
          backgroundColor: "transparent",
          boxShadow: bezig ? (donker ? GLAS_SCHADUW_DONKER : GLAS_SCHADUW) : rustSchaduw,
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
