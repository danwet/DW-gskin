"use client";

import { useState } from "react";
import { Modal } from "@/components/kit/modal";

export function SheetDemo() {
  const [confirmation, setConfirmation] = useState(false);
  const [form, setForm] = useState(false);
  const [list, setList] = useState(false);

  return (
    <div className="mx-auto max-w-[720px] px-6 py-10">
      <h1 className="text-[24px] font-semibold text-[var(--ink)]">Sheet-test</h1>
      <div className="mt-6 flex flex-col gap-3">
        <button type="button" onClick={() => setConfirmation(true)} className="btn-primary focus-ring rounded-full px-4 py-2 text-[13px] font-medium">
          Bevestiging (waarschuwing)
        </button>
        <button type="button" onClick={() => setForm(true)} className="btn-primary focus-ring rounded-full px-4 py-2 text-[13px] font-medium">
          Formulier
        </button>
        <button type="button" onClick={() => setList(true)} className="btn-primary focus-ring rounded-full px-4 py-2 text-[13px] font-medium">
          Lijst met plakkende kop
        </button>
      </div>

      <Modal
        open={confirmation}
        onOpenChange={setConfirmation}
        title="Weet je het zeker?"
        waarschuwing
        gecentreerd
        beschrijving={
          <>
            Je gaat een nieuw voorstel genereren,
            <br />
            het oude voorstel wordt verwijderd.
          </>
        }
        voet={
          <button
            type="button"
            onClick={() => setConfirmation(false)}
            className="h-12 w-3/4 rounded-full bg-[var(--accent-fill)] font-medium text-[#f6f4ef] transition active:scale-[0.98]"
          >
            Opnieuw genereren
          </button>
        }
      />

      <Modal
        open={form}
        onOpenChange={setForm}
        title="Dienst plannen"
        voet={
          <button
            type="button"
            onClick={() => setForm(false)}
            className="h-12 w-3/4 rounded-full bg-[var(--accent-fill)] font-medium text-[#f6f4ef] disabled:opacity-50"
          >
            Aanmaken
          </button>
        }
      >
        <form className="flex flex-col gap-4">
          <input className="t-body w-full rounded-[var(--radius-card)] border border-hairline bg-bg p-3" placeholder="Titel" />
          <input className="t-body w-full rounded-[var(--radius-card)] border border-hairline bg-bg p-3" placeholder="Datum" />
        </form>
      </Modal>

      <Modal
        open={list}
        onOpenChange={setList}
        title="Lied toevoegen"
        beschrijving="Kies een lied dat aansluit op het thema."
        kop={
          <div className="flex flex-col gap-3">
            <input className="t-body w-full rounded-[var(--radius-card)] border border-hairline bg-bg p-3" placeholder="Zoeken…" />
          </div>
        }
        voet={
          <button type="button" onClick={() => setList(false)} className="h-12 w-full rounded-full bg-[var(--accent-fill)] text-[#f6f4ef]">
            Toevoegen
          </button>
        }
      >
        <ul className="flex flex-col gap-1">
          {Array.from({ length: 40 }, (_, index) => (
            <li key={index} className="rounded-xl border border-hairline bg-bg px-4 py-3 text-ink">
              Lied {index + 1}
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}
