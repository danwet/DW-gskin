import "server-only";

import { readAssessments, setAssessmentTegenpartijen, type TegenpartijWijziging } from "./store";
import type { MailAssessment } from "./types";
import { fetchGmailMessage } from "../gmail/fetch";
import type { InboundMessage } from "./types";
import { saveMessages } from "../gmail/store";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

type Kop = { id: string; fromEmail: string; from: string; receivedAt: string };

/** Leest de afzenders van een gesprek bij Gmail. */
async function threadAfzenders(accessToken: string, threadId: string): Promise<Kop[]> {
  const thread = await fetch(`${GMAIL_API}/threads/${encodeURIComponent(threadId)}?format=metadata`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  }).catch(() => null);
  if (!thread?.ok) return [];
  const data = (await thread.json().catch(() => null)) as {
    messages?: { id?: string; payload?: { headers?: { name?: string; value?: string }[] }; internalDate?: string }[];
  } | null;
  const uit: Kop[] = [];
  for (const bericht of data?.messages ?? []) {
    const kop = (naam: string) =>
      bericht.payload?.headers?.find((h) => (h.name ?? "").toLowerCase() === naam)?.value ?? "";
    const van = kop("from");
    const email = (/<([^>]+)>/.exec(van)?.[1] ?? van).trim().toLowerCase();
    if (!email) continue;
    uit.push({
      id: bericht.id ?? "",
      fromEmail: email,
      from: van.replace(/<[^>]*>/, "").replace(/"/g, "").trim(),
      receivedAt: bericht.internalDate ? new Date(Number(bericht.internalDate)).toISOString() : "",
    });
  }
  return uit;
}

/**
 * Kaarten waar je eigen naam op staat: het gesprek had op dat moment alleen jouw
 * berichten in de opslag. We halen het gesprek bij Gmail op, zetten de berichten
 * terug (zodat de geschiedenis weer compleet is) en naam de kaart naar de andere
 * partij.
 */
export async function healCounterparty(
  userId: string,
  accessToken: string,
  ownerEmail: string | null | undefined,
  limit = 3,
): Promise<number> {
  const items = await readAssessments();
  return herstelTegenpartijen(userId, accessToken, ownerEmail, items, limit);
}

/**
 * Zelfde herstel, maar voor een lijst die al geladen is. De inbox-route gebruikt
 * dit zodat de afzenderkolom meteen klopt in plaats van pas na een sync.
 */
export async function herstelTegenpartijen(
  userId: string,
  accessToken: string,
  ownerEmail: string | null | undefined,
  items: MailAssessment[],
  limit = 3,
): Promise<number> {
  const owner = (ownerEmail ?? "").trim().toLowerCase();
  if (!owner) return 0;

  const week = 7 * 24 * 60 * 60 * 1000;
  const kandidaten = items
    .filter((item) => (item.fromEmail ?? "").trim().toLowerCase() === owner)
    // Onlangs geprobeerd en niets gevonden? Niet elke keer opnieuw vragen.
    .filter((item) => !item.counterpartyCheckedAt || Date.now() - Date.parse(item.counterpartyCheckedAt) > week)
    .sort((a, b) => Date.parse(b.receivedAt ?? "") - Date.parse(a.receivedAt ?? ""))
    .slice(0, limit);

  let hersteld = 0;
  const wijzigingen: TegenpartijWijziging[] = [];
  for (const item of kandidaten) {
    const afzenders = await threadAfzenders(accessToken, item.conversationId);
    const ander = afzenders.find((entry) => entry.fromEmail !== owner);
    if (!ander) {
      wijzigingen.push({ conversationId: item.conversationId, gecontroleerd: true });
      continue;
    }

    // Berichten terugzetten zodat de geschiedenis in de sheet te zien is.
    const berichten: InboundMessage[] = [];
    for (const entry of afzenders) {
      if (!entry.id) continue;
      const bericht = await fetchGmailMessage(accessToken, entry.id);
      if (bericht) berichten.push(bericht);
    }
    if (berichten.length > 0) await saveMessages(userId, berichten).catch(() => undefined);

    wijzigingen.push({
      conversationId: item.conversationId,
      from: ander.from,
      fromEmail: ander.fromEmail,
      gecontroleerd: true,
    });
    hersteld += 1;
  }
  await setAssessmentTegenpartijen(wijzigingen);
  return hersteld;
}
