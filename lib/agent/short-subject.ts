import "server-only";

import { askModel } from "./classify";
import { loadAgentConfig } from "./config";
import { readAssessments, setShortSubject } from "./store";

/** Onderwerpen vanaf deze lengte passen niet meer op twee regels. */
const TE_LANG = 60;

const SYSTEM = `Je maakt een korte versie van een e-mailonderwerp voor op een kaartje.
Antwoord met precies deze JSON: {"kort":"<max 50 tekens>"}
Regels: behoud de betekenis, laat beleefdheidsvormen weg, geen aanhalingstekens, geen punt aan het eind.
Gaat het om een factuur, zet dan altijd het factuurnummer in de korte titel: "Factuur <nummer> · <leverancier>".
Dit geldt voor elke soort mail, ook nieuwsbrieven en informatieve mail: een te lang onderwerp wordt daar ook ingekort.
Laat bij een nieuwsbrief de nieuwsbriefnaam staan en kort de rest in.`;

/**
 * Kaarten van vóór dit veld krijgen alsnog een korte onderwerpregel, een paar
 * per ronde, zodat een lange lijst zichzelf inloopt.
 */
export async function backfillShortSubjects(limit = 2): Promise<number> {
  const config = await loadAgentConfig().catch(() => null);
  const provider = config?.defaultProvider ?? "openai";
  const entry = config?.providers?.[provider];
  if (!entry?.apiKey) return 0;

  const items = await readAssessments();
  const zonder = items
    // Nieuwsbrieven en informatieve mail tellen net zo goed mee: ook daar past
    // een lang onderwerp niet op twee regels.
    .filter((item) => !item.shortSubject && (item.subject ?? "").length > TE_LANG)
    .sort((a, b) => Date.parse(b.receivedAt ?? "") - Date.parse(a.receivedAt ?? ""))
    .slice(0, limit);

  let gedaan = 0;
  for (const item of zonder) {
    try {
      const antwoord = await askModel({
        provider,
        apiKey: entry.apiKey,
        model: entry.model,
        system: SYSTEM,
        user: [
          `onderwerp: ${item.subject}`,
          `afzender: ${item.from ?? ""}`,
          item.invoice?.invoiceNumber ? `factuurnummer: ${item.invoice.invoiceNumber}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      });
      const parsed = JSON.parse(antwoord.slice(antwoord.indexOf("{"), antwoord.lastIndexOf("}") + 1)) as {
        kort?: string;
      };
      const kort = typeof parsed.kort === "string" ? parsed.kort.trim().slice(0, 60) : "";
      if (kort) {
        await setShortSubject(item.conversationId, kort);
        gedaan += 1;
      }
    } catch {
      // Volgende ronde opnieuw.
    }
  }
  return gedaan;
}
