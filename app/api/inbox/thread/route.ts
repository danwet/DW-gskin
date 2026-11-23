import { sessionUser, unauthorized } from "@/lib/api-auth";
import { listThreadMessages } from "@/lib/gmail/store";

export const dynamic = "force-dynamic";

/**
 * Het hele gesprek, inclusief onze eigen antwoorden. Zonder die berichten lijkt
 * een thread te eindigen bij de mail van de ander.
 */
export async function GET(request: Request) {
  const user = await sessionUser();
  if (!user) return unauthorized();

  const id = new URL(request.url).searchParams.get("conversationId") ?? "";
  if (!id) return Response.json({ error: "Onbekend gesprek." }, { status: 400 });

  const messages = await listThreadMessages(user.id, id).catch(() => []);
  const owner = (user.email ?? "").trim().toLowerCase();

  return Response.json({
    messages: messages.map((message) => ({
      id: message.id,
      from: message.from,
      fromEmail: message.fromEmail,
      fromMe: message.fromEmail.trim().toLowerCase() === owner,
      receivedAt: message.receivedAt,
      // De bijlagetekst hoort niet in het gesprek: dat is PDF-inhoud.
      text: (message.body ?? "")
        .replace(/^---\s*bijlage[\s\S]*$/i, "")
        .replace(/<\/?[^>]+>/g, " ")
        .replace(/\s*\n\s*/g, "\n")
        .trim()
        .slice(0, 4000),
    })),
  });
}
