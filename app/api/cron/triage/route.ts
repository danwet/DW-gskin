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
    // Describe the attempt, never the secret: that is what tells a wrong header
    // apart from a scheduler that never calls at all.
    const header = request.headers.get("authorization") ?? "";
    const key = new URL(request.url).searchParams.get("key") ?? "";
    await noteCronRejected({
      hadHeader: header.length > 0,
      headerScheme: header ? (header.split(" ")[0] ?? null) : null,
      headerLength: header.length,
      hadKey: key.length > 0,
      keyLength: key.length,
    }).catch(() => null);
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const force = new URL(request.url).searchParams.get("force") === "1";
  const result = await runMailAgent(new Date(), { force });
  return Response.json(result, { status: result.ok ? 200 : 502 });
}
