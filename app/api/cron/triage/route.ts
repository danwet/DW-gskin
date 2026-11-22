import { runMailAgent } from "@/lib/agent/pipeline";
import { createHash } from "crypto";

import { noteCronRejected } from "@/lib/agent/store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Reads the presented secret, tolerating spacing around the scheme and value. */
function presentedSecret(request: Request): { token: string; source: "header" | "query" | "none" } {
  const header = (request.headers.get("authorization") ?? "").trim();
  if (header) return { token: header.replace(/^Bearer\s+/i, "").trim(), source: "header" };
  const key = (new URL(request.url).searchParams.get("key") ?? "").trim();
  if (key) return { token: key, source: "query" };
  return { token: "", source: "none" };
}

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const { token } = presentedSecret(request);
  return token.length > 0 && token === secret.trim();
}

export async function POST(request: Request) {
  return run(request);
}

export async function GET(request: Request) {
  return run(request);
}

async function run(request: Request) {
  if (!authorized(request)) {
    // Describe the attempt, never the secret: that is what tells a wrong header
    // apart from a scheduler that never calls at all.
    const header = request.headers.get("authorization") ?? "";
    const secret = (process.env.CRON_SECRET ?? "").trim();
    // A short hash of both values tells a wrong secret from a right one without
    // ever storing the secret itself.
    const digest = (value: string) =>
      createHash("sha256").update(value).digest("hex").slice(0, 8);
    await noteCronRejected({
      hadHeader: header.length > 0,
      headerScheme: header ? (header.split(" ")[0] ?? null) : null,
      headerLength: header.length,
      hadKey: new URL(request.url).searchParams.has("key"),
      keyLength: (new URL(request.url).searchParams.get("key") ?? "").length,
      method: request.method,
      presentedLength: presentedSecret(request).token.length,
      presentedHash: digest(presentedSecret(request).token),
      expectedHash: secret ? digest(secret) : "",
      expectedLength: secret.length,
    }).catch(() => null);
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const force = new URL(request.url).searchParams.get("force") === "1";
  const result = await runMailAgent(new Date(), { force });
  return Response.json(result, { status: result.ok ? 200 : 502 });
}
