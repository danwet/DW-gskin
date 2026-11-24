"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/kit/modal";
import { PageTitle } from "@/components/PageTitle";
import { useInbox } from "@/components/AgentInbox";
import type { MailAssessment } from "@/lib/agent/types";

type GesprekBericht = {
  id: string;
  from: string;
  fromMe: boolean;
  receivedAt: string;
  text: string;
};

/** Wanneer is deze mail afgehandeld? De eerste datum die de app vastlegde. */
function afgehandeldOp(item: MailAssessment): string {
  return item.handledAt ?? item.paidAt ?? item.sentAt ?? item.archivedAt ?? item.receivedAt;
}

function soortLabel(item: MailAssessment): string {
  if (item.invoice) return "Betaald";
  if (item.sentAt) return "Beantwoord";
  if (item.savedAt) return "Bewaard";
  if (item.archivedAt) return "Gearchiveerd";
  return "Afgehandeld";
}

function datum(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}

function tijd(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
}

export function HandledView() {
  const inbox = useInbox();
  const [gekozen, setGekozen] = useState<MailAssessment | null>(null);
  const [gesprek, setGesprek] = useState<GesprekBericht[] | null>(null);
  const [mailTekst, setMailTekst] = useState("");
  const [pagina, setPagina] = useState(0);

  // Alles wat de app als afgehandeld beschouwt: zelf afgevinkt, gearchiveerd of
  // bewaard na het lezen.
  const rijen = inbox.items
    .filter((item) => item.handledByUser === true || Boolean(item.archivedAt) || Boolean(item.savedAt))
    .sort((a, b) => Date.parse(afgehandeldOp(b)) - Date.parse(afgehandeldOp(a)));

  useEffect(() => {
    if (!gekozen) return;
    let alive = true;
    setGesprek(null);
    // De kaart bewaart de mailtekst niet meer; die halen we hier op.
    const tekstVoor = gekozen.sourceMessageId;
    setMailTekst("");
    if (tekstVoor) {
      void fetch(`/api/inbox/preview?tekst=1&id=${encodeURIComponent(tekstVoor)}`)
        .then((r) => (r.ok ? r.text() : ""))
        .then((tekst) => {
          if (alive) setMailTekst(tekst);
        })
        .catch(() => undefined);
    }
    void (async () => {
      try {
        const response = await fetch(
          `/api/inbox/thread?conversationId=${encodeURIComponent(gekozen.conversationId)}`,
          { cache: "no-store" },
        );
        if (!response.ok) return;
        const data = (await response.json()) as { messages?: GesprekBericht[] };
        if (alive) setGesprek(Array.isArray(data.messages) ? data.messages : []);
      } catch {
        if (alive) setGesprek([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [gekozen]);

  // Vijftig per pagina; de rest gaat via de paginering onderaan.
  const PER_PAGINA = 50;
  const paginaGrootte = Math.max(1, Math.ceil(rijen.length / PER_PAGINA));
  const huidige = Math.min(pagina, paginaGrootte - 1);
  const zichtbaar = rijen.slice(huidige * PER_PAGINA, huidige * PER_PAGINA + PER_PAGINA);

  const antwoorden = (gesprek ?? []).filter((m) => m.fromMe);

  return (
    <div className="mx-auto max-w-[1180px] px-6 pt-9 pb-7 sm:px-8 sm:pb-8 md:pb-14">
      <PageTitle eyebrow="Afgehandeld" title="Afgehandelde berichten" />

      {inbox.loading ? (
        <p className="text-[14px] text-[var(--muted)]">Laden…</p>
      ) : rijen.length === 0 ? (
        <p className="text-[14px] text-[var(--muted)]">Nog niets afgehandeld.</p>
      ) : (
        <div className="mb-5 overflow-hidden rounded-2xl border border-[var(--line)]">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-[var(--bg)] text-[11px] tracking-[0.12em] text-[var(--muted)] uppercase">
                <th className="px-4 py-2.5 font-medium">Afzender</th>
                <th className="px-4 py-2.5 font-medium">Onderwerp</th>
                <th className="hidden px-4 py-2.5 font-medium md:table-cell">Soort</th>
                <th className="px-4 py-2.5 text-right font-medium">Afgehandeld</th>
              </tr>
            </thead>
            <tbody>
              {zichtbaar.map((item) => (
                <tr
                  key={item.conversationId}
                  onClick={() => setGekozen(item)}
                  className="cursor-pointer border-t border-[var(--line)] align-top transition-colors hover:bg-[var(--bg)]"
                >
                  <td className="px-4 py-3 text-[13px] text-[var(--ink)]">
                    {item.from}
                  </td>
                  <td className="px-4 py-3">
                    <p className="line-clamp-1 text-[14px] font-medium text-[var(--ink)]">
                      {item.shortSubject || item.subject}
                    </p>
                    {item.invoice?.invoiceNumber ? (
                      // Het factuurnummer hoort zichtbaar te zijn: daar zoek je
                      // een factuur later op terug.
                      <p className="mt-0.5 truncate text-[12px] text-[var(--muted)]">{item.invoice.invoiceNumber}</p>
                    ) : null}
                  </td>
                  <td className="hidden px-4 py-3 text-[13px] text-[var(--muted)] md:table-cell">{soortLabel(item)}</td>
                  <td className="px-4 py-3 text-right text-[13px] whitespace-nowrap text-[var(--muted)]">
                    {datum(afgehandeldOp(item))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* De paginering staat er altijd, ook bij één pagina: dan zie je ten
              minste hoeveel items er zijn en dat de pijlen niets meer doen. */}
          {rijen.length > 0 ? (
            <div className="flex items-center justify-between gap-3 border-t border-[var(--line)] px-4 py-2.5">
              <p className="text-[12px] text-[var(--muted)]">
                {huidige * PER_PAGINA + 1}–{Math.min(rijen.length, (huidige + 1) * PER_PAGINA)} van {rijen.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPagina((p) => Math.max(0, p - 1))}
                  disabled={huidige === 0}
                  aria-label="Vorige pagina"
                  className="glass-chip focus-ring grid h-7 w-7 place-items-center rounded-full text-[var(--ink)] disabled:opacity-40"
                >
                  ‹
                </button>
                <span className="text-[12px] text-[var(--muted)]">
                  {huidige + 1} / {paginaGrootte}
                </span>
                <button
                  type="button"
                  onClick={() => setPagina((p) => Math.min(paginaGrootte - 1, p + 1))}
                  disabled={huidige >= paginaGrootte - 1}
                  aria-label="Volgende pagina"
                  className="glass-chip focus-ring grid h-7 w-7 place-items-center rounded-full text-[var(--ink)] disabled:opacity-40"
                >
                  ›
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {gekozen ? (
        <Modal
          open
          onOpenChange={(open) => !open && setGekozen(null)}
          title={gekozen.subject}
          beschrijving={`${gekozen.from} · afgehandeld ${datum(afgehandeldOp(gekozen))}`}
          className="max-w-3xl"
        >
          <div className="space-y-4">
            {antwoorden.length > 0 ? (
              <section>
                <p className="text-[11px] font-medium tracking-[0.14em] text-[var(--muted)] uppercase">
                  Jouw antwoord{antwoorden.length > 1 ? `en (${antwoorden.length})` : ""}
                </p>
                <ul className="mt-2 space-y-2">
                  {antwoorden.map((bericht) => (
                    <li key={bericht.id} className="rounded-2xl bg-[var(--blue-soft)] px-3.5 py-2.5">
                      <p className="text-[11px] text-[var(--muted)]">
                        Verstuurd {datum(bericht.receivedAt)} om {tijd(bericht.receivedAt)}
                      </p>
                      <p className="mt-1 line-clamp-6 text-[13px] leading-5 whitespace-pre-line text-[var(--ink)]">
                        {bericht.text || "(geen tekst)"}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section>
              <p className="text-[11px] font-medium tracking-[0.14em] text-[var(--muted)] uppercase">De mail</p>
              <p className="mt-2 line-clamp-6 text-[13px] leading-5 whitespace-pre-line text-[var(--ink)]">
                {mailTekst || "(geen tekst)"}
              </p>
            </section>

            {gesprek && gesprek.length > 1 ? (
              <section>
                <p className="text-[11px] font-medium tracking-[0.14em] text-[var(--muted)] uppercase">
                  Gesprek ({gesprek.length})
                </p>
                <ul className="mt-2 space-y-2">
                  {gesprek
                    .filter((m) => !m.fromMe)
                    .map((bericht) => (
                      <li key={bericht.id} className="rounded-2xl border border-[var(--line)] px-3.5 py-2.5">
                        <p className="text-[11px] text-[var(--muted)]">
                          {bericht.from} · {datum(bericht.receivedAt)} {tijd(bericht.receivedAt)}
                        </p>
                        <p className="mt-1 line-clamp-4 text-[13px] leading-5 whitespace-pre-line text-[var(--ink)]">
                          {bericht.text || "(geen tekst)"}
                        </p>
                      </li>
                    ))}
                </ul>
              </section>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
