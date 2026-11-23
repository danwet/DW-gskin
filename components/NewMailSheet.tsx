"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/kit/modal";
import { opschonenHandtekening } from "@/lib/handtekening";

const VELD =
  "veld-underline mt-1 px-0 py-2 text-[14px] text-ink placeholder:text-ink-muted";

/**
 * Een nieuwe mail: dezelfde opbouw als het concept in een gesprek, maar zonder
 * bestaand gesprek. Met de handtekening uit Instellingen, die je hier ook kunt
 * aanpassen voordat je verstuurt.
 */
export function NewMailSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [aan, setAan] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [onderwerp, setOnderwerp] = useState("");
  const [toonCc, setToonCc] = useState(false);
  const [tekst, setTekst] = useState("");
  const [html, setHtml] = useState("");
  const [bijlagen, setBijlagen] = useState<File[]>([]);
  const [sleep, setSleep] = useState(false);
  const [stand, setStand] = useState<"rust" | "bezig" | "klaar" | "fout">("rust");
  const [melding, setMelding] = useState<string | null>(null);
  const [beginHandtekening, setBeginHandtekening] = useState("");
  const invoer = useRef<HTMLInputElement>(null);
  const veld = useRef<HTMLDivElement>(null);
  const [handtekeningKlaar, setHandtekeningKlaar] = useState(false);
  const [spellBezig, setSpellBezig] = useState(false);

  // Bij openen de handtekening ophalen en het vlak leegmaken.
  useEffect(() => {
    if (!open) return;
    if (veld.current) delete veld.current.dataset.gevuld;
    setStand("rust");
    setMelding(null);
    setHandtekeningKlaar(false);
    let alive = true;
    void (async () => {
      try {
        const response = await fetch("/api/settings", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { email?: { signature?: string } };
        if (!alive) return;
        const schoon = opschonenHandtekening(data.email?.signature?.trim() ?? "");
        setBeginHandtekening((huidig) => huidig || schoon);
      } catch {
        // Zonder handtekening blijft het vlak leeg.
      } finally {
        if (alive) setHandtekeningKlaar(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open]);

  // Het vel één keer vullen: lege regel bovenaan, handtekening eronder, en de
  // cursor meteen boven de handtekening.
  useEffect(() => {
    const element = veld.current;
    if (!element || !handtekeningKlaar || element.dataset.gevuld) return;
    element.innerHTML = `<p><br></p>${
      beginHandtekening ? `<div class="handtekening" data-handtekening="1" style="margin-top:16px">${beginHandtekening}</div>` : ""
    }`;
    element.dataset.gevuld = "1";
    element.focus();
    const eerste = element.firstElementChild;
    if (eerste) {
      const bereik = document.createRange();
      bereik.setStart(eerste, 0);
      bereik.collapse(true);
      const selectie = window.getSelection();
      selectie?.removeAllRanges();
      selectie?.addRange(bereik);
    }
  }, [handtekeningKlaar, beginHandtekening]);

  /**
   * De AI haalt de spelfouten eruit. De handtekening onderaan het vel blijft
   * staan: alleen de getypte tekst wordt vervangen.
   */
  const corrigeer = async () => {
    const element = veld.current;
    if (!element || spellBezig) return;
    // Alles boven de handtekening is de getypte tekst.
    const handtekeningBlok = element.querySelector("[data-handtekening]");
    const ondertekst = handtekeningBlok ? handtekeningBlok.outerHTML : "";
    const eigenTekst = ondertekst ? element.innerHTML.split(ondertekst)[0] ?? "" : element.innerHTML;
    const platte = handtekeningBlok ? element.innerText.split(handtekeningBlok.textContent ?? "")[0] ?? "" : element.innerText;
    if (!platte.trim()) return;

    setSpellBezig(true);
    setMelding(null);
    try {
      const response = await fetch("/api/agent/spell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: platte }),
      });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; text?: string; error?: string } | null;
      if (!response.ok || !data?.ok || !data.text) {
        setMelding(data?.error ?? "De AI kon de tekst niet nakijken.");
        return;
      }
      const gecorrigeerd = escapeHtml(data.text);
      element.innerHTML = `${gecorrigeerd}${ondertekst}`;
      setTekst(data.text);
      setHtml(element.innerHTML);
      setMelding(null);
    } catch {
      setMelding("De AI kon de tekst niet nakijken.");
    } finally {
      setSpellBezig(false);
    }
  };

  const voegToe = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBijlagen((huidig) => [...huidig, ...Array.from(files)].slice(0, 10));
  };

  const verstuur = async () => {
    setStand("bezig");
    setMelding(null);
    try {
      const vorm = new FormData();
      vorm.set("to", aan);
      vorm.set("cc", toonCc ? cc : "");
      vorm.set("bcc", toonCc ? bcc : "");
      vorm.set("subject", onderwerp);
      vorm.set("body", tekst);
      vorm.set("html", html || tekst);
      vorm.set("signature", "included");
      for (const bestand of bijlagen) vorm.append("files", bestand);

      const response = await fetch("/api/gmail/compose", { method: "POST", body: vorm });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !data?.ok) {
        setStand("fout");
        setMelding(data?.error ?? "Versturen mislukte.");
        return;
      }
      setStand("klaar");
      setMelding("Verstuurd.");
      setAan("");
      setCc("");
      setBcc("");
      setOnderwerp("");
      setTekst("");
      setHtml("");
      setBijlagen([]);
      onClose();
    } catch {
      setStand("fout");
      setMelding("Versturen mislukte: geen verbinding.");
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(value) => !value && onClose()}
      title="Nieuwe mail"
      beschrijving=""
      className="max-w-4xl"
      vasteHoogte
      voet={
        <div className="flex w-full flex-col items-center gap-2">
          {melding ? <p className="text-center text-[13px] text-[var(--muted)]">{melding}</p> : null}
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="rounded-full px-3 py-2 text-[14px] text-ink-muted">
              Annuleren
            </button>
            <button
              type="button"
              onClick={() => void verstuur()}
              disabled={stand === "bezig" || !aan.trim() || !onderwerp.trim()}
              className="btn-primary focus-ring rounded-full px-5 py-2 text-[14px] font-medium disabled:opacity-60"
            >
              {stand === "bezig" ? "Versturen…" : "Versturen"}
            </button>
          </div>
        </div>
      }
    >
      <div className="mx-[5%] flex flex-col gap-4 pb-3">
        <div>
          <label htmlFor="nieuw-aan" className="text-[11px] font-medium tracking-[0.14em] text-[var(--muted)] uppercase">
            Aan
          </label>
          <input
            id="nieuw-aan"
            value={aan}
            onChange={(event) => setAan(event.target.value)}
            placeholder="naam@voorbeeld.nl"
            autoComplete="off"
            className={VELD}
          />
        </div>

        {toonCc ? (
          <>
            <div>
              <label htmlFor="nieuw-cc" className="text-[11px] font-medium tracking-[0.14em] text-[var(--muted)] uppercase">
                CC
              </label>
              <input id="nieuw-cc" value={cc} onChange={(event) => setCc(event.target.value)} className={VELD} />
            </div>
            <div>
              <label htmlFor="nieuw-bcc" className="text-[11px] font-medium tracking-[0.14em] text-[var(--muted)] uppercase">
                BCC
              </label>
              <input id="nieuw-bcc" value={bcc} onChange={(event) => setBcc(event.target.value)} className={VELD} />
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setToonCc(true)}
            className="self-start text-[12px] font-medium text-[var(--blue)]"
          >
            + CC / BCC
          </button>
        )}

        <div>
          <label
            htmlFor="nieuw-onderwerp"
            className="text-[11px] font-medium tracking-[0.14em] text-[var(--muted)] uppercase"
          >
            Onderwerp
          </label>
          <input
            id="nieuw-onderwerp"
            value={onderwerp}
            onChange={(event) => setOnderwerp(event.target.value)}
            className={VELD}
          />
        </div>

        <div className="flex flex-col gap-[10px] sm:flex-row">
          <div className="veld-underline relative min-w-0 flex-1 px-0 py-2">
            {/* De AI-knop hoort bij dit vak, niet bij de sheet: hij werkt op
                de tekst die hier staat. */}
            <button
              type="button"
              onClick={() => void corrigeer()}
              disabled={spellBezig || !tekst.trim()}
              aria-label="Spelfouten verbeteren"
              title="Spelfouten verbeteren"
              className="glass-chip focus-ring !absolute top-0 right-0 z-10 grid h-8 w-8 place-items-center rounded-full text-[var(--ink)] disabled:opacity-50"
            >
              {spellBezig ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M12 3a9 9 0 1 0 9 9" strokeLinecap="round" />
                </svg>
              ) : (
                <SparklesIcon />
              )}
            </button>
            {/* Eén vel: de handtekening staat er al in, jij typt erboven. */}
            <div
              ref={veld}
              contentEditable
              role="textbox"
              aria-multiline="true"
              aria-label="Bericht"
              suppressContentEditableWarning
              onInput={(event) => {
                setTekst(event.currentTarget.innerText);
                setHtml(event.currentTarget.innerHTML);
              }}
              className="min-h-[120px] w-full bg-transparent pr-10 text-[14px] leading-6 text-[var(--ink)] outline-none [font-family:Helvetica,Arial,sans-serif] [&_a]:text-[var(--blue)] [&_a]:underline"
            />
          </div>

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
            className={`flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-4 text-center transition-colors sm:w-[190px] ${
              sleep ? "border-[var(--blue)] bg-[var(--blue-soft)]" : "border-[var(--line)]"
            }`}
          >
            <p className="text-[12px] text-[var(--muted)]">Sleep bestanden hierheen</p>
            <button
              type="button"
              onClick={() => invoer.current?.click()}
              className="btn-secondary focus-ring rounded-full px-3 py-1.5 text-[12px] font-medium"
            >
              Kies bestanden
            </button>
            <input
              ref={invoer}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => voegToe(event.target.files)}
            />
            {bijlagen.length > 0 ? (
              <ul className="mt-1 max-h-[90px] w-full space-y-1 overflow-y-auto text-left text-[12px] text-[var(--ink)]">
                {bijlagen.map((bestand, index) => (
                  <li key={`${bestand.name}-${index}`} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate">{bestand.name}</span>
                    <button
                      type="button"
                      aria-label={`${bestand.name} verwijderen`}
                      onClick={() => setBijlagen((huidig) => huidig.filter((_, i) => i !== index))}
                      className="shrink-0 text-[var(--muted)]"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** Platte tekst naar HTML-alinea's. */
function escapeHtml(text: string): string {
  const schoon = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const blokken = /\n\s*\n/.test(schoon) ? schoon.split(/\n\s*\n+/) : schoon.split(/\n/);
  return blokken
    .map((blok) => blok.trim())
    .filter(Boolean)
    .map((blok) => `<p>${blok.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** Twee sterretjes, het bekende teken voor AI. */
function SparklesIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 3l1.9 4.6L17.5 9.5 12.9 11.4 11 16l-1.9-4.6L4.5 9.5l4.6-1.9L11 3z" />
      <path d="M18 14l.9 2.1L21 17l-2.1.9L18 20l-.9-2.1L15 17l2.1-.9L18 14z" />
    </svg>
  );
}
