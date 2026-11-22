import { runMailAgent } from "@/lib/agent/pipeline";
import { noteCronRejected } from "@/lib/agent/store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  if (request.headers.get("authorization") === `Bearer ${secret}`) return true;
  // Some schedulers can only call a URL: allow ?key=<secret> as well.
  return new URL(request.url).searchParams.get("key") === secret;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    await noteCronRejected().catch(() => null);
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const force = new URL(request.url).searchParams.get("force") === "1";
  const result = await runMailAgent(new Date(), { force });
  return Response.json(result, { status: result.ok ? 200 : 502 });
}
