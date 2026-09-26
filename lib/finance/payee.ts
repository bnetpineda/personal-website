/**
 * Who the money went to or came from, read from an imported description. It groups a payee's
 * payments ("teach once"), matches past decisions for the model, and names repeat payers.
 *   "Received from Centauri Media Ltd"      → "Centauri Media Ltd"
 *   "Sent to Juan Dela Cruz"                → "Juan Dela Cruz"
 *   "Card payment: Upwork Dublin (11.19 USD)" → "Upwork Dublin"
 *   "Payment: Shopee"                       → "Shopee"
 */
export function payeeOf(description: string): string {
  const text = description.replace(/\s+/g, " ").trim();
  const sender = /^(?:received(?: money)?|sent(?: money)?) (?:from|to) (.+?)(?: with reference\b.*| \(fee: .*\))?$/i.exec(text);
  if (sender) return sender[1].trim();
  const channel = /^[A-Za-z][A-Za-z -]{1,30}: (.+?)(?: \([^()]*\))?$/.exec(text);
  if (channel) return channel[1].trim();
  return text;
}

/** Lower-case words of a payee, without digits, for matching the same payee across descriptions. */
export function payeeKey(description: string): string {
  return payeeOf(description).toLowerCase().replace(/[\d\W_]+/g, " ").trim();
}
