import { sessionUser, unauthorized } from "@/lib/api-auth";
import { loadAgentConfig } from "@/lib/agent/config";
import { getGmailRefreshToken } from "@/lib/gmail/connection";
import { sendGmailMessage, type Attachment } from "@/lib/agent/gmail-send";
import { opschonenHandtekening } from "@/lib/handtekening";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Een nieuwe mail, dus zonder gesprek: alleen Aan, CC, BCC en Onderwerp. */
export async function POST(request: Request) {
  const user = await sessionUser();
  if (!user) return unauthorized();

  const form = await request.formData().catch(() => null);
  const veld = (naam: string) => (typeof form?.get(naam) === "string" ? (form.get(naam) as string).trim() : "");

  const to = veld("to");
  const cc = veld("cc");
  const bcc = veld("bcc");
  const subject = veld("subject");
  const body = typeof form?.get("body") === "string" ? (form.get("body") as string) : "";
  const bodyHtml = typeof form?.get("html") === "string" ? (form.get("html") as string) : "";

  if (!to) return Response.json({ ok: false, error: "Vul bij Aan een e-mailadres in." }, { status: 400 });
  if (!subject) return Response.json({ ok: false, error: "Vul een onderwerp in." }, { status: 400 });
  if (!body.trim()) return Response.json({ ok: false, error: "De mail is nog leeg." }, { status: 400 });

  const attachments: Attachment[] = [];
  for (const entry of form?.getAll("files") ?? []) {
    if (!(entry instanceof File)) continue;
    attachments.push({
      filename: entry.name || "bijlage",
      mimeType: entry.type || "application/octet-stream",
      content: Buffer.from(await entry.arrayBuffer()),
    });
  }

  const config = await loadAgentConfig();
  const refreshToken = (await getGmailRefreshToken(user.id)) ?? config.gmailRefreshToken;
  if (!refreshToken) {
    return Response.json({ ok: false, error: "Gmail is niet gekoppeld." }, { status: 409 });
  }

  const result = await sendGmailMessage({
    refreshToken,
    from: user.email,
    to,
    cc: cc || undefined,
    bcc: bcc || undefined,
    subject,
    body,
    bodyHtml: bodyHtml ? opschonenHandtekening(bodyHtml) : undefined,
    signatureHtml:
      (form?.get("signature") === "included" ? "" : opschonenHandtekening(config.emailSignature)) || undefined,
    attachments,
  });

  if (!result.ok) {
    return Response.json({ ok: false, error: result.message ?? "Versturen mislukte." }, { status: 502 });
  }
  return Response.json({ ok: true, id: result.id ?? "" });
}
