import { sessionUser, unauthorized } from "@/lib/api-auth";
import { markHandled, readAssessments, readMeta, saveConversation, setDeclaration, snoozeConversation } from "@/lib/agent/store";
import { loadAgentConfig } from "@/lib/agent/config";
import { gmailConfigured, resolveMailSource } from "@/lib/agent/mail-source";
import { runMailAgent } from "@/lib/agent/pipeline";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await sessionUser();
  if (!user) return unauthorized();

  try {
    const config = await loadAgentConfig();
    const source = resolveMailSource(config);
    const provider = config.providers[config.defaultProvider];
    const model = provider?.apiKey ? (provider.model || config.defaultProvider) : "rule";

    let meta = await readMeta();

    if (source === "gmail") {
      // A deliberate switch to Gmail must never keep showing fixture cards.
      if (!gmailConfigured(config)) {
        return Response.json({
          items: [],
          meta,
          model: "rule",
          error:
            "Gmail is nog niet gekoppeld. Koppel Gmail bij Instellingen → Verbindingen, of kies Testdata als mailbron.",
        });
      }
      if (meta.source !== "gmail") {
        // First real Gmail run replaces the fixture view with live mail.
        await runMailAgent();
        meta = await readMeta();
      }
      if (meta.source !== "gmail") {
        return Response.json({
          items: [],
          meta,
          model,
          error: "Gmail is gekoppeld, maar de mailbox kon nog niet gelezen worden. Probeer het later opnieuw.",
        });
      }
      return Response.json({ items: await readAssessments(), meta, model });
    }

    // Fixtures: seed the demo data on first use when the store has never run.
    if (!meta.lastRunAt) {
      await runMailAgent();
    }

    const [items, latestMeta] = await Promise.all([readAssessments(), readMeta()]);
    return Response.json({
      items,
      meta: latestMeta,
      model,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Inbox kon niet worden geladen.";
    return Response.json({ error: message }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const user = await sessionUser();
  if (!user) return unauthorized();

  const body = (await request.json().catch(() => null)) as {
    conversationId?: unknown;
    handled?: unknown;
    snoozedUntil?: unknown;
    declaration?: unknown;
    saved?: unknown;
  } | null;
  const conversationId = typeof body?.conversationId === "string" ? body.conversationId : "";
  if (!conversationId) {
    return Response.json({ error: "conversationId is required" }, { status: 400 });
  }

  const declaration =
    body?.declaration === "none" || body?.declaration === "pending" || body?.declaration === "declared"
      ? body.declaration
      : body?.declaration === null
        ? null
        : undefined;

  if (declaration !== undefined) {
    const item = await setDeclaration(conversationId, declaration);
    if (!item) return Response.json({ error: "Conversation not found" }, { status: 404 });
    return Response.json({ ok: true, item });
  }

  if (body?.saved !== undefined && typeof body.saved === "boolean") {
    const item = await saveConversation(conversationId, body.saved);
    if (!item) return Response.json({ error: "Conversation not found" }, { status: 404 });
    return Response.json({ ok: true, item });
  }

  const snoozedUntil =
    typeof body?.snoozedUntil === "string" && Number.isFinite(Date.parse(body.snoozedUntil))
      ? new Date(body.snoozedUntil).toISOString()
      : null;

  const item = snoozedUntil
    ? await snoozeConversation(conversationId, snoozedUntil)
    : await markHandled(conversationId, body?.handled === true);

  if (!item) return Response.json({ error: "Conversation not found" }, { status: 404 });
  return Response.json({ ok: true, item });
}
