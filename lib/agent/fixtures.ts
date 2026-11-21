import type { InboundMessage } from "./types";

function isoDaysFrom(now: Date, days: number): string {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function hoursAgo(now: Date, hours: number): string {
  return new Date(now.getTime() - hours * 36e5).toISOString();
}

/**
 * Deterministic test mailbox covering every phase-1 scenario. Dates are relative
 * to "now" so the urgency rules stay visible, while the stable thread ids keep
 * repeated runs free of duplicate cards.
 *
 * Stage 1 contains the invoice without its reminder; stage 2 adds the reminder
 * for the same thread so a second run can be verified to update the existing
 * card instead of creating a new one.
 */
export function buildFixtureMessages(now: Date = new Date(), stage: 1 | 2 = 1): InboundMessage[] {
  const messages: InboundMessage[] = [
    {
      id: "fx-inv100-a",
      threadId: "thread-inv-100",
      from: "Noordlicht Energie",
      fromEmail: "facturen@noordlicht.example",
      subject: "Factuur 2026-441",
      snippet: "Factuur 2026-441 van €120.00.",
      body: [
        "Geachte heer/mevrouw,",
        "",
        "Bijgaand factuur 2026-441 van €120.00 met vervaldatum " + isoDaysFrom(now, 1) + ".",
        "IBAN NL20INGB0001234567. Referentie: Factuur 2026-441.",
        "Wij verzoeken u vriendelijk dit bedrag voor de vervaldatum te voldoen.",
      ].join("\n"),
      receivedAt: hoursAgo(now, 48),
    },
    {
      id: "fx-inv205",
      threadId: "thread-inv-205",
      from: "Demo Fysio",
      fromEmail: "factuur@demofysio.example",
      subject: "Factuur FYSIO-1044",
      snippet: "Factuur FYSIO-1044 van €58.00.",
      body: [
        "Hierbij ontvangt u factuur FYSIO-1044 van €58.00.",
        "Vervaldatum: " + isoDaysFrom(now, 10) + ".",
        "IBAN NL91ABNA0417164300. Referentie: Factuur FYSIO-1044.",
      ].join("\n"),
      receivedAt: hoursAgo(now, 6),
    },
    {
      id: "fx-inv030",
      threadId: "thread-inv-030",
      from: "TransIP B.V.",
      fromEmail: "billing@transip.example",
      subject: "Herinnering: factuur 2026-9921 is vervallen",
      snippet: "Factuur 2026-9921 van €300.00 is vervallen.",
      body: [
        "Factuur 2026-9921 van €300.00 was vervallen op " + isoDaysFrom(now, -1) + ".",
        "IBAN NL68KNAB0123456789. Referentie: Factuur 2026-9921.",
        "Wij verzoeken u met klem om direct te betalen.",
      ].join("\n"),
      receivedAt: hoursAgo(now, 3),
    },
    {
      id: "fx-reply1",
      threadId: "thread-reply-1",
      from: "Maya Chen",
      fromEmail: "maya.chen@northline.studio",
      subject: "Bevestiging nodig voor de kickoff",
      snippet: "Kun je bevestigen dat het contract door kan?",
      body: [
        "Kun je uiterlijk " + isoDaysFrom(now, 2) + " bevestigen dat het contract door kan?",
        "Als jij niet bevestigt, kan de kickoff volgende week niet doorgaan.",
      ].join("\n"),
      receivedAt: hoursAgo(now, 5),
    },
    {
      id: "fx-info1",
      threadId: "thread-info-1",
      from: "Industry Weekly",
      fromEmail: "digest@industryweekly.com",
      subject: "Weekly briefing",
      snippet: "Je weekly digest is klaar. Geen actie nodig.",
      body: [
        "Je weekly digest is klaar.",
        "",
        "De drie artikelen van deze week: trends in duurzame energie, een interview over hybride werken en een kort marktbericht.",
        "",
        "Geen actie nodig. Afmelden kan altijd.",
      ].join("\n"),
      bodyHtml:
        '<p>Je weekly digest is klaar.</p><img src="https://picsum.photos/seed/digest/800/400" alt="Digest" /><p>De drie artikelen van deze week: duurzame energie, hybride werken en een marktbericht.</p>',
      receivedAt: hoursAgo(now, 8),
    },
    {
      id: "fx-wait1",
      threadId: "thread-wait-1",
      from: "Jordan Lee",
      fromEmail: "jordan.lee@fieldtest.io",
      subject: "Planning",
      snippet: "Ik kom erop terug met de planning.",
      body: "Ik kom er uiterlijk " + isoDaysFrom(now, 3) + " bij je op terug met de planning.",
      receivedAt: hoursAgo(now, 9),
    },
    {
      id: "fx-nl-oc",
      threadId: "thread-nl-oc",
      from: "De Nieuwsbrief",
      fromEmail: "nieuws@voorbeeld.nl",
      subject: "Jouw wekelijkse update",
      snippet: "Dit is je wekelijkse update met tips.",
      body: [
        "Dit is je wekelijkse update met tips.",
        "",
        "Tip 1: begin je dag met de drie belangrijkste taken, dan voelt de rest vanzelf lichter.",
        "",
        "Tip 2: blok een vast halfuur voor je inbox in plaats van de hele dag te reageren.",
        "",
        "Tip 3: sluit de week af met een korte terugblik van vijf minuten.",
        "",
        "Tot volgende week!",
      ].join("\n"),
      bodyHtml:
        '<p>Dit is je wekelijkse update met tips.</p><img src="https://picsum.photos/seed/weekoverzicht/800/400" alt="Weekoverzicht" /><p>Tip 1: begin je dag met de drie belangrijkste taken.</p><p>Tip 2: blok een vast halfuur voor je inbox.</p><img src="https://picsum.photos/seed/werkdag/800/400" alt="Werkdag" /><p>Tip 3: sluit de week af met een korte terugblik. Tot volgende week!</p>',
      receivedAt: hoursAgo(now, 10),
      listUnsubscribe: "<https://nieuws.voorbeeld.nl/afmelden/abc123>",
      listUnsubscribePost: "List-Unsubscribe=One-Click",
      messageIdHeader: "<abc123@nieuws.voorbeeld.nl>",
    },
    {
      id: "fx-nl-manual",
      threadId: "thread-nl-manual",
      from: "Shop Nieuws",
      fromEmail: "nieuws@shop.example",
      subject: "De aanbiedingen van deze week",
      snippet: "Bekijk de aanbiedingen van deze week.",
      body: [
        "Bekijk de aanbiedingen van deze week.",
        "",
        "Deze week extra voordeel op kantoorartikelen: tot 20% korting op schriften en pennen.",
        "",
        "Daarnaast gratis verzending vanaf €25 en een klein cadeautje bij je volgende bestelling.",
        "",
        "Wil je deze mails niet meer? Afmelden: https://shop.example/afmelden",
      ].join("\n"),
      bodyHtml:
        '<p>Bekijk de aanbiedingen van deze week.</p><img src="https://picsum.photos/seed/aanbieding/800/400" alt="Aanbiedingen" /><p>Deze week extra voordeel op kantoorartikelen: tot 20% korting.</p><p>Gratis verzending vanaf €25. Afmelden kan onderaan.</p>',
      receivedAt: hoursAgo(now, 11),
    },
    {
      id: "fx-nl-mailto",
      threadId: "thread-nl-mailto",
      from: "Club Nieuwsbrief",
      fromEmail: "club@voorbeeld.org",
      subject: "Clubupdate",
      snippet: "Het nieuws van de club.",
      body: [
        "Het nieuws van de club.",
        "",
        "Zaterdag is de grote clubdag met een toernooi, een barbecue en muziek.",
        "",
        "Meld je voor vrijdag aan, dan staat alles voor je klaar.",
      ].join("\n"),
      bodyHtml:
        '<p>Het nieuws van de club.</p><img src="https://picsum.photos/seed/clubdag/800/400" alt="Clubdag" /><p>Zaterdag is de grote clubdag met toernooi, barbecue en muziek. Meld je voor vrijdag aan.</p>',
      receivedAt: hoursAgo(now, 12),
      listUnsubscribe: "<mailto:afmelden@voorbeeld.org>",
    },
    {
      id: "fx-nl-invalid",
      threadId: "thread-nl-invalid",
      from: "Slechte Nieuwsbrief",
      fromEmail: "slecht@example.org",
      subject: "Slechte afmeldlink",
      snippet: "Met een ongeldige afmeldlink.",
      body: "Afmelden: http://192.168.0.1/afmelden",
      receivedAt: hoursAgo(now, 13),
      listUnsubscribe: "<http://192.168.0.1/afmelden>",
      listUnsubscribePost: "List-Unsubscribe=One-Click",
    },
    {
      id: "fx-order1",
      threadId: "thread-order-1",
      from: "Webwinkel",
      fromEmail: "orders@webwinkel.example",
      subject: "Orderbevestiging #8831",
      snippet: "Bedankt voor je bestelling.",
      body: [
        "Bedankt voor je bestelling #8831.",
        "",
        "Je bestelling wordt binnen 3 werkdagen verzonden.",
        "",
        "Je betaalt bij ontvangst.",
      ].join("\n"),
      receivedAt: hoursAgo(now, 14),
    },
    {
      id: "fx-ship2",
      threadId: "thread-ship-2",
      from: "Bol.com",
      fromEmail: "noreply@bol.example",
      subject: "Je bestelling is bezorgd",
      snippet: "Bestelling 100200300 is bezorgd.",
      body: [
        "Bestelling 100200300 is bezorgd.",
        "",
        "Vervoerder: DHL.",
        "Bezorgd op " + isoDaysFrom(now, 0) + ".",
      ].join("\n"),
      receivedAt: hoursAgo(now, 5),
    },
    {
      id: "fx-ship3",
      threadId: "thread-ship-3",
      from: "AliExpress",
      fromEmail: "noreply@aliexpress.example",
      subject: "Update: aangekomen op Schiphol Airport",
      snippet: "Bestelling 700900 is aangekomen op Schiphol Airport.",
      body: [
        "Bestelling 700900 is aangekomen op Schiphol Airport.",
        "",
        "Status: douane vrijgegeven.",
        "Vervoerder: DHL.",
      ].join("\n"),
      receivedAt: hoursAgo(now, 2),
    },
    {
      id: "fx-missed1",
      threadId: "thread-missed-1",
      from: "Onbekende afzender",
      fromEmail: "info@onbekend.example",
      subject: "Even een berichtje",
      snippet: "We wilden je even iets laten weten.",
      body: "We wilden je even iets laten weten. Meer informatie volgt.",
      receivedAt: hoursAgo(now, 6),
    },
  ];

  if (stage === 2) {
    messages.push({
      id: "fx-inv100-b",
      threadId: "thread-inv-100",
      from: "Noordlicht Energie",
      fromEmail: "facturen@noordlicht.example",
      subject: "Herinnering: factuur 2026-441",
      snippet: "Herinnering: factuur 2026-441 van €120.00 is nog niet betaald.",
      body: [
        "Herinnering.",
        "",
        "Factuur 2026-441 van €120.00 is nog niet betaald.",
        "Betaal uiterlijk " + isoDaysFrom(now, 1) + " om te voorkomen dat wij de vordering uit handen geven aan een incassobureau.",
      ].join("\n"),
      receivedAt: hoursAgo(now, 1),
    });
  }

  return messages;
}

export function fixtureStage(): 1 | 2 {
  return process.env.MAIL_AGENT_FIXTURE_STAGE?.trim() === "2" ? 2 : 1;
}
