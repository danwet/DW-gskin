"use client";

import { useRef } from "react";
import { GlasDruppel } from "@/components/kit/glas-druppel";
import { GLAS_BALK, MORFING_BLUR } from "@/components/kit/vloeibaar-glas";
import { cn } from "@/lib/utils";

/** Unieke, stabiele layoutId per instantie (meerdere pillen mogen niet botsen). */
let druppelTeller = 0;

export type SelectieOptie<T extends string> = {
  waarde: T;
  /** Kort label in het vakje. */
  label: string;
  /** Volledige naam voor de tooltip, als het label is afgekort. */
  titel?: string;
  /** Klein getal in een balletje achter het label. */
  badge?: string;
  /** Nieuwe, ongelezen mail in deze categorie: het balletje wordt rood. */
  badgeAlert?: boolean;
};

/** Vijf of zes kolommen krijgen een vaste maximumbreedte. */
const VORM = {
  5: { max: "max-w-[15.5rem]", kolommen: "grid-cols-5" },
  6: { max: "max-w-[18.5rem]", kolommen: "grid-cols-6" },
} as const;

/**
 * Gelijke kolommen in een glazen bak, met één Liquid Glass-druppel die naar de
 * gekozen kolom schuift. Dezelfde druppel en dezelfde glazen achtergrond als de
 * menubalk.
 */
export function SelectorPill<T extends string>({
  opties,
  waarde,
  onChange,
  label = "Kies een optie",
  vullend = false,
  className,
}: {
  opties: readonly SelectieOptie<T>[];
  waarde: T;
  onChange: (waarde: T) => void;
  /** Naam van de radiogroep (voor screenreaders). */
  label?: string;
  /** Rek de bak over de resterende breedte, bijvoorbeeld naast een invoerveld. */
  vullend?: boolean;
  className?: string;
}) {
  const vorm =
    opties.length === 5 ? VORM[5] : opties.length === 6 ? VORM[6] : null;
  const zes = opties.length === 6;

  const druppelIdRef = useRef<string | null>(null);
  if (druppelIdRef.current === null) {
    druppelIdRef.current = `selectie-druppel-${druppelTeller++}`;
  }
  const druppelId = druppelIdRef.current;

  return (
    <div
      className={cn(
        "@container/cat flex min-w-0 justify-center",
        vullend ? "flex-1" : "w-full",
        className,
      )}
    >
      <div
        className={cn(
          GLAS_BALK,
          MORFING_BLUR,
          // overflow-VISIBLE: de opgetilde druppel (1,24×) mag niet afgeknipt worden.
          "relative w-full min-w-0 overflow-visible rounded-full p-1",
          !vullend && vorm?.max,
          !vullend &&
            zes &&
            "@max-[23.5rem]/cat:max-w-[17rem] @max-[23.5rem]/cat:p-0.5",
        )}
      >
        <div
          role="radiogroup"
          aria-label={label}
          className={cn("relative grid w-full min-w-0", vorm?.kolommen)}
          style={
            vorm === null
              ? { gridTemplateColumns: `repeat(${opties.length}, minmax(0, 1fr))` }
              : undefined
          }
        >
          {opties.map((optie) => {
            const actief = optie.waarde === waarde;
            return (
              <button
                key={optie.waarde}
                type="button"
                role="radio"
                aria-checked={actief}
                title={optie.titel ?? optie.label}
                onClick={() => onChange(optie.waarde)}
                className={cn(
                  "group relative t-meta h-8 min-w-0 whitespace-nowrap rounded-full transition-colors",
                  !vullend && zes && "cat-dicht",
                  // Alle labels even zwaar. De kleuren zijn omgedraaid ten
                  // opzichte van de eerste opzet: het actieve label staat op de
                  // volle tekstkleur, de rest is gedempt. Bij hover wisselen ze
                  // van rol, zodat je muis hetzelfde verschil maakt als de
                  // selectie.
                  actief
                    ? "font-normal! text-ink"
                    : "font-normal! text-ink-muted hover:text-ink",
                )}
              >
                {actief && <GlasDruppel layoutId={druppelId} className="inset-0" />}
                <span className="relative z-10 inline-flex items-center gap-1.5">
                  {optie.label}
                  {optie.badge ? (
                    <span
                      className={cn(
                        // Een omtrek in plaats van een gevuld balletje: dat
                        // weegt visueel minder naast het label.
                        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full border px-1.5 text-[10px] leading-none font-medium transition-colors",
                        optie.badgeAlert
                          ? "border-[var(--dot-red)] text-[var(--dot-red)]"
                          // Inactief: bij hover licht de cirkel mee op met het
                          // label, anders blijft hij achter.
                          : !actief
                            // Ook hier omgedraaid: de inactieve teller staat
                            // op de volle tekstkleur, de actieve op de gedempte.
                            ? "border-[var(--muted)]/70 text-[var(--muted)] group-hover:border-[var(--ink)] group-hover:text-[var(--ink)]"
                          : actief
                            // Zelfde kleur als het label: de cirkel en het
                            // cijfer erven de tekstkleur van de actieve pil.
                            ? "border-current text-current"
                            : "",
                      )}
                    >
                      {optie.badge}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
