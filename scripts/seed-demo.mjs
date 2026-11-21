// Seeds the demo/fixture mail-agent data by triggering the pipeline through a
// running (local or Vercel) server. The server writes assessments to Supabase
// when Supabase is configured, else to local files.
//
// Usage:
//   npm run seed:demo                                   (local dev server)
//   SEED_URL=https://dw-gskin.vercel.app CRON_SECRET=... npm run seed:demo
const base = (process.env.SEED_URL || "http://localhost:3000").replace(/\/$/, "");
const secret = process.env.CRON_SECRET;

try {
  const response = await fetch(`${base}/api/cron/triage`, {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
  const data = await response.json().catch(() => ({ error: "non-json response" }));
  console.log(JSON.stringify(data, null, 2));
  process.exit(response.ok ? 0 : 1);
} catch (error) {
  console.error(`Could not reach ${base}/api/cron/triage. Is the server running?`);
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
