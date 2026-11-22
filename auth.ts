import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { refreshGoogleAccessToken } from "@/lib/google-token";

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
/** Needed to create, change and delete appointments. */
const CALENDAR_EVENTS_SCOPE = "https://www.googleapis.com/auth/calendar.events";

/** Auth.js callback for the Google provider. Route: app/api/auth/[...nextauth]. */
export const GOOGLE_CALLBACK_PATH = "/api/auth/callback/google";

export function googleAuthConfigured() {
  return Boolean(process.env.AUTH_SECRET && process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    Google({
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
          scope: `openid email profile ${CALENDAR_SCOPE} ${CALENDAR_EVENTS_SCOPE}`,
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        // Stable per Google account across environments and sessions. Without
        // this the JWT subject changes per sign-in and per-user data (the
        // Gmail connection) would be orphaned.
        if (account.providerAccountId) token.sub = account.providerAccountId;
        if (account.access_token) token.accessToken = account.access_token;
        if (account.refresh_token) token.refreshToken = account.refresh_token;
        if (account.expires_at) token.expiresAt = account.expires_at;
        return token;
      }

      const expiresAt = typeof token.expiresAt === "number" ? token.expiresAt : 0;
      if (typeof token.accessToken === "string" && Date.now() < expiresAt * 1000 - 60_000) {
        return token;
      }
      if (typeof token.refreshToken !== "string") return token;

      const refreshed = await refreshGoogleAccessToken(token.refreshToken);
      if (!refreshed) return token;
      token.accessToken = refreshed.access_token;
      token.expiresAt = Math.floor(Date.now() / 1000) + refreshed.expires_in;
      if (refreshed.refresh_token) token.refreshToken = refreshed.refresh_token;
      return token;
    },
    async session({ session, token }) {
      if (session.user) session.user.id = token.sub ?? "";
      return session;
    },
  },
});
