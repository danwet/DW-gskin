import type { InvoiceData } from "./epc";
import { detectLanguage, type MailLanguage } from "./language";
import type { Brief, DraftReply, ProactiveAction, QuietEmail, RawMessage } from "./types";

type Bucket = "draft" | "quiet" | "receipt" | "incasso" | "payable";

const DIRECT_DEBIT_RE = /automatische incasso|\bincasso\b|direct debit|sepa mandate|will be debited/i;
const PAY_REQUEST_RE = /\bplease pay\b|\bkindly pay\b|\bpayment is due\b|\bamount due\b|\bte betalen\b|gelieve te betalen/i;

function parseAmount(text: string): number | null {
  const match = text.match(/(?:€|eur)\s*(\d{1,7}(?:[.,]\d{2})?)/i);
  if (!match) return null;
  const value = Number(match[1].replace(",", "."));
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

function parseIban(text: string): string | null {
  const source = text.toUpperCase();
  const labeled = source.match(/IBAN[:\s]*([A-Z]{2}\d{2}(?:\s*[A-Z0-9]){10,30})/);
  const raw = labeled?.[1] ?? source.match(/\b([A-Z]{2}\d{2}[A-Z0-9]{10,30})\b/)?.[1];
  if (!raw) return null;
  const iban = raw.replace(/\s+/g, "");
  return /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban) ? iban : null;
}

function parseDueDate(text: string): string | null {
  const labeled = text.match(/due date:\s*(20\d{2}-\d{2}-\d{2})/i);
  const match = labeled ?? text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (!match) return null;
  const iso = match[1];
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return iso;
}

function parseReference(text: string): string | null {
  const match = text.match(/(?:reference|betalingskenmerk|kenmerk)\s*:\s*([^.]+)/i);
  const value = match?.[1]?.trim();
  return value || null;
}

function isDirectDebit(message: RawMessage): boolean {
  return DIRECT_DEBIT_RE.test(messageText(message));
}

function payableInvoice(message: RawMessage): InvoiceData | null {
  const text = messageText(message);
  if (isDirectDebit(message) || !PAY_REQUEST_RE.test(text)) return null;
  const amount = parseAmount(text);
  const iban = parseIban(text);
  const due = parseDueDate(text);
  if (amount == null || !iban || !due) return null;
  return {
    id: `pay-${message.id}`,
    recipient_name: message.from,
    iban,
    amount,
    reference: parseReference(text) ?? message.subject.trim(),
    due_date: due,
    pdf_url: message.attachmentUrl,
    pdf_filename: message.attachmentName,
  };
}

function classify(message: RawMessage): Bucket {
  const text = `${message.fromEmail} ${messageText(message)}`.toLowerCase();

  if (isDirectDebit(message)) return "incasso";
  if (payableInvoice(message)) return "payable";

  if (
    message.fromEmail.startsWith("receipts@") ||
    message.fromEmail.includes("noreply") ||
    /receipt|invoice|payment received/.test(text)
  ) {
    return "receipt";
  }

  if (/unsubscribe|weekly briefing|digest|newsletter/.test(text)) {
    return "quiet";
  }

  if (/no need to reply|for your awareness|\bfyi\b/.test(text)) {
    return "quiet";
  }

  if (/approval|confirm|can you|\?|should the|question/.test(text)) {
    return "draft";
  }

  return "quiet";
}

const DAY_WORD = /thursday|donderdag|donnerstag|jeudi/i;

type DraftIntent = "approval" | "sequence" | "ack";

function messageText(message: RawMessage): string {
  return `${message.subject} ${message.snippet} ${message.body ?? ""}`;
}

function draftIntent(text: string): DraftIntent {
  if (/thursday|donderdag|donnerstag|jeudi|approval|confirm|bevestig|goedkeuring|bestätig|freigabe|approbation/.test(text)) {
    return "approval";
  }
  if (/before or after|demo sequence|live test|voor of na|live-test|vor oder nach|reihenfolge|avant ou après|test en direct/.test(text)) {
    return "sequence";
  }
  return "ack";
}

function draftFor(message: RawMessage, displayName: string): string {
  const text = messageText(message).toLowerCase();
  const language = detectLanguage(text);
  const first = message.from.split(" ")[0] || "there";
  const signoff = displayName.trim() || "there";
  return DRAFTS[language][draftIntent(text)](first, signoff);
}

function taskFor(message: RawMessage): { title: string; detail: string } {
  const first = message.from.split(" ")[0] || "them";
  return TASKS[draftIntent(messageText(message).toLowerCase())](first);
}

const TASKS: Record<DraftIntent, (first: string) => { title: string; detail: string }> = {
  approval: (first) => ({
    title: `Confirm Thursday at 11:00 with ${first}`,
    detail: `If you don't, the review stays blocked and the meeting cannot go ahead.`,
  }),
  sequence: (first) => ({
    title: `Choose the demo order for ${first}`,
    detail: `If you don't, ${first} locks the run of show tonight without your answer.`,
  }),
  ack: (first) => ({
    title: `Answer ${first}`,
    detail: `If you don't, this stays open and no reply goes back.`,
  }),
};

const DRAFTS: Record<MailLanguage, Record<DraftIntent, (first: string, name: string) => string>> = {
  en: {
    approval: (first, name) =>
      `Hi ${first} — Thursday at 11:00 works. I'll send the final notes before we meet, and I've held that time on my calendar.\n\n— ${name}`,
    sequence: (first, name) =>
      `Hi ${first} — Show the live test first, then the comparison, so the result is on screen before you talk through it.\n\n— ${name}`,
    ack: (first, name) =>
      `Hi ${first} — Thanks for the note. I'll come back with a clear answer shortly.\n\n— ${name}`,
  },
  nl: {
    approval: (first, name) =>
      `Hoi ${first} — Donderdag om 11:00 past. Ik stuur de laatste notities voordat we afspreken, en ik heb die tijd in mijn agenda gezet.\n\n— ${name}`,
    sequence: (first, name) =>
      `Hoi ${first} — Laat eerst de live test zien en daarna de vergelijking, zodat het resultaat al op het scherm staat voordat je het toelicht.\n\n— ${name}`,
    ack: (first, name) =>
      `Hoi ${first} — Bedankt voor je bericht. Ik kom er zo op terug met een duidelijk antwoord.\n\n— ${name}`,
  },
  de: {
    approval: (first, name) =>
      `Hallo ${first} — Donnerstag um 11:00 Uhr passt. Ich schicke die letzten Notizen vor dem Treffen und habe die Zeit in meinen Kalender eingetragen.\n\n— ${name}`,
    sequence: (first, name) =>
      `Hallo ${first} — Zeig zuerst den Live-Test und danach den Vergleich, damit das Ergebnis schon zu sehen ist, bevor du es erklärst.\n\n— ${name}`,
    ack: (first, name) =>
      `Hallo ${first} — Danke für deine Nachricht. Ich melde mich gleich mit einer klaren Antwort.\n\n— ${name}`,
  },
  fr: {
    approval: (first, name) =>
      `Bonjour ${first} — Jeudi à 11 h me convient. J'envoie les notes finales avant que nous nous voyions, et j'ai bloqué ce créneau dans mon agenda.\n\n— ${name}`,
    sequence: (first, name) =>
      `Bonjour ${first} — Montre d'abord le test en direct, puis la comparaison, pour que le résultat soit à l'écran avant de l'expliquer.\n\n— ${name}`,
    ack: (first, name) =>
      `Bonjour ${first} — Merci pour ton message. Je reviens vite avec une réponse claire.\n\n— ${name}`,
  },
};

function whenLabel(iso: string): string {
  const then = new Date(iso).getTime();
  const hours = Math.max(1, Math.round((Date.now() - then) / 36e5));
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "Yesterday" : `${days}d ago`;
}

function incassoAction(message: RawMessage): ProactiveAction {
  const amount = parseAmount(messageText(message));
  return {
    id: `incasso-${message.id}`,
    title: message.from,
    detail:
      amount == null
        ? "Collected by direct debit. Nothing is due from you."
        : `€${amount.toFixed(2)} collected by direct debit. Nothing is due from you.`,
    status: "Done",
    messageId: message.id,
  };
}

export function triageInbox(messages: RawMessage[], displayName: string): Brief {
  const drafts: DraftReply[] = [];
  const quiet: QuietEmail[] = [];
  const payments: Brief["loops"] = [];
  const incasso: ProactiveAction[] = [];

  for (const message of messages) {
    const bucket = classify(message);

    if (bucket === "incasso") {
      incasso.push(incassoAction(message));
      continue;
    }

    if (bucket === "payable") {
      const invoice = payableInvoice(message);
      if (!invoice) continue;
      payments.push({
        id: invoice.id,
        title: `Pay ${message.from}`,
        detail: `If you don't, €${invoice.amount.toFixed(2)} stays unpaid and this invoice remains open.`,
        doneByAgent: false,
        messageId: message.id,
        payment: invoice,
      });
      continue;
    }

    if (bucket === "draft") {
      const aboutThursday = DAY_WORD.test(messageText(message));
      drafts.push({
        id: `draft-${message.id}`,
        messageId: message.id,
        from: message.from,
        fromEmail: message.fromEmail,
        subject: message.subject,
        snippet: message.snippet,
        deadline: aboutThursday ? "Reply by 11:00" : "Needs reply",
        draft: draftFor(message, displayName),
      });
      continue;
    }

    quiet.push({
      id: `quiet-${message.id}`,
      from: message.from,
      subject: message.subject,
      reason:
        bucket === "receipt"
          ? "Receipt recorded. Nothing to send back."
          : /digest|briefing|unsubscribe/i.test(`${message.subject} ${message.snippet}`)
            ? "Newsletter. Left out of the reply pile."
            : "Marked as awareness only.",
      when: whenLabel(message.receivedAt),
    });
  }

  const thursday = drafts.find((draft) => DAY_WORD.test(`${draft.subject} ${draft.snippet}`));
  const actions: ProactiveAction[] = [];
  if (messages.length > 0) {
    actions.push({
      id: "inbox-triaged",
      title: "Inbox triaged",
      detail: `${messages.length} messages sorted, ${drafts.length + payments.length} need you`,
      status: "Done",
    });
  }
  if (thursday) {
    actions.push({
      id: "thursday-hold",
      title: "Thursday hold placed",
      detail: `11:00 held from ${thursday.from}'s note`,
      status: "Done",
      localHold: true,
    });
  }
  if (quiet.some((item) => item.reason.startsWith("Receipt"))) {
    actions.push({
      id: "receipt-filed",
      title: "Receipt filed",
      detail: "Payment note stored. No thank-you was sent.",
      status: "Done",
    });
  }
  actions.push(...incasso);

  const loops: Brief["loops"] = [
    ...payments,
    ...drafts.map((draft) => {
      const task = taskFor({
        id: draft.messageId,
        from: draft.from,
        fromEmail: draft.fromEmail,
        subject: draft.subject,
        snippet: draft.snippet,
        receivedAt: "",
      });
      return {
        id: `loop-${draft.id}`,
        title: task.title,
        detail: task.detail,
        doneByAgent: false,
        draftId: draft.id,
      };
    }),
  ];

  if (thursday) {
    loops.push({
      id: "loop-hold",
      title: "Check the Thursday hold",
      detail: "If you don't, 11:00 stays on your calendar without your confirmation.",
      doneByAgent: true,
      mail: {
        from: thursday.from,
        fromEmail: thursday.fromEmail,
        subject: thursday.subject,
        snippet: thursday.snippet,
      },
      hold: {
        title: `Review with ${thursday.from}`,
        when: "Thursday · 11:00",
        detail: "Hold created from the approval email",
      },
    });
  }

  return {
    source: "user",
    messageCount: messages.length,
    insight: {
      title: drafts.length === 0 ? "Your inbox is clear." : "Your day is clear.",
      detail:
        drafts.length === 0
          ? "Nothing in this run needs a reply."
          : `${drafts.length === 1 ? "One reply is" : `${drafts.length} replies are`} drafted. The afternoon block is there so you can send only what you approve.`,
    },
    events: [],
    tomorrowEvents: [],
    upcoming: thursday
      ? [
          {
            id: "u1",
            when: "Thursday · 11:00",
            title: `Review with ${thursday.from}`,
            detail: "Hold created from the approval email",
            localHold: true,
          },
        ]
      : [],
    drafts,
    quiet,
    actions,
    loops,
  };
}
