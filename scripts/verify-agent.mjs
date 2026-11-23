// Deterministic verification of the mail-agent logic, independent of the web
// server and any API key. Run with: npm run agent:verify
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.TZ = "Europe/Amsterdam";

// The app uses extensionless TS imports (Next resolves them); Node's direct TS
// runner needs the .ts extension, so map relative imports before loading.
const projectRoot = new URL("../", import.meta.url).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    const parent = context.parentURL ?? "";
    const hasExtension = /\.[a-zA-Z0-9]+$/.test(specifier);
    if (
      parent.startsWith(projectRoot) &&
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      !hasExtension
    ) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const { buildAssessment, groupByConversation } = await import("../lib/agent/build.ts");
const { ruleAssessForTests } = await import("../lib/agent/classify.ts");
const { buildFixtureMessages } = await import("../lib/agent/fixtures.ts");
const store = await import("../lib/agent/store.ts");
const { urgencyFor } = await import("../lib/agent/urgency.ts");
const { runMailAgentOnMessages } = await import("../lib/agent/pipeline.ts");

const dir = await mkdtemp(path.join(tmpdir(), "dw-agent-"));
store.setAgentStoreDirectoryForTests(dir);

const now = new Date("2026-11-20T09:00:00.000Z");
const nowPlus1 = new Date(now.getTime() + 24 * 3600 * 1000);

function assess(messages) {
  const grouped = groupByConversation(messages);
  const updates = [];
  for (const conversation of grouped.values()) {
    updates.push(buildAssessment(conversation, ruleAssessForTests(conversation), now));
  }
  return updates;
}

function byId(items) {
  return Object.fromEntries(items.map((item) => [item.conversationId, item]));
}

try {
  await store.resetAgentStore();

  // --- Run 1 (stage 1: invoice without reminder) ---
  await store.upsertAssessments(assess(buildFixtureMessages(now, 1)));
  let items = await store.readAssessments();
  assert.equal(items.length, 14, "one card per conversation");

  let map = byId(items);
  assert.equal(map["thread-inv-100"].invoice.paymentStatus, "unknown", "invoice without proof is unknown");
  assert.equal(map["thread-inv-205"].invoice.paymentStatus, "unknown");
  assert.equal(map["thread-inv-030"].invoice.paymentStatus, "open_per_sender", "explicit reminder is open");
  assert.equal(map["thread-reply-1"].classification, "reply_needed", "reply request is an action item");
  assert.equal(map["thread-info-1"].classification, "info");
  assert.equal(map["thread-wait-1"].classification, "waiting");
  assert.equal(map["thread-inv-100"].invoice.amount, 120, "amount extracted");
  assert.match(map["thread-inv-100"].invoice.dueDate, /^\d{4}-\d{2}-\d{2}$/, "due date extracted");

  // --- Unsubscribe detection (no network performed during detection) ---
  assert.equal(map["thread-nl-oc"].unsubscribe?.kind, "one-click", "List-Unsubscribe + One-Click is detected");
  assert.equal(map["thread-nl-manual"].unsubscribe?.kind, "manual", "manual HTTPS link is detected");
  assert.equal(map["thread-nl-mailto"].unsubscribe?.kind, "mailto", "mailto-only fallback is detected");
  assert.equal(map["thread-nl-invalid"].unsubscribe, undefined, "invalid destination is dropped");
  assert.equal(map["thread-inv-100"].unsubscribe, undefined, "invoice has no unsubscribe action");

  // --- Urgency: de uiterste betaaldatum bepaalt de band ---
  // < 3 dagen rood, 3 t/m 10 dagen oranje, daarboven blauw.
  const inv100 = map["thread-inv-100"];
  assert.equal(urgencyFor(inv100, now, "Europe/Amsterdam").tone, "red", "factuur die morgen moet is rood");
  assert.equal(urgencyFor(inv100, nowPlus1, "Europe/Amsterdam").tone, "red");
  const overDagen = (dagen) => {
    const d = new Date(now.getTime() + dagen * 24 * 3600 * 1000);
    return d.toLocaleDateString("sv-SE");
  };
  // De losse deadline uit de mail moet leeg, anders wint die van de factuurdatum.
  const metVervaldatum = (dagen) => ({
    ...inv100,
    deadline: null,
    invoice: { ...inv100.invoice, dueDate: overDagen(dagen) },
  });
  assert.equal(urgencyFor(metVervaldatum(5), now, "Europe/Amsterdam").tone, "orange", "5 dagen is oranje");
  assert.equal(urgencyFor(metVervaldatum(20), now, "Europe/Amsterdam").tone, "blue", "20 dagen is blauw");
  assert.match(urgencyFor(metVervaldatum(20), now, "Europe/Amsterdam").label, /Betalen in \d+ dagen/);
  assert.equal(urgencyFor(map["thread-info-1"], now, "Europe/Amsterdam").tone, "blue", "info mail reads as information");
  assert.equal(urgencyFor(map["thread-inv-030"], now, "Europe/Amsterdam").tone, "red", "overdue invoice is red");

  // --- Run 2 (same messages): no duplicate cards ---
  await store.upsertAssessments(assess(buildFixtureMessages(now, 1)));
  items = await store.readAssessments();
  assert.equal(items.length, 14, "second run adds no duplicate cards");

  // --- Manual handled survives a re-run ---
  await store.markHandled("thread-inv-100", true);
  await store.upsertAssessments(assess(buildFixtureMessages(now, 1)));
  map = byId(await store.readAssessments());
  assert.equal(map["thread-inv-100"].handledByUser, true, "handled choice survives re-run");
  assert.ok(!map["thread-inv-100"].needsAttention, "same message does not re-flag");

  // --- Stage 2: reminder updates the existing card ---
  await store.upsertAssessments(assess(buildFixtureMessages(now, 2)));
  items = await store.readAssessments();
  assert.equal(items.length, 14, "reminder updates the existing card instead of adding one");
  map = byId(items);
  const reminded = map["thread-inv-100"];
  assert.equal(reminded.invoice.paymentStatus, "open_per_sender");
  assert.ok(reminded.consequence?.senderSays?.toLowerCase().includes("incasso"), "shows what the sender says");
  // Een nieuw bericht maakt de eerdere afhandeling ongeldig: de kaart moet
  // terug in de lijst, anders blijft een nieuwe reactie onzichtbaar.
  assert.notEqual(reminded.handledByUser, true, "a new message reopens the card");
  assert.equal(reminded.needsAttention, true, "new message flags attention again");

  // --- Incremental classification: only new mail reaches the model ---
  await store.resetAgentStore();
  const firstRun = await runMailAgentOnMessages(buildFixtureMessages(now, 1), "fixtures", now);
  assert.equal(firstRun.processed, 14, "first run classifies everything");
  const secondRun = await runMailAgentOnMessages(buildFixtureMessages(now, 1), "fixtures", now);
  assert.equal(secondRun.processed, 0, "unchanged mail is not re-classified");
  assert.equal(secondRun.skipped, 14, "all conversations are skipped");
  const bumpedRun = await runMailAgentOnMessages(buildFixtureMessages(now, 2), "fixtures", now);
  assert.equal(bumpedRun.processed, 1, "only the thread with a new message is re-classified");
  assert.equal(bumpedRun.skipped, 13, "the remaining conversations are skipped");

  // --- A failed classification must not wipe prior assessments ---
  const before = await store.readAssessments();
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-invalid";
  globalThis.fetch = async () => {
    throw new Error("simulated network failure");
  };
  const { classifyConversation } = await import("../lib/agent/classify.ts");
  // A failed model call now falls back to the deterministic classifier instead
  // of throwing, so the import never stalls on a bad model response.
  const fallback = await classifyConversation(buildFixtureMessages(now, 1).slice(0, 1));
  assert.ok(fallback && typeof fallback === "object" && typeof fallback.classification === "string", "failed model call falls back to the rule classifier");
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalKey;
  assert.deepEqual(await store.readAssessments(), before, "failed model call preserves assessments");

  console.log("✓ mail-agent verification passed");
  console.log(JSON.stringify(
    {
      conversations: (await store.readAssessments()).length,
      invoiceStatuses: byId(await store.readAssessments()),
    },
    null,
    2,
  ));
} finally {
  store.setAgentStoreDirectoryForTests(null);
  await rm(dir, { recursive: true, force: true });
}
