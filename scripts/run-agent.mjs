// Triggers a local mail-agent run through the running Next.js server.
// Usage: npm run agent:run   (set AGENT_URL and CRON_SECRET for other hosts)
const base = process.env.AGENT_URL || "http://localhost:3000";
const secret = process.env.CRON_SECRET;

try {
  const response = await fetch(`${base.replace(/\/$/, "")}/api/cron/triage`, {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
  const data = await response.json().catch(() => ({ error: "non-json response" }));
  console.log(JSON.stringify(data, null, 2));
  process.exit(response.ok ? 0 : 1);
} catch (error) {
  console.error(`Could not reach ${base}/api/cron/triage. Is the dev server running?`);
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
