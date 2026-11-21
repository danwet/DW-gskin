import "server-only";

import { buildAssessment, groupByConversation } from "./build";
import { agentModel, classifyConversation, openAiConfigured } from "./classify";
import { loadAgentConfig, type AgentConfig } from "./config";
import { fetchInboxMessages, resolveMailSource } from "./mail-source";
import { archiveGmailMessages } from "./gmail-archive";
import { isShipmentRelated } from "./shipment";
import { appendRun, readAssessments, readMeta, updateMeta, upsertAssessments } from "./store";
import type { InboundMessage, MailAssessment } from "./types";

export type RunResult = {
  ok: boolean;
  source: "gmail" | "fixtures";
  model: string;
  processed: number;
  messagesSeen: number;
  conversations: number;
  archived?: number;
  errors: string[];
  note?: string;
};

export async function runMailAgent(now = new Date()): Promise<RunResult> {
  const config = await loadAgentConfig();
  const source = resolveMailSource(config);
  const fetchResult = await fetchInboxMessages(config);
  if (!fetchResult.ok) {
    const useOpenAi = openAiConfigured(config.providers.openai.apiKey);
    await updateMeta({
      lastRunAt: now.toISOString(),
      lastError: fetchResult.reason,
      source,
      model: useOpenAi ? "openai" : "rule",
    });
    await appendRun({
      at: now.toISOString(),
      ok: false,
      source,
      model: useOpenAi ? "openai" : "rule",
      conversations: 0,
      messages: 0,
      error: fetchResult.reason,
    });
    return {
      ok: false,
      source,
      model: useOpenAi ? agentModel(config.providers.openai.model) : "rule",
      processed: 0,
      messagesSeen: 0,
      conversations: 0,
      errors: [fetchResult.reason],
      note: "Mailbox read failed; previous assessments were preserved.",
    };
  }
  return runMailAgentOnMessages(fetchResult.messages, source, now, config);
}

/** Classification + storage, separated so the harness can inject a message set. */
export async function runMailAgentOnMessages(
  messages: InboundMessage[],
  source: "gmail" | "fixtures",
  now = new Date(),
  config?: AgentConfig,
): Promise<RunResult> {
  const useOpenAi = openAiConfigured(config?.providers.openai.apiKey);
  const modelLabel = useOpenAi ? agentModel(config?.providers.openai.model) : "rule";
  const meta = await readMeta();

  if (messages.length === 0) {
    await updateMeta({
      lastRunAt: now.toISOString(),
      lastSuccessfulRunAt: now.toISOString(),
      lastError: null,
      source,
      model: useOpenAi ? "openai" : "rule",
      conversationsProcessed: 0,
      messagesSeen: 0,
    });
    await appendRun({
      at: now.toISOString(),
      ok: true,
      source,
      model: useOpenAi ? "openai" : "rule",
      conversations: 0,
      messages: 0,
      error: null,
    });
    return { ok: true, source, model: modelLabel, processed: 0, messagesSeen: 0, conversations: 0, errors: [] };
  }

  const grouped = groupByConversation(messages);
  const updates: MailAssessment[] = [];
  const errors: string[] = [];

  for (const conversation of grouped.values()) {
    try {
      const draft = await classifyConversation(conversation, { apiKey: config?.providers.openai.apiKey, model: config?.providers.openai.model });
      updates.push(buildAssessment(conversation, draft, now));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "unknown classification error");
    }
  }

  await upsertAssessments(updates);

  // Order/shipment status updates are archived in Gmail once the agent has read
  // them. Only possible with a gmail.modify refresh token; otherwise this is a
  // no-op that leaves the mailbox untouched.
  let archived = 0;
  if (source === "gmail") {
    const shipmentIds = messages.filter((message) => isShipmentRelated(message)).map((message) => message.id);
    const assessments = await readAssessments();
    const archiveIdsFromAssessments = assessments
      .filter((assessment) => {
        if (assessment.source === "scan" || !assessment.sourceMessageId) return false;
        if (assessment.invoice && assessment.handledByUser === true && assessment.declaration !== "pending") return true;
        if (assessment.savedAt && assessment.handledByUser === true) return true;
        return false;
      })
      .map((assessment) => assessment.sourceMessageId as string);
    const invoiceIds = archiveIdsFromAssessments;
    const archiveIds = Array.from(new Set([...shipmentIds, ...invoiceIds]));
    if (archiveIds.length > 0) {
      const result = await archiveGmailMessages(archiveIds, config?.gmailRefreshToken);
      archived = result.archived;
    }
  }

  const success = errors.length === 0;
  await updateMeta({
    lastRunAt: now.toISOString(),
    lastSuccessfulRunAt: success ? now.toISOString() : meta.lastSuccessfulRunAt,
    lastError: success ? null : `Model failed for ${errors.length} conversation(s)`,
    source,
    model: useOpenAi ? "openai" : "rule",
    conversationsProcessed: grouped.size,
    messagesSeen: messages.length,
  });
  await appendRun({
    at: now.toISOString(),
    ok: success,
    source,
    model: useOpenAi ? "openai" : "rule",
    conversations: grouped.size,
    messages: messages.length,
    archived,
    error: success ? null : `Model mislukt voor ${errors.length} gesprek(ken)`,
  });

  return {
    ok: success,
    source,
    model: modelLabel,
    processed: updates.length,
    messagesSeen: messages.length,
    conversations: grouped.size,
    archived,
    errors,
  };
}
