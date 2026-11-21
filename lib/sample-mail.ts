import type { CalendarEvent, RawMessage } from "./types";

export const sampleMessages: RawMessage[] = [
  {
    id: "m1",
    from: "Maya Chen",
    fromEmail: "maya.chen@northline.studio",
    subject: "Final approval needed for Thursday",
    snippet:
      "Can you confirm Thursday at 11:00 and send the final notes before we meet? The review can't move without your approval.",
    receivedAt: "2026-10-10T21:14:00.000Z",
  },
  {
    id: "m2",
    from: "Jordan Lee",
    fromEmail: "jordan.lee@fieldtest.io",
    subject: "Quick question on the demo sequence",
    snippet:
      "Should the comparison come before or after the live test? I need to lock the run of show tonight.",
    receivedAt: "2026-10-10T19:02:00.000Z",
  },
  {
    id: "m3",
    from: "Stripe",
    fromEmail: "receipts@stripe.com",
    subject: "Your receipt from Cursor",
    snippet: "Payment received. This receipt needs no reply. Amount paid for the October invoice.",
    receivedAt: "2026-10-10T16:40:00.000Z",
  },
  {
    id: "m4",
    from: "Industry Weekly",
    fromEmail: "digest@industryweekly.com",
    subject: "Weekly briefing",
    snippet: "Your weekly digest is ready. Unsubscribe any time. No action is required.",
    receivedAt: "2026-10-10T12:05:00.000Z",
  },
  {
    id: "m5",
    from: "Alex Rivera",
    fromEmail: "alex.rivera@harbor.co",
    subject: "Notes from yesterday",
    snippet: "FYI — sharing yesterday's notes for your awareness. No need to reply.",
    receivedAt: "2026-10-10T09:18:00.000Z",
  },
  {
    id: "m6",
    from: "Lotte de Vries",
    fromEmail: "lotte.devries@atelier.nl",
    subject: "Bevestiging nodig voor donderdag",
    snippet:
      "Kun je bevestigen dat donderdag om 11:00 nog past? De bespreking kan niet doorgaan zonder jouw goedkeuring.",
    receivedAt: "2026-10-10T18:20:00.000Z",
  },
  {
    id: "m7",
    from: "Jonas Weber",
    fromEmail: "jonas.weber@feldtest.de",
    subject: "Frage zur Demo-Reihenfolge",
    snippet:
      "Soll der Vergleich vor oder nach dem Live-Test kommen? Ich muss den Ablauf heute Abend festlegen.",
    receivedAt: "2026-10-10T17:05:00.000Z",
  },
  {
    id: "m8",
    from: "Noordlicht Energie",
    fromEmail: "facturen@noordlicht-energie.example",
    subject: "Factuur oktober — automatische incasso",
    snippet:
      "Uw factuur van €52.10 wordt via automatische incasso afgeschreven. This invoice will be collected automatically by direct debit under your SEPA mandate and will be debited from your account. IBAN NL20KNAB0000000099. Reference: Factuur NE-2026-441. Nothing is due from you.",
    receivedAt: "2026-10-09T08:00:00.000Z",
  },
  {
    id: "m9",
    from: "TransIP B.V.",
    fromEmail: "billing@transip.example",
    subject: "Please pay invoice Factuur 2026-9921",
    snippet:
      "Please pay this invoice. Amount due: €24.50. IBAN NL02KNAB0123456789. Reference: Factuur 2026-9921. Due date: 2026-10-25.",
    attachmentUrl: "/invoices/transip-2026-9921.pdf",
    attachmentName: "TransIP-Factuur-2026-9921.pdf",
    receivedAt: "2026-10-10T08:12:00.000Z",
  },
  {
    id: "m10",
    from: "Demo Fysio",
    fromEmail: "factuur@demofysio.example",
    subject: "Please pay invoice Factuur FYSIO-1044",
    snippet:
      "Please pay this invoice for your physiotherapy session so you can declare it later. Amount due: €36.00. IBAN NL91KNAB9999999999. Reference: Factuur FYSIO-1044. Due date: 2026-10-03.",
    attachmentUrl: "/invoices/fysio-1044.pdf",
    attachmentName: "Demo-Fysio-FYSIO-1044.pdf",
    receivedAt: "2026-10-04T09:00:00.000Z",
  },
];

export const sampleEvents: CalendarEvent[] = [
  {
    id: "e1",
    hour: 8,
    minute: 30,
    title: "Morning planning",
    detail: "Review Dashboard and pick the one thing that matters",
    tone: "blue",
  },
  {
    id: "e2",
    hour: 9,
    minute: 30,
    title: "Deep work",
    detail: "Uninterrupted block — drafts stay closed",
    tone: "green",
  },
  {
    id: "e3",
    hour: 11,
    minute: 0,
    title: "Draft review",
    detail: "Read the replies before anything is sent",
    tone: "orange",
  },
  {
    id: "e4",
    hour: 14,
    minute: 0,
    title: "Send approved drafts",
    detail: "Only the replies you have signed off",
    tone: "purple",
  },
];
