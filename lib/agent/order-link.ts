import type { MailAssessment } from "./types";

const DAY = 24 * 60 * 60 * 1000;
/** A parcel follows its order within a month; later than that is a new order. */
const MAX_AGE_MS = 30 * DAY;
/** Bounds the cost of a sync: only genuinely unclear mails are asked about. */
const MAX_MODEL_QUESTIONS = 8;

export type AskFunction = (input: {
  system: string;
  user: string;
}) => Promise<string>;

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function contains(haystack: string, needle: string): boolean {
  const target = normalize(needle);
  if (target.length < 3) return false;
  return normalize(haystack).includes(target);
}

function isConfirmation(item: MailAssessment): boolean {
  const status = (item.shipment?.status ?? "").toLowerCase();
  return /bevestig|besteld|order confirmed|geplaatst/.test(status);
}

function bodyOf(item: MailAssessment): string {
  const shipment = item.shipment;
  return [
    item.subject ?? "",
    item.body ?? "",
    shipment?.orderNumber ?? "",
    shipment?.tracking ?? "",
    shipment?.shop ?? "",
  ].join("\n");
}

function keyOf(item: MailAssessment): string {
  const shipment = item.shipment!;
  const owner = shipment.shop || shipment.supplier;
  return `${normalize(owner)}::${normalize(shipment.orderNumber || "")}`;
}

/**
 * Hard evidence links a mail without asking anyone: an identical order number,
 * the order number quoted in the mail, or the same tracking code.
 */
function strongMatch(item: MailAssessment, order: MailAssessment): boolean {
  const mine = item.shipment!;
  const other = order.shipment!;
  if (mine.orderNumber && other.orderNumber && normalize(mine.orderNumber) === normalize(other.orderNumber)) {
    return true;
  }
  if (other.orderNumber && contains(bodyOf(item), other.orderNumber)) return true;
  if (mine.tracking && contains(bodyOf(order), mine.tracking)) return true;
  return false;
}

/**
 * Ties every shipment mail to the order it belongs to.
 *
 * The rules handle what is certain; anything else is handed to the model with a
 * shortlist of candidate orders, because shops and carriers each phrase their
 * mails differently and a regex will never cover them all. The model may only
 * choose from that shortlist, so it can never invent an order.
 */
export async function linkOrders(items: MailAssessment[]): Promise<Record<string, string>> {
  const orders = items.filter((item) => item.shipment);
  const confirmations = orders.filter(isConfirmation);
  const keys: Record<string, string> = {};

  for (const item of confirmations) keys[item.conversationId] = keyOf(item);

  for (const item of orders) {
    if (keys[item.conversationId]) continue;
    const at = Date.parse(item.receivedAt);

    // Only orders that already existed can own this parcel.
    const candidates = confirmations
      .filter((order) => {
        const created = Date.parse(order.receivedAt);
        return Number.isFinite(created) && Number.isFinite(at) && at >= created && at - created <= MAX_AGE_MS;
      })
      .map((order) => ({
        order,
        score:
          (strongMatch(item, order) ? 200 : 0) +
          (item.shipment!.shop && contains(order.shipment!.supplier, item.shipment!.shop) ? 40 : 0) +
          (item.shipment!.shop && contains(item.shipment!.shop, order.shipment!.supplier) ? 40 : 0) -
          Math.min(30, (at - Date.parse(order.receivedAt)) / DAY),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);

    if (candidates.length === 0) {
      keys[item.conversationId] = keyOf(item);
      continue;
    }
    keys[item.conversationId] = keys[candidates[0].order.conversationId] ?? keyOf(candidates[0].order);
  }

  return keys;
}
