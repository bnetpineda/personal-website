import { ImportError, type EntryKind, type ImportEntry } from "./types";

const OWN_MONEY = new Set(["CONVERSION", "INCOMING_CROSS_BALANCE", "OUTGOING_CROSS_BALANCE", "MONEY_ADDED"]);

/**
 * Classifies a Wise statement row. Money received from someone else (DEPOSIT, "Received money from …") is a
 * payment: it reaches rules and review as income. Conversions and top-ups stay transfers.
 */
export function wiseKind(id: string, amount: number, detailsType = "", description = ""): EntryKind {
  const type = detailsType.trim().toUpperCase();
  if (/^(?:FEE|CHARGE)[-_]/i.test(id) || type === "ACCRUAL_CHARGE") return "fee";
  if (OWN_MONEY.has(type)) return "transfer";
  if (type === "BALANCE_INTEREST") return "interest";
  if (type === "DEPOSIT" || (amount > 0 && /^received money from /i.test(description))) return "payment";
  if (type === "TRANSFER") return amount > 0 ? "payment" : "transfer";
  if (type) return "payment";
  return /^(?:BALANCE|CONVERSION|TRANSFER)[-_]/i.test(id) ? "transfer" : "payment";
}

const FEE_SOURCE: Record<string, string> = { TRANSFER: "transfer", CARD: "card", BALANCE: "conversion" };

/**
 * Wise's wording, minus the boilerplate: fees already have their own rows, and a card merchant is
 * easier to read (and to categorize) without its city and terminal numbers.
 */
export function tidyWiseDescription(raw: string, currency: string): string {
  const text = raw.replace(/\s+/g, " ").trim();
  const card = /^Card transaction of ([\d,.]+) ([A-Z]{3}) issued by (.+?)(?: \(fee: [^)]*\))?$/i.exec(text);
  if (card) {
    const words = card[3].split(" ").filter((w) => !/\d{5,}/.test(w));
    // Trailing all-caps words are the city or card-terminal domain ("Ovhcloud SINGAPORE", "Anomaly ANOMA.LY").
    while (words.length > 1 && /^[A-Z][A-Z.]+$/.test(words.at(-1)!)) words.pop();
    const foreign = card[2].toUpperCase() !== currency ? ` (${card[1]} ${card[2].toUpperCase()})` : "";
    return `Card payment: ${words.join(" ") || card[3]}${foreign}`;
  }
  const received = /^Received money from (.+?)(?: with reference\b.*)?$/i.exec(text);
  if (received) return `Received from ${received[1]}`;
  const sent = /^Sent money to (.+?)(?: \(fee: [^)]*\))?$/i.exec(text);
  if (sent) return `Sent to ${sent[1]}`;
  const converted = /^(Converted .+?)(?: \(fee: [^)]*\))?$/i.exec(text);
  if (converted) return converted[1];
  const charge = /^Wise Charges for: ([A-Z]+)-\d+$/i.exec(text);
  if (charge) return `Wise ${FEE_SOURCE[charge[1].toUpperCase()] ?? charge[1].toLowerCase()} fee`;
  return text;
}

/** Splits fees out of an amount that includes them ("included" fee convention). */
export function wiseRows(base: { id: string; currency: string; occurredOn: string; amount: number; fee: number; kind: EntryKind; description: string }): ImportEntry[] {
  const { id, currency, occurredOn, amount, fee, kind } = base;
  if (amount === 0) return [];
  const description = tidyWiseDescription(base.description, currency).slice(0, 200) || "Wise transaction";
  // Currency + direction distinguishes both sides of a conversion without relying on row order.
  const externalId = `${id}:${currency}:${amount < 0 ? "out" : "in"}`;
  const row = { provider: "wise" as const, accountKey: "personal", externalId, currency, occurredOn, description, realizedPnl: null };
  const principal = fee > 0 && kind !== "fee" ? amount + fee : amount;
  if (amount < 0 && principal > 0) throw new ImportError("Fees exceed a debit. Check the selected fee format.");
  const entries: ImportEntry[] = [];
  if (principal !== 0) entries.push({ ...row, amount: principal, kind });
  if (fee > 0 && kind !== "fee") entries.push({ ...row, externalId: `${externalId}:fee`, amount: -fee, kind: "fee", description: `Wise fee · ${description}`.slice(0, 200) });
  return entries;
}
