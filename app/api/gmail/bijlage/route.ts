import { sessionUser, unauthorized } from "@/lib/api-auth";
import { refreshGoogleAccessToken } from "@/lib/google-token";
import { gmailRefreshTokenState, resolveGmailConnection } from "@/lib/gmail/connection";
import { haalFactuurbijlage } from "@/lib/gmail/bijlagen";
import { readAssessments } from "@/lib/agent/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Downloadt de factuurbijlage (PDF) van een gesprek. */
export async function GET(request: Request) {
  const user = await sessionUser();
  if (!user) return unauthorized();

  const conversationId = new URL(request.url).searchParams.get("conversationId") ?? "";
  if (!conversationId) return Response.json({ error: "Gesprek ontbreekt." }, { status: 400 });

  const connection = await resolveGmailConnection(user.id, user.email).catch(() => null);
  if (!connection) return Response.json({ error: "Gmail is niet gekoppeld." }, { status: 400 });

  const tokenState = await gmailRefreshTokenState(connection.userId);
  if (!tokenState.ok) return Response.json({ error: "De Gmail-koppeling is niet bruikbaar." }, { status: 409 });

  const token = await refreshGoogleAccessToken(tokenState.token);
  if (!token) return Response.json({ error: "Gmail-token kon niet worden vernieuwd." }, { status: 502 });

  // Zoektermen voor als de herinnering zelf geen pdf heeft: eerst het
  // notanummer, dan de afzender.
  const kaart = (await readAssessments()).find((item) => item.conversationId === conversationId);
  const zoektermen = [kaart?.invoice?.invoiceNumber ?? "", kaart?.invoice?.supplier ?? ""];

  const bijlage = await haalFactuurbijlage(token.access_token, conversationId, zoektermen);
  if (!bijlage) return Response.json({ error: "Deze mail heeft geen pdf-bijlage." }, { status: 404 });

  const naam = bijlage.filename.replace(/["\\]/g, "").trim() || "factuur.pdf";
  return new Response(new Uint8Array(bijlage.buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${naam}"`,
      "Content-Length": String(bijlage.buffer.length),
      "Cache-Control": "no-store",
    },
  });
}
