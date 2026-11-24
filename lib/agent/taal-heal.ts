import "server-only";

import { askModel } from "./classify";
import { loadAgentConfig } from "./config";
import { readAssessments, setAssessmentTaal } from "./store";

/** Bewijsversie: bij een nieuwe regel doen bestaande kaarten opnieuw mee. */
export const TAAL_VERSION = 1;

const SYSTEM = `Je vertaalt korte labels van een e-maillijst naar het Nederlands.
Antwoord met precies deze JSON: {"actie":"...","reden":"...","gevolg":"..."}
Regels:
- Vertaal, herformuleer niet: de betekenis blijft precies hetzelfde.
- actie is een korte gebiedende wijs van maximaal vijf woorden.
- reden en gevolg zijn korte frases van maximaal acht woorden.
- Laat een veld leeg als de invoer leeg is.
- Geen aanhalingstekens, geen uitleg, geen extra velden.`;

/**
 * Kaarten die het model in de taal van de mail schreef (meestal Engels) krijgen
 * hier alsnog Nederlandse labels. Een paar kaarten per ronde, zodat het niet in
 * één keer tokens kost.
 */
export async function healLanguage(limit = 3): Promise<number> {
  const config = await loadAgentConfig().catch(() => null);
  const provider = config?.defaultProvider ?? "openai";
  const entry = config?.providers?.[provider];
  if (!entry?.apiKey) return 0;

  const items = await readAssessments();
  const kandidaten = items
    .filter((item) => (item.languageVersion ?? 0) < TAAL_VERSION)
    .filter((item) => lijktEngels(`${item.nextAction} ${item.priorityReason ?? ""} ${item.impact ?? ""}`))
    .sort((a, b) => Date.parse(b.receivedAt ?? "") - Date.parse(a.receivedAt ?? ""))
    .slice(0, limit);

  let hersteld = 0;
  for (const item of kandidaten) {
    try {
      const antwoord = await askModel({
        provider,
        apiKey: entry.apiKey,
        model: entry.model,
        system: SYSTEM,
        user: [
          `actie: ${item.nextAction ?? ""}`,
          `reden: ${item.priorityReason ?? ""}`,
          `gevolg: ${item.impact ?? ""}`,
        ].join("\n"),
      });
      const json = antwoord.slice(antwoord.indexOf("{"), antwoord.lastIndexOf("}") + 1);
      const parsed = JSON.parse(json) as { actie?: string; reden?: string; gevolg?: string };
      const actie = typeof parsed.actie === "string" ? parsed.actie.trim() : "";
      const reden = typeof parsed.reden === "string" ? parsed.reden.trim() : "";
      const gevolg = typeof parsed.gevolg === "string" ? parsed.gevolg.trim() : "";
      await setAssessmentTaal(item.conversationId, {
        nextAction: actie || item.nextAction,
        priorityReason: reden || item.priorityReason || "",
        impact: gevolg || item.impact || undefined,
        version: TAAL_VERSION,
      });
      hersteld += 1;
    } catch {
      // Volgende ronde opnieuw.
    }
  }
  return hersteld;
}

/** Grof maar genoeg: Engelse functiewoorden die in een Nederlandse kaart niet horen. */
function lijktEngels(tekst: string): boolean {
  const waarde = `/\\b(check|your|you|the|this|license|section|and|with|for|from|please|reply|review|pay|invoice\\s+(is|due)|waiting|answer|confirm|sign|we|have|has|need|needs)\\b/i`;
  return new RegExp(waarde).test(tekst);
}
