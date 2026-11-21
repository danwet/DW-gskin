"use client";

import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard render error:", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-screen max-w-[640px] flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-[var(--ink)]">
        Er ging iets mis bij het laden
      </h1>
      <p className="text-[14px] leading-6 text-[var(--muted)]">
        {error.message || "Onbekende fout."}
        {error.digest ? <span className="mt-1 block font-mono text-[12px]">{error.digest}</span> : null}
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-full bg-[var(--accent)] px-4 py-2 text-[14px] font-medium text-white"
        >
          Opnieuw proberen
        </button>
        <button
          type="button"
          onClick={() => window.location.assign("/login")}
          className="glass-chip rounded-full px-4 py-2 text-[14px] font-medium text-[var(--ink)]"
        >
          Naar inloggen
        </button>
      </div>
    </div>
  );
}
