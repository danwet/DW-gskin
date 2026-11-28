"use client";

import { TopBar } from "./TopBar";
import { MenuIcoon, useMobielNav } from "./mobiel-nav";

/**
 * Eén vast stramien voor elke paginakop: klein kopje, de titel, en de
 * knoppencluster rechts uitgelijnd op de titelregel. Geen aparte marges per
 * pagina meer; alles zit hier.
 *
 * Op mobiel staat er geen witte balk boven: het menu-icoon linksboven en het
 * iconen-eiland rechtsboven liggen op de kop zelf, met de datum en de titel
 * eronder. Beide elementen staan absoluut, zodat er maar één TopBar bestaat.
 */
export function PageTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  const nav = useMobielNav();

  return (
    <header className="relative mb-[38px] md:mb-[52px]">
      <button
        type="button"
        onClick={() => nav.setOpen(!nav.open)}
        aria-label="Navigatie openen"
        aria-expanded={nav.open}
        aria-controls="mobile-sidebar"
        className="btn-secondary focus-ring grid h-12 w-12 place-items-center rounded-full text-[var(--ink)] md:hidden"
      >
        <MenuIcoon />
      </button>
      {/* Op mobiel trekt het eiland 8 px naar buiten, zodat het rechts gelijk
          staat met de focus-selector (die ook 8 px buiten de marge valt). */}
      <div className="absolute top-0 -right-2 flex items-center md:static md:float-right md:mt-[22px] md:right-0">
        <TopBar />
      </div>

      <p className="mt-[26px] text-[11px] leading-none font-medium tracking-[0.16em] text-[var(--muted)] uppercase md:mt-0">
        {eyebrow}
      </p>
      <div className="mt-2 flex items-center justify-between gap-6">
        <h1 className="min-w-0 text-[26px] leading-[1.08] font-bold tracking-[-0.025em] text-[var(--ink)] md:text-[36px] md:leading-[1.05] md:tracking-[-0.03em]">
          {title}
        </h1>
      </div>
    </header>
  );
}
