export type GoogleToken = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
};

export async function refreshGoogleAccessToken(refreshToken: string): Promise<GoogleToken | null> {
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
  return {
    access_token: data.access_token,
    expires_in: data.expires_in,
    refresh_token: typeof data.refresh_token === "string" ? data.refresh_token : undefined,
  };
}
