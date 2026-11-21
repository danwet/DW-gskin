import { sessionUser, unauthorized } from "@/lib/api-auth";
import { getGmailRefreshToken } from "@/lib/gmail/connection";
import { refreshGoogleAccessToken } from "@/lib/google-token";
import { extractPdfTextStrict } from "@/lib/scan/extract";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

type PartInfo = { mimeType: string; filename: string; size: number | null; attachmentId: boolean; inline: boolean };

/** Walks the payload and reports the structure, never the content. */
function describeParts(payload: unknown): PartInfo[] {
  const out: PartInfo[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const part = node as {
      mimeType?: string;
      filename?: string;
      body?: { attachmentId?: string; data?: string; size?: number };
      parts?: unknown[];
    };
    if (part.mimeType || part.filename) {
      out.push({
        mimeType: part.mimeType ?? "",
        filename: part.filename ?? "",
        size: part.body?.size ?? null,
        attachmentId: Boolean(part.body?.attachmentId),
        inline: Boolean(part.body?.data),
      });
    }
    for (const child of part.parts ?? []) walk(child);
  };
  walk(payload);
  return out;
}

/**
 * Diagnostic: shows how Gmail structures the newest matching messages and
 * whether the PDF text can be extracted. Read-only, session-bound.
 */
export async function GET(request: Request) {
  const user = await sessionUser();
  if (!user) return unauthorized();

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() || "in:inbox";
  const limit = Math.min(Number(url.searchParams.get("n") ?? 2) || 2, 5);

  const refreshToken = await getGmailRefreshToken(user.id);
  if (!refreshToken) return Response.json({ error: "Geen leesbare Gmail-token op deze omgeving." }, { status: 409 });
  const token = await refreshGoogleAccessToken(refreshToken);
  if (!token) return Response.json({ error: "Token kon niet worden vernieuwd." }, { status: 502 });

  const auth = { Authorization: `Bearer ${token.access_token}` };
  const listResponse = await fetch(
    `${GMAIL_API}/messages?${new URLSearchParams({ q: query, maxResults: String(limit) })}`,
    { headers: auth },
  );
  if (!listResponse.ok) return Response.json({ error: `Gmail list faalde (${listResponse.status}).` }, { status: 502 });
  const list = (await listResponse.json().catch(() => null)) as { messages?: { id?: string }[] } | null;

  const results = [];
  for (const entry of (list?.messages ?? []).slice(0, limit)) {
    if (!entry.id) continue;
    const messageResponse = await fetch(`${GMAIL_API}/messages/${entry.id}?format=full`, { headers: auth });
    if (!messageResponse.ok) continue;
    const message = (await messageResponse.json().catch(() => null)) as {
      payload?: unknown;
      snippet?: string;
    } | null;

    const parts = describeParts(message?.payload);
    const pdf = parts.find((p) => p.mimeType.startsWith("application/pdf") || /\.pdf$/i.test(p.filename));

    let pdfText = "";
    let pdfError: string | null = null;
    let pdfSource = "none";

    if (pdf) {
      const raw = message?.payload as { parts?: unknown[] } | undefined;
      // Grab the actual PDF part: inline bytes or an attachmentId.
      const grab = (node: unknown): { data?: string; attachmentId?: string } => {
        if (!node || typeof node !== "object") return {};
        const part = node as {
          mimeType?: string;
          filename?: string;
          body?: { data?: string; attachmentId?: string };
          parts?: unknown[];
        };
        if ((part.mimeType ?? "").startsWith("application/pdf") || /\.pdf$/i.test(part.filename ?? "")) {
          if (part.body?.data) return { data: part.body.data };
          if (part.body?.attachmentId) return { attachmentId: part.body.attachmentId };
        }
        for (const child of part.parts ?? []) {
          const found = grab(child);
          if (found.data || found.attachmentId) return found;
        }
        return {};
      };

      const part = grab(raw);
      let base64 = part.data ?? "";
      if (base64) pdfSource = "inline";
      else if (part.attachmentId) {
        pdfSource = "attachment";
        const download = await fetch(
          `${GMAIL_API}/messages/${entry.id}/attachments/${encodeURIComponent(part.attachmentId)}`,
          { headers: auth },
        );
        if (!download.ok) {
          pdfError = `download faalde (${download.status})`;
        } else {
          const payload = (await download.json().catch(() => null)) as { data?: string } | null;
          base64 = payload?.data ?? "";
          if (!base64) pdfError = "download gaf geen data";
        }
      } else {
        pdfError = "geen bytes en geen attachmentId";
      }

      if (base64) {
        try {
          pdfText = await extractPdfTextStrict(
            Buffer.from(base64.replace(/-/g, "+").replace(/_/g, "/"), "base64"),
          );
          if (!pdfText.trim()) pdfError = "extractie gaf lege tekst";
        } catch (error) {
          pdfError = `extractie mislukt: ${error instanceof Error ? error.message : "onbekend"}`;
        }
      }
    }

    results.push({
      id: entry.id,
      snippet: (message?.snippet ?? "").slice(0, 80),
      parts,
      pdfFound: Boolean(pdf),
      pdfSource,
      pdfError,
      pdfTextLength: pdfText.length,
      pdfTextStart: pdfText.slice(0, 160).replace(/\s+/g, " "),
    });
  }

  return Response.json({ v: 2, query, results });
}
