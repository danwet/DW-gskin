"use client";

import { createContext, useContext } from "react";

/** De navigatie op mobiel: de knop staat in de paginakop, de lade in de shell. */
type MobielNav = { open: boolean; setOpen: (open: boolean) => void };

const MobielNavContext = createContext<MobielNav | null>(null);

export const MobielNavProvider = MobielNavContext.Provider;

export function useMobielNav(): MobielNav {
  return useContext(MobielNavContext) ?? { open: false, setOpen: () => undefined };
}

export function MenuIcoon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}
