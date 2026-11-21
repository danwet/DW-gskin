import { sessionUser, unauthorized } from "@/lib/api-auth";
import type { ConnectionStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await sessionUser();
  if (!user) return unauthorized();

  const status: ConnectionStatus = {
    cronSecret: Boolean(process.env.CRON_SECRET),
    agentApiKey: Boolean(process.env.AGENT_API_KEY),
  };

  return Response.json(status);
}
