"use client";

import { TopBar } from "./TopBar";

/**
 * Eén vast stramien voor elke paginakop: klein kopje, de titel, en de
 * knoppencluster rechts uitgelijnd op de titelregel. Geen aparte marges per
 * pagina meer; alles zit hier.
 */
export function PageTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <header className="mb-[52px]">
      <p className="text-[11px] leading-none font-medium tracking-[0.16em] text-[var(--muted)] uppercase">
        {eyebrow}
      </p>
      <div className="mt-2 flex items-center justify-between gap-6">
        <h1 className="min-w-0 text-[36px] leading-[1.05] font-bold tracking-[-0.03em] text-[var(--ink)]">
          {title}
        </h1>
        <div className="flex shrink-0 items-center">
          <TopBar />
        </div>
      </div>
    </header>
  );
}
