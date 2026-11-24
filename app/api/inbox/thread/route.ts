import { sessionUser, unauthorized } from "@/lib/api-auth";
import { listThreadMessages, saveMessages } from "@/lib/gmail/store";
import { fetchGmailMessage } from "@/lib/gmail/fetch";
import { gmailRefreshTokenState, resolveGmailConnection } from "@/lib/gmail/connection";
import { refreshGoogleAccessToken } from "@/lib/google-token";

export const dynamic = "force-dynamic";

/** Het hele gesprek, inclusief onze eigen antwoorden en wanneer ze verstuurd zijn. */
export async function GET(request: Request) {
  const user = await sessionUser();
  if (!user) return unauthorized();

  const id = new URL(request.url).searchParams.get("conversationId") ?? "";
  if (!id) return Response.json({ error: "Onbekend gesprek." }, { status: 400 });

  let messages = await listThreadMessages(user.id, id).catch(() => []);
  const owner = (user.email ?? "").trim().toLowerCase();

  // De opslag kan onvolledig zijn (berichten die ooit zijn opgeruimd). Vraag het
  // gesprek dan bij Gmail op en zet het terug, zodat de geschiedenis compleet is.
  if (messages.length > 0) {
    const connection = await resolveGmailConnection(user.id, user.email).catch(() => null);
    const tokenState = connection ? await gmailRefreshTokenState(connection.userId).catch(() => null) : null;
    if (connection && tokenState?.ok) {
      const token = await refreshGoogleAccessToken(tokenState.token).catch(() => null);
      if (token) {
        const thread = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(id)}?format=minimal`,
          { headers: { Authorization: `Bearer ${token.access_token}` } },
        )
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null) as { messages?: { id?: string }[] } | null;
        const inGmail = (thread?.messages ?? []).map((m) => m.id).filter((x): x is string => Boolean(x));
        if (inGmail.length > messages.length) {
          const opgehaald = [];
          for (const berichtId of inGmail.slice(-20)) {
            const bericht = await fetchGmailMessage(token.access_token, berichtId);
            if (bericht) opgehaald.push(bericht);
          }
          if (opgehaald.length > 0) {
            await saveMessages(connection.userId, opgehaald).catch(() => undefined);
            messages = await listThreadMessages(user.id, id).catch(() => messages);
          }
        }
      }
    }
  }

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
