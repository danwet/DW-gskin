import { sessionUser, unauthorized } from "@/lib/api-auth";
import { readNotificationState, writeNotificationState } from "@/lib/agent/store";

export const dynamic = "force-dynamic";

/** Reading state of the notification bell, shared across devices. */
export async function GET() {
  const user = await sessionUser();
  if (!user) return unauthorized();

  const state = await readNotificationState();
  return Response.json(state);
}

export async function POST(request: Request) {
  const user = await sessionUser();
  if (!user) return unauthorized();

  const body = (await request.json().catch(() => null)) as
    | { since?: string | null; read?: string[]; markAllRead?: boolean }
    | null;
  if (!body) return Response.json({ error: "Ongeldige aanvraag." }, { status: 400 });

  if (body.markAllRead) {
    await writeNotificationState({ since: new Date().toISOString(), read: [] });
  } else {
    const patch: { since?: string | null; read?: string[] } = {};
    if (body.since !== undefined) patch.since = body.since;
    if (Array.isArray(body.read)) patch.read = body.read.filter((id) => typeof id === "string");
    await writeNotificationState(patch);
  }

  const state = await readNotificationState();
  return Response.json(state);
}
