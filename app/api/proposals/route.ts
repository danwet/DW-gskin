import { sessionUser, unauthorized } from "@/lib/api-auth";
import { requestProposal, type ProposalAction } from "@/lib/proposals";

export const dynamic = "force-dynamic";

const ACTIONS: ProposalAction[] = ["archive", "trash"];

/** Prepares an archive/trash proposal for one conversation (never executes it). */
export async function POST(request: Request) {
  const user = await sessionUser();
  if (!user) return unauthorized();

  const body = (await request.json().catch(() => null)) as { conversationId?: string; action?: string } | null;
  const conversationId = body?.conversationId?.trim();
  const action = (body?.action ?? "archive") as ProposalAction;
  if (!conversationId || !ACTIONS.includes(action)) {
    return Response.json({ error: "Ongeldig verzoek." }, { status: 400 });
  }

  try {
    const proposal = await requestProposal(user.id, conversationId, action);
    if (!proposal) return Response.json({ error: "Voorstel kon niet worden gemaakt." }, { status: 404 });
    return Response.json({ ok: true, proposal });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Voorstel kon niet worden gemaakt.";
    return Response.json({ error: message }, { status: 503 });
  }
}
