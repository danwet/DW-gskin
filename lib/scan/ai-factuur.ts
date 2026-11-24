import "server-only";

import { askModel } from "@/lib/agent/classify";
import { loadAgentConfig } from "@/lib/agent/config";
import type { ExtractedInvoice } from "./extract";

const SYSTEM = `Je leest één factuur en haalt de gegevens eruit. Antwoord met precies deze JSON:
{"leverancier":"","factuurnummer":"","factuurdatum":"YYYY-MM-DD of \\"\\"","vervaldatum":"YYYY-MM-DD of \\"\\"","bedrag":0 of null,"valuta":"EUR","iban":"","kenmerk":"","gevolg":""}
Regels:
- Kijk naar het hele document, niet alleen naar de eerste regels. Het totaalbedrag staat vaak onderaan bij "Totaal", "Te betalen", "Factuurtotaal" of "Subtotaal + BTW".
- Neem het BEDRAG DAT BETAALD MOET WORDEN, inclusief btw. Niet een subtotaal, niet een los tarief, niet een bedrag uit een eerdere factuur.
- Een bedrag met een punt als decimaalteken ("151.38") is ook gewoon een bedrag; geef het als getal terug (151.38).
- factuurnummer is het nummer dat de leverancier aan deze factuur gaf. Het heet niet altijd zo: ook "declaratienummer", "declaratienr", "notanummer", "nota nr", "factuurnr", "rekeningnummer", "dossiernummer", "referentie nr" of gewoon "Nr." is dit nummer. Neem het over zoals het er staat, met letters en streepjes.
- Kijk ook naar kop- en voetteksten, stempels en kleine lettertjes: daar staat het nummer vaak.
- Staat er echt geen nummer, laat het dan leeg. Verzin niets.
- Datums als YYYY-MM-DD. Verzin geen datum: staat er geen vervaldatum en geen termijn, laat vervaldatum leeg.
- iban alleen als er echt een IBAN staat, zonder spaties.
- kenmerk is het betalingskenmerk of de referentie als dat er staat.
- gevolg alleen als de factuur zelf een consequentie noemt bij te laat betalen.
- Geen uitleg, geen tekst buiten de JSON.`;

type AiFactuur = {
  leverancier?: string;
  factuurnummer?: string;
  factuurdatum?: string;
  vervaldatum?: string;
  bedrag?: number | string | null;
  valuta?: string;
  iban?: string;
  kenmerk?: string;
  gevolg?: string;
};

function tekst(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function datum(value: unknown): string {
  const text = tekst(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function bedrag(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.round(value * 100) / 100;
  const text = tekst(value).replace(/[^\d.,-]/g, "");
  if (!text) return null;
  const normalized = text.replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  const getal = Number(normalized);
  return Number.isFinite(getal) && getal > 0 ? Math.round(getal * 100) / 100 : null;
}

/**
 * Laat het model de factuur lezen en de velden invullen. Geeft null als er geen
 * model is geconfigureerd of het antwoord onbruikbaar is; de aanroeper valt dan
 * terug op de regelgebaseerde lezer.
 */
export async function leesFactuurMetModel(text: string): Promise<Partial<ExtractedInvoice> | null> {
  const schoon = text.replace(/\r/g, "").trim();
  if (schoon.length < 20) return null;

  const config = await loadAgentConfig().catch(() => null);
  const provider = config?.defaultProvider ?? "openai";
  const entry = config?.providers?.[provider];
  if (!entry?.apiKey) return null;

  try {
    const antwoord = await askModel({
      provider,
      apiKey: entry.apiKey,
      model: entry.model,
      system: SYSTEM,
      // Ruim genoeg voor een volledige factuur, maar geen eindeloze bijlagen.
      user: schoon.slice(0, 12_000),
    });
    const start = antwoord.indexOf("{");
    const eind = antwoord.lastIndexOf("}");
    if (start < 0 || eind <= start) return null;
    const parsed = JSON.parse(antwoord.slice(start, eind + 1)) as AiFactuur;

    const uitkomst: Partial<ExtractedInvoice> = {
      supplier: tekst(parsed.leverancier),
      invoiceNumber: tekst(parsed.factuurnummer),
      invoiceDate: datum(parsed.factuurdatum),
      dueDate: datum(parsed.vervaldatum),
      amount: bedrag(parsed.bedrag),
      currency: tekst(parsed.valuta).toUpperCase() || "EUR",
      iban: tekst(parsed.iban).replace(/\s+/g, "").toUpperCase(),
      reference: tekst(parsed.kenmerk),
      senderSays: tekst(parsed.gevolg),
    };
    // Niets bruikbaars? Dan liever de regelgebaseerde lezer.
    if (!uitkomst.supplier && !uitkomst.invoiceNumber && uitkomst.amount == null) return null;
    return uitkomst;
  } catch {
    return null;
  }
}
