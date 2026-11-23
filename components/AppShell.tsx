"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { signOutOfDashboard } from "@/app/login/actions";
import { useApp, type SyncProgressView } from "./AppProvider";
import { DraftDialog } from "./DraftDialog";
import { LoopPreview } from "./LoopPreview";
import { NewMailSheet } from "./NewMailSheet";
import { PaymentModal } from "./PaymentModal";
import { SettingsDialog } from "./SettingsDialog";
import { BrandMark } from "./BrandMark";

const NAV = [
  { href: "/", label: "Focus", icon: "home" as const },
  { href: "/scan", label: "Uploaden", icon: "scan" as const },
  { href: "/bewaren", label: "Bewaard", icon: "save" as const },
  { href: "/afgehandeld", label: "Afgehandeld", icon: "done" as const },
  { href: "/agent", label: "Agent", icon: "agent" as const },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { setSettingsOpen, account, settings, updateSettings, syncProgress } = useApp();

  const pinned = settings.sidebarMode === "pinned";
  const [floatingOpen, setFloatingOpen] = useState(false);
  const [nieuweMail, setNieuweMail] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const asideRef = useRef<HTMLElement | null>(null);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);

  const fullName = account?.name?.trim() ?? "";
  const accountLabel = fullName ? fullName.split(/\s+/)[0] : account?.email || "Account";
  const initial = accountLabel.trim().charAt(0).toUpperCase() || "?";

  const cancelTimers = useCallback(() => {
    if (openTimer.current) window.clearTimeout(openTimer.current);
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
  }, []);

  const openFloating = useCallback(() => {
    cancelTimers();
    setFloatingOpen(true);
  }, [cancelTimers]);

  const scheduleClose = useCallback(() => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      // Een klik op een menu-item laat de knop focus houden; zonder dit bleef de
      // balk daardoor staan terwijl de muis al weg was.
      const actief = document.activeElement;
      if (actief instanceof HTMLElement && asideRef.current?.contains(actief)) actief.blur();
      setFloatingOpen(false);
    }, 250);
  }, []);

  // A quick swipe across the screen should not drag the sidebar open, so the
  // edge waits a moment and only opens if the pointer is still there.
  const pointerOnEdge = useRef(false);
  const edgeEnter = useCallback(() => {
    cancelTimers();
    pointerOnEdge.current = true;
    openTimer.current = window.setTimeout(() => {
      if (pointerOnEdge.current) setFloatingOpen(true);
    }, 300);
  }, [cancelTimers]);

  const edgeLeave = useCallback(() => {
    pointerOnEdge.current = false;
    cancelTimers();
  }, [cancelTimers]);

  // Escape: close an open menu first, then the floating panel, then the mobile drawer.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (!pinned && floatingOpen) {
        setFloatingOpen(false);
      } else if (mobileOpen) {
        setMobileOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pinned, floatingOpen, mobileOpen]);

  // Close the theme picker on outside click.
  useEffect(() => () => cancelTimers(), [cancelTimers]);

  // Alleen de mobiele drawer sluit bij navigeren; de zwevende balk blijft staan
  // tot de muis eruit gaat.
  const closeOverlay = useCallback(() => {
    setMobileOpen(false);
  }, []);

  const sidebar = (
    <SidebarContent
      pathname={pathname}
      accountLabel={accountLabel}
      email={account?.email}
      initial={initial}
      settingsTheme={settings.theme}
      syncProgress={syncProgress}
      pinned={pinned}
      onTogglePinned={() => {
        const next = pinned ? "floating" : "pinned";
        updateSettings({ sidebarMode: next });
        if (next === "floating") setFloatingOpen(true);
      }}
      onOpenSettings={() => setSettingsOpen(true)}
      onNavigate={closeOverlay}
    />
  );

  return (
    <div className="min-h-screen md:flex md:h-screen md:overflow-hidden">
      {/* Pinned sidebar (desktop) */}
      {pinned ? (
        <aside
          className="glass-panel sticky top-0 z-30 hidden h-screen w-[224px] shrink-0 flex-col md:flex"
          style={{ borderRadius: 0 }}
        >
          <span className="glass-reflect" aria-hidden="true" />
          {sidebar}
        </aside>
      ) : null}

      {/* Floating sidebar (desktop) */}
      {!pinned ? (
        <>
          <div
            className="fixed top-0 left-0 z-40 hidden h-full w-[50px] md:block"
            aria-hidden="true"
            onMouseEnter={edgeEnter}
            onMouseLeave={edgeLeave}
          />
          <aside
            id="app-sidebar"
            ref={asideRef}
            inert={!floatingOpen}
            onMouseEnter={cancelTimers}
            onMouseLeave={scheduleClose}
            onFocus={cancelTimers}
            className={`glass-float fixed top-4 bottom-4 left-4 z-50 hidden w-[224px] flex-col transition-transform duration-[180ms] md:flex ${
              floatingOpen ? "translate-x-0" : "-translate-x-[120%]"
            }`}
          >
            <span className="glass-reflect" aria-hidden="true" />
            {sidebar}
          </aside>
        </>
      ) : null}

      {/* Mobile top bar + drawer */}
      <header className="glass-panel sticky top-0 z-30 flex items-center justify-between px-4 py-3 md:hidden">
        <span className="glass-reflect" aria-hidden="true" />
        <img src="/dw-mark.png" alt="DW" className="h-7 w-auto dark:invert" />
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Navigatie openen"
          aria-expanded={mobileOpen}
          aria-controls="mobile-sidebar"
          className="glass-chip focus-ring grid h-7 w-7 place-items-center rounded-full text-[var(--ink)]"
        >
          <MenuIcon />
        </button>
      </header>
      {mobileOpen ? (
        <aside
          id="mobile-sidebar"
          className="glass-float fixed top-0 left-0 z-50 flex h-full w-[78vw] max-w-[300px] flex-col md:hidden"
        >
          {sidebar}
        </aside>
      ) : null}

      <main className="min-w-0 flex-1 md:min-h-0 md:overflow-y-auto">
        {/* Ruimte die de oude bovenbalk innam, zodat elke pagina op dezelfde
            hoogte begint. De kop zelf zit in PageTitle. */}
        <div className="h-5" aria-hidden="true" />
        {children}
      </main>

      {/* Nieuwe mail: grote glazen knop rechtsonder, altijd bereikbaar. */}
      <button
        type="button"
        onClick={() => setNieuweMail(true)}
        aria-label="Nieuwe mail"
        // btn-primary zet zelf `position: relative`; !fixed houdt de knop rechtsonder.
        className="btn-primary focus-ring !fixed right-6 bottom-6 z-40 grid h-14 w-14 place-items-center rounded-full shadow-[var(--shadow)]"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
      <NewMailSheet open={nieuweMail} onClose={() => setNieuweMail(false)} />
      <SettingsDialog />
      <DraftDialog />
      <LoopPreview />
      <PaymentModal />
    </div>
  );
}

function SidebarContent({
  pathname,
  accountLabel,
  email,
  initial,
  settingsTheme,
  syncProgress,
  pinned,
  onTogglePinned,
  onOpenSettings,
  onNavigate,
}: {
  pathname: string;
  accountLabel: string;
  email: string | undefined;
  initial: string;
  settingsTheme: string;
  syncProgress: SyncProgressView | null;
  pinned: boolean;
  onTogglePinned: () => void;
  onOpenSettings: () => void;
  onNavigate: () => void;
}) {
  // Two phases, two counters: fetching mail, then judging it. Showing the fetch
  // counter during triage made the bar look stuck.
  const triaging = syncProgress?.phase === "triaging";
  const syncingNow = syncProgress?.phase === "importing" || triaging;
  // During triage the useful total is what still needs judging plus what is
  // already done; threadsImported is 0 when nothing new arrived.
  const remaining = syncProgress?.pending ?? 0;
  // Tijdens het beoordelen is er geen betrouwbare noemer: het aantal dat al
  // beoordeeld is telt op over alle rondes. We tonen daarom wat er nog ligt.
  const total = triaging ? null : (syncProgress?.total ?? null);
  const shown = triaging ? remaining : (syncProgress?.imported ?? 0);
  const importTotal = syncingNow && total ? total : null;
  const percent = importTotal ? Math.min(100, Math.round(((total ?? 0) - shown) / (total ?? 1) * 100)) : 0;
  const progressLabel = triaging ? "Beoordelen" : "Indexeren";
  const progressUnit = triaging ? "te gaan" : "berichten";

  return (
    <div className="sidebar-enter relative z-10 flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-3 pt-5 pb-5">
        <div className="flex justify-start px-1">
          <button
            type="button"
            onClick={onTogglePinned}
            aria-label={pinned ? "Zijbalk losmaken" : "Zijbalk vastzetten"}
            title={pinned ? "Zijbalk losmaken" : "Zijbalk vastzetten"}
            className="glass-chip focus-ring hidden h-7 w-7 place-items-center rounded-full text-[var(--muted)] md:grid"
          >
            <PanelIcon />
          </button>
        </div>
        <BrandMark className="mt-2 px-1" />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-5">
      <nav className="mt-[2.4rem] flex flex-col gap-1" aria-label="Hoofdnavigatie">
        {NAV.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`focus-ring relative flex items-center gap-3 py-2.5 pr-3 pl-5 text-[14px] whitespace-nowrap transition-colors ${
                active
                  ? "glas-selectie rounded-full font-semibold"
                  : "rounded-[14px] text-[var(--ink)]/85 hover:bg-[var(--glass-bg-soft)]"
              }`}
            >
              <NavIcon name={link.icon} active={active} />
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto pt-4">
        {importTotal ? (
          <div className="mb-[32px] px-2">
            <p className="text-[11px] leading-4 text-[var(--muted)]">
              {progressLabel} {shown} van {importTotal} {progressUnit}
            </p>
            <div className="mt-1 h-[3px] w-full overflow-hidden rounded-full bg-[var(--line)]">
              <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${percent}%` }} />
            </div>
          </div>
        ) : null}
        <div className="flex items-center gap-2.5 rounded-xl px-2 py-1.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--ink)] text-[13px] font-semibold text-[var(--surface)]">
            {initial}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-medium leading-tight">{accountLabel || "Account"}</span>
            <span className="block truncate text-[12px] text-[var(--muted)]">{email || "Geen e-mail"}</span>
          </span>
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Instellingen openen"
            className="focus-ring relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--glass-bg-soft)]"
          >
            <GearIcon />
          </button>
        </div>

        <form action={signOutOfDashboard} className="mt-2 px-1">
          <button type="submit" className="focus-ring rounded-md text-[12px] font-medium text-[var(--muted)] hover:text-[var(--blue)]">
            Uitloggen
          </button>
        </form>
      </div>
      </div>
    </div>
  );
}

function NavIcon({ name, active }: { name: "home" | "today" | "inbox" | "agent" | "scan" | "missed" | "save" | "done"; active: boolean }) {
  // Het actieve item is glas, geen blauw: het icoon volgt de zwarte tekst.
  const color = active ? "#141915" : "var(--muted)";
  const common = {
    width: 19,
    height: 19,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (name === "home") {
    return (
      <svg {...common} style={{ color }}>
        <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-5H9v5H5a1 1 0 0 1-1-1v-9.5Z" />
      </svg>
    );
  }
  if (name === "scan") {
    return (
      <svg {...common} style={{ color }}>
        <path d="M5 3h9l4 4v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
        <path d="M14 3v4h4" />
        <path d="M4 10h16" />
        <path d="M4 14h16" />
      </svg>
    );
  }
  if (name === "missed") {
    return (
      <svg {...common} style={{ color }}>
        <path d="M4 5h16l-6 7v5l-4 2v-7L4 5Z" />
      </svg>
    );
  }
  if (name === "save") {
    return (
      <svg {...common} style={{ color }}>
        <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" />
      </svg>
    );
  }
  if (name === "done") {
    return (
      <svg {...common} style={{ color }}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="m8.4 12.3 2.4 2.4 4.8-4.9" />
      </svg>
    );
  }
  if (name === "agent") {
    return (
      <svg {...common} style={{ color }}>
        <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z" />
        <path d="M19 15l.7 1.8L21.5 17l-1.8.7L19 19.5l-.7-1.8L16.5 17l1.8-.7L19 15Z" />
      </svg>
    );
  }
  return (
    <svg {...common} style={{ color }}>
      <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z" />
      <path d="M19 15l.7 1.8L21.5 17l-1.8.7L19 19.5l-.7-1.8L16.5 17l1.8-.7L19 15Z" />
    </svg>
  );
}

function PanelIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M8 4v16" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}