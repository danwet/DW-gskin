import "server-only";

import { listThreadMessages } from "../gmail/store";
import type { MailAssessment } from "./types";

/**
 * De afzenderkolom hoort altijd de andere partij te tonen. Staat er je eigen
 * naam op een kaart (omdat het gesprek op dat moment alleen jouw berichten
 * bevatte), dan zoeken we in de opgeslagen berichten de eerste afzender die
 * niet van jou is en gebruiken we die naam.
 */
export async function vulTegenpartij(
  userId: string,
  items: MailAssessment[],
  ownerEmail: string | null | undefined,
): Promise<MailAssessment[]> {
  const eigen = (ownerEmail ?? "").trim().toLowerCase();
  if (!eigen) return items;

  const nodig = new Set(
    items
      .filter((item) => (item.fromEmail ?? "").trim().toLowerCase() === eigen)
      .map((item) => item.conversationId),
  );
  if (nodig.size === 0) return items;

  const perThread = new Map<string, { name: string; email: string }>();
  for (const threadId of nodig) {
    const berichten = await listThreadMessages(userId, threadId).catch(() => []);
    // Het oudste bericht van de andere partij is de oorspronkelijke afzender.
    const ander = berichten.find(
      (bericht) => (bericht.fromEmail ?? "").trim().toLowerCase() !== eigen && bericht.fromEmail,
    );
    if (ander) perThread.set(threadId, { name: ander.from || ander.fromEmail, email: ander.fromEmail });
  }

  return items.map((item) => {
    const ander = perThread.get(item.conversationId);
    if (!ander) return item;
    return { ...item, from: ander.name, fromEmail: ander.email };
  });
}
