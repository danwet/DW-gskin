import "server-only";

import { refreshGoogleAccessToken } from "../google-token";

export type SendResult =
  | { ok: true; id: string }
  | { ok: false; reason: "not_configured" | "auth_failed" | "invalid_recipient" | "scope_missing" | "send_failed"; message: string };

export type Attachment = {
  filename: string;
  mimeType: string;
  content: Buffer;
};

function base64Url(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function encodeSubject(subject: string): string {
  if (/^[\x00-\x7F]*$/.test(subject)) return subject;
  return `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function wrapBase64(buffer: Buffer): string {
  return buffer.toString("base64").replace(/(.{76})/g, "$1\r\n");
}

function safeFilename(name: string): string {
  return name.replace(/[\r\n"]/g, "_").slice(0, 120);
}

export function buildRawMessage(options: {
  from: string;
  /** Naam die vóór het adres in de From-regel komt. */
  fromName?: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  /** HTML-versie van de tekst; als die er is, gaat die mee in de HTML-tak. */
  bodyHtml?: string;
  signatureHtml?: string;
  attachments?: Attachment[];
}): string {
  const signatureHtml = options.signatureHtml?.trim() ?? "";
  const attachments = options.attachments ?? [];

  const afzender = options.fromName?.trim()
    ? `"${options.fromName.trim().replace(/"/g, "")}" <${options.from}>`
    : options.from;
  const headers = [
    `From: ${afzender}`,
    `To: ${options.to}`,
    ...(options.cc ? [`Cc: ${options.cc}`] : []),
    ...(options.bcc ? [`Bcc: ${options.bcc}`] : []),
    `Subject: ${encodeSubject(options.subject)}`,
    "MIME-Version: 1.0",
  ];

  let contentPart: string;
  if (signatureHtml) {
    const boundary = `dw-alt-${Date.now()}`;
    const tekstDeel = options.bodyHtml?.trim()
      ? options.bodyHtml
      : `<div style="white-space:pre-wrap">${escapeHtml(options.body)}</div>`;
    const html = tekstDeel + `<div style="margin-top:16px">${signatureHtml}</div>`;
    const plainPart = [
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      wrapBase64(Buffer.from(options.body, "utf8")),
    ].join("\r\n");
    const htmlPart = [
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      wrapBase64(Buffer.from(html, "utf8")),
    ].join("\r\n");
    contentPart = [
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      plainPart,
      `--${boundary}`,
      htmlPart,
      `--${boundary}--`,
    ].join("\r\n");
  } else {
    contentPart = [
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      wrapBase64(Buffer.from(options.body, "utf8")),
    ].join("\r\n");
  }

  if (attachments.length === 0) {
    return [...headers, contentPart].join("\r\n");
  }

  const mixedBoundary = `dw-mixed-${Date.now()}`;
  const parts: string[] = [`--${mixedBoundary}`, contentPart];
  for (const attachment of attachments) {
    const name = safeFilename(attachment.filename);
    parts.push(
      `--${mixedBoundary}`,
      `Content-Type: ${attachment.mimeType || "application/octet-stream"}; name="${name}"`,
      `Content-Disposition: attachment; filename="${name}"`,
      "Content-Transfer-Encoding: base64",
      "",
      wrapBase64(attachment.content),
    );
  }
  parts.push(`--${mixedBoundary}--`);
  const mixedPart = [
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    "",
    ...parts,
  ].join("\r\n");
  return [...headers, mixedPart].join("\r\n");
}

export async function sendGmailMessage(options: {
  refreshToken: string;
  from: string;
  fromName?: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  bodyHtml?: string;
  signatureHtml?: string;
  attachments?: Attachment[];
}): Promise<SendResult> {
  if (!options.refreshToken) {
    return { ok: false, reason: "not_configured", message: "Gmail is niet gekoppeld." };
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(options.to.split(",")[0]?.trim() ?? "")) {
    return { ok: false, reason: "invalid_recipient", message: "Vul een geldig e-mailadres bij Aan in." };
  }
  const token = await refreshGoogleAccessToken(options.refreshToken);
  if (!token) {
    return { ok: false, reason: "auth_failed", message: "Kon het Gmail access token niet vernieuwen." };
  }
  const raw = buildRawMessage(options);
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: base64Url(raw) }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const scopeMissing = response.status === 403 && /insufficient|scope|permission/i.test(text);
    return {
      ok: false,
      reason: scopeMissing ? "scope_missing" : "send_failed",
      message: scopeMissing
        ? "De Gmail-token mist de gmail.send-scope."
        : `Gmail kon het bericht niet versturen (${response.status}).`,
    };
  }
  const data = (await response.json().catch(() => null)) as { id?: string } | null;
  return { ok: true, id: data?.id ?? "" };
}

export async function sendGmailReply(options: {
  refreshToken: string;
  from: string;
  fromName?: string;
  to: string;
  subject: string;
  body: string;
  bodyHtml?: string;
  signatureHtml?: string;
  attachments?: Attachment[];
}): Promise<SendResult> {
  if (!options.refreshToken) {
    return {
      ok: false,
      reason: "not_configured",
      message:
        "Gmail versturen is nog niet geconfigureerd. Voeg in Instellingen een Gmail refresh token met de gmail.send-scope toe.",
    };
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(options.to)) {
    return { ok: false, reason: "invalid_recipient", message: "De ontvanger heeft geen geldig e-mailadres." };
  }

  const token = await refreshGoogleAccessToken(options.refreshToken);
  if (!token) {
    return { ok: false, reason: "auth_failed", message: "Kon het Gmail access token niet vernieuwen. Log opnieuw in." };
  }

  const raw = buildRawMessage(options);

  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: base64Url(raw) }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const scopeMissing = response.status === 403 && /insufficient|scope|permission/i.test(text);
    return {
      ok: false,
      reason: scopeMissing ? "scope_missing" : "send_failed",
      message: scopeMissing
        ? "De Gmail-token mist de gmail.send-scope. Geef opnieuw toestemming met Gmail-verzendrechten."
        : `Gmail kon het bericht niet versturen (${response.status}).`,
    };
  }

  const data = (await response.json().catch(() => null)) as { id?: string } | null;
  return { ok: true, id: data?.id ?? "" };
}
