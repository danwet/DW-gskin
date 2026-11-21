import { sessionUser, unauthorized } from "@/lib/api-auth";
import { applyClientPatch, toWorkspace, updateUser, type UserStatePatch } from "@/lib/user-store";

export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  const user = await sessionUser();
  if (!user) return unauthorized();

  const body = (await request.json().catch(() => null)) as (UserStatePatch & { migrate?: unknown }) | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  const record = await updateUser(user.id, user.email, (current) => {
    applyClientPatch(current, body, body.migrate === true);
  });
  return Response.json({ state: toWorkspace(record) });
}
