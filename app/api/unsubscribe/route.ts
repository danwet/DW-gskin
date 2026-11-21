import { sessionUser, unauthorized } from "@/lib/api-auth";
import { readAssessments, setUnsubscribeStatus } from "@/lib/agent/store";
import { performOneClickUnsubscribe, validateUnsubscribeUrl } from "@/lib/agent/unsubscribe";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request) {
  const user = await sessionUser();
  if (!user) return unauthorized();

  const body = (await request.json().catch(() => null)) as { messageId?: unknown } | null;
  const messageId = typeof body?.messageId === "string" ? body.messageId.trim() : "";
  if (!messageId) {
    return Response.json({ ok: false, message: "messageId ontbreekt." }, { status: 400 });
  }

  const items = await readAssessments();
  const item = items.find(
    (entry) => entry.sourceMessageId === messageId && entry.unsubscribe?.kind === "one-click",
  );
  if (!item || !item.unsubscribe?.url) {
    return Response.json({ ok: false, message: "Geen geldige afmelding gevonden." }, { status: 404 });
  }
  if (item.ownerId && item.ownerId !== user.id) {
    return Response.json({ ok: false, message: "Geen toegang." }, { status: 403 });
  }
  if (item.unsubscribe.status === "sending") {
    return Response.json({ ok: false, message: "Verzoek loopt al." }, { status: 409 });
  }

  const url = validateUnsubscribeUrl(item.unsubscribe.url);
  if (!url) {
    await setUnsubscribeStatus(item.conversationId, "error", "Ongeldige afmeldbestemming.");
    return Response.json({ ok: false, message: "Ongeldige afmeldbestemming." }, { status: 422 });
  }

  await setUnsubscribeStatus(item.conversationId, "sending");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const result = await performOneClickUnsubscribe(url, controller.signal);
    clearTimeout(timer);
    if (result.ok) {
      await setUnsubscribeStatus(item.conversationId, "sent");
      return Response.json({ ok: true, status: "sent" });
    }
    const message = `Afmelden is niet gelukt (HTTP ${result.status ?? "geen status"}).`;
    await setUnsubscribeStatus(item.conversationId, "error", message);
    return Response.json({ ok: false, status: "error", message }, { status: 502 });
  } catch {
    clearTimeout(timer);
    const message = "Afmelden is niet gelukt (time-out of netwerkfout).";
    await setUnsubscribeStatus(item.conversationId, "error", message);
    return Response.json({ ok: false, status: "error", message }, { status: 502 });
  }
}
