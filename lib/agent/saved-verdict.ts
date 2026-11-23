import "server-only";

import { askModel } from "./classify";
import { loadAgentConfig } from "./config";
import { setSavedVerdict } from "./store";
import { listThreadMessages } from "../gmail/store";

const SYSTEM = `Je kijkt naar één e-mailgesprek dat de gebruiker heeft bewaard.
Bepaal of het gesprek tot stilstand is gekomen en de mail alleen ter informatie is,
of dat er nog iets van de gebruiker verwacht wordt.
Antwoord met precies deze JSON: {"gestopt":true|false,"waarom":"<max 8 woorden>"}
gestopt = niets meer nodig; de mail is een bevestiging, ontvangstbewijs, kennisgeving of afgerond antwoord.
niet gestopt = er wacht nog een actie, beslissing, betaling of antwoord van de gebruiker.`;

/**
 * Bij bewaren bepaalt het model of het gesprek klaar is of dat er nog iets
 * wacht. Zo zegt de pil op de kaart of bewaren het einde was of niet.
 */
export async function judgeSavedConversation(userId: string, conversationId: string): Promise<boolean> {
  const config = await loadAgentConfig().catch(() => null);
  const provider = config?.defaultProvider ?? "openai";
  const entry = config?.providers?.[provider];
  if (!entry?.apiKey) return false;

  let messages;
  try {
    messages = await listThreadMessages(userId, conversationId);
  } catch {
    return false;
  }
  if (messages.length === 0) return false;

  const laatste = messages[messages.length - 1];
  const user = [
    `afzender: ${laatste.from} <${laatste.fromEmail}>`,
    `onderwerp: ${laatste.subject}`,
    `berichten in het gesprek: ${messages.length}`,
    `laatste bericht: ${(laatste.body ?? laatste.snippet ?? "").slice(0, 2500)}`,
  ].join("\n");

  try {
    const antwoord = await askModel({ provider, apiKey: entry.apiKey, model: entry.model, system: SYSTEM, user });
    const parsed = JSON.parse(antwoord.slice(antwoord.indexOf("{"), antwoord.lastIndexOf("}") + 1)) as {
      gestopt?: boolean;
      waarom?: string;
    };
    if (typeof parsed.gestopt !== "boolean") return false;
    await setSavedVerdict(conversationId, {
      stopped: parsed.gestopt,
      reason: typeof parsed.waarom === "string" ? parsed.waarom.slice(0, 60) : undefined,
      at: new Date().toISOString(),
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Bewaarde mails van vóór dit oordeel krijgen het alsnog, een paar per ronde,
 * zodat een achterstand zichzelf inloopt zonder de cron te belasten.
 */
export async function backfillSavedVerdicts(userId: string, limit = 2): Promise<number> {
  const { readAssessments } = await import("./store");
  const items = await readAssessments();
  const zonder = items
    .filter((item) => item.savedAt && !item.savedVerdict)
    .sort((a, b) => Date.parse(b.savedAt ?? "") - Date.parse(a.savedAt ?? ""))
    .slice(0, limit);

  let done = 0;
  for (const item of zonder) {
    if (await judgeSavedConversation(userId, item.conversationId)) done += 1;
  }
  return done;
}
