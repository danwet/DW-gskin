/**
 * The DW mark with the GSKIN wordmark underneath. Shared by the sidebar and
 * the login screen so the lockup stays identical in both places.
 */
export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <div className={className}>
      <img src="/dw-mark.png" alt="DW" className="h-auto w-full dark:invert" />
      <p className="mt-1.5 pl-[0.7em] text-center text-[10px] font-light uppercase tracking-[0.7em] text-[var(--muted)]">
        GSKIN
      </p>
    </div>
  );
}
