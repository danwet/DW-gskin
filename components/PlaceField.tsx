"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Zoekt echt bestaande adressen terwijl je typt, zoals Apple Calendar: je kiest
 * uit een lijst en wat er in het veld komt te staan is een adres dat andere apps
 * als locatie herkennen. Zonder keuze blijft het een gewoon tekstveld.
 */
export function PlaceField({
  id,
  value,
  onChange,
  disabled,
  className,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement | null>(null);

  // Alleen zoeken als de gebruiker typt; een gekozen adres hoeft niet opnieuw.
  useEffect(() => {
    const query = value.trim();
    if (query.length < 3) {
      setSuggestions([]);
      return;
    }
    let alive = true;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/calendar/place?q=${encodeURIComponent(query)}`, {
          cache: "no-store",
        });
        const data = (await response.json()) as { places?: string[] };
        if (!alive) return;
        setSuggestions(data.places ?? []);
      } catch {
        if (alive) setSuggestions([]);
      }
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [value]);

  // Klik buiten de lijst sluit hem.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const choose = (place: string) => {
    onChange(place);
    setOpen(false);
    setActive(-1);
  };

  return (
    <div ref={boxRef} className="relative">
      <input
        id={id}
        type="text"
        autoComplete="off"
        value={value}
        placeholder="Straat en plaats"
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (!open || suggestions.length === 0) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((current) => (current + 1) % suggestions.length);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((current) => (current <= 0 ? suggestions.length - 1 : current - 1));
          } else if (event.key === "Enter" && active >= 0) {
            event.preventDefault();
            choose(suggestions[active]);
          } else if (event.key === "Escape") {
            setOpen(false);
            setActive(-1);
          }
        }}
        className={className}
        role="combobox"
        aria-expanded={open && suggestions.length > 0}
        aria-controls={`${id}-places`}
        aria-autocomplete="list"
      />

      {open && suggestions.length > 0 ? (
        <ul
          id={`${id}-places`}
          role="listbox"
          className="absolute inset-x-0 top-full z-40 mt-1 max-h-56 overflow-y-auto rounded-2xl border border-hairline bg-[var(--card)] py-1 shadow-[var(--shadow)]"
        >
          {suggestions.map((place, index) => (
            <li key={place} role="option" aria-selected={index === active}>
              <button
                type="button"
                onClick={() => choose(place)}
                onMouseEnter={() => setActive(index)}
                className={`block w-full px-3 py-2 text-left text-[13px] leading-5 text-ink ${
                  index === active ? "bg-[var(--bg)]" : ""
                }`}
              >
                {place}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
