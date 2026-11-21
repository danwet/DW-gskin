import "server-only";

import { refreshGoogleAccessToken } from "../google-token";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

export type MailAction = "archive" | "trash";

export type MailActionResult = {
  ok: boolean;
  /** Set when Gmail refused: "scope" means the connection lacks write access. */
  reason?: "scope" | "auth" | "api";
  message?: string;
};

async function accessToken(refreshToken: string): Promise<string | null> {
  const token = await refreshGoogleAccessToken(refreshToken);
  return token?.access_token ?? null;
}

/** Removes the message from the inbox but keeps it in All Mail. */
export async function archiveGmailMessage(refreshToken: string, messageId: string): Promise<MailActionResult> {
  const token = await accessToken(refreshToken);
  if (!token) return { ok: false, reason: "auth", message: "Gmail-token kon niet worden vernieuwd." };

  const response = await fetch(`${GMAIL_API}/messages/${encodeURIComponent(messageId)}/modify`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    // Archive means out of the inbox, and read so it stops demanding attention.
    body: JSON.stringify({ removeLabelIds: ["INBOX", "UNREAD"] }),
  });
  if (response.ok) return { ok: true };
  if (response.status === 403) {
    return { ok: false, reason: "scope", message: "De koppeling heeft geen schrijfrechten. Koppel Gmail opnieuw." };
  }
  return { ok: false, reason: "api", message: `Archiveren mislukte (${response.status}).` };
}

/** Moves the message to the trash; Gmail keeps it recoverable for 30 days. */
export async function trashGmailMessage(refreshToken: string, messageId: string): Promise<MailActionResult> {
  const token = await accessToken(refreshToken);
  if (!token) return { ok: false, reason: "auth", message: "Gmail-token kon niet worden vernieuwd." };

  const response = await fetch(`${GMAIL_API}/messages/${encodeURIComponent(messageId)}/trash`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.ok) return { ok: true };
  if (response.status === 403) {
    return { ok: false, reason: "scope", message: "De koppeling heeft geen schrijfrechten. Koppel Gmail opnieuw." };
  }
  return { ok: false, reason: "api", message: `Verwijderen mislukte (${response.status}).` };
}

export function runGmailAction(refreshToken: string, messageId: string, action: MailAction): Promise<MailActionResult> {
  return action === "archive"
    ? archiveGmailMessage(refreshToken, messageId)
    : trashGmailMessage(refreshToken, messageId);
}

/** Puts the message back: the INBOX label for an archive, out of trash otherwise. */
export async function restoreGmailMessage(
  refreshToken: string,
  messageId: string,
  action: MailAction,
): Promise<MailActionResult> {
  const token = await accessToken(refreshToken);
  if (!token) return { ok: false, reason: "auth", message: "Gmail-token kon niet worden vernieuwd." };

  const url =
    action === "archive"
      ? `${GMAIL_API}/messages/${encodeURIComponent(messageId)}/modify`
      : `${GMAIL_API}/messages/${encodeURIComponent(messageId)}/untrash`;

  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: action === "archive" ? JSON.stringify({ addLabelIds: ["INBOX"] }) : undefined,
  });
  if (response.ok) return { ok: true };
  if (response.status === 403) {
    return { ok: false, reason: "scope", message: "De koppeling heeft geen schrijfrechten. Koppel Gmail opnieuw." };
  }
  return { ok: false, reason: "api", message: `Terugzetten mislukte (${response.status}).` };
}
