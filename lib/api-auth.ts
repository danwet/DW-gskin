import "server-only";

import { auth } from "@/auth";

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
};

export async function sessionUser(): Promise<SessionUser | null> {
  if (!process.env.AUTH_SECRET) return null;
  try {
    const session = await auth();
    const email = session?.user?.email?.trim().toLowerCase() ?? "";
    const id = session?.user?.id?.trim() ?? "";
    if (!session?.user || !email || !id) return null;
    return { id, email, name: session.user.name?.trim() || null };
  } catch {
    return null;
  }
}

export function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
