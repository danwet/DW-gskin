import "server-only";

import type { MailAssessment } from "./agent/types";
import { dbClient } from "./supabase/db";

export type ProposalAction = "archive" | "trash" | "reply" | "unsubscribe";
export type ProposalStatus = "pending" | "approved" | "rejected";
export type ProposalDecision = "approved" | "rejected";
export type ProposalTarget = "message" | "thread";

export type ProposalPayload = {
  recipients?: string[];
  subject?: string;
  body?: string;
  unsubscribeUrl?: string;
  unsubscribeKind?: string;
  domain?: string;
};

export type ProposalSummary = {
  id: string;
  action: ProposalAction;
  status: ProposalStatus;
  version: number;
};

export type ActionProposal = {
  id: string;
  userId: string;
  gmailEmail: string | null;
  conversationId: string;
  messageId: string;
  threadId: string | null;
  action: ProposalAction;
  target: ProposalTarget;
  reason: string;
  payload: ProposalPayload;
  version: number;
  status: ProposalStatus;
  createdAt: string;
  updatedAt: string;
};

export type StoredDecision = {
  decision: ProposalDecision;
  version: number;
  decidedAt: string;
};

export type ProposalView = ActionProposal & { decision: StoredDecision | null };

type Row = {
  id: string;
  user_id: string;
  gmail_email: string | null;
  conversation_id: string;
  message_id: string;
  thread_id: string | null;
  action: ProposalAction;
  target: ProposalTarget;
  reason: string;
  payload: ProposalPayload | null;
  version: number;
  status: ProposalStatus;
  created_at: string;
  updated_at: string;
};

function toProposal(row: Row): ActionProposal {
  return {
    id: row.id,
    userId: row.user_id,
    gmailEmail: row.gmail_email,
    conversationId: row.conversation_id,
    messageId: row.message_id,
    threadId: row.thread_id,
    action: row.action,
    target: row.target,
    reason: row.reason,
    payload: row.payload ?? {},
    version: row.version,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * The proposal a card can offer. Deterministic and derived from the triage
 * result — the model never gets to name an arbitrary action.
 */
export function deriveProposal(item: MailAssessment): {
  action: ProposalAction;
  target: ProposalTarget;
  reason: string;
  payload: ProposalPayload;
} | null {
  if (item.unsubscribe) {
    return {
      action: "unsubscribe",
      target: "thread",
      reason: item.priorityReason || "Deze afzender biedt een afmeldmogelijkheid.",
      payload: {
        unsubscribeUrl: item.unsubscribe.url,
        unsubscribeKind: item.unsubscribe.kind,
        domain: item.unsubscribe.domain,
      },
    };
  }

  if (item.classification === "reply_needed" && item.draftReply) {
    return {
      action: "reply",
      target: "thread",
      reason: item.priorityReason || "De afzender wacht op een antwoord.",
      payload: {
        recipients: [item.fromEmail],
        subject: /^re:/i.test(item.subject) ? item.subject : `Re: ${item.subject}`,
        body: item.draftReply,
      },
    };
  }

  if (item.classification === "info") {
    return {
      action: "archive",
      target: "message",
      reason: "Informatieve mail zonder actie; archiveren houdt je inbox overzichtelijk.",
      payload: {},
    };
  }

  return null;
}

async function readDecision(proposalId: string, version: number): Promise<StoredDecision | null> {
  const supabase = await dbClient();
  const { data } = await supabase
    .from("dw_action_decisions")
    .select("decision, version, decided_at")
    .eq("proposal_id", proposalId)
    .eq("version", version)
    .maybeSingle();
  if (!data) return null;
  return { decision: data.decision as ProposalDecision, version: data.version as number, decidedAt: data.decided_at as string };
}

export async function getProposal(id: string, userId: string): Promise<ProposalView | null> {
  const supabase = await dbClient();
  const { data, error } = await supabase.from("dw_action_proposals").select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  const row = data as Row;
  if (row.user_id !== userId) return null;
  return { ...toProposal(row), decision: await readDecision(row.id, row.version) };
}

/**
 * Keeps one proposal per conversation. A changed action, payload or target
 * message bumps the version and resets the status, so an earlier approval
 * never carries over to new content.
 */
export async function syncProposals(
  userId: string,
  items: MailAssessment[],
  gmailEmail: string | null,
): Promise<Map<string, ProposalSummary>> {
  const supabase = await dbClient();
  const { data } = await supabase.from("dw_action_proposals").select("*").eq("user_id", userId);
  const existing = (data ?? []) as Row[];
  const byConversation = new Map(existing.map((row) => [row.conversation_id, row]));

  const summaries = new Map<string, ProposalSummary>();
  const now = new Date().toISOString();

  for (const item of items) {
    const derived = deriveProposal(item);
    if (!derived) continue;

    const current = byConversation.get(item.conversationId);
    const payloadJson = JSON.stringify(derived.payload);

    if (!current) {
      const { data: inserted } = await supabase
        .from("dw_action_proposals")
        .insert({
          user_id: userId,
          gmail_email: gmailEmail,
          conversation_id: item.conversationId,
          message_id: item.sourceMessageId,
          thread_id: item.conversationId,
          action: derived.action,
          target: derived.target,
          reason: derived.reason,
          payload: derived.payload,
          version: 1,
          status: "pending",
          created_at: now,
          updated_at: now,
        })
        .select("*")
        .single();
      if (inserted) {
        const row = inserted as Row;
        summaries.set(item.conversationId, {
          id: row.id,
          action: row.action,
          status: row.status,
          version: row.version,
        });
      }
      continue;
    }

    const changed =
      JSON.stringify(current.payload ?? {}) !== payloadJson ||
      current.message_id !== item.sourceMessageId ||
      current.reason !== derived.reason ||
      current.action !== derived.action;

    if (!changed) {
      if (current.gmail_email !== gmailEmail) {
        await supabase.from("dw_action_proposals").update({ gmail_email: gmailEmail }).eq("id", current.id);
      }
      summaries.set(item.conversationId, {
        id: current.id,
        action: current.action,
        status: current.status,
        version: current.version,
      });
      continue;
    }

    const { data: updated } = await supabase
      .from("dw_action_proposals")
      .update({
        gmail_email: gmailEmail,
        message_id: item.sourceMessageId,
        thread_id: item.conversationId,
        action: derived.action,
        target: derived.target,
        reason: derived.reason,
        payload: derived.payload,
        version: current.version + 1,
        status: "pending",
        updated_at: now,
      })
      .eq("id", current.id)
      .eq("version", current.version)
      .select("*")
      .maybeSingle();

    const row = (updated as Row | null) ?? { ...current, version: current.version + 1, status: "pending" };
    summaries.set(item.conversationId, {
      id: row.id,
      action: row.action,
      status: row.status,
      version: row.version,
    });
  }

  return summaries;
}

export type DecideResult =
  | { ok: true; proposal: ProposalView }
  | { ok: false; code: "not_found" }
  | { ok: false; code: "changed"; proposal: ProposalView };

/**
 * Records the decision for exactly the version the user saw. The unique
 * (proposal_id, version) constraint makes retries and double clicks idempotent,
 * and nothing is ever executed — this only writes a decision row.
 */
export async function decideProposal(
  id: string,
  userId: string,
  version: number,
  decision: ProposalDecision,
): Promise<DecideResult> {
  const supabase = await dbClient();
  const { data } = await supabase.from("dw_action_proposals").select("*").eq("id", id).maybeSingle();
  if (!data) return { ok: false, code: "not_found" };
  const row = data as Row;
  if (row.user_id !== userId) return { ok: false, code: "not_found" };

  if (row.version !== version) {
    const proposal = await getProposal(id, userId);
    if (!proposal) return { ok: false, code: "not_found" };
    return { ok: false, code: "changed", proposal };
  }

  const { error } = await supabase.from("dw_action_decisions").upsert(
    { proposal_id: id, user_id: userId, version: row.version, decision },
    { onConflict: "proposal_id,version", ignoreDuplicates: true },
  );
  if (error) throw new Error("Beslissing kon niet worden opgeslagen.");

  // The first stored decision for this version wins, even on a retry.
  const stored = await readDecision(id, row.version);
  await supabase
    .from("dw_action_proposals")
    .update({ status: stored?.decision ?? decision, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("version", row.version);

  const proposal = await getProposal(id, userId);
  if (!proposal) return { ok: false, code: "not_found" };
  return { ok: true, proposal };
}
