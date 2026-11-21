import { sessionUser, unauthorized } from "@/lib/api-auth";
import { attachScanToAssessment, findInvoiceDuplicate, readAssessment, upsertAssessments } from "@/lib/agent/store";
import type { MailAssessment } from "@/lib/agent/types";
import { isValidCalendarDate } from "@/lib/scan/validate";

export const dynamic = "force-dynamic";

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatAmount(amount: number, currency: string): string {
  const upper = currency.toUpperCase();
  const symbol = upper === "USD" ? "$" : upper === "GBP" ? "£" : "€";
  return `${symbol}${amount % 1 === 0 ? amount : amount.toFixed(2)}`;
}

export async function POST(request: Request) {
  const user = await sessionUser();
  if (!user) return unauthorized();

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Ongeldige aanvraag." }, { status: 400 });
  }

  const scanId = str(body.scanId);
  const storedName = str(body.storedName);
  const fileName = str(body.fileName);
  const mime = str(body.mime);
  const attachTo = str(body.attachToConversationId);
  const confirmDuplicate = body.confirmDuplicate === true;

  const supplier = str(body.supplier);
  const invoiceNumber = str(body.invoiceNumber);
  const dueDate = str(body.dueDate);

  if (!isValidCalendarDate(dueDate)) {
    return Response.json({ error: "Een geldige uiterste betaaldatum is verplicht." }, { status: 400 });
  }

  // Attach the scan to an existing invoice.
  if (attachTo) {
    const existing = await readAssessment(attachTo);
    if (!existing) return Response.json({ error: "Bestaande factuur niet gevonden." }, { status: 404 });
    const updated = await attachScanToAssessment(attachTo, { scanFileName: fileName, scanFilePath: storedName, scanMime: mime, ownerId: user.id });
    return Response.json({ ok: true, item: updated, attached: true });
  }

  // Prevent duplicates unless the user explicitly confirms a second copy.
  if (!confirmDuplicate) {
    const duplicate = await findInvoiceDuplicate(supplier, invoiceNumber);
    if (duplicate) {
      return Response.json({ ok: false, duplicate: true, existing: duplicate }, { status: 409 });
    }
  }

  if (!scanId) {
    return Response.json({ error: "scanId ontbreekt." }, { status: 400 });
  }

  const amountRaw = typeof body.amount === "number" && Number.isFinite(body.amount) && body.amount > 0
    ? Math.round(body.amount * 100) / 100
    : null;
  const currency = str(body.currency) || (amountRaw != null ? "EUR" : "");
  const paid = body.paid === true;
  const senderSays = str(body.senderSays);
  const now = new Date().toISOString();

  const assessment: MailAssessment = {
    conversationId: `scan-${scanId}`,
    subject: invoiceNumber ? `Factuur ${invoiceNumber}` : supplier || "Papieren factuur",
    from: supplier || "Papieren factuur",
    fromEmail: "",
    classification: "action_needed",
    nextAction: paid ? "Geen actie nodig — betaald" : amountRaw != null ? `Betaal factuur ${formatAmount(amountRaw, currency)}` : "Betaal factuur",
    priorityReason: paid ? "Betaald" : "Onbetaalde factuur",
    deadline: dueDate,
    consequence: senderSays ? { senderSays } : undefined,
    impact: paid ? undefined : senderSays ? "Incassokosten" : "Aanmaning volgt",
    invoice: {
      supplier,
      invoiceNumber,
      amount: amountRaw ?? undefined,
      currency,
      iban: str(body.iban),
      dueDate,
      paymentStatus: paid ? "paid_confirmed" : "unknown",
      paymentAdvice: paid ? "Handmatig als betaald gemarkeerd." : "Papieren factuur — controleer of deze al betaald is.",
      unreadAttachment: "",
    },
    preparedAction: "Scan opgeslagen",
    sourceMessageId: `scan-${scanId}`,
    receivedAt: now,
    updatedAt: now,
    handledByUser: paid,
    handledAt: paid ? now : undefined,
    paidAt: paid ? now : undefined,
    source: "scan",
    ownerId: user.id,
    scanFileName: fileName || storedName,
    scanFilePath: storedName,
    scanMime: mime,
  };

  const [saved] = await upsertAssessments([assessment]);
  return Response.json({ ok: true, item: saved });
}
