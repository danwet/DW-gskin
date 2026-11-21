import { sessionUser, unauthorized } from "@/lib/api-auth";
import { markHandled, readMeta, readStateOnce, saveConversation, setDeclaration, snoozeConversation } from "@/lib/agent/store";
import { loadAgentConfig } from "@/lib/agent/config";
import { gmailConfigured, resolveMailSource } from "@/lib/agent/mail-source";
import { runMailAgent } from "@/lib/agent/pipeline";
import type { MailAssessment } from "@/lib/agent/types";
import { resolveGmailConnection } from "@/lib/gmail/connection";
import { getSyncProgress, type SyncProgress } from "@/lib/gmail/sync";
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
    // Everything independent of the source is fetched in parallel: this route
    // is on the critical path of the first paint.
    const [config, connection, stateDoc, progress] = await Promise.all([
      loadAgentConfig(),
      resolveGmailConnection(user.id, user.email).catch(() => null),
      readStateOnce(),
      getSyncProgress(user.id).catch(() => ({
        phase: "idle" as const,
        imported: 0,
        total: null,
        threadsImported: 0,
        triaged: 0,
        pending: 0,
        lastError: null,
      })),
    ]);
    const meta = stateDoc.meta;

    const connectionUsable = connection?.status === "connected";
    const legacyGmail = gmailConfigured(config);
    const gmailReady = connectionUsable || legacyGmail;
    // A linked account always wins over test data, even while it needs a reconnect.
    const source = resolveMailSource(config, Boolean(connection) || legacyGmail);
    const provider = config.providers[config.defaultProvider];
    const model = provider?.apiKey ? provider.model || config.defaultProvider : "rule";
    const gmailEmail = connection?.email ?? null;

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
      const raw = stateDoc.assessments.filter((item) => item.mailbox === "gmail");
      const items = await attachProposals(user.id, raw, gmailEmail);

      return Response.json({ items, pending: [], progress, meta, model, gmail: connection, undoable: Boolean(meta.lastAction) });
    }

    // Fixtures: seed the demo data on first use when the store has never run.
    if (!meta.lastRunAt) {
      await runMailAgent();
    }

    const latestMeta = meta;
    // Test data only: anything assessed from a linked Gmail account stays out.
    const rawItems = stateDoc.assessments.filter((item) => item.mailbox !== "gmail");
    const items = await attachProposals(user.id, rawItems, gmailEmail);
    return Response.json({
      items,
      pending: [],
      progress: null,
      meta: latestMeta,
      model,
      gmail: connection,
      undoable: Boolean(latestMeta.lastAction),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Inbox kon niet worden geladen.";
    return Response.json({ error: message }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const user = await sessionUser();
  if (!user) return unauthorized();

  const body = (await request.json().catch(() => null)) as {
    conversationId?: string;
    handled?: boolean;
    snoozedUntil?: string | null;
    snoozedTier?: "later" | "info" | null;
    declaration?: string;
    saved?: boolean;
    action?: string;
    until?: string | null;
    tier?: "later" | "info" | null;
  } | null;

  const conversationId = body?.conversationId?.trim();
  if (!conversationId) return Response.json({ error: "Ongeldig verzoek." }, { status: 400 });

  const snoozeUntil = body?.snoozedUntil !== undefined ? body.snoozedUntil : body?.until;
  const snoozeTier = body?.snoozedTier ?? body?.tier ?? null;

  try {
    let item = null;
    if (body?.action === "snooze" || snoozeUntil !== undefined) {
      item = await snoozeConversation(conversationId, snoozeUntil ?? null, snoozeTier);
    } else if (body?.handled !== undefined) {
      item = await markHandled(conversationId, Boolean(body.handled));
    } else if (body?.declaration !== undefined) {
      item = await setDeclaration(conversationId, body.declaration as "none" | "pending" | "declared");
    } else if (body?.saved !== undefined) {
      item = await saveConversation(conversationId, Boolean(body.saved));
    } else {
      return Response.json({ error: "Onbekende actie." }, { status: 400 });
    }
    return Response.json({ ok: true, item });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Actie mislukt.";
    return Response.json({ error: message }, { status: 503 });
  }
}
