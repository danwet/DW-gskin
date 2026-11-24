import "server-only";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

/** Gmail levert base64url; Node wil er base64 van maken. */
function naarBuffer(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

type Deel = {
  mimeType?: string;
  filename?: string;
  body?: { attachmentId?: string; data?: string; size?: number };
  parts?: Deel[];
};

type Pdf = { filename: string; attachmentId?: string; data?: string };

/** Zoekt in een bericht naar PDF-bijlagen. */
function zoekPdf(payload: unknown): Pdf[] {
  const gevonden: Pdf[] = [];
  const loop = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const deel = node as Deel;
    const mime = (deel.mimeType ?? "").toLowerCase().split(";")[0].trim();
    const naam = deel.filename ?? "";
    if ((mime === "application/pdf" || /\.pdf$/i.test(naam)) && (deel.body?.attachmentId || deel.body?.data)) {
      gevonden.push({ filename: naam || "factuur.pdf", attachmentId: deel.body?.attachmentId, data: deel.body?.data });
    }
    for (const kind of deel.parts ?? []) loop(kind);
  };
  loop(payload);
  return gevonden;
}

/** Leest één bericht en pakt de eerste PDF die eraan hangt. */
async function pdfUitBericht(
  accessToken: string,
  id: string,
): Promise<{ filename: string; buffer: Buffer } | null> {
  const response = await fetch(`${GMAIL_API}/messages/${encodeURIComponent(id)}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;

  const bericht = (await response.json().catch(() => null)) as { payload?: unknown } | null;
  const pdf = zoekPdf(bericht?.payload)[0];
  if (!pdf) return null;
  if (pdf.data) return { filename: pdf.filename, buffer: naarBuffer(pdf.data) };
  if (!pdf.attachmentId) return null;

  const bijlage = await fetch(
    `${GMAIL_API}/messages/${encodeURIComponent(id)}/attachments/${encodeURIComponent(pdf.attachmentId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!bijlage.ok) return null;
  const data = (await bijlage.json().catch(() => null)) as { data?: string } | null;
  if (!data?.data) return null;
  return { filename: pdf.filename, buffer: naarBuffer(data.data) };
}

/**
 * Haalt de factuurbijlage van een gesprek op. Het gesprek wordt rechtstreeks bij
 * Gmail opgevraagd, zodat het niet uitmaakt of de berichtrijen hier nog staan.
 *
 * Een herinnering heeft vaak zelf geen bijlage; daarom zoeken we daarna op het
 * notanummer in de hele mailbox. Lukt dat ook niet, dan zoeken we op de afzender
 * met een bijlage.
 */
export async function haalFactuurbijlage(
  accessToken: string,
  threadId: string,
  zoektermen: string[] = [],
): Promise<{ filename: string; buffer: Buffer } | null> {
  const thread = await fetch(`${GMAIL_API}/threads/${encodeURIComponent(threadId)}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  }).catch(() => null);
  if (thread?.ok) {
    const data = (await thread.json().catch(() => null)) as { messages?: { id?: string }[] } | null;
    const ids = (data?.messages ?? [])
      .map((message) => message.id)
      .filter((id): id is string => Boolean(id))
      .reverse();
    for (const id of ids) {
      const gevonden = await pdfUitBericht(accessToken, id);
      if (gevonden) return gevonden;
    }
  }

  for (const term of zoektermen.map((value) => value.trim()).filter(Boolean)) {
    const zoek = await fetch(
      `${GMAIL_API}/messages?q=${encodeURIComponent(`${term} has:attachment`)}&maxResults=8`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    ).catch(() => null);
    if (!zoek?.ok) continue;
    const data = (await zoek.json().catch(() => null)) as { messages?: { id?: string }[] } | null;
    for (const bericht of data?.messages ?? []) {
      if (!bericht.id) continue;
      const gevonden = await pdfUitBericht(accessToken, bericht.id);
      if (gevonden) return gevonden;
    }
  }
  return null;
}

/** Alle berichten van een gesprek, rechtstreeks uit Gmail. */
export async function haalThreadBerichten(
  accessToken: string,
  threadId: string,
): Promise<{ id: string; fromEmail: string; from: string; subject: string; receivedAt: string }[]> {
  const thread = await fetch(`${GMAIL_API}/threads/${encodeURIComponent(threadId)}?format=metadata`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  }).catch(() => null);
  if (!thread?.ok) return [];
  const data = (await thread.json().catch(() => null)) as {
    messages?: { id?: string; payload?: { headers?: { name?: string; value?: string }[] }; internalDate?: string }[];
  } | null;
  const uit: { id: string; fromEmail: string; from: string; subject: string; receivedAt: string }[] = [];
  for (const bericht of data?.messages ?? []) {
    if (!bericht.id) continue;
    const kop = (naam: string) =>
      bericht.payload?.headers?.find((h) => (h.name ?? "").toLowerCase() === naam)?.value ?? "";
    const van = kop("from");
    const email = /<([^>]+)>/.exec(van)?.[1] ?? van;
    uit.push({
      id: bericht.id,
      fromEmail: email.trim().toLowerCase(),
      from: van.replace(/<[^>]*>/, "").replace(/"/g, "").trim(),
      subject: kop("subject"),
      receivedAt: bericht.internalDate ? new Date(Number(bericht.internalDate)).toISOString() : "",
    });
  }
  return uit;
}
