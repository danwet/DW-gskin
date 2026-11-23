import "server-only";

import { refreshGoogleAccessToken } from "../google-token";
import {
  forgetHiddenMessages,
  markArchivedByAgent,
  readAssessments,
  readMeta,
  rememberHiddenMessages,
  removeAssessments,
  unarchiveConversation,
  updateMeta,
} from "../agent/store";
import { listStoredMessages, purgeMessages, saveMessages } from "./store";
import { fetchGmailMessage, listGmailInbox } from "./fetch";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

export type ReconcileResult = {
  removed: number;
  /** True when Gmail no longer holds the history and we fell back to a full compare. */
  reset: boolean;
};

/** Current cursor, from the same profile call that gives us the address. */
export async function fetchGmailHistoryId(accessToken: string): Promise<string | null> {
  const response = await fetch(`${GMAIL_API}/profile`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  const data = (await response.json().catch(() => null)) as { historyId?: string } | null;
  return data?.historyId ?? null;
}

type HistoryRecord = {
  messagesDeleted?: { message?: { id?: string } }[];
  labelsRemoved?: { message?: { id?: string }; labelIds?: string[] }[];
};

type HistoryPage = {
  ok: boolean;
  records: HistoryRecord[];
  historyId: string | null;
  stale: boolean;
};

/** Changes since `startHistoryId`, including deletions and INBOX label removals. */
async function listGmailHistory(accessToken: string, startHistoryId: string): Promise<HistoryPage> {
  const records: HistoryRecord[] = [];
  let pageToken: string | null = null;
  let latest: string | null = null;

  for (let page = 0; page < 20; page += 1) {
    const params = new URLSearchParams({ startHistoryId, maxResults: "500" });
    if (pageToken) params.set("pageToken", pageToken);

    const response = await fetch(`${GMAIL_API}/history?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.status === 404 || response.status === 400) {
      // The cursor is older than Gmail keeps history for.
      return { ok: false, records: [], historyId: null, stale: true };
    }
    if (!response.ok) return { ok: false, records: [], historyId: null, stale: false };

    const data = (await response.json().catch(() => null)) as {
      history?: HistoryRecord[];
      historyId?: string;
      nextPageToken?: string;
    } | null;
    records.push(...(data?.history ?? []));
    latest = data?.historyId ?? latest;
    pageToken = data?.nextPageToken ?? null;
    if (!pageToken) break;
  }

  return { ok: true, records, historyId: latest, stale: false };
}

/** Every inbox id, for the fallback when the history cursor is too old. */
async function listAllInboxIds(accessToken: string): Promise<Set<string>> {
  const ids = new Set<string>();
  let pageToken: string | null = null;
  for (let page = 0; page < 40; page += 1) {
    const result = await listGmailInbox(accessToken, { pageToken, maxResults: 500 });
    if (!result.ok) break;
    for (const id of result.ids) ids.add(id);
    pageToken = result.nextPageToken;
    if (!pageToken) break;
  }
  return ids;
}

/** Conversations the agent archived itself; their data stays. */
async function archivedThreads(): Promise<Set<string>> {
  const items = await readAssessments();
  return new Set(items.filter((item) => item.archivedAt).map((item) => item.conversationId));
}

/** Drops stored messages that are no longer in the inbox and their empty cards. */
async function pruneMissing(userId: string, accessToken: string): Promise<number> {
  const inbox = await listAllInboxIds(accessToken);
  if (inbox.size === 0) return 0;
  const stored = await listStoredMessages(userId);
  // Cards the agent archived itself keep their data for the shipments panel.
  const archived = await archivedThreads();
  const gone = stored
    .filter((row) => !inbox.has(row.message_id) && !archived.has(row.thread_id))
    .map((row) => row.message_id);
  if (gone.length === 0) return 0;
  const emptied = await purgeMessages(userId, gone);
  await removeAssessments(emptied.filter((id) => !archived.has(id)));
  return gone.length;
}

/**
 * Brings the stored inbox in line with Gmail: messages that were deleted or
 * archived elsewhere disappear, and messages that came back are re-imported.
 */
export async function reconcileGmailHistory(
  userId: string,
  refreshToken: string,
): Promise<ReconcileResult> {
  const token = await refreshGoogleAccessToken(refreshToken);
  if (!token) return { removed: 0, reset: false };

  const current = await fetchGmailHistoryId(token.access_token);
  const meta = await readMeta();
  const start = meta.gmailHistoryId?.trim() || null;

  let removed = 0;
  let reset = !start;

  // History-based pass: precise, and also handles mail that came back.
  if (start) {
    const history = await listGmailHistory(token.access_token, start);
    if (history.ok) {
      const gone = new Set<string>();
      const backInInbox = new Set<string>();

      for (const record of history.records) {
        for (const entry of record.messagesDeleted ?? []) {
          if (entry.message?.id) gone.add(entry.message.id);
        }
        for (const entry of record.labelsRemoved ?? []) {
          if (entry.message?.id && (entry.labelIds ?? []).includes("INBOX")) gone.add(entry.message.id);
        }
        for (const entry of (record as { labelsAdded?: { message?: { id?: string }; labelIds?: string[] }[] }).labelsAdded ?? []) {
          if (entry.message?.id && (entry.labelIds ?? []).includes("INBOX")) backInInbox.add(entry.message.id);
        }
      }

      if (gone.size > 0) {
        const archived = await archivedThreads();
        // Een aankoop is een feit, geen inbox-item: die bewaren we ook als de
        // mail in Gmail gearchiveerd is. Anders verdwijnt je aankoopgeschiedenis
        // zodra je de bevestiging opruimt.
        const purchases = new Set(
          (await readAssessments()).filter((item) => item.purchase).map((item) => item.conversationId),
        );
        const stored = await listStoredMessages(userId);
        const keep = new Set(
          stored.filter((row) => purchases.has(row.thread_id)).map((row) => row.message_id),
        );
        const targets = [...gone].filter((id) => !keep.has(id));
        // Onthoud wat je zelf uit de inbox haalde, zodat de recente-import het
        // niet elke ronde opnieuw binnenhaalt.
        await rememberHiddenMessages(targets);
        const emptied = await purgeMessages(userId, targets);
        await removeAssessments(emptied.filter((id) => !archived.has(id) && !purchases.has(id)));
        if (purchases.size > 0) await markArchivedByAgent([...purchases]);
        removed += targets.length;
      }

      if (backInInbox.size > 0) {
        const storedRows = await listStoredMessages(userId);
        const threadOf = new Map(storedRows.map((row) => [row.message_id, row.thread_id]));
        const existing = new Set(storedRows.map((row) => row.message_id));
        const fresh: Awaited<ReturnType<typeof fetchGmailMessage>>[] = [];
        for (const id of backInInbox) {
          if (existing.has(id)) continue;
          fresh.push(await fetchGmailMessage(token.access_token, id));
        }
        const messages = fresh.filter((message): message is NonNullable<typeof message> => Boolean(message));
        if (messages.length > 0) await saveMessages(userId, messages);
        // Post comes back into the inbox: an earlier archive in that thread no
        // longer applies, otherwise the card stays hidden while Gmail shows it.
        await forgetHiddenMessages([...backInInbox]);
        for (const id of backInInbox) {
          const threadId =
            messages.find((message) => message.id === id)?.threadId ?? threadOf.get(id) ?? id;
          await unarchiveConversation(threadId);
        }
      }

      await updateMeta({ gmailHistoryId: history.historyId ?? current ?? start });
    } else if (history.stale) {
      reset = true;
    }
  }

  // Safety net: a full compare against the live inbox, so an archived or
  // deleted mail never survives in the overview, whatever the history said.
  removed += await pruneMissing(userId, token.access_token);

  // Persist a baseline cursor for the next run.
  if (current && reset) {
    await updateMeta({ gmailHistoryId: current });
  }

  return { removed, reset };
}
