import fs from "node:fs";
for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  const k = t.slice(0, i);
  if (process.env[k] === undefined) process.env[k] = t.slice(i + 1);
}
const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" };

const [{ data }] = await (await fetch(`${base}/rest/v1/dw_agent_state?select=data&id=eq.singleton`, { headers })).json();
const assessments = data.assessments ?? {};
const gmail = Object.values(assessments).filter((i) => i.mailbox === "gmail");
const a = gmail.find((i) => /gemeenteavond|rank|baptist/i.test(`${i.from} ${i.subject}`)) ?? gmail[0];
console.log("assessment:", a.conversationId, "| json size:", JSON.stringify(a).length);
console.log("doc size now:", JSON.stringify(data).length);

const next = { ...data, meta: { ...(data.meta ?? {}), lastAction: { conversationId: a.conversationId, action: "archive", messageIds: [a.sourceMessageId ?? a.conversationId], assessment: a, at: new Date().toISOString() } } };
console.log("doc size with lastAction:", JSON.stringify(next).length);

const res = await fetch(`${base}/rest/v1/dw_agent_state?id=eq.singleton`, {
  method: "PATCH", headers,
  body: JSON.stringify({ data: next, updated_at: new Date().toISOString() }),
});
console.log("PATCH status:", res.status, "|", res.status === 200 ? await res.text().then((t) => t.slice(0, 120)) : await res.text().then((t) => t.slice(0, 300)));

// revert
const back = { ...data, meta: { ...(data.meta ?? {}), lastAction: null } };
const res2 = await fetch(`${base}/rest/v1/dw_agent_state?id=eq.singleton`, {
  method: "PATCH", headers,
  body: JSON.stringify({ data: back, updated_at: new Date().toISOString() }),
});
console.log("revert status:", res2.status);
