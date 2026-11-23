import "server-only";

import { askModel } from "./classify";
import { loadAgentConfig } from "./config";
import { readAssessments, readMeta, setShortSubject, updateMeta } from "./store";

/** Onderwerpen vanaf deze lengte passen niet meer op twee regels. */
const TE_LANG = 60;

/**
 * Versie van de regels voor de korte titel. Bij een nieuwe versie worden
 * bestaande kaarten opnieuw gedaan: de regels veranderen, dus oude titels
 * kunnen niet blijven staan.
 */
export const SHORT_SUBJECT_VERSION = 3;

/** Onderwerpen korter dan dit hoeven niet opnieuw, ook niet bij een reindex. */
const MIN_VOOR_REINDEX = 30;

const SYSTEM = `Je maakt een korte versie van een e-mailonderwerp voor op een kaartje.
Antwoord met precies deze JSON: {"kort":"<max 50 tekens>"}
Regels: behoud de betekenis, laat beleefdheidsvormen weg, geen aanhalingstekens, geen punt aan het eind.
Gaat het om een factuur, zet dan het factuurnummer in de korte titel: "Factuur <nummer>", zonder leverancier (dat is de afzender, die staat al boven de kaart).
Dit geldt voor elke soort mail, ook nieuwsbrieven en informatieve mail: een te lang onderwerp wordt daar ook ingekort.
Laat bij een nieuwsbrief de nieuwsbriefnaam staan en kort de rest in.
Kort nooit een persoonsnaam in: "van", "van de", "de", "der", "ten" en "ter" horen bij de achternaam, dus "Van de Wetering" blijft heel.
Noem de afzender of het bedrijf niet als de mail daar zelf vandaan komt: dat staat al boven de kaart.`;

/**
 * Kaarten van vóór dit veld krijgen alsnog een korte onderwerpregel, een paar
 * per ronde, zodat een lange lijst zichzelf inloopt.
 */
export async function backfillShortSubjects(limit = 2): Promise<number> {
  const config = await loadAgentConfig().catch(() => null);
  const provider = config?.defaultProvider ?? "openai";
  const entry = config?.providers?.[provider];
  if (!entry?.apiKey) return 0;

  const meta = await readMeta();
  const reindex = (meta.shortSubjectVersion ?? 1) < SHORT_SUBJECT_VERSION;

  const items = await readAssessments();
  const zonder = items
    // Tijdens een reindex telt elke kaart mee die een korte titel heeft of een
    // onderwerp dat lang genoeg is om er een te hebben. Nieuwsbrieven en
    // informatieve mail doen gewoon mee.
    .filter((item) => {
      const lengte = (item.subject ?? "").length;
      const versie = item.shortSubjectVersion ?? 0;
      // Bij een reindex telt elke kaart mee die nog met een oudere versie is
      // gemaakt; anders blijft hij dezelfde twee kaarten opnieuw doen.
      if (reindex) return versie < SHORT_SUBJECT_VERSION && (Boolean(item.shortSubject) || lengte > MIN_VOOR_REINDEX);
      return !item.shortSubject && lengte > TE_LANG;
    })
    .sort((a, b) => Date.parse(b.receivedAt ?? "") - Date.parse(a.receivedAt ?? ""))
    .slice(0, limit);

  // Queue leeg en nog geen versie genoteerd? Dan is de reindex klaar.
  if (reindex && zonder.length === 0) {
    await updateMeta({ shortSubjectVersion: SHORT_SUBJECT_VERSION }).catch(() => undefined);
    return 0;
  }

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
        await setShortSubject(item.conversationId, kort, SHORT_SUBJECT_VERSION);
        gedaan += 1;
      }
    } catch {
      // Volgende ronde opnieuw.
    }
  }
  return gedaan;
}
