"use client";

import { formatBriefDay, formatClock, greetingFor, greetingName } from "@/lib/greeting";
import { useApp } from "./AppProvider";

export function PageHeader({ action }: { action?: "refresh" | "none" }) {
  const { now, ready, settings, account, weather, weatherError, refresh, refreshing } = useApp();
  const greet = ready ? greetingFor(now) : null;
  const name = greetingName(settings.displayName, account?.name);

  return (
    <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <p className="text-[12px] font-medium tracking-[0.16em] text-[var(--muted)]">
          {ready ? formatBriefDay(now) : "TODAY"}
        </p>
        <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.045em] sm:text-[36px] lg:text-[40px]">
          {greet ? `${greet.greeting}, ${name}.` : "Hello."}
        </h1>
        <p className="mt-2 text-[15px] text-[var(--muted)]">
          {greet ? greet.line : "Here's what deserves your attention."}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 lg:pt-8">
        <div
          className="flex items-center gap-3 rounded-full border border-[var(--line)] bg-[var(--card)] py-1.5 pr-4 pl-2 shadow-[var(--shadow)]"
          title={weather?.city ? `${weather.condition} · ${weather.city}` : undefined}
        >
          <WeatherIcon condition={weather?.condition ?? ""} />
          <span>
            <span className="block text-[14px] leading-none font-semibold">
              {weather ? `${weather.temperature}°` : weatherError ? "—" : "…"}
            </span>
            <span className="mt-1 block text-[11px] text-[var(--muted)]">
              {weather?.condition ?? (weatherError ? "Location unavailable" : "Finding weather")}
            </span>
          </span>
        </div>
        {action !== "none" ? (
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing || !ready}
            className="glass-chip focus-ring rounded-full px-4 py-2.5 text-[14px] font-medium text-[var(--ink)] disabled:opacity-60"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        ) : null}
      </div>
    </header>
  );
}

function WeatherIcon({ condition }: { condition: string }) {
  const rainy = /rain|drizzle|shower|storm/i.test(condition);
  const cloudy = /cloud|overcast|fog/i.test(condition);
  return (
    <span className="grid h-9 w-9 place-items-center rounded-full bg-[#fff6df] text-[#e2a21a] dark:bg-[#3a2e14]">
      {rainy ? (
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <path d="M5 10h8a2.5 2.5 0 0 0 .4-5 3.5 3.5 0 0 0-6.7-1A2.8 2.8 0 0 0 5 10Z" fill="currentColor" />
          <path d="M7 12.5v2M11 12.5v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      ) : cloudy ? (
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <path d="M5 13h8.2A2.8 2.8 0 0 0 14 7.6 3.6 3.6 0 0 0 7.2 6.4 3 3 0 0 0 5 13Z" fill="currentColor" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <circle cx="9" cy="9" r="3.2" fill="currentColor" />
          <path
            d="M9 1.8v1.8M9 14.4v1.8M1.8 9h1.8M14.4 9h1.8M3.6 3.6l1.3 1.3M13.1 13.1l1.3 1.3M14.4 3.6l-1.3 1.3M4.9 13.1l-1.3 1.3"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      )}
    </span>
  );
}
