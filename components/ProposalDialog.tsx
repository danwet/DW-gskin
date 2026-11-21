"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ProposalAction, ProposalView } from "@/lib/proposals";

const ACTION_LABEL: Record<ProposalAction, string> = {
  archive: "Archiveren",
  trash: "Naar prullenbak",
  reply: "Antwoorden",
  unsubscribe: "Afmelden",
};

const ACTION_EFFECT: Record<ProposalAction, string> = {
  archive: "Het bericht uit je inbox halen en in Archief plaatsen.",
  trash: "Het bericht naar de prullenbak verplaatsen.",
  reply: "Een antwoord sturen naar de ontvangers hieronder.",
  unsubscribe: "Je afmelden voor deze lijst via de afmeldlink van de afzender.",
};

function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat("nl-NL", { dateStyle: "long", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
}

export function ProposalDialog({ proposalId, onClose }: { proposalId: string; onClose: () => void }) {
  const [proposal, setProposal] = useState<ProposalView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/proposals/${proposalId}`, { cache: "no-store" });
      const data = (await response.json().catch(() => null)) as { proposal?: ProposalView; error?: string } | null;
      if (!response.ok || !data?.proposal) {
        throw new Error(data?.error ?? "Voorstel kon niet worden geladen.");
      }
      setProposal(data.proposal);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Voorstel kon niet worden geladen.");
    } finally {
      setLoading(false);
    }
  }, [proposalId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Escape and outside clicks close the dialog without recording a decision.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function decide(choice: "approved" | "rejected") {
    if (!proposal || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/proposals/${proposal.id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: proposal.version, decision: choice }),
      });
      const data = (await response.json().catch(() => null)) as
        | { proposal?: ProposalView; error?: string }
        | null;

      if (response.status === 409 && data?.proposal) {
        setProposal(data.proposal);
        setNotice("Dit voorstel is inmiddels gewijzigd. Bekijk de nieuwe versie en kies opnieuw.");
        return;
      }
      if (!response.ok || !data?.proposal) {
        throw new Error(data?.error ?? "Beslissing kon niet worden opgeslagen.");
      }

      setProposal(data.proposal);
      setNotice(
        choice === "approved"
          ? "Goedgekeurd · niet uitgevoerd. Gmail is alleen-lezen gekoppeld, dus er is niets verstuurd of verplaatst."
          : "Afgewezen · er is niets uitgevoerd.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Beslissing kon niet worden opgeslagen. Probeer het opnieuw.");
    } finally {
      setBusy(false);
    }
  }

  const action = proposal ? ACTION_LABEL[proposal.action] : "";
  const decided = proposal?.decision?.decision ?? null;
  const lastUnsubscribeLink = proposal?.payload.unsubscribeUrl;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-6">
      <button
        type="button"
        aria-label="Sluiten"
        onClick={onClose}
        className="absolute inset-0 bg-[#12141c]/40"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Voorstel"
        tabIndex={-1}
        className="glass-float relative flex max-h-[90vh] w-full max-w-[560px] flex-col overflow-hidden rounded-[22px] bg-[var(--card)] outline-none"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Voorstel</p>
            <p className="mt-1 text-[18px] font-semibold text-[var(--ink)]">{loading ? "Laden…" : action}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="glass-chip focus-ring rounded-full px-3 py-1.5 text-[13px] font-medium"
          >
            Sluiten
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {error ? (
            <div className="rounded-2xl bg-[var(--bg)] p-3">
              <p className="text-[13px] text-[var(--danger)]">{error}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="btn-secondary focus-ring mt-2 rounded-full px-3 py-1.5 text-[13px] font-medium"
              >
                Opnieuw proberen
              </button>
            </div>
          ) : null}

          {notice ? (
            <p className="mb-3 rounded-2xl bg-[var(--blue-soft)] px-3 py-2 text-[13px] font-medium text-[var(--active-ink)]">
              {notice}
            </p>
          ) : null}

          {proposal ? (
            <div className="space-y-4">
              <section>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Mail</p>
                <p className="mt-1 text-[15px] font-semibold text-[var(--ink)]">{proposal.payload.subject || proposal.conversationId}</p>
                <p className="mt-1 text-[13px] text-[var(--muted)]">
                  {proposal.gmailEmail ? `Gekoppeld account: ${proposal.gmailEmail}` : "Testdata · geen Gmail-account gekoppeld"}
                </p>
                <p className="mt-1 text-[13px] text-[var(--muted)]">
                  Van toepassing op: {proposal.target === "thread" ? "het hele gesprek" : "één bericht"} · versie {proposal.version}
                </p>
              </section>

              <section>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Waarom</p>
                <p className="mt-1 text-[13px] leading-6 text-[var(--ink)]">{proposal.reason}</p>
                <p className="mt-1 text-[13px] leading-6 text-[var(--muted)]">
                  Wat de actie zou doen: {ACTION_EFFECT[proposal.action]}
                </p>
              </section>

              {proposal.action === "reply" ? (
                <section className="rounded-2xl bg-[var(--bg)] p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Concept</p>
                  <p className="mt-1 text-[13px] text-[var(--ink)]">
                    Aan: {(proposal.payload.recipients ?? []).join(", ") || "—"}
                  </p>
                  <p className="text-[13px] text-[var(--ink)]">Onderwerp: {proposal.payload.subject || "—"}</p>
                  <p className="mt-2 whitespace-pre-wrap text-[13px] leading-6 text-[var(--ink)]">
                    {proposal.payload.body || "—"}
                  </p>
                </section>
              ) : null}

              {proposal.action === "unsubscribe" ? (
                <section className="rounded-2xl bg-[var(--bg)] p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Afmelden</p>
                  <p className="mt-1 text-[13px] text-[var(--ink)]">
                    {proposal.payload.domain ? `Lijst van ${proposal.payload.domain}` : "Afmeldlink gedetecteerd"}
                    {proposal.payload.unsubscribeKind ? ` · ${proposal.payload.unsubscribeKind}` : ""}
                  </p>
                  {lastUnsubscribeLink ? (
                    <p className="mt-1 break-all text-[12px] text-[var(--muted)]">{lastUnsubscribeLink}</p>
                  ) : null}
                </section>
              ) : null}

              <p className="text-[12px] leading-5 text-[var(--muted)]">
                Fase 1: Gmail is alleen-lezen gekoppeld. Akkoord legt alleen je beslissing vast — er wordt niets
                verstuurd, verplaatst of afgemeld.
              </p>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--line)] px-5 py-4">
          <button
            type="button"
            onClick={() => void decide("approved")}
            disabled={!proposal || busy || Boolean(decided)}
            className="btn-primary focus-ring rounded-full px-4 py-2 text-[13px] font-semibold"
          >
            {busy ? "Bezig…" : "Akkoord"}
          </button>
          <button
            type="button"
            onClick={() => void decide("rejected")}
            disabled={!proposal || busy || Boolean(decided)}
            className="btn-secondary focus-ring rounded-full px-4 py-2 text-[13px] font-medium"
          >
            Afwijzen
          </button>
          {decided ? (
            <span className="text-[12px] font-medium text-[var(--muted)]">
              {decided === "approved" ? "Goedgekeurd · niet uitgevoerd" : "Afgewezen"}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
