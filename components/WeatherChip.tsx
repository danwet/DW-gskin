"use client";

import { useApp } from "./AppProvider";

export function WeatherChip() {
  const { weather, weatherError } = useApp();

  return (
    <div
      className="flex items-center gap-2.5"
      title={weather?.city ? `${weather.condition} · ${weather.city}` : undefined}
    >
      <span className="text-[var(--orange)]">
        <WeatherIcon condition={weather?.condition ?? ""} />
      </span>
      <span>
        <span className="tnum block text-[14px] leading-none font-semibold text-[var(--ink)]">
          {weather ? `${weather.temperature}°` : weatherError ? "—" : "…"}
        </span>
        <span className="-mt-px block text-[11px] text-[var(--muted)]">
          {weather?.condition ?? (weatherError ? "Locatie onbekend" : "Weer laden")}
        </span>
      </span>
    </div>
  );
}

function WeatherIcon({ condition }: { condition: string }) {
  const rainy = /rain|drizzle|shower|storm/i.test(condition);
  const cloudy = /cloud|overcast|fog/i.test(condition);
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden="true">
      {rainy ? (
        <>
          <path d="M5 10h8a2.5 2.5 0 0 0 .4-5 3.5 3.5 0 0 0-6.7-1A2.8 2.8 0 0 0 5 10Z" fill="currentColor" />
          <path d="M7 12.5v2M11 12.5v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </>
      ) : cloudy ? (
        <path d="M5 13h8.2A2.8 2.8 0 0 0 14 7.6 3.6 3.6 0 0 0 7.2 6.4 3 3 0 0 0 5 13Z" fill="currentColor" />
      ) : (
        <>
          <circle cx="9" cy="9" r="3.2" fill="currentColor" />
          <path
            d="M9 1.8v1.8M9 14.4v1.8M1.8 9h1.8M14.4 9h1.8M3.6 3.6l1.3 1.3M13.1 13.1l1.3 1.3M14.4 3.6l-1.3 1.3M4.9 13.1l-1.3 1.3"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  );
}
