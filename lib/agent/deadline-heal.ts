import "server-only";

import { askModel } from "./classify";
import { loadAgentConfig } from "./config";
import { readAssessments, setAssessmentDeadlines, type DeadlineWijziging } from "./store";

/** Bewijsversie: bij een nieuwe regel doen bestaande kaarten opnieuw mee. */
export const DEADLINE_VERSION = 2;

const SYSTEM = `Je controleert of een e-mail zelf een datum of termijn noemt.
Antwoord met precies deze JSON: {"datum":"YYYY-MM-DD of null","termijn":"korte uitleg"}
Regels:
- Noem alleen een datum als die letterlijk in de mail staat, of als de mail een
  termijn noemt ("binnen 14 dagen") die je omrekent vanaf de ontvangstdatum.
- Staat er geen datum en geen termijn in? Dan is datum null. Verzin niets.
- Gebruik de ontvangstdatum als anker voor een genoemde termijn.`;

/**
 * Bestaande kaarten kunnen een datum dragen die het model ooit verzon. Hier
 * vragen we het model opnieuw, een paar kaarten per ronde, en zetten we de
 * normale reactietermijn neer als de mail geen datum noemt.
 */
export async function healDeadlines(limit = 3): Promise<number> {
  const config = await loadAgentConfig().catch(() => null);
  const provider = config?.defaultProvider ?? "openai";
  const entry = config?.providers?.[provider];
  if (!entry?.apiKey) return 0;

  const items = await readAssessments();
  const kandidaten = items
    .filter(
      (item) =>
        !item.invoice &&
        (item.classification === "action_needed" || item.classification === "reply_needed") &&
        (item.deadlineVersion ?? 1) < DEADLINE_VERSION,
    )
    .sort((a, b) => Date.parse(b.receivedAt ?? "") - Date.parse(a.receivedAt ?? ""))
    .slice(0, limit);

  let hersteld = 0;
  const wijzigingen: DeadlineWijziging[] = [];
  for (const item of kandidaten) {
    try {
      const antwoord = await askModel({
        provider,
        apiKey: entry.apiKey,
        model: entry.model,
        system: SYSTEM,
        user: [
          `ontvangen: ${(item.receivedAt ?? "").slice(0, 10)}`,
          `onderwerp: ${item.subject}`,
          `tekst: ${(item.body ?? item.subject ?? "").slice(0, 1500)}`,
        ].join("\n"),
      });
      const json = antwoord.slice(antwoord.indexOf("{"), antwoord.lastIndexOf("}") + 1);
      const parsed = JSON.parse(json) as { datum?: string | null };
      const datum = typeof parsed.datum === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.datum) ? parsed.datum : null;

      let volgende = datum;
      if (!volgende) {
        const basis = new Date(item.receivedAt ?? "");
        if (Number.isNaN(basis.getTime())) continue;
        basis.setDate(basis.getDate() + 3);
        volgende = basis.toLocaleDateString("sv-SE");
      }
      wijzigingen.push({ conversationId: item.conversationId, deadline: volgende, version: DEADLINE_VERSION });
      hersteld += 1;
    } catch {
      // Volgende ronde opnieuw.
    }
  }
  await setAssessmentDeadlines(wijzigingen);
  return hersteld;
}
