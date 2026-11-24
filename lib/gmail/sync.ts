import "server-only";

import { buildAssessment, groupByConversation } from "../agent/build";
import { classifyConversation } from "../agent/classify";
import { loadAgentConfig, type ProviderId } from "../agent/config";
import {
  corrigeerTegenstrijdigheden,
  markArchivedByAgent,
  readAssessments,
  readMeta,
  setAssessmentTier,
  setUserReplied,
  unarchiveConversation,
  updateMeta,
  upsertAssessments,
} from "../agent/store";
import type { InboundMessage } from "../agent/types";
import { refreshGoogleAccessToken } from "../google-token";
import { fetchGmailMessage, listGmailInbox, listGmailRecent, listGmailSent } from "./fetch";
import { backfillSavedVerdicts } from "../agent/saved-verdict";
import { backfillShortSubjects } from "../agent/short-subject";
import { healDeadlines } from "../agent/deadline-heal";
import { healLanguage } from "../agent/taal-heal";
import { reconcileGmailHistory } from "./history";
import { archiveGmailMessage, markGmailMessageRead } from "./actions";
import {
  countUntriaged,
  listStoredMessages,
  getImportState,
  listThreadMessages,
  listMessagesWithoutHtml,
  listUntriagedMessages,
  markThreadTriaged,
  setMessageHtml,
  saveMessages,
  startImport,
  updateImportState,
  type ImportPhase,
} from "./store";

export type SyncProgress = {
  phase: ImportPhase;
  imported: number;
  total: number | null;
  threadsImported: number;
  triaged: number;
  pending: number;
  lastError: string | null;
};

export type StepResult = {
  ok: boolean;
  step: "import" | "triage" | "idle" | "error";
  processed: number;
  progress: SyncProgress;
  error?: string;
};

const IMPORT_BATCH = 25;
const TRIAGE_BATCH = 3;

async function readProgress(userId: string): Promise<SyncProgress> {
  const state = await getImportState(userId);
  if (!state) {
    return { phase: "idle", imported: 0, total: null, threadsImported: 0, triaged: 0, pending: 0, lastError: null };
  }
  const active = state.phase === "importing" || state.phase === "triaging" || Boolean(state.pageToken);
  return {
    // A leftover page token means the mailbox was not fully walked; report it
    // as importing so the runner resumes instead of showing "done".
    phase: state.phase === "done" && state.pageToken ? "importing" : state.phase,
    imported: state.importedCount,
    total: state.totalEstimate,
    threadsImported: state.importedThreads,
    triaged: state.triagedCount,
    pending: active
      ? await countUntriaged(userId).catch(() => Math.max(state.importedThreads - state.triagedCount, 0))
      : 0,
    lastError: state.lastError,
  };
}

export async function getSyncProgress(userId: string): Promise<SyncProgress> {
  return readProgress(userId);
}

/**
 * One import batch: the next page of the inbox (newest first), stored message
 * by message. The page token lives in Supabase, so an interrupted import
 * continues instead of starting over.
 */
export async function importStep(userId: string, refreshToken: string): Promise<StepResult> {
  const state = await getImportState(userId);
  if (!state) {
    return { ok: false, step: "error", processed: 0, progress: await readProgress(userId), error: "Importstatus ontbreekt." };
  }
  const morePages = Boolean(state.pageToken);

  if (state.phase === "triaging" && !morePages) {
    return { ok: true, step: "idle", processed: 0, progress: await readProgress(userId) };
  }

  // After the first import, keep watching the newest page for new mail.
  if (state.phase === "done" && !morePages) {
    const token = await refreshGoogleAccessToken(refreshToken);
    if (!token) {
      return { ok: false, step: "error", processed: 0, progress: await readProgress(userId), error: "Gmail-token kon niet worden vernieuwd." };
    }
    const page = await listGmailInbox(token.access_token, { maxResults: IMPORT_BATCH });
    if (!page.ok) {
      await updateImportState(userId, { lastError: page.error ?? "Gmail-list mislukt." });
      return { ok: false, step: "error", processed: 0, progress: await readProgress(userId), error: page.error };
    }
    // Only fetch what we do not have yet: a quiet inbox then costs one call.
    const known = new Set((await listStoredMessages(userId)).map((row) => row.message_id));
    // Wat in de app is afgehandeld mag niet via de inbox terugkomen.
    const verborgen = new Set((await readMeta()).hiddenMessageIds ?? []);
    const fresh = page.ids.filter((id) => !known.has(id) && !verborgen.has(id));

    const messages: InboundMessage[] = [];
    for (const id of fresh) {
      const mapped = await fetchGmailMessage(token.access_token, id);
      if (mapped) messages.push(mapped);
    }
    const saved = await saveMessages(userId, messages);
    await updateImportState(userId, {
      importedCount: state.importedCount + saved.newMessages,
      importedThreads: state.importedThreads + saved.newThreads,
      // New mail still has to be judged: report triaging so the progress bar
      // shows it instead of looking idle.
      phase: saved.newMessages > 0 ? "triaging" : state.phase,
      lastError: null,
    });
    return { ok: true, step: "import", processed: saved.newMessages, progress: await readProgress(userId) };
  }

  const token = await refreshGoogleAccessToken(refreshToken);
  if (!token) {
    await updateImportState(userId, { phase: "error", lastError: "Gmail-token kon niet worden vernieuwd." });
    return {
      ok: false,
      step: "error",
      processed: 0,
      progress: await readProgress(userId),
      error: "Gmail-token kon niet worden vernieuwd.",
    };
  }

  const page = await listGmailInbox(token.access_token, { pageToken: state.pageToken, maxResults: IMPORT_BATCH });
  if (!page.ok) {
    // A paused import leaves a stale page token; Gmail then rejects the page.
    // Restart the walk from the top (upserts dedupe) instead of getting stuck.
    if (state.pageToken) {
      await updateImportState(userId, {
        pageToken: null,
        phase: "importing",
        importedCount: 0,
        importedThreads: 0,
        lastError: null,
      });
      return { ok: true, step: "import", processed: 0, progress: await readProgress(userId) };
    }
    await updateImportState(userId, { phase: "error", lastError: page.error ?? "Gmail-list mislukt." });
    return { ok: false, step: "error", processed: 0, progress: await readProgress(userId), error: page.error };
  }

  const messages: InboundMessage[] = [];
  let missed = 0;
  for (const id of page.ids) {
    let mapped = await fetchGmailMessage(token.access_token, id);
    if (!mapped) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      mapped = await fetchGmailMessage(token.access_token, id);
    }
    if (mapped) messages.push(mapped);
    else missed += 1;
  }

  const saved = await saveMessages(userId, messages);
  const totalEstimate = Math.max(state.totalEstimate ?? 0, page.resultSizeEstimate ?? 0);

  // Retry a page with misses once, but never loop on it forever: a single
  // stubborn message used to block the whole walk at the same page.
  const alreadyRetried = (state.lastError ?? "").startsWith("page-retry");
  if (missed > 0 && !alreadyRetried) {
    await updateImportState(userId, {
      phase: "importing",
      pageToken: state.pageToken ?? null,
      importedCount: state.importedCount + saved.newMessages,
      totalEstimate,
      importedThreads: state.importedThreads + saved.newThreads,
      lastError: `page-retry ${missed}/${page.ids.length}`,
    });
    return { ok: true, step: "import", processed: saved.saved, progress: await readProgress(userId) };
  }

  const done = !page.nextPageToken;
  await updateImportState(userId, {
    phase: done ? "triaging" : "importing",
    pageToken: page.nextPageToken,
    importedCount: state.importedCount + saved.saved,
    totalEstimate,
    importedThreads: state.importedThreads + saved.newThreads,
    lastError: missed > 0 ? `${missed} berichten overgeslagen; volgende ronde opnieuw.` : null,
  });

  return { ok: true, step: "import", processed: saved.saved, progress: await readProgress(userId) };
}

/**
 * One triage batch: the newest not-yet-triaged conversations, classified with
 * the existing model config. Messages are marked triaged so a resume neither
 * repeats work nor creates duplicate cards.
 */
/**
 * Kaarten van vóór het urgentie-oordeel krijgen het alsnog van het model. Twee
 * per ronde, zodat een sync niet opeens tien modelvragen doet.
 */
async function backfillTiers(
  userId: string,
  opts: { provider: ProviderId; apiKey?: string; model?: string },
): Promise<number> {
  const items = await readAssessments();
  const zonder = items.filter((item) => !item.tier && item.mailbox === "gmail").slice(0, 2);
  let done = 0;
  for (const item of zonder) {
    const conversation = await listThreadMessages(userId, item.conversationId);
    if (conversation.length === 0) continue;
    try {
      const draft = await classifyConversation(conversation, opts);
      if (draft.tier) {
        await setAssessmentTier(item.conversationId, draft.tier);
        done += 1;
      }
    } catch {
      // Volgende ronde opnieuw.
    }
  }
  return done;
}

export async function triageStep(userId: string, ownerEmail?: string | null): Promise<StepResult> {
  const config = await loadAgentConfig().catch(() => null);
  const provider: ProviderId = config?.defaultProvider ?? "openai";
  const entry = config?.providers?.[provider];
  const apiKey = entry?.apiKey || undefined;
  const model = entry?.model || undefined;

  const untriaged = await listUntriagedMessages(userId, 200, ownerEmail);
  if (untriaged.length === 0) {
    const state = await getImportState(userId);
    if (state && state.phase !== "done") await updateImportState(userId, { phase: "done" });
    // Ook zonder nieuwe mail: kaarten van vóór het urgentie-oordeel bijwerken.
    const filled = await backfillTiers(userId, { provider, apiKey, model });
    return { ok: true, step: "idle", processed: filled, progress: await readProgress(userId) };
  }

  // Een bericht van jezelf in een gesprek dat al een kaart heeft, is je eigen
  // antwoord: daar maken we geen tweede kaart van. Een mail aan jezelf in een
  // nieuw gesprek is wél gewoon mail.
  const bestaand = new Set((await readAssessments()).map((item) => item.conversationId));
  const eigen = (ownerEmail ?? "").trim().toLowerCase();
  const relevant = eigen
    ? untriaged.filter(
        (message) =>
          message.fromEmail.trim().toLowerCase() !== eigen || !bestaand.has(message.threadId ?? ""),
      )
    : untriaged;

  // Wat we overslaan (je eigen antwoord in een bestaand gesprek) hoeft geen
  // kaart, maar moet wél als beoordeeld gemarkeerd worden. Anders blijft het
  // voor altijd in de wachtrij staan en lijkt de agent eindeloos bezig.
  const overgeslagen = untriaged.filter((message) => !relevant.includes(message));
  for (const message of overgeslagen) {
    const threadId = message.threadId ?? message.id;
    await markThreadTriaged(userId, threadId).catch(() => null);
  }

  const grouped = groupByConversation(relevant);
  const threads = Array.from(grouped.entries())
    .map(([conversationId, list]) => ({ conversationId, latest: list[list.length - 1] }))
    .sort((a, b) => Date.parse(b.latest.receivedAt) - Date.parse(a.latest.receivedAt))
    .slice(0, TRIAGE_BATCH);

  const updates = [];
  const errors: string[] = [];
  for (const thread of threads) {
    const threadId = thread.latest.threadId ?? thread.latest.id;
    const conversation = await listThreadMessages(userId, threadId);
    const target = conversation.length > 0 ? conversation : grouped.get(thread.conversationId) ?? [thread.latest];
    try {
      const draft = await classifyConversation(target, { provider, apiKey, model });
      updates.push(buildAssessment(target, draft, new Date(), "gmail", ownerEmail));
      await markThreadTriaged(userId, threadId);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Classificatie mislukt.");
    }
  }

  if (updates.length > 0) await upsertAssessments(updates);

  // Oudere kaarten krijgen alsnog het urgentie-oordeel van het model.
  if (updates.length === 0) await backfillTiers(userId, { provider, apiKey, model });

  const state = await getImportState(userId);
  const currentPhase = state?.phase ?? "idle";
  const moreRemain = untriaged.length > threads.length;
  // While the import is still walking the mailbox it owns the phase; triage
  // must never move it forward, or the remaining pages would never be fetched.
  const stillImporting = currentPhase === "importing" || Boolean(state?.pageToken);
  const nextPhase: ImportPhase = stillImporting ? "importing" : moreRemain ? "triaging" : "done";
  await updateImportState(userId, {
    triagedCount: (state?.triagedCount ?? 0) + updates.length,
    phase: nextPhase,
    lastError: errors.length > 0 ? errors[0] : null,
  });

  return {
    ok: errors.length === 0,
    step: "triage",
    processed: updates.length,
    progress: await readProgress(userId),
    error: errors[0],
  };
}

/** One unit of work for the client runner: import a batch, then triage a batch. */
/**
 * Order-status and payment-confirmation mail is read once and then has no
 * further use in the inbox. Once the status is stored on the assessment, the
 * mail is archived in Gmail (and marked read) automatically.
 */
async function archiveProcessedOrders(userId: string, refreshToken: string): Promise<number> {
  const assessments = await readAssessments();
  const candidates = assessments.filter(
    (item) =>
      item.mailbox === "gmail" &&
      !item.archivedAt &&
      // Verzend- en betaalbevestigingen zijn nieuws van de dag.
      ((Boolean(item.shipment || item.payment) && item.classification === "info") ||
        // Een aankoopbewijs is verwerkt zodra het in Bestellingen staat; alleen
        // iets dat nog aandacht vraagt blijft in de inbox.
        (Boolean(item.purchase) && item.tier !== "moet")),
  );
  if (candidates.length === 0) return 0;

  const stored = await listStoredMessages(userId);
  const archived: string[] = [];

  for (const item of candidates) {
    const ids = stored.filter((row) => row.thread_id === item.conversationId).map((row) => row.message_id);
    const targets = ids.length > 0 ? ids : item.sourceMessageId ? [item.sourceMessageId] : [];
    if (targets.length === 0) continue;

    // Een verwerkte order is gelezen en afgehandeld: eerst als gelezen
    // markeren, dan pas archiveren, zodat er geen ongelezen mail achterblijft.
    let ok = true;
    for (const id of targets) {
      await markGmailMessageRead(refreshToken, id).catch(() => null);
      const result = await archiveGmailMessage(refreshToken, id);
      if (!result.ok) {
        ok = false;
        break;
      }
    }
    if (ok) archived.push(item.conversationId);
  }

  await markArchivedByAgent(archived);
  return archived.length;
}

/**
 * Onze eigen antwoorden horen bij de thread waarin we ze schreven. Zonder die
 * berichten lijkt een thread af te lopen bij de mail van de ander, terwijl er
 * allang een antwoord van jou tussen zit.
 */
function normalizeSubject(subject: string): string {
  return subject
    .replace(/^((re|fwd|antw|aw|wg|tr)\s*:\s*)+/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Mail die je snel archiveert zou anders nooit beoordeeld worden: de import
 * keek alleen in de inbox. Deze ronde pakt de laatste dagen mee, ook uit het
 * archief, met een grens per keer.
 */
async function importRecentMail(userId: string, refreshToken: string): Promise<number> {
  const token = await refreshGoogleAccessToken(refreshToken);
  if (!token) return 0;
  const page = await listGmailRecent(token.access_token, { days: 3, maxResults: 25 });
  if (!page.ok || page.ids.length === 0) return 0;

  const known = new Set((await listStoredMessages(userId)).map((row) => row.message_id));
  // Wat je zelf archiveerde komt hier niet opnieuw binnen.
  const verborgen = new Set((await readMeta()).hiddenMessageIds ?? []);
  const fresh = page.ids.filter((id) => !known.has(id) && !verborgen.has(id)).slice(0, 8);
  if (fresh.length === 0) return 0;

  const messages = [];
  for (const id of fresh) {
    const mapped = await fetchGmailMessage(token.access_token, id);
    if (mapped) messages.push(mapped);
  }
  const saved = await saveMessages(userId, messages);
  return saved.newMessages;
}

async function importSentReplies(userId: string, refreshToken: string): Promise<number> {
  const token = await refreshGoogleAccessToken(refreshToken);
  if (!token) return 0;
  const page = await listGmailSent(token.access_token, { maxResults: 25 });
  if (!page.ok || page.ids.length === 0) return 0;

  const known = new Set((await listStoredMessages(userId)).map((row) => row.message_id));
  // Wat je zelf uit de inbox haalde of wat is opgeruimd, komt hier niet terug:
  // anders staat er elke vijf minuten "2 gelezen" zonder dat er mail is.
  const verborgen = new Set((await readMeta()).hiddenMessageIds ?? []);
  const fresh = page.ids.filter((id) => !known.has(id) && !verborgen.has(id)).slice(0, 10);
  if (fresh.length === 0) return 0;

  // Een antwoord uit een andere mailclient krijgt soms een eigen thread-id.
  // Dan koppelen we hem op onderwerp aan het gesprek dat we al kennen, anders
  // blijft het antwoord los staan en lijkt de thread af te lopen.
  const perOnderwerp = new Map<string, string>();
  for (const item of await readAssessments()) {
    const key = normalizeSubject(item.subject ?? "");
    if (key && !perOnderwerp.has(key)) perOnderwerp.set(key, item.conversationId);
  }

  const messages = [];
  for (const id of fresh) {
    const mapped = await fetchGmailMessage(token.access_token, id);
    if (!mapped) continue;
    const doel = perOnderwerp.get(normalizeSubject(mapped.subject ?? ""));
    if (doel) mapped.threadId = doel;
    messages.push(mapped);
  }
  const saved = await saveMessages(userId, messages);
  return saved.newMessages;
}

/**
 * Een thread waarin jouw antwoord het laatste bericht is, is afgehandeld: die
 * gaat naar het archief en komt pas terug als er weer iemand reageert. Reageert
 * er iemand op jouw antwoord, dan komt de thread terug en telt hij mee als iets
 * waar jij zelf naar hebt gehandeld.
 */
async function applyAnsweredThreads(
  userId: string,
  ownerEmail?: string | null,
): Promise<{ archived: number; reopened: number }> {
  const owner = (ownerEmail ?? "").trim().toLowerCase();
  if (!owner) return { archived: 0, reopened: 0 };

  // Alleen de recente gesprekken: een thread van maanden terug hoeft niet elke
  // vijf minuten opnieuw bekeken te worden.
  const items = await readAssessments();
  const recent = [...items]
    .sort((a, b) => (b.receivedAt ?? "").localeCompare(a.receivedAt ?? ""))
    .slice(0, 40);
  const answered: string[] = [];
  const reopened: string[] = [];

  for (const item of recent) {
    let thread;
    try {
      thread = await listThreadMessages(userId, item.conversationId);
    } catch {
      continue;
    }
    if (thread.length < 2) continue;

    const last = thread[thread.length - 1];
    const hasOutbound = thread.some((message) => message.fromEmail.trim().toLowerCase() === owner);
    if (!hasOutbound) continue;

    if (last.fromEmail.trim().toLowerCase() === owner) answered.push(item.conversationId);
    else reopened.push(item.conversationId);
  }

  if (answered.length > 0) {
    await setUserReplied(answered, true);
    await markArchivedByAgent(answered);
  }
  if (reopened.length > 0) {
    await setUserReplied(reopened, true);
    // Er is weer iemand aan het woord: de thread hoort terug in de lijst.
    for (const id of reopened) await unarchiveConversation(id).catch(() => undefined);
  }
  return { archived: answered.length, reopened: reopened.length };
}


/** Vult ontbrekende HTML-inhoud aan, een paar berichten per ronde. */
async function backfillHtmlBodies(userId: string, refreshToken: string, limit = 3): Promise<number> {
  const ontbreekt = await listMessagesWithoutHtml(userId, limit);
  // Leg vast wat deze stap doet, zodat een lege kolom niet giswerk oplevert.
  if (ontbreekt.length === 0) {
    await updateMeta({ htmlBackfill: { at: new Date().toISOString(), gevonden: 0, gevuld: 0 } }).catch(() => null);
    return 0;
  }
  const token = await refreshGoogleAccessToken(refreshToken);
  if (!token) {
    await updateMeta({ htmlBackfill: { at: new Date().toISOString(), gevonden: ontbreekt.length, gevuld: 0, fout: "geen token" } }).catch(() => null);
    return 0;
  }
  let gevuld = 0;
  const details: string[] = [];
  for (const id of ontbreekt) {
    const bericht = await fetchGmailMessage(token.access_token, id).catch(() => null);
    if (!bericht) {
      details.push(`${id}: niet opgehaald`);
      continue;
    }
    if (!bericht.bodyHtml) {
      details.push(`${id}: geen html in dit bericht`);
      continue;
    }
    await setMessageHtml(userId, id, bericht.bodyHtml).catch(() => null);
    gevuld += 1;
    details.push(`${id}: gevuld (${bericht.bodyHtml.length})`);
  }
  await updateMeta({
    htmlBackfill: { at: new Date().toISOString(), gevonden: ontbreekt.length, gevuld, details },
  }).catch(() => null);
  return gevuld;
}

export async function syncStep(
  userId: string,
  refreshToken: string,
  ownerEmail?: string | null,
): Promise<{
  ok: boolean;
  imported: number;
  triaged: number;
  removed: number;
  autoArchived: number;
  progress: SyncProgress;
  error?: string;
}> {
  let state = await getImportState(userId);
  // Een run zonder importstatus (nieuwe koppeling, of een andere id dan waar de
  // status staat) hoort niet als fout te eindigen: begin dan gewoon opnieuw.
  if (!state) {
    await startImport(userId).catch(() => undefined);
    state = await getImportState(userId);
  }
  let imported = 0;
  let error: string | undefined;

  // First bring the store in line with Gmail: mail that was archived or
  // deleted elsewhere disappears before anything new is imported.
  const reconcile = await reconcileGmailHistory(userId, refreshToken).catch(() => null);

  const morePages = Boolean(state?.pageToken);
  // "done" still needs a look at the newest page: new mail arrives after the
  // initial walk and nobody else fetches it.
  if (!state || state.phase === "idle" || state.phase === "importing" || state.phase === "done" || morePages) {
    const step = await importStep(userId, refreshToken);
    imported = step.processed;
    if (!step.ok) error = step.error;
  }

  // Onze eigen antwoorden ophalen en aan hun thread koppelen: pas dan is een
  // gesprek compleet en weten we dat jij er al op hebt gereageerd.
  const recentImported = await importRecentMail(userId, refreshToken).catch(() => 0);
  imported += recentImported;
  const sentImported = await importSentReplies(userId, refreshToken).catch(() => 0);
  // Berichten van vóór de HTML-opslag misten hun inhoud; die halen we bij.
  await backfillHtmlBodies(userId, refreshToken).catch(() => 0);
  imported += sentImported;
  const answered = await applyAnsweredThreads(userId, ownerEmail).catch(() => ({ archived: 0, reopened: 0 }));

  const triage = await triageStep(userId, ownerEmail);
  if (!triage.ok && !error) error = triage.error;

  // Bewaarde mails zonder oordeel krijgen dat alsnog van het model.
  await backfillSavedVerdicts(userId).catch(() => 0);
  // En lange onderwerpen krijgen een korte versie voor op de kaart.
  await backfillShortSubjects().catch(() => 0);
  // Kaarten met een datum die de mail nooit noemde rechttrekken.
  await healDeadlines().catch(() => 0);
  // Kaarten die het model in de taal van de mail schreef, alsnog Nederlands maken.
  await healLanguage().catch(() => 0);
  // Kaarten waar beoordeling en indeling elkaar tegenspreken rechtzetten.
  await corrigeerTegenstrijdigheden().catch(() => 0);

  // Order mail whose status is now stored goes to the archive by itself.
  const autoArchived = await archiveProcessedOrders(userId, refreshToken).catch(() => 0);

  return {
    ok: !error,
    imported,
    triaged: triage.processed,
    removed: reconcile?.removed ?? 0,
    autoArchived: autoArchived + answered.archived,
    progress: await readProgress(userId),
    error,
  };
}
