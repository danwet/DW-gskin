import "server-only";

import { buildAssessment, groupByConversation } from "./build";
import { classifyConversation } from "./classify";
import { loadAgentConfig, type AgentConfig, type ProviderId } from "./config";
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

export async function runMailAgent(now = new Date()): Promise<RunResult> {
  const config = await loadAgentConfig();
  const source = resolveMailSource(config);
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
  return runMailAgentOnMessages(fetchResult.messages, source, now, config);
}

/** Classification + storage, separated so the harness can inject a message set. */
export async function runMailAgentOnMessages(
  messages: InboundMessage[],
  source: "gmail" | "fixtures",
  now = new Date(),
  config?: AgentConfig,
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
  const updates: MailAssessment[] = [];
  const errors: string[] = [];

  for (const conversation of grouped.values()) {
    try {
      const draft = await classifyConversation(conversation, { provider, apiKey, model });
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
    archived,
    errors,
  };
}
