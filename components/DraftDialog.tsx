"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Modal } from "@/components/kit/modal";
import { useApp } from "./AppProvider";
import { Avatar } from "./ui";

export function DraftDialog() {
  const { draft, setDraft, approved, approveDraft, updateDraftBody } = useApp();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!draft) return;
    setCopied(false);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDraft(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draft, setDraft]);

  if (!draft) return null;

  const isApproved = approved.has(draft.id);
  const status = isApproved
    ? "Approved. Copy this reply into your mail app."
    : "Approve this reply, then copy it into your mail app.";

  return (
    <Modal
      open
      onOpenChange={(open) => !open && setDraft(null)}
      title={draft.subject}
      beschrijving={`${draft.from}${draft.fromEmail ? ` · ${draft.fromEmail}` : ""}`}
      className="max-w-4xl"
      vastHoogte
      voet={
        <div className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <p className="min-w-48 flex-1 text-[13px] leading-5 whitespace-normal text-ink-muted">{status}</p>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={() => setDraft(null)} className="rounded-full px-3 py-2 text-[14px] text-ink-muted">
              Sluiten
            </button>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(draft.draft);
                setCopied(true);
              }}
              className="rounded-full px-3 py-2 text-[14px] text-ink-muted"
            >
              {copied ? "Gekopieerd" : "Kopiëren"}
            </button>
            <button
              type="button"
              onClick={() => approveDraft(draft.id)}
              className={`rounded-full border border-hairline px-4 py-2 text-[14px] font-medium ${isApproved ? "text-[var(--green)]" : "text-ink"}`}
            >
              {isApproved ? "Goedgekeurd" : "Goedkeuren"}
            </button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">

          {isApproved ? (
            <div className="mt-5 space-y-4 text-[15px] leading-7">
              {draft.draft.split(/\n{2,}/).map((block) => (
                <p key={block} className="whitespace-pre-wrap">
                  {block}
                </p>
              ))}
            </div>
          ) : (
            <ReplyField
              value={draft.draft}
              onChange={(text) => updateDraftBody(draft.id, text)}
            />
          )}

          <blockquote className="mt-8 border-l-2 border-[var(--faint)] py-0.5 pl-4">
            <p className="text-[12px] text-[var(--muted)]">{draft.from}</p>
            <p className="mt-1 text-[14px] leading-6 text-[var(--muted)]">{draft.snippet}</p>
          </blockquote>
      </div>
    </Modal>
  );
}

function ReplyField({ value, onChange }: { value: string; onChange: (text: string) => void }) {
  const field = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const element = field.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={field}
      value={value}
      aria-label="Reply"
      onChange={(event) => onChange(event.target.value)}
      className="mt-5 w-full resize-none rounded-2xl bg-[var(--bg)] px-4 py-3 text-[15px] leading-7 outline-none"
    />
  );
}
