import { sessionUser, unauthorized } from "@/lib/api-auth";
import { readAssessments } from "@/lib/agent/store";

export const dynamic = "force-dynamic";

/**
 * Alleen wat de notificatiebel nodig heeft: geen mailtekst, geen concepten en
 * geen HTML. Zo kost het pollen een paar kilobyte in plaats van een half
 * megabyte.
 */
export async function GET() {
  const user = await sessionUser();
  if (!user) return unauthorized();

  const items = (await readAssessments())
    .filter((item) => item.mailbox === "gmail")
    .map((item) => ({
      conversationId: item.conversationId,
      subject: item.subject,
      shortSubject: item.shortSubject,
      from: item.from,
      fromEmail: item.fromEmail,
      receivedAt: item.receivedAt,
      classification: item.classification,
      archivedAt: item.archivedAt,
      savedAt: item.savedAt,
      tier: item.tier,
    }));

  return Response.json({ items });
}
