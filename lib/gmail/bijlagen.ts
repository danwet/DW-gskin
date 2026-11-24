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

/** Zoekt in een bericht naar PDF-bijlagen. */
function zoekPdf(payload: unknown): { filename: string; attachmentId?: string; data?: string }[] {
  const gevonden: { filename: string; attachmentId?: string; data?: string }[] = [];
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

/**
 * Haalt de factuurbijlage van een gesprek op: de nieuwste PDF die in een van de
 * berichten hangt. Geeft null als er geen PDF is.
 */
export async function haalFactuurbijlage(
  accessToken: string,
  messageIds: string[],
): Promise<{ filename: string; buffer: Buffer } | null> {
  for (const id of messageIds) {
    const response = await fetch(`${GMAIL_API}/messages/${encodeURIComponent(id)}?format=full`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) continue;
    const bericht = (await response.json().catch(() => null)) as { payload?: unknown } | null;
    const pdf = zoekPdf(bericht?.payload)[0];
    if (!pdf) continue;

    if (pdf.data) {
      return { filename: pdf.filename, buffer: naarBuffer(pdf.data) };
    }
    if (!pdf.attachmentId) continue;
    const bijlage = await fetch(
      `${GMAIL_API}/messages/${encodeURIComponent(id)}/attachments/${encodeURIComponent(pdf.attachmentId)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!bijlage.ok) continue;
    const data = (await bijlage.json().catch(() => null)) as { data?: string } | null;
    if (!data?.data) continue;
    return { filename: pdf.filename, buffer: naarBuffer(data.data) };
  }
  return null;
}
