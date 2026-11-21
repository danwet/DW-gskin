import { sessionUser, unauthorized } from "@/lib/api-auth";
import { deleteGmailConnection } from "@/lib/gmail/connection";

export const dynamic = "force-dynamic";

/** Removes the Gmail link for this user. Messages and cards stay in place. */
export async function POST() {
  const user = await sessionUser();
  if (!user) return unauthorized();

  try {
    await deleteGmailConnection(user.id);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Ontkoppelen mislukt." }, { status: 503 });
  }
}
