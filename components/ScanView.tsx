"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { isValidCalendarDate } from "@/lib/scan/validate";
import { PageTitle } from "./PageTitle";

type UploadResult = {
  scanId: string;
  storedName: string;
  fileName: string;
  mime: string;
  previewUrl: string;
  extracted: {
    supplier: string;
    invoiceNumber: string;
    invoiceDate: string;
    dueDate: string;
    dueDateSource: string;
    amount: number | null;
    currency: string;
    iban: string;
    reference: string;
    senderSays: string;
  };
  textReadable: boolean;
  warning: string | null;
};

type FormState = {
  supplier: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  dueDateSource: string;
  amount: string;
  currency: string;
  iban: string;
  reference: string;
  senderSays: string;
};

type ExistingInvoice = {
  conversationId: string;
  from: string;
  subject: string;
  invoice?: { supplier?: string; invoiceNumber?: string; amount?: number; currency?: string; dueDate?: string };
};

// Zelfde veldstijl als in Instellingen en het opstelvenster: geen kader, maar
// een lijn onder het veld.
const inputClass = "veld-underline mt-1 px-0 py-2 text-[14px] text-ink";
const labelClass = "text-[11px] font-medium tracking-[0.08em] text-[var(--faint)]";

export function ScanView() {
  const [stage, setStage] = useState<"idle" | "uploading" | "review" | "saving" | "saved" | "error">("idle");
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<UploadResult | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  // Een ingescande factuur is per definitie nog niet betaald: die gaat de
  // workflow in. Geen statuskeuze meer in het formulier.
  const [paid] = useState(false);
  const [mobileTab, setMobileTab] = useState<"scan" | "gegevens">("scan");
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<ExistingInvoice | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const photoRef = useRef<HTMLInputElement | null>(null);

  const dueValid = useMemo(() => Boolean(form?.dueDate && isValidCalendarDate(form.dueDate)), [form?.dueDate]);

  const upload = useCallback(async (uploaded: File) => {
    setStage("uploading");
    setError(null);
    setDuplicate(null);
    setSavedMessage(null);
    const body = new FormData();
    body.append("file", uploaded);
    try {
      const response = await fetch("/api/scan/upload", { method: "POST", body });
      const payload = (await response.json()) as (UploadResult & { error?: string }) | null;
      if (!response.ok || !payload) throw new Error(payload?.error ?? "Uploaden is mislukt.");
      setData(payload);
      const ext = payload.extracted;
      setForm({
        supplier: ext.supplier,
        invoiceNumber: ext.invoiceNumber,
        invoiceDate: ext.invoiceDate,
        dueDate: ext.dueDate,
        dueDateSource: ext.dueDateSource,
        amount: ext.amount != null ? String(ext.amount) : "",
        currency: ext.currency || "EUR",
        iban: ext.iban,
        // Het declaratie-/factuurnummer is het betalingskenmerk; staat er een
        // eigen kenmerk in de factuur, dan gaat dat voor.
        reference: ext.reference || ext.invoiceNumber,
        senderSays: ext.senderSays,
      });
      setStage("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Uploaden is mislukt.");
      setStage("error");
    }
  }, []);

  const onFiles = useCallback(
    (list: FileList | null) => {
      const picked = list?.[0];
      if (!picked) return;
      setFile(picked);
      void upload(picked);
    },
    [upload],
  );

  const save = useCallback(
    async (opts?: { attachTo?: string; confirmDuplicate?: boolean }) => {
      if (!data || !form) return;
      if (!isValidCalendarDate(form.dueDate)) {
        setError("Een geldige uiterste betaaldatum is verplicht.");
        return;
      }
      setStage("saving");
      setError(null);
      setDuplicate(null);
      const amount = form.amount.trim() === "" ? null : Number(form.amount.replace(",", "."));
      try {
        const response = await fetch("/api/scan/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scanId: data.scanId,
            storedName: data.storedName,
            fileName: data.fileName,
            mime: data.mime,
            supplier: form.supplier,
            invoiceNumber: form.invoiceNumber,
            invoiceDate: form.invoiceDate,
            dueDate: form.dueDate,
            amount: amount && Number.isFinite(amount) ? amount : null,
            currency: form.currency,
            iban: form.iban,
            reference: form.reference,
            senderSays: form.senderSays,
            paid,
            ...(opts?.attachTo ? { attachToConversationId: opts.attachTo } : {}),
            ...(opts?.confirmDuplicate ? { confirmDuplicate: true } : {}),
          }),
        });
        const payload = (await response.json().catch(() => null)) as {
          ok?: boolean;
          duplicate?: boolean;
          existing?: ExistingInvoice;
          item?: { conversationId: string };
          error?: string;
        } | null;
        if (response.status === 409 && payload?.duplicate && payload.existing) {
          setDuplicate(payload.existing);
          setStage("review");
          return;
        }
        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.error ?? "Opslaan is mislukt.");
        }
        setSavedMessage(opts?.attachTo ? "Scan toegevoegd aan de bestaande factuur." : "Factuur opgeslagen.");
        setStage("saved");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Opslaan is mislukt.");
        setStage("review");
      }
    },
    [data, form, paid],
  );

  const reset = useCallback(() => {
    setStage("idle");
    setData(null);
    setForm(null);
    setFile(null);
    setError(null);
    setDuplicate(null);
    setSavedMessage(null);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const field = (key: keyof FormState, value: string) => setForm((current) => (current ? { ...current, [key]: value } : current));

  return (
    <div className="mx-auto max-w-[1180px] px-6 pt-9 pb-7 sm:px-8 sm:pb-8 md:pb-14">
      <PageTitle eyebrow="Uploaden" title="Hardcopy facturen" />

      {stage === "idle" || stage === "error" ? (
        <section
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            onFiles(event.dataTransfer.files);
          }}
          className={`glass-panel mx-auto mt-[200px] w-3/4 rounded-[24px] px-6 py-14 text-center ${dragging ? "ring-2 ring-[var(--blue)]" : ""}`}
        >
          <p className="text-[17px] font-semibold text-[var(--ink)]">Sleep je ingescande factuur of factuurfoto hierheen</p>
          <p className="mt-1 text-[13px] text-[var(--muted)]">PDF, JPG of PNG · één document tegelijk · maximaal 15 MB</p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="btn-primary focus-ring rounded-full px-5 py-2.5 text-[14px]"
            >
              Kies bestand
            </button>
            <button
              type="button"
              onClick={() => photoRef.current?.click()}
              className="glass-chip focus-ring rounded-full px-5 py-2.5 text-[14px] font-medium md:hidden"
            >
              Foto maken
            </button>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf,image/jpeg,image/png"
            className="hidden"
            onChange={(event) => {
              onFiles(event.target.files);
              event.currentTarget.value = "";
            }}
          />
          <input
            ref={photoRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(event) => {
              onFiles(event.target.files);
              event.currentTarget.value = "";
            }}
          />
          {error ? <p className="mt-4 text-[13px] text-[var(--danger)]">{error}</p> : null}
        </section>
      ) : null}

      {stage === "uploading" ? (
        // Dezelfde bovenmarge als het sleepvak: het vlak blijft staan waar het
        // staat terwijl de factuur wordt uitgelezen.
        <section className="glass-panel mx-auto mt-[200px] w-3/4 rounded-[24px] px-6 py-14 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[var(--line)] border-t-[var(--blue)]" />
          <p className="mt-4 text-[15px] font-medium text-[var(--ink)]">Factuur wordt uitgelezen…</p>
          <p className="mt-1 text-[13px] text-[var(--muted)]">Dit kan even duren.</p>
        </section>
      ) : null}

      {stage === "review" || stage === "saving" ? (
        data && form ? (
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Mobile tabs */}
            <div className="flex gap-2 lg:hidden">
              <button
                type="button"
                onClick={() => setMobileTab("scan")}
                className={`focus-ring flex-1 rounded-full px-4 py-2 text-[13px] font-medium ${mobileTab === "scan" ? "glass-active" : "glass-chip text-[var(--ink)]"}`}
              >
                Scan
              </button>
              <button
                type="button"
                onClick={() => setMobileTab("gegevens")}
                className={`focus-ring flex-1 rounded-full px-4 py-2 text-[13px] font-medium ${mobileTab === "gegevens" ? "glass-active" : "glass-chip text-[var(--ink)]"}`}
              >
                Gegevens
              </button>
            </div>

            {/* Scan preview */}
            <section className={`glass-panel overflow-hidden rounded-[24px] p-4 ${mobileTab === "scan" ? "block" : "hidden lg:block"}`}>
              <p className={labelClass}>ORIGINELE SCAN</p>
              <div className="mt-2 h-[420px] overflow-hidden rounded-2xl bg-[var(--bg)] sm:h-[560px]">
                {data.mime === "application/pdf" ? (
                  <iframe title="Scan" src={data.previewUrl} className="h-full w-full" />
                ) : (
                  <img src={data.previewUrl} alt="Scan" className="h-full w-full object-contain" />
                )}
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="truncate text-[12px] text-[var(--muted)]">{data.fileName}</p>
                <a
                  href={data.previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-[13px] font-medium text-[var(--blue)]"
                >
                  Open volledig
                </a>
              </div>
            </section>

            {/* Form */}
            <section className={`space-y-4 ${mobileTab === "gegevens" ? "block" : "hidden lg:block"}`}>
              {data.warning ? (
                <div className="glass-panel rounded-2xl px-4 py-3">
                  <p className="text-[13px] leading-5 text-[var(--orange)]">{data.warning}</p>
                  <button
                    type="button"
                    onClick={() => file && void upload(file)}
                    className="focus-ring mt-2 text-[12px] font-medium text-[var(--blue)]"
                  >
                    Opnieuw proberen
                  </button>
                </div>
              ) : null}

              {duplicate ? (
                <div className="glass-panel rounded-2xl px-4 py-3">
                  <p className="text-[13px] font-medium text-[var(--ink)]">Deze factuur bestaat waarschijnlijk al:</p>
                  <p className="mt-1 text-[13px] text-[var(--muted)]">
                    {duplicate.from} · {duplicate.invoice?.invoiceNumber || duplicate.subject}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void save({ attachTo: duplicate.conversationId })}
                      className="btn-primary focus-ring rounded-full px-4 py-2 text-[13px]"
                    >
                      Scan toevoegen aan bestaande factuur
                    </button>
                    <button
                      type="button"
                      onClick={() => void save({ confirmDuplicate: true })}
                      className="glass-chip focus-ring rounded-full px-4 py-2 text-[13px] font-medium text-[var(--ink)]"
                    >
                      Toch als nieuwe opslaan
                    </button>
                    <button
                      type="button"
                      onClick={() => setDuplicate(null)}
                      className="focus-ring rounded-full px-3 py-2 text-[13px] text-[var(--muted)]"
                    >
                      Annuleren
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="glass-panel rounded-[24px] p-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className={labelClass} htmlFor="scan-supplier">Leverancier</label>
                    <input id="scan-supplier" className={inputClass} value={form.supplier} onChange={(e) => field("supplier", e.target.value)} placeholder="Naam leverancier" />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="scan-number">Factuurnummer / declaratienummer</label>
                    <input
                      id="scan-number"
                      className={inputClass}
                      value={form.invoiceNumber}
                      onChange={(e) => field("invoiceNumber", e.target.value)}
                      placeholder="Bijv. 18312"
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="scan-invoiceDate">Factuurdatum</label>
                    <input id="scan-invoiceDate" type="date" className={inputClass} value={form.invoiceDate} onChange={(e) => field("invoiceDate", e.target.value)} />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="scan-due">Uiterste betaaldatum *</label>
                    <input id="scan-due" type="date" className={inputClass} value={form.dueDate} onChange={(e) => field("dueDate", e.target.value)} required />
                    <p className="mt-1 text-[12px] text-[var(--muted)]">{form.dueDateSource || "Vul de vervaldatum in."}</p>
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="scan-amount">Totaalbedrag</label>
                    <input id="scan-amount" type="number" inputMode="decimal" step="0.01" min="0" className={inputClass} value={form.amount} onChange={(e) => field("amount", e.target.value)} placeholder="0,00" />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="scan-currency">Valuta</label>
                    <select id="scan-currency" className={inputClass} value={form.currency} onChange={(e) => field("currency", e.target.value)}>
                      <option value="EUR">EUR</option>
                      <option value="USD">USD</option>
                      <option value="GBP">GBP</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="scan-iban">IBAN</label>
                    <input id="scan-iban" className={inputClass} value={form.iban} onChange={(e) => field("iban", e.target.value)} placeholder="NL00 BANK 0000 0000 00" />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="scan-reference">Betalingskenmerk</label>
                    <input id="scan-reference" className={inputClass} value={form.reference} onChange={(e) => field("reference", e.target.value)} placeholder="Kenmerk / referentie" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClass} htmlFor="scan-consequence">Aangekondigd gevolg bij uitstel</label>
                    <input id="scan-consequence" className={inputClass} value={form.senderSays} onChange={(e) => field("senderSays", e.target.value)} placeholder="Bijv. incasso, opschorting…" />
                  </div>
                </div>

              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={!dueValid || stage === "saving"}
                  className="btn-primary focus-ring rounded-full px-5 py-2.5 text-[14px] disabled:opacity-50"
                >
                  {stage === "saving" ? "Opslaan…" : "Factuur opslaan"}
                </button>
                <button type="button" onClick={reset} className="focus-ring rounded-full px-4 py-2.5 text-[13px] text-[var(--muted)]">
                  Annuleren
                </button>
                {!dueValid ? <p className="text-[12px] text-[var(--muted)]">Vul een geldige uiterste betaaldatum in om op te slaan.</p> : null}
                {error ? <p className="text-[13px] text-[var(--danger)]">{error}</p> : null}
              </div>
            </section>
          </div>
        ) : null
      ) : null}

      {stage === "saved" ? (
        <section className="glass-panel rounded-[24px] px-6 py-14 text-center">
          <p className="text-[17px] font-semibold text-[var(--ink)]">{savedMessage ?? "Factuur opgeslagen."}</p>
          <p className="mt-1 text-[13px] text-[var(--muted)]">
            De factuur staat nu in je aandachtsoverzicht.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link href="/" className="btn-primary focus-ring rounded-full px-5 py-2.5 text-[14px]">
              Naar dashboard
            </Link>
            <button type="button" onClick={reset} className="btn-secondary focus-ring rounded-full px-5 py-2.5 text-[14px]">
              Nog een factuur inscannen
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
