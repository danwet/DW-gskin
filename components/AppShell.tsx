"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { signOutOfDashboard } from "@/app/login/actions";
import { useApp } from "./AppProvider";
import { DraftDialog } from "./DraftDialog";
import { LoopPreview } from "./LoopPreview";
import { PaymentModal } from "./PaymentModal";
import { SettingsDialog } from "./SettingsDialog";

const NAV = [
  { href: "/", label: "Focus", icon: "home" as const },
  { href: "/scan", label: "Uploaden", icon: "scan" as const },
  { href: "/bewaren", label: "Bewaren", icon: "save" as const },
  { href: "/agent", label: "Agent", icon: "agent" as const },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { setSettingsOpen, account, settings, updateSettings } = useApp();

  const pinned = settings.sidebarMode === "pinned";
  const [floatingOpen, setFloatingOpen] = useState(false);
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
      if (asideRef.current?.contains(document.activeElement)) return;
      setFloatingOpen(false);
    }, 250);
  }, []);

  const edgeEnter = useCallback(() => {
    cancelTimers();
    openTimer.current = window.setTimeout(() => setFloatingOpen(true), 100);
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

  const closeOverlay = useCallback(() => {
    setFloatingOpen(false);
    setMobileOpen(false);
  }, []);

  const sidebar = (
    <SidebarContent
      pathname={pathname}
      accountLabel={accountLabel}
      email={account?.email}
      initial={initial}
      settingsTheme={settings.theme}
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
    <div className="min-h-screen md:flex">
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

      <main className="min-w-0 flex-1">{children}</main>

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
  pinned: boolean;
  onTogglePinned: () => void;
  onOpenSettings: () => void;
  onNavigate: () => void;
}) {
  return (
    <div className="sidebar-enter flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-3 pt-5 pb-2">
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
      <div className="mt-2 px-1">
        <img src="/dw-mark.png" alt="DW" className="h-auto w-full dark:invert" />
      </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-5">
      <nav className="mt-4 flex flex-col gap-1" aria-label="Hoofdnavigatie">
        {NAV.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`focus-ring relative flex items-center gap-3 rounded-[14px] px-3 py-2.5 text-[14px] whitespace-nowrap transition-colors ${
                active ? "glass-active font-semibold" : "text-[var(--ink)]/85 hover:bg-[var(--glass-bg-soft)]"
              }`}
            >
              <NavIcon name={link.icon} active={active} />
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto pt-4">
        <div className="flex items-center gap-2.5 rounded-xl px-2 py-1.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--ink)] text-[13px] font-semibold text-[var(--surface)]">
            {initial}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-medium leading-tight">{accountLabel}</span>
            <span className="block truncate text-[12px] text-[var(--muted)]">{email || "Ingelogd"}</span>
          </span>
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Instellingen openen"
            className="focus-ring grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--glass-bg-soft)]"
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

function NavIcon({ name, active }: { name: "home" | "today" | "inbox" | "agent" | "scan" | "missed" | "save"; active: boolean }) {
  const color = active ? "var(--active-ink)" : "var(--muted)";
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
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1-2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z" />
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