import { sessionUser, unauthorized } from "@/lib/api-auth";
import { markHandled, readAssessments, readMeta, saveConversation, setDeclaration, snoozeConversation } from "@/lib/agent/store";
import { loadAgentConfig } from "@/lib/agent/config";
import { groupByConversation } from "@/lib/agent/build";
import { gmailConfigured, resolveMailSource } from "@/lib/agent/mail-source";
import { runMailAgent } from "@/lib/agent/pipeline";
import type { MailAssessment } from "@/lib/agent/types";
import { resolveGmailConnection } from "@/lib/gmail/connection";
import { getSyncProgress, type SyncProgress } from "@/lib/gmail/sync";
import { listUntriagedMessages } from "@/lib/gmail/store";
import { syncProposals, type ProposalSummary } from "@/lib/proposals";

export const dynamic = "force-dynamic";

export type PendingItem = {
  conversationId: string;
  subject: string;
  from: string;
  fromEmail: string;
  receivedAt: string;
  snippet: string;
  messages: number;
};

/** Conversations that are imported but not triaged yet. */
async function pendingItems(userId: string, assessed: Set<string>): Promise<PendingItem[]> {
  const messages = await listUntriagedMessages(userId, 200);
  const grouped = groupByConversation(messages);
  const items: PendingItem[] = [];
  for (const [conversationId, list] of grouped) {
    if (assessed.has(conversationId)) continue;
    const latest = list[list.length - 1];
    items.push({
      conversationId,
      subject: latest.subject,
      from: latest.from,
      fromEmail: latest.fromEmail,
      receivedAt: latest.receivedAt,
      snippet: latest.snippet,
      messages: list.length,
    });
  }
  return items.sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt));
}

async function attachProposals(userId: string, items: MailAssessment[], gmailEmail: string | null): Promise<MailAssessment[]> {
  if (items.length === 0) return items;
  // Bound the first sync so a large archive cannot stall the inbox request.
  const newest = [...items].sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt)).slice(0, 300);
  let summaries: Map<string, ProposalSummary>;
  try {
    summaries = await syncProposals(userId, newest, gmailEmail);
  } catch {
    return items;
  }
  return items.map((item) => {
    const summary = summaries.get(item.conversationId);
    return summary ? { ...item, proposal: summary } : item;
  });
}

export async function GET() {
  const user = await sessionUser();
  if (!user) return unauthorized();

  try {
    const config = await loadAgentConfig();
    const connection = await resolveGmailConnection(user.id, user.email).catch(() => null);
    const connectionUsable = connection?.status === "connected";
    const legacyGmail = gmailConfigured(config);
    const gmailReady = connectionUsable || legacyGmail;
    // A linked account always wins over test data, even while it needs a reconnect.
    const source = resolveMailSource(config, Boolean(connection) || legacyGmail);
    const provider = config.providers[config.defaultProvider];
    const model = provider?.apiKey ? provider.model || config.defaultProvider : "rule";
    const gmailEmail = connection?.email ?? null;

    let meta = await readMeta();

    if (source === "gmail") {
      if (!gmailReady) {
        return Response.json({
          items: [],
          pending: [],
          progress: null,
          meta,
          model: "rule",
          gmail: connection
            ? { email: connection.email, status: connection.status, scopes: connection.scopes, connectedAt: connection.connectedAt }
            : null,
          error: connection
            ? `De Gmail-koppeling van ${connection.email} is verlopen of ingetrokken. Koppel opnieuw bij Instellingen → Verbindingen.`
            : "Gmail is nog niet gekoppeld. Koppel Gmail bij Instellingen → Verbindingen.",
        });
      }

      // Only live Gmail assessments: the demo cards never join this list.
      const raw = (await readAssessments()).filter((item) => item.mailbox === "gmail");
      const items = await attachProposals(user.id, raw, gmailEmail);
      const assessed = new Set(raw.map((item) => item.conversationId));
      const progress: SyncProgress = await getSyncProgress(user.id).catch(() => ({
        phase: "idle" as const,
        imported: 0,
        total: null,
        threadsImported: 0,
        triaged: 0,
        pending: 0,
        lastError: null,
      }));
      const pending = await pendingItems(user.id, assessed).catch(() => []);

      return Response.json({ items, pending, progress, meta, model, gmail: connection });
    }

    // Fixtures: seed the demo data on first use when the store has never run.
    if (!meta.lastRunAt) {
      await runMailAgent();
    }

    const [allItems, latestMeta] = await Promise.all([readAssessments(), readMeta()]);
    // Test data only: anything assessed from a linked Gmail account stays out.
    const rawItems = allItems.filter((item) => item.mailbox !== "gmail");
    const items = await attachProposals(user.id, rawItems, gmailEmail);
    return Response.json({
      items,
      pending: [],
      progress: null,
      meta: latestMeta,
      model,
      gmail: connection,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Inbox kon niet worden geladen.";
    return Response.json({ error: message }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const user = await sessionUser();
  if (!user) return unauthorized();

  const body = (await request.json().catch(() => null)) as
    | { action?: string; id?: string; conversationId?: string; until?: string; declaration?: string }
    | null;
  if (!body?.action || !body.conversationId) {
    return Response.json({ error: "Ongeldig verzoek." }, { status: 400 });
  }

  try {
    if (body.action === "snooze") {
      await snoozeConversation(body.conversationId, body.until ?? new Date().toISOString());
    } else if (body.action === "declare") {
      await setDeclaration(body.conversationId, (body.declaration ?? "none") as "none" | "pending" | "declared");
    } else if (body.action === "handle") {
      await markHandled(body.conversationId, true);
    } else if (body.action === "save") {
      await saveConversation(body.conversationId, true);
    } else {
      return Response.json({ error: "Onbekende actie." }, { status: 400 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Actie mislukt.";
    return Response.json({ error: message }, { status: 503 });
  }
}
