import { sessionUser, unauthorized } from "@/lib/api-auth";
import { markHandled, readAssessments, readMeta, saveConversation, setDeclaration, snoozeConversation } from "@/lib/agent/store";
import { loadAgentConfig } from "@/lib/agent/config";
import { runMailAgent } from "@/lib/agent/pipeline";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await sessionUser();
  if (!user) return unauthorized();

  // Seed the demo/fixture data on first use when the store has never run yet.
  const initialMeta = await readMeta();
  if (!initialMeta.lastRunAt) {
    await runMailAgent();
  }

  const [items, meta, config] = await Promise.all([readAssessments(), readMeta(), loadAgentConfig()]);
  const provider = config.providers[config.defaultProvider];
  const model = provider?.apiKey ? (provider.model || config.defaultProvider) : "rule";
  return Response.json({
    items,
    meta,
    model,
  });
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
