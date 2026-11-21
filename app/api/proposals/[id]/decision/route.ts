import { sessionUser, unauthorized } from "@/lib/api-auth";
import { decideProposal, type ProposalDecision } from "@/lib/proposals";

export const dynamic = "force-dynamic";

/**
 * Records the decision for the proposal version the user saw.
 * This never executes anything: Gmail is read-only in this phase.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await sessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { version?: unknown; decision?: unknown } | null;
  const version = Number(body?.version);
  const decision = body?.decision;

  if (!Number.isInteger(version) || version < 1 || (decision !== "approved" && decision !== "rejected")) {
    return Response.json({ error: "Ongeldige beslissing." }, { status: 400 });
  }

  try {
    const result = await decideProposal(id, user.id, version, decision as ProposalDecision);
    if (!result.ok) {
      if (result.code === "not_found") {
        return Response.json({ error: "Voorstel niet gevonden." }, { status: 404 });
      }
      return Response.json({ error: "changed", proposal: result.proposal }, { status: 409 });
    }
    return Response.json({ ok: true, proposal: result.proposal });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Beslissing kon niet worden opgeslagen.";
    return Response.json({ error: message }, { status: 503 });
  }
}
