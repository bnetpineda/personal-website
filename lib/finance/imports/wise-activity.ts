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

/** Splits fees out of an amount that includes them ("included" fee convention). */
export function wiseRows(base: { id: string; currency: string; occurredOn: string; amount: number; fee: number; kind: EntryKind; description: string }): ImportEntry[] {
  const { id, currency, occurredOn, amount, fee, kind } = base;
  if (amount === 0) return [];
  const description = base.description.replace(/\s+/g, " ").trim().slice(0, 200) || "Wise transaction";
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
