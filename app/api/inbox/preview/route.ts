import { sessionUser } from "@/lib/api-auth";
import { sanitizeEmailHtml } from "@/lib/gmail/html";
import { storedMessageHtml } from "@/lib/gmail/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await sessionUser();
  if (!user) return new Response("Niet ingelogd", { status: 401 });

  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id) return new Response("Onbekend bericht", { status: 400 });

  const html = await storedMessageHtml(user.id, id);
  if (!html) return new Response("Geen inhoud", { status: 404 });

  const cleaned = sanitizeEmailHtml(html);
  return new Response(cleaned, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, max-age=300",
      // Only images may be fetched from anywhere; no scripts at all.
      "Content-Security-Policy":
        "default-src 'none'; img-src * data:; style-src 'unsafe-inline'; font-src * data:;",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
