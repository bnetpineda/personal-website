import { describe, expect, test } from "bun:test";
import { isGenericDescription, payeeKey, payeeOf } from "./payee";

describe("payees", () => {
  test("reads who was paid or who paid from any bank's wording", () => {
    expect(payeeOf("Received from Centauri Media Ltd")).toBe("Centauri Media Ltd");
    expect(payeeOf("Received money from Romer Martin LLC with reference 806096")).toBe("Romer Martin LLC");
    expect(payeeOf("Sent money to Ra**n Cr**g I. (fee: 39.20 PHP)")).toBe("Ra**n Cr**g I.");
    expect(payeeOf("Sent to Juan Dela Cruz")).toBe("Juan Dela Cruz");
    expect(payeeOf("Sent to Ysah tibalani G-Xchange, Inc (GCash)")).toBe("Ysah tibalani");
    expect(payeeOf("Card payment: Upwork Dublin (11.19 USD)")).toBe("Upwork Dublin");
    expect(payeeOf("Card payment: BLIZZARD *US1066982371")).toBe("BLIZZARD");
    expect(payeeOf("Sent to SWAPPEDCOM* #5A4A5AB1")).toBe("SWAPPEDCOM");
    expect(payeeOf("Card payment: POLAR* NOMAC")).toBe("POLAR* NOMAC");
    expect(payeeOf("Card Payment: Grok Xai")).toBe("Grok Xai");
    expect(payeeOf("Load - Regular: DITO 100")).toBe("DITO 100");
    expect(payeeOf("ATM cash withdrawal")).toBe("ATM cash withdrawal");
  });
  test("the same payee matches across invoice numbers, card terminal codes and bank rails", () => {
    expect(payeeKey("Received money from Romer Martin LLC with reference 806096")).toBe(payeeKey("Received from Romer Martin LLC"));
    expect(payeeKey("Sent to Ysah tibalani G-Xchange, Inc (GCash)")).toBe(payeeKey("Sent to Ysah tibalani"));
    expect(payeeKey("Card payment: BLIZZARD *US1066982371")).toBe(payeeKey("Card payment: BLIZZARD *EU99999999"));
  });
  test("recognizes generic bank channel descriptions that name no payee", () => {
    expect(isGenericDescription("QR payment")).toBe(true);
    expect(isGenericDescription("Outbound interbank transfer")).toBe(true);
    expect(isGenericDescription("Refund for card payment")).toBe(true);
    expect(isGenericDescription("ATM cash withdrawal")).toBe(false);
    expect(isGenericDescription("Card payment: SCALEWAY")).toBe(false);
  });
});
