"use client";

import { useEffect } from "react";
import { Modal } from "@/components/kit/modal";
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
    <Modal
      open
      onOpenChange={(open) => !open && setPreview(null)}
      title={preview.title}
      beschrijving={preview.detail}
      voet={
        <div className="flex w-full flex-col items-center gap-2">
          <p className="text-center text-[13px] leading-5 text-ink-muted">
            {done ? "Deze taak is klaar." : "Aanvinken zet hem af in het dashboard."}
          </p>
          <button
            type="button"
            disabled={done}
            onClick={() => {
              completeLoop(preview.id);
              setPreview(null);
            }}
            className="shrink-0 rounded-full bg-[var(--accent-fill)] px-4 py-2 text-[14px] font-medium text-[#f6f4ef] disabled:opacity-50"
          >
            {done ? "Klaar" : "Aanvinken"}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">

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

      </div>
    </Modal>
  );
}
