"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <button
        type="button"
        aria-label="Close draft"
        className="absolute inset-0 bg-[#12141c]/40"
        onClick={() => setDraft(null)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="draft-title"
        className="relative flex max-h-[calc(100dvh-2rem)] w-full max-w-[560px] flex-col overflow-hidden rounded-[24px] border border-[var(--line)] bg-[var(--card)] shadow-[var(--shadow)]"
      >
        <div className="flex items-center justify-between px-6 pt-5">
          <p className="text-[11px] font-medium tracking-[0.16em] text-[var(--muted)]">DRAFT</p>
          <button
            type="button"
            onClick={() => setDraft(null)}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-full text-[18px] text-[var(--muted)] hover:bg-[var(--bg)]"
          >
            ×
          </button>
        </div>

        <div className="overflow-y-auto px-6 pt-4 pb-2">
          <div className="flex items-center gap-3">
            <Avatar name={draft.from} />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-medium">{draft.from}</p>
              <p className="truncate text-[13px] text-[var(--muted)]">{draft.fromEmail}</p>
            </div>
          </div>
          <h2 id="draft-title" className="mt-5 text-[18px] font-semibold tracking-[-0.03em]">
            {draft.subject}
          </h2>

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

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-[var(--line)] px-6 py-4">
          <p className="min-w-48 flex-1 text-[13px] leading-5 whitespace-normal text-[var(--muted)]">{status}</p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="rounded-full px-3 py-2 text-[14px] text-[var(--muted)]"
            >
              Close
            </button>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(draft.draft);
                setCopied(true);
              }}
              className="rounded-full px-3 py-2 text-[14px] text-[var(--muted)]"
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              onClick={() => approveDraft(draft.id)}
              className={`rounded-full border border-[var(--line)] px-4 py-2 text-[14px] font-medium ${isApproved ? "text-[var(--green)]" : ""}`}
            >
              {isApproved ? "Approved" : "Approve"}
            </button>
          </div>
        </div>
      </div>
    </div>
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
