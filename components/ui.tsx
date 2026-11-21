import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[22px] border border-[var(--line)] bg-[var(--card)] p-5 shadow-[var(--shadow)] ${className}`}
    >
      {children}
    </section>
  );
}

export function CardHeading({
  eyebrow,
  title,
  meta,
  metaTone,
}: {
  eyebrow: string;
  title: string;
  meta?: string;
  metaTone?: "green" | "muted";
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <p className="text-[11px] font-medium tracking-[0.16em] text-[var(--muted)]">{eyebrow}</p>
        <h2 className="mt-1 text-[17px] font-semibold tracking-[-0.02em]">{title}</h2>
      </div>
      {meta ? (
        <p
          className={`pt-1 text-[13px] font-medium ${metaTone === "green" ? "text-[var(--green)]" : "text-[var(--muted)]"}`}
        >
          {meta}
        </p>
      ) : null}
    </div>
  );
}

const avatarTones = ["#3a6bff", "#ef9f1a", "#7b61ff", "#1b8f4e", "#d4537e"];

export function Avatar({ name }: { name: string }) {
  const color = avatarTones[name.charCodeAt(0) % avatarTones.length];
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[13px] font-semibold text-white"
      style={{ background: color }}
    >
      {initial}
    </span>
  );
}

export function DonePill({ children, tone = "green" }: { children: ReactNode; tone?: "green" | "orange" }) {
  const color =
    tone === "orange"
      ? "bg-[var(--orange-soft)] text-[var(--orange)]"
      : "bg-[var(--green-soft)] text-[var(--green)]";
  return (
    <span className={`rounded-full px-2.5 py-1 text-[12px] font-medium ${color}`}>
      {children}
    </span>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border ${
        checked
          ? "border-[var(--accent)] bg-[var(--accent)] text-white"
          : "border-[var(--line)] bg-transparent"
      }`}
    >
      {checked ? (
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path
            d="M2.2 6.2 4.7 8.7 9.8 3.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </button>
  );
}
