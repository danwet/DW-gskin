import "server-only";

import { buildAssessment, groupByConversation } from "./build";
import { classifyConversation } from "./classify";
import { loadAgentConfig, type AgentConfig, type ProviderId } from "./config";
import { fetchInboxMessages, gmailConfigured, resolveMailSource, storedGmailConnection } from "./mail-source";
import { hasGmailConnection, readActiveGmailConnection } from "../gmail/connection";
import { isShipmentRelated } from "./shipment";
import { appendRun, readAssessments, readMeta, updateMeta, upsertAssessments } from "./store";
import type { InboundMessage, MailAssessment } from "./types";
import { syncStep } from "../gmail/sync";

export type RunResult = {
  ok: boolean;
  source: "gmail" | "fixtures";
  model: string;
  processed: number;
  messagesSeen: number;
  conversations: number;
  skipped?: number;
  archived?: number;
  errors: string[];
  note?: string;
};

function activeProvider(config?: AgentConfig): { provider: ProviderId; apiKey?: string; model?: string } {
  const provider = config?.defaultProvider ?? "openai";
  const providerConfig = config?.providers?.[provider];
  return {
    provider,
    apiKey: providerConfig?.apiKey || undefined,
    model: providerConfig?.model || undefined,
  };
}

function modelLabelFor(provider: ProviderId, model?: string): string {
  return model?.trim() || provider;
}

export async function runMailAgent(now = new Date(), options?: { force?: boolean }): Promise<RunResult> {
  // Stamp the run the moment it starts: a long run otherwise reports the time
  // it finished, which is not when the schedule fired.
  const startedAt = now.toISOString();
  await updateMeta({ lastRunAt: startedAt }).catch(() => null);
  const config = await loadAgentConfig();
  const connection = await storedGmailConnection();
  const source = resolveMailSource(config, Boolean(connection) || gmailConfigured(config));

  if (source === "gmail") {
    const { provider, apiKey, model } = activeProvider(config);
    const useModel = Boolean(apiKey);
    const label = useModel ? modelLabelFor(provider, model) : "rule";

    if (!connection) {
      const reason = await connectionProblem();

      async function connectionProblem(): Promise<string> {
        const state = await readActiveGmailConnection().catch(() => null);
        if (!state || state.ok) {
          return "De Gmail-koppeling kon tijdelijk niet worden gelezen. Probeer het zo nog eens.";
        }
        if (state.reason === "no-row") {
          const linked = await hasGmailConnection().catch(() => false);
          return linked
            ? "De koppeling staat op 'opnieuw koppelen'. Koppel Gmail opnieuw bij Instellingen → Verbindingen."
            : "Gmail is niet gekoppeld.";
        }
        if (state.reason === "decrypt-error") {
          return "De opgeslagen Gmail-toegang kon niet worden ontsleuteld. Koppel Gmail opnieuw bij Instellingen → Verbindingen.";
        }
        return `De Gmail-koppeling kon niet worden gelezen (${state.detail ?? "onbekende fout"}). Probeer het zo nog eens.`;
      }
      await updateMeta({
        lastRunAt: now.toISOString(),
        lastError: reason,
        source,
        model: useModel ? provider : "rule",
      });
      await appendRun({
        at: now.toISOString(),
        ok: false,
        source,
        model: useModel ? provider : "rule",
        conversations: 0,
        messages: 0,
        error: reason,
      });
      return {
        ok: false,
        source,
        model: label,
        processed: 0,
        messagesSeen: 0,
        conversations: 0,
        errors: [reason],
        note: "Koppel Gmail opnieuw in Instellingen → Verbindingen.",
      };
    }

    const step = await syncStep(connection.userId, connection.refreshToken, connection.email);
    await updateMeta({
      lastRunAt: now.toISOString(),
      lastSuccessfulRunAt: step.ok ? now.toISOString() : undefined,
      lastError: step.ok ? null : step.error ?? "Synchronisatie mislukt.",
      source,
      model: useModel ? provider : "rule",
      conversationsProcessed: step.progress.imported,
      messagesSeen: step.progress.imported,
    });
    await appendRun({
      at: now.toISOString(),
      ok: step.ok,
      source,
      model: useModel ? provider : "rule",
      conversations: step.progress.threadsImported,
      messages: step.progress.imported,
      error: step.ok ? null : step.error ?? "Synchronisatie mislukt.",
    });
    return {
      ok: step.ok,
      source,
      model: label,
      processed: step.triaged,
      messagesSeen: step.progress.imported,
      conversations: step.progress.threadsImported,
      errors: step.error ? [step.error] : [],
    };
  }

  const fetchResult = await fetchInboxMessages(config);
  if (!fetchResult.ok) {
    const { provider, apiKey, model } = activeProvider(config);
    const useModel = Boolean(apiKey);
    const label = useModel ? modelLabelFor(provider, model) : "rule";
    await updateMeta({
      lastRunAt: now.toISOString(),
      lastError: fetchResult.reason,
      source,
      model: useModel ? provider : "rule",
    });
    await appendRun({
      at: now.toISOString(),
      ok: false,
      source,
      model: useModel ? provider : "rule",
      conversations: 0,
      messages: 0,
      error: fetchResult.reason,
    });
    return {
      ok: false,
      source,
      model: label,
      processed: 0,
      messagesSeen: 0,
      conversations: 0,
      errors: [fetchResult.reason],
      note: "Mailbox read failed; previous assessments were preserved.",
    };
  }
  return runMailAgentOnMessages(fetchResult.messages, source, now, config, options);
}

/** Classification + storage, separated so the harness can inject a message set. */
export async function runMailAgentOnMessages(
  messages: InboundMessage[],
  source: "gmail" | "fixtures",
  now = new Date(),
  config?: AgentConfig,
  options?: { force?: boolean },
): Promise<RunResult> {
  const { provider, apiKey, model } = activeProvider(config);
  const useModel = Boolean(apiKey);
  const label = useModel ? modelLabelFor(provider, model) : "rule";
  const meta = await readMeta();

  if (messages.length === 0) {
    await updateMeta({
      lastRunAt: now.toISOString(),
      lastSuccessfulRunAt: now.toISOString(),
      lastError: null,
      source,
      model: useModel ? provider : "rule",
      conversationsProcessed: 0,
      messagesSeen: 0,
    });
    await appendRun({
      at: now.toISOString(),
      ok: true,
      source,
      model: useModel ? provider : "rule",
      conversations: 0,
      messages: 0,
      error: null,
    });
    return { ok: true, source, model: label, processed: 0, messagesSeen: 0, conversations: 0, errors: [] };
  }

  const grouped = groupByConversation(messages);
  const existingById = new Map((await readAssessments()).map((item) => [item.conversationId, item]));
  const updates: MailAssessment[] = [];
  const errors: string[] = [];
  let skipped = 0;

  for (const [conversationId, conversation] of grouped) {
    const latest = conversation[conversation.length - 1];
    const current = existingById.get(conversationId);

    // Only new mail, or a new message inside an existing thread, needs the model.
    // A conversation that was already assessed on its latest message is left as is.
    if (!options?.force && current && current.sourceMessageId === latest.id) {
      skipped += 1;
      continue;
    }

    try {
      const draft = await classifyConversation(conversation, { provider, apiKey, model });
      updates.push(buildAssessment(conversation, draft, now, source));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "unknown classification error");
    }
  }

  if (updates.length > 0) {
    await upsertAssessments(updates);
  }

  // Phase 1 is read-only: never archive, label or modify anything in Gmail.
  const archived = 0;

  const success = errors.length === 0;
  await updateMeta({
    lastRunAt: now.toISOString(),
    lastSuccessfulRunAt: success ? now.toISOString() : meta.lastSuccessfulRunAt,
    lastError: success ? null : `Model failed for ${errors.length} conversation(s)`,
    source,
    model: useModel ? provider : "rule",
    conversationsProcessed: grouped.size,
    messagesSeen: messages.length,
  });
  await appendRun({
    at: now.toISOString(),
    ok: success,
    source,
    model: useModel ? provider : "rule",
    conversations: grouped.size,
    skipped,
    messages: messages.length,
    archived,
    error: success ? null : `Model mislukt voor ${errors.length} gesprek(ken)`,
  });

  return {
    ok: success,
    source,
    model: label,
    processed: updates.length,
    messagesSeen: messages.length,
    conversations: grouped.size,
    skipped,
    archived,
    errors,
  };
}
