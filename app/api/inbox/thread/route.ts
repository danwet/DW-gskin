import { sessionUser, unauthorized } from "@/lib/api-auth";
import { listThreadMessages } from "@/lib/gmail/store";

export const dynamic = "force-dynamic";

/** Het hele gesprek, inclusief onze eigen antwoorden en wanneer ze verstuurd zijn. */
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
      subject: message.subject,
      text: (message.body ?? "")
        .replace(/^---\s*bijlage[\s\S]*$/i, "")
        .replace(/<\/?[^>]+>/g, " ")
        .replace(/\s*\n\s*/g, "\n")
        .trim()
        .slice(0, 4000),
    })),
  });
}
