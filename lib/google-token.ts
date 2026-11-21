export type GoogleToken = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
};

/**
 * Access tokens live an hour. Caching them per instance removes a token
 * roundtrip from every single Gmail call.
 */
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

export async function refreshGoogleAccessToken(refreshToken: string): Promise<GoogleToken | null> {
  const cached = tokenCache.get(refreshToken);
  if (cached && cached.expiresAt > Date.now()) {
    return { access_token: cached.token, expires_in: Math.floor((cached.expiresAt - Date.now()) / 1000) };
  }

  const clientId = process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET;
  if (!clientId || !clientSecret || !refreshToken) return null;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!response.ok) return null;

  const data = (await response.json()) as Partial<GoogleToken>;
  if (typeof data.access_token !== "string" || typeof data.expires_in !== "number") return null;
  tokenCache.set(refreshToken, {
    token: data.access_token,
    expiresAt: Date.now() + Math.max(data.expires_in - 120, 60) * 1000,
  });
  return {
    access_token: data.access_token,
    expires_in: data.expires_in,
    refresh_token: typeof data.refresh_token === "string" ? data.refresh_token : undefined,
  };
}
