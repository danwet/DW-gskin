import "server-only";

import type { InboundMessage, ShipmentInfo } from "./types";

const SHIPMENT_MARKER = /track(?:ing)?|track & trace|pakket|package|parcel|verzonden|onderweg|geleverd|bezorgd|delivered|shipped|dispatched|in transit|shipment|vervoerder|carrier|bezorging|levering|order bevestigd|orderbevestiging|order confirmed/i;
const ORDER_MARKER = /order|bestelling|pakket|package|bestelnummer/i;

export function isShipmentRelated(message: InboundMessage): boolean {
  const text = `${message.subject ?? ""}\n${message.snippet ?? ""}\n${message.body ?? ""}`;
  return SHIPMENT_MARKER.test(text) && ORDER_MARKER.test(text);
}

const CARRIERS = /(?:postnl|dhl|dpd|ups|fedex|gls|bpost|postnord|royal mail|usps|evri|hermes|chronopost|colis)/i;

/**
 * Order numbers always contain a digit; a word like "outlook" that follows the
 * label is a mail-client footer, not an order.
 */
function plausibleOrder(value: string): boolean {
  return /\d/.test(value) && !/^(outlook|gmail|hotmail|yahoo|apple|mail|verzonden|bekijk|hier|status|details)$/i.test(value);
}

function orderNumber(text: string): string {
  for (const match of text.matchAll(/#\s*([A-Za-z0-9-]{3,24})/g)) {
    const value = match[1].trim();
    if (plausibleOrder(value)) return value;
  }
  const labeled =
    /\b(?:order(?:nummer)?|bestel(?:ling|nummer)?)\b[^\n]{0,20}?\b([A-Za-z0-9][A-Za-z0-9-]{3,24})\b/gi;
  for (const match of text.matchAll(labeled)) {
    const value = match[1].trim();
    if (plausibleOrder(value)) return value;
  }
  return "";
}

function statusOf(text: string): string {
  if (/geleverd|bezorgd|afgeleverd|delivered/i.test(text)) return "Geleverd";
  if (/onderweg|in transit|onderweg naar|aangekomen op|arrived at|customs|douane|airport|luchthaven/i.test(text)) return "Onderweg";
  if (/order bevestigd|orderbevestiging|order confirmed|bedankt voor je bestelling|we hebben je bestelling|je bestelling is geplaatst/i.test(text)) {
    return "Order bevestigd";
  }
  if (/verzonden|shipped|verstuurd|dispatched/i.test(text)) return "Verzonden";
  return "Update";
}

function carrier(text: string): string {
  const match = text.match(CARRIERS);
  return match ? match[0].replace(/^./, (c) => c.toUpperCase()) : "";
}

function deliveredAt(text: string): string {
  const candidates = text.match(/\d{1,2}[-/.]\d{1,2}[-/.]20\d{2}|20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}/g) ?? [];
  for (const candidate of candidates) {
    const iso = candidate.replace(/[/.]/g, "-");
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
    const parts = iso.split("-");
    if (parts.length === 3 && parts[2].length === 4) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
  }
  return "";
}

/**
 * A carrier mail usually names the shop it delivers for ("in opdracht van
 * Coolblue"), which is what lets us tie it to that shop's order.
 */
function shopOf(text: string): string {
  const patterns = [
    /in\s+opdracht\s+van\s+([A-Z0-9][\w&. '\-]{1,40})/i,
    /namens\s+([A-Z0-9][\w&. '\-]{1,40})/i,
    /(?:opdrachtgever|afzender)\s*[:\-]\s*([A-Z0-9][\w&. '\-]{1,40})/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (!match) continue;
    // Cut at a line break or a word that starts a new sentence.
    const value = match[1].split(/\n|\r|\||,|;|\.\s/)[0].trim();
    if (value.length >= 2) return value;
  }
  return "";
}

function trackingOf(text: string): string {
  const labeled = /\b(?:track(?:ing)?(?:nummer|code)?|barcode|zending(?:nummer)?)\b[^\n]{0,20}?\b([A-Z0-9]{8,24})\b/i.exec(text);
  if (labeled && /\d/.test(labeled[1])) return labeled[1].trim();
  const known = /\b(3S[A-Z0-9]{10,}|JJD[0-9]{10,}|1Z[A-Z0-9]{10,}|[A-Z]{2}\d{9}[A-Z]{2})\b/.exec(text);
  return known ? known[1] : "";
}

function internationalOf(text: string): boolean {
  return /airport|luchthaven|customs|douane|international|import|export|destination country|land van bestemming|departed from/i.test(text);
}

function locationOf(text: string): string {
  if (/cleared customs|customs clearance completed|douane vrijgegeven|door de douane vrijgeven/i.test(text)) return "Douane vrijgegeven";
  if (/held at customs|in afwachting van de douane|bij de douane/i.test(text)) return "Bij de douane";
  if (/customs|douane/i.test(text)) return "Douane";
  const airport = text.match(/(?:arrived at|aangekomen op|aankomst op)\s+([A-Za-z .-]{2,30}?)\s*(?:airport|luchthaven)/i);
  if (airport) return `${airport[1].trim()} Airport`;
  const departed = text.match(/(?:departed|vertrokken uit|left)\s+([A-Za-z .-]{2,30})/i);
  if (departed) return `Vertrokken uit ${departed[1].trim()}`;
  if (/arrived in destination country|aangekomen in het land van bestemming/i.test(text)) return "Aangekomen in bestemmingsland";
  return "";
}

export function detectShipment(message: InboundMessage): ShipmentInfo | null {
  if (!isShipmentRelated(message)) return null;
  const text = `${message.subject ?? ""}\n${message.body ?? ""}\n${message.snippet ?? ""}`;
  const international = internationalOf(text);
  const shipment: ShipmentInfo = {
    supplier: message.from || "Onbekend",
    orderNumber: orderNumber(text),
    status: statusOf(text),
    international: international || undefined,
  };
  const c = carrier(text);
  if (c) shipment.carrier = c;
  const shop = shopOf(text);
  if (shop) shipment.shop = shop;
  const tracking = trackingOf(text);
  if (tracking) shipment.tracking = tracking;
  const d = deliveredAt(text);
  if (d) shipment.deliveredAt = d;
  if (international) {
    const location = locationOf(text);
    if (location) shipment.location = location;
  }
  return shipment;
}
