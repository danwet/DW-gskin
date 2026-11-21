import "server-only";

import type { InboundMessage } from "../agent/types";
import { dbClient } from "../supabase/db";
import { senderDisplayName } from "./fetch";

export type ImportPhase = "idle" | "importing" | "triaging" | "done" | "error";

export type ImportState = {
  userId: string;
  phase: ImportPhase;
  pageToken: string | null;
  importedCount: number;
  totalEstimate: number | null;
  importedThreads: number;
  triagedCount: number;
  lastError: string | null;
};

type MessageRow = {
  message_id: string;
  thread_id: string;
  from_name: string;
  from_email: string;
  subject: string;
  snippet: string;
  body: string;
  body_html: string;
  received_at: string;
  triaged_at: string | null;
};

type ImportRow = {
  user_id: string;
  phase: ImportPhase;
  page_token: string | null;
  imported_count: number;
  total_estimate: number | null;
  imported_threads: number;
  triaged_count: number;
  last_error: string | null;
};

function rowToMessage(row: MessageRow): InboundMessage {
  return {
    id: row.message_id,
    threadId: row.thread_id,
    from: senderDisplayName(row.from_name, row.from_email),
    fromEmail: row.from_email,
    subject: row.subject,
    snippet: row.snippet,
    body: row.body,
    bodyHtml: row.body_html || undefined,
    receivedAt: row.received_at,
    link: `https://mail.google.com/mail/u/0/#inbox/${row.thread_id}`,
  };
}

export async function getImportState(userId: string): Promise<ImportState | null> {
  const supabase = await dbClient();
  const { data, error } = await supabase
    .from("dw_gmail_imports")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as ImportRow;
  return {
    userId: row.user_id,
    phase: row.phase,
    pageToken: row.page_token,
    importedCount: row.imported_count,
    totalEstimate: row.total_estimate,
    importedThreads: row.imported_threads,
    triagedCount: row.triaged_count,
    lastError: row.last_error,
  };
}

export async function startImport(userId: string): Promise<void> {
  const supabase = await dbClient();
  const { error } = await supabase.from("dw_gmail_imports").upsert(
    {
      user_id: userId,
      phase: "importing",
      page_token: null,
      imported_count: 0,
      total_estimate: null,
      imported_threads: 0,
      triaged_count: 0,
      last_error: null,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(`Importstatus kon niet worden opgeslagen: ${error.message} (${error.code ?? "?"})`);
}

export async function updateImportState(userId: string, patch: Partial<ImportState>): Promise<void> {
  const supabase = await dbClient();
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.phase !== undefined) row.phase = patch.phase;
  if (patch.pageToken !== undefined) row.page_token = patch.pageToken;
  if (patch.importedCount !== undefined) row.imported_count = patch.importedCount;
  if (patch.totalEstimate !== undefined) row.total_estimate = patch.totalEstimate;
  if (patch.importedThreads !== undefined) row.imported_threads = patch.importedThreads;
  if (patch.triagedCount !== undefined) row.triaged_count = patch.triagedCount;
  if (patch.lastError !== undefined) row.last_error = patch.lastError;
  await supabase.from("dw_gmail_imports").update(row).eq("user_id", userId);
}

export async function clearMessages(userId: string): Promise<void> {
  const supabase = await dbClient();
  await supabase.from("dw_gmail_messages").delete().eq("user_id", userId);
}

/** Upserts a batch of messages and reports how many new threads it introduced. */
export async function saveMessages(
  userId: string,
  messages: InboundMessage[],
): Promise<{ saved: number; newMessages: number; newThreads: number }> {
  if (messages.length === 0) return { saved: 0, newMessages: 0, newThreads: 0 };
  const supabase = await dbClient();

  const threadIds = Array.from(new Set(messages.map((message) => message.threadId ?? message.id)));
  const { data: existing } = await supabase
    .from("dw_gmail_messages")
    .select("message_id, thread_id")
    .eq("user_id", userId)
    .in("thread_id", threadIds);
  const knownThreads = new Set((existing ?? []).map((row) => (row as { thread_id: string }).thread_id));
  const knownMessages = new Set((existing ?? []).map((row) => (row as { message_id: string }).message_id));
  const newThreads = threadIds.filter((id) => !knownThreads.has(id)).length;
  const newMessages = messages.filter((message) => !knownMessages.has(message.id)).length;

  const rows = messages.map((message) => ({
    user_id: userId,
    message_id: message.id,
    thread_id: message.threadId ?? message.id,
    from_name: message.from,
    from_email: message.fromEmail,
    subject: message.subject,
    snippet: message.snippet,
    body: (message.body ?? "").slice(0, 20_000),
    body_html: (message.bodyHtml ?? "").slice(0, 40_000),
    received_at: message.receivedAt,
    imported_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("dw_gmail_messages")
    .upsert(rows, { onConflict: "user_id,message_id" });
  if (error) throw new Error("Berichten konden niet worden opgeslagen.");

  return { saved: messages.length, newMessages, newThreads };
}

/** Untriaged messages, newest first. Drives the resumable triage. */
export async function listUntriagedMessages(userId: string, limit = 200): Promise<InboundMessage[]> {
  const supabase = await dbClient();
  const { data } = await supabase
    .from("dw_gmail_messages")
    .select("*")
    .eq("user_id", userId)
    .is("triaged_at", null)
    .order("received_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as MessageRow[]).map(rowToMessage);
}

/** Marks a whole conversation as triaged so a resume never redoes it. */
export async function markThreadTriaged(userId: string, threadId: string): Promise<void> {
  const supabase = await dbClient();
  await supabase
    .from("dw_gmail_messages")
    .update({ triaged_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("thread_id", threadId)
    .is("triaged_at", null);
}

/** The newest messages, used to build the pending and assessed views. */
export async function listRecentMessages(userId: string, limit = 400): Promise<InboundMessage[]> {
  const supabase = await dbClient();
  const { data } = await supabase
    .from("dw_gmail_messages")
    .select("*")
    .eq("user_id", userId)
    .order("received_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as MessageRow[]).map(rowToMessage);
}

export async function listThreadMessages(userId: string, threadId: string): Promise<InboundMessage[]> {
  const supabase = await dbClient();
  const { data } = await supabase
    .from("dw_gmail_messages")
    .select("*")
    .eq("user_id", userId)
    .eq("thread_id", threadId)
    .order("received_at", { ascending: true });
  return ((data ?? []) as MessageRow[]).map(rowToMessage);
}

/** How many imported messages still await triage (exact count). */
export async function countUntriaged(userId: string): Promise<number> {
  const supabase = await dbClient();
  const { count } = await supabase
    .from("dw_gmail_messages")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("triaged_at", null);
  return count ?? 0;
}
