/**
 * Bank-rail suffixes GoTyme appends to counterparties ("Ysah tibalani G-Xchange, Inc (GCash)")
 * so the same person matches across GoTyme, MariBank and Wise.
 */
const BANK_RAIL_SUFFIX = /(?:\s+(?:G-Xchange,\s*Inc\s*\(GCash\)|MariBank Philippines\s*\(SeaBank\)|DCPay Philippines,\s*Inc\s*\(Coins PH\)|Bizmoto Wallet|Starpay Corporation|GoTyme Bank|Netbank))+$/i;

/** Trailing card terminal/order codes ("BLIZZARD *US1066982371", "SWAPPEDCOM* #5A4A5AB1") and bank disbursement IDs. */
const TRAILING_REF = /(?:\s*(?:\*[A-Z]{0,4}\d{4,}|#[A-F0-9]{4,}|-\.\s*DIS\d+))+$/i;

/**
 * Who the money went to or came from, read from an imported description. It groups a payee's
 * payments ("teach once"), matches past decisions for the model, and names repeat payers.
 *   "Received from Centauri Media Ltd"        → "Centauri Media Ltd"
 *   "Sent to Juan Dela Cruz"                  → "Juan Dela Cruz"
 *   "Sent to Ysah tibalani G-Xchange, Inc (GCash)" → "Ysah tibalani"
 *   "Card payment: Upwork Dublin (11.19 USD)" → "Upwork Dublin"
 *   "Card payment: BLIZZARD *US1066982371"    → "BLIZZARD"
 *   "Payment: Shopee"                         → "Shopee"
 */
export function payeeOf(description: string): string {
  const text = description.replace(/\s+/g, " ").trim();
  const sender = /^(?:received(?: money)?|sent(?: money)?) (?:from|to) (.+?)(?: with reference\b.*| \(fee: .*\))?$/i.exec(text);
  const raw = sender
    ? sender[1].replace(/,\s*(?:account|mobile) no\.?.*$/i, "").replace(BANK_RAIL_SUFFIX, "").trim()
    : (/^[A-Za-z][A-Za-z -]{1,30}: (.+?)(?: \([^()]*\))?$/.exec(text)?.[1].trim() ?? text);
  const cleaned = raw.replace(TRAILING_REF, "").replace(/\*+$/, "").trim();
  return cleaned || raw || text;
}

/** Lower-case words of a payee, without digits, for matching the same payee across descriptions. */
export function payeeKey(description: string): string {
  return payeeOf(description).toLowerCase().replace(/[\d\W_]+/g, " ").trim();
}

/**
 * Generic bank channel descriptions that name no merchant or counterparty. One manual decision on
 * "QR payment" or "Outbound interbank transfer" must never auto-file every unrelated future line
 * or generate a blanket rule in "Sort these".
 */
const GENERIC_KEYS = new Set([
  "qr payment",
  "outbound interbank transfer",
  "inbound interbank transfer",
  "interbank transfer",
  "refund for card payment",
  "card refund",
  "card payment",
  "bank transfer",
  "fund transfer",
  "wire transfer",
  "instapay",
  "pesonet",
  "cash deposit",
  "cash withdrawal",
  "refund",
]);

export function isGenericDescription(description: string): boolean {
  const key = payeeKey(description);
  return !key || GENERIC_KEYS.has(key);
}

/**
 * First and last name as whole words, so a longer legal name still counts as the account holder.
 * Banks that shorten names (GoTyme's "M. B. N. PINEDA") count too when the initials start with every
 * given name's, in order, then the last name. One initial alone is too common to count.
 */
export function paysAccountHolder(description: string, fullName: string): boolean {
  const parts = fullName.trim().toLowerCase().split(/\s+/).filter((part) => part.length > 1);
  if (parts.length < 2) return false;
  const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const has = (word: string) => new RegExp(`\\b${escape(word)}\\b`, "i").test(description);
  if (has(parts[0]) && has(parts[parts.length - 1])) return true;
  const given = parts.slice(0, -1).map((part) => `${escape(part[0])}\\.\\s*`).join("");
  return new RegExp(`(?<![a-z.])(?<![a-z]\\.\\s+)${given}(?:[a-z]\\.\\s*)*${escape(parts[parts.length - 1])}\\b`, "i").test(description);
}

/**
 * Who the money went to or came from, as the bank names them: the part after "Received from" / "Sent to" (and
 * Wise's and GoTyme's raw "Received money from" / "Transfer to"), without a payment reference or fee note.
 * Null when the line names no counterparty. The reference is free text the sender types, so it must never
 * decide whose money this is.
 */
export function counterpartyOf(description: string): string | null {
  const text = description.replace(/\s+/g, " ").trim();
  const match = /^(?:received money from|sent money to|received from|sent to|transfer from|transfer to)\s+(.+)$/i.exec(text);
  if (!match) return null;
  const name = match[1]
    .replace(/\s+with reference\b.*$/i, "")
    .replace(/\s*\(fee: [^)]*\)\s*$/i, "")
    .replace(/,\s*(?:account|mobile) no\.?.*$/i, "")
    .trim();
  return name || null;
}
