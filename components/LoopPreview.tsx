"use client";

import { useEffect } from "react";
import { useApp } from "./AppProvider";

export function LoopPreview() {
  const { preview, setPreview, checked, completeLoop } = useApp();

  useEffect(() => {
    if (!preview) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreview(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview, setPreview]);

  if (!preview) return null;

  const done = checked.has(preview.id);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <button
        type="button"
        aria-label="Close preview"
        className="absolute inset-0 bg-[#12141c]/40"
        onClick={() => setPreview(null)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="loop-title"
        className="relative max-h-[calc(100dvh-2rem)] w-full max-w-[520px] overflow-y-auto rounded-[24px] border border-[var(--line)] bg-[var(--card)] p-6 shadow-[var(--shadow)]"
      >
        <p className="text-[11px] font-medium tracking-[0.16em] text-[var(--muted)]">STILL NEEDS YOU</p>
        <h2 id="loop-title" className="mt-1 text-[20px] font-semibold tracking-[-0.03em]">
          {preview.title}
        </h2>
        <p className="mt-1 text-[14px] leading-6 text-[var(--muted)]">{preview.detail}</p>

        {preview.mail ? (
          <div className="mt-4 rounded-2xl bg-[var(--bg)] p-4">
            <p className="text-[11px] font-medium tracking-[0.14em] text-[var(--muted)]">FROM THE EMAIL</p>
            <p className="mt-2 text-[15px] font-medium">{preview.mail.from}</p>
            <p className="text-[13px] text-[var(--muted)]">{preview.mail.fromEmail}</p>
            <p className="mt-2 text-[14px] font-medium">{preview.mail.subject}</p>
            <p className="mt-1 text-[14px] leading-6 text-[var(--muted)]">{preview.mail.snippet}</p>
          </div>
        ) : null}

        {preview.hold ? (
          <div className="mt-3 rounded-2xl bg-[var(--bg)] p-4">
            <p className="text-[11px] font-medium tracking-[0.14em] text-[var(--muted)]">ON THE CALENDAR</p>
            <p className="mt-2 text-[12px] font-medium tracking-wide text-[var(--orange)]">{preview.hold.when}</p>
            <p className="mt-1 text-[15px] font-medium">{preview.hold.title}</p>
            <p className="text-[14px] leading-6 text-[var(--muted)]">{preview.hold.detail}</p>
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-[var(--line)] pt-4">
          <p className="min-w-48 flex-1 text-[13px] leading-5 text-[var(--muted)]">
            {done ? "This task is done." : "Marking this done checks it off in Dashboard."}
          </p>
          <button
            type="button"
            disabled={done}
            onClick={() => {
              completeLoop(preview.id);
              setPreview(null);
            }}
            className="shrink-0 rounded-full bg-[var(--accent)] px-4 py-2 text-[14px] font-medium text-white disabled:opacity-50"
          >
            {done ? "Done" : "Mark done"}
          </button>
        </div>
      </div>
    </div>
  );
}
