import { expect, test } from "bun:test";
import { BANK_FILING_LABELS, bankFiling, refileChoices } from "./review";

const entry = { provider: "gotyme" as const, kind: "payment" as const, amount: -500, currency: "PHP", status: "posted" as const, transferId: null };

test("a same-day twin of a logged entry reads as Already in Transactions, not a plain ignore", () => {
  expect(bankFiling({ status: "ignored", aiReason: "Already in Transactions: lunch" })).toBe("duplicate");
  expect(bankFiling({ status: "ignored", aiReason: "Card verification hold" })).toBe("ignored");
  expect(bankFiling({ status: "reviewed", aiReason: null })).toBe("investment");
  expect(BANK_FILING_LABELS[bankFiling({ status: "pending", aiReason: null })]).toBe("Waiting for AI");
});

test("re-filing offers only the moves that change something", () => {
  expect(refileChoices(entry)).toEqual({ post: false, transfer: true, ignore: true, unlink: false });
  expect(refileChoices({ ...entry, status: "ignored" })).toEqual({ post: true, transfer: true, ignore: false, unlink: false });
  expect(refileChoices({ ...entry, status: "transfer", transferId: "pair" })).toEqual({ post: true, transfer: false, ignore: true, unlink: true });
  // Interest can't be a transfer; a foreign currency without a PHP rate path can't be posted.
  expect(refileChoices({ ...entry, kind: "interest", status: "ignored" }).transfer).toBe(false);
  expect(refileChoices({ ...entry, currency: "XAU", status: "ignored" }).post).toBe(false);
  // Investment accounts keep their own ledger.
  expect(refileChoices({ ...entry, provider: "binance" as never, status: "ignored" })).toEqual({ post: false, transfer: false, ignore: false, unlink: false });
});
