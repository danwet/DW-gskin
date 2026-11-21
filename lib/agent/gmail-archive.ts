import "server-only";

import { refreshGoogleAccessToken } from "../google-token";

/**
 * Archives Gmail messages (removes the INBOX label) after the agent has read
 * them. Requires a refresh token with the gmail.modify scope; without it the
 * call fails softly and the email is left untouched.
 */
export async function archiveGmailMessages(
  ids: string[],
  refreshTokenOverride?: string,
): Promise<{ ok: boolean; archived: number; error?: string }> {
  const refreshToken = (refreshTokenOverride ?? process.env.GMAIL_REFRESH_TOKEN)?.trim();
  if (!refreshToken) return { ok: false, archived: 0, error: "Gmail refresh token ontbreekt." };
  if (ids.length === 0) return { ok: true, archived: 0 };

  const token = await refreshGoogleAccessToken(refreshToken);
  if (!token) return { ok: false, archived: 0, error: "Gmail access token kon niet worden vernieuwd." };

  let archived = 0;
  const failures: string[] = [];
  for (const id of ids) {
    try {
      const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}/modify`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ removeLabelIds: ["INBOX"] }),
      });
      if (response.ok) archived += 1;
      else failures.push(`${id}: HTTP ${response.status}`);
    } catch {
      failures.push(`${id}: netwerkfout`);
    }
  }
  return {
    ok: failures.length === 0,
    archived,
    error: failures.length > 0 ? failures.slice(0, 5).join(", ") : undefined,
  };
}
