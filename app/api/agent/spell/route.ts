import { sessionUser, unauthorized } from "@/lib/api-auth";
import { askModel } from "@/lib/agent/classify";
import { loadAgentConfig } from "@/lib/agent/config";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SYSTEM = `Je corrigeert een e-mail die iemand zelf heeft getypt.
Regels:
- Verbeter alleen spelfouten, typefouten en duidelijke grammaticale fouten.
- Behoud de taal, de toon, de stijl en de betekenis. Herschrijf niets.
- Verander geen namen, getallen, bedragen of data.
- Behoud de alinea-indeling.
Antwoord met alleen de gecorrigeerde tekst, zonder uitleg of aanhalingstekens.`;

/** Haalt spelfouten uit de getypte tekst voordat je verstuurt. */
export async function POST(request: Request) {
  const user = await sessionUser();
  if (!user) return unauthorized();

  const body = (await request.json().catch(() => null)) as { text?: string } | null;
  const tekst = typeof body?.text === "string" ? body.text : "";
  if (!tekst.trim()) return Response.json({ ok: true, text: tekst });

  const config = await loadAgentConfig();
  const provider = config.defaultProvider ?? "openai";
  const entry = config.providers?.[provider];
  if (!entry?.apiKey) {
    return Response.json({ ok: false, error: "Er is geen model met een API-sleutel ingesteld." }, { status: 409 });
  }

  try {
    const antwoord = await askModel({
      provider,
      apiKey: entry.apiKey,
      model: entry.model,
      system: SYSTEM,
      user: tekst,
    });
    // Soms komt het antwoord in een codeblok of met aanhalingstekens.
    let schoon = antwoord.replace(/^```[a-z]*\n?/i, "").replace(/```$/i, "").trim();

    // Het model antwoordt soms met JSON in plaats van platte tekst.
    if (schoon.startsWith("{")) {
      try {
        const parsed = JSON.parse(schoon) as Record<string, unknown>;
        const waarde = Object.values(parsed).find((entry) => typeof entry === "string" && entry.trim());
        if (typeof waarde === "string") schoon = waarde.trim();
      } catch {
        // Geen geldige JSON: laat de tekst zoals hij is.
      }
    }
    const eerste = schoon.charAt(0);
    const laatste = schoon.charAt(schoon.length - 1);
    if (schoon.length > 1 && /["'“”]/.test(eerste) && /["'“”]/.test(laatste)) {
      schoon = schoon.slice(1, -1).trim();
    }

    // Leeg of nog steeds JSON? Dan is het antwoord onbruikbaar en laten we de
    // tekst van de gebruiker met rust.
    const onbruikbaar = !schoon.trim() || schoon.trim().startsWith("{") || schoon.trim().startsWith("[");
    if (onbruikbaar) return Response.json({ ok: true, text: tekst, ongewijzigd: true });
    return Response.json({ ok: true, text: schoon || tekst });
  } catch {
    return Response.json({ ok: false, error: "De AI kon de tekst niet nakijken." }, { status: 502 });
  }
}
