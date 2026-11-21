import { randomBytes } from "crypto";
import { cookies } from "next/headers";

import { sessionUser, unauthorized } from "@/lib/api-auth";
import { GMAIL_STATE_COOKIE, gmailAuthUrl, gmailOAuthConfigured } from "@/lib/gmail/oauth";

export const dynamic = "force-dynamic";

/** Starts the separate, read-only Gmail consent flow (not the Google login). */
export async function GET(request: Request) {
  const user = await sessionUser();
  if (!user) return unauthorized();

  const origin = new URL(request.url).origin;

  if (!gmailOAuthConfigured()) {
    return Response.redirect(new URL("/?gmail=not_configured", origin), 303);
  }

  const state = randomBytes(16).toString("base64url");
  const jar = await cookies();
  jar.set(GMAIL_STATE_COOKIE, `${user.id}:${state}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: "/",
    maxAge: 600,
  });

  return Response.redirect(gmailAuthUrl(origin, state), 303);
}
