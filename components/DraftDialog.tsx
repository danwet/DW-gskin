"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/kit/modal";
import { opschonenHandtekening } from "@/lib/handtekening";
import { useApp } from "./AppProvider";

export function DraftDialog() {
  const { draft, setDraft, approved, approveDraft, updateDraftBody } = useApp();
  const [copied, setCopied] = useState(false);
  const [handtekening, setHandtekening] = useState("");
  const [conceptHtml, setConceptHtml] = useState("");
  const [bijlagen, setBijlagen] = useState<File[]>([]);
  const [sleep, setSleep] = useState(false);
  const [versturen, setVersturen] = useState<"rust" | "bezig" | "klaar" | "fout">("rust");
  const [fout, setFout] = useState<string | null>(null);
  const invoer = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!draft) return;
    setCopied(false);
    setVersturen("rust");
    setFout(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDraft(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draft, setDraft]);

  // De handtekening uit Instellingen, zodat je ziet wat er onder je tekst komt.
  useEffect(() => {
    if (!draft || handtekening) return;
    let alive = true;
    void (async () => {
      try {
        const response = await fetch("/api/settings", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { email?: { signature?: string } };
        if (alive) setHandtekening(data.email?.signature?.trim() ?? "");
      } catch {
        // Zonder handtekening blijft het veld gewoon leeg.
      }
    })();
    return () => {
      alive = false;
    };
  }, [draft, handtekening]);

  if (!draft) return null;

  const isApproved = approved.has(draft.id);

  const voegToe = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBijlagen((huidig) => [...huidig, ...Array.from(files)].slice(0, 10));
  };

  const verstuur = async () => {
    setVersturen("bezig");
    setFout(null);
    try {
      const vorm = new FormData();
      vorm.set("conversationId", draft.id);
      vorm.set("body", draft.draft);
      if (conceptHtml) vorm.set("html", conceptHtml);
      for (const bestand of bijlagen) vorm.append("files", bestand);
      const response = await fetch("/api/agent/send", { method: "POST", body: vorm });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !data?.ok) {
        setVersturen("fout");
        setFout(data?.error ?? "Versturen mislukte.");
        return;
      }
      setVersturen("klaar");
      setBijlagen([]);
    } catch {
      setVersturen("fout");
      setFout("Versturen mislukte: geen verbinding.");
    }
  };

  return (
    <Modal
      open
      onOpenChange={(open) => !open && setDraft(null)}
      title={draft.subject}
      beschrijving={`${draft.from}${draft.fromEmail ? ` · ${draft.fromEmail}` : ""}`}
      className="max-w-4xl"
      vastHoogte
      voet={
        <div className="flex w-full flex-col items-center gap-2">
          <p className="text-center text-[13px] leading-5 whitespace-normal text-ink-muted">
            {versturen === "klaar"
              ? "Verstuurd. De mail gaat naar je verzonden items."
              : fout
                ? fout
                : isApproved
                  ? "Goedgekeurd. Je kunt het antwoord ook direct versturen."
                  : "Lees het concept na, voeg eventueel een bijlage toe en verstuur."}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
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
            <button
              type="button"
              onClick={() => void verstuur()}
              disabled={versturen === "bezig" || !draft.draft.trim()}
              className="btn-primary focus-ring rounded-full px-5 py-2 text-[14px] disabled:opacity-60"
            >
              {versturen === "bezig" ? "Versturen…" : "Versturen"}
            </button>
          </div>
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-[1fr_240px]">
        {/* Links: het concept op een vel papier, met de handtekening eronder. */}
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
          <p className="text-[11px] font-medium tracking-[0.14em] text-[var(--muted)] uppercase">Concept</p>
          <ReplyField
            value={conceptHtml || escapeHtml(draft.draft)}
            onChange={(text, html) => {
              setConceptHtml(html);
              updateDraftBody(draft.id, text);
            }}
          />
          {handtekening ? (
            <div className="mt-3 border-t border-[var(--line)] pt-3">
              <p className="text-[11px] font-medium tracking-[0.14em] text-[var(--muted)] uppercase">
                Handtekening · wordt automatisch toegevoegd
              </p>
              {/* Alleen ter controle: de verzendlaag zet hem onder de mail, dus
                  je hoeft hem niet zelf te typen. Eerst opschonen, want een
                  handtekening uit een mailclient bevat soms kapotte tags. */}
              <div
                className="mt-1 text-[14px] leading-6 text-[var(--ink)] [&_img]:max-w-[220px]"
                dangerouslySetInnerHTML={{ __html: opschonenHandtekening(handtekening) }}
              />
            </div>
          ) : null}
        </div>

        {/* Rechts: bijlagen erin slepen. */}
        <div className="flex flex-col gap-2">
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setSleep(true);
            }}
            onDragLeave={() => setSleep(false)}
            onDrop={(event) => {
              event.preventDefault();
              setSleep(false);
              voegToe(event.dataTransfer.files);
            }}
            onClick={() => invoer.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") invoer.current?.click();
            }}
            className={`focus-ring flex min-h-[132px] cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border border-dashed px-3 py-4 text-center transition-colors ${
              sleep ? "border-[var(--blue)] bg-[var(--blue-soft)]" : "border-[var(--line)] bg-[var(--bg)]"
            }`}
          >
            <p className="text-[13px] font-medium text-[var(--ink)]">Sleep hier je bijlagen</p>
            <p className="text-[12px] text-[var(--muted)]">of klik om te kiezen</p>
            <input
              ref={invoer}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => voegToe(event.target.files)}
            />
          </div>

          {bijlagen.length > 0 ? (
            <ul className="space-y-1.5">
              {bijlagen.map((bestand, index) => (
                <li
                  key={`${bestand.name}-${index}`}
                  className="flex items-center justify-between gap-2 rounded-xl bg-[var(--bg)] px-2.5 py-1.5"
                >
                  <span className="truncate text-[12px] text-[var(--ink)]">{bestand.name}</span>
                  <button
                    type="button"
                    aria-label={`${bestand.name} verwijderen`}
                    onClick={() =>
                      setBijlagen((huidig) => huidig.filter((_, i) => i !== index))
                    }
                    className="shrink-0 rounded-full px-1.5 text-[13px] text-[var(--muted)] hover:text-[var(--danger)]"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <blockquote className="border-l-2 border-[var(--faint)] py-0.5 pl-4 md:col-span-2">
          <p className="text-[12px] text-[var(--muted)]">{draft.from}</p>
          <p className="mt-1 text-[14px] leading-6 text-[var(--muted)]">{draft.snippet}</p>
        </blockquote>
      </div>
    </Modal>
  );
}

/**
 * Een echt HTML-vlak: wat er in staat wordt opgemaakt getoond en als HTML
 * verstuurd (regels, nadruk, links). De tekstversie gaat mee als plain text.
 */
function ReplyField({
  value,
  onChange,
}: {
  value: string;
  onChange: (text: string, html: string) => void;
}) {
  const field = useRef<HTMLDivElement>(null);

  // Alleen bij een nieuwe waarde van buiten bijwerken, anders springt de cursor.
  useEffect(() => {
    const element = field.current;
    if (!element) return;
    if (element.innerHTML !== value) element.innerHTML = value;
  }, [value]);

  return (
    <div
      ref={field}
      contentEditable
      role="textbox"
      aria-multiline="true"
      aria-label="Concept"
      suppressContentEditableWarning
      onInput={(event) => {
        const element = event.currentTarget;
        onChange(element.innerText, element.innerHTML);
      }}
      className="mt-2 w-full bg-transparent text-[14px] leading-6 text-[var(--ink)] outline-none [font-family:Helvetica,Arial,sans-serif] [&_a]:text-[var(--blue)] [&_a]:underline"
    />
  );
}

/** Zet platte tekst om naar HTML, zodat het HTML-vak ook klopt zonder opmaak. */
function escapeHtml(text: string): string {
  const schoon = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const blokken = /\n\s*\n/.test(schoon) ? schoon.split(/\n\s*\n+/) : schoon.split(/\n/);
  return blokken
    .map((blok) => blok.trim())
    .filter(Boolean)
    .map((blok) => `<p>${blok.replace(/\n/g, "<br>")}</p>`)
    .join("");
}
