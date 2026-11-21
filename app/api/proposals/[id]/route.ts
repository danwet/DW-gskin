import { sessionUser, unauthorized } from "@/lib/api-auth";
import { getProposal } from "@/lib/proposals";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await sessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  try {
    const proposal = await getProposal(id, user.id);
    if (!proposal) return Response.json({ error: "Voorstel niet gevonden." }, { status: 404 });
    return Response.json({ proposal });
  } catch {
    return Response.json({ error: "Voorstel kon niet worden geladen." }, { status: 503 });
  }
}
