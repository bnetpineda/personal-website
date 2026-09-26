import { describe, expect, test } from "bun:test";
import { payeeKey, payeeOf } from "./payee";

describe("payees", () => {
  test("reads who was paid or who paid from any bank's wording", () => {
    expect(payeeOf("Received from Centauri Media Ltd")).toBe("Centauri Media Ltd");
    expect(payeeOf("Received money from Romer Martin LLC with reference 806096")).toBe("Romer Martin LLC");
    expect(payeeOf("Sent money to Ra**n Cr**g I. (fee: 39.20 PHP)")).toBe("Ra**n Cr**g I.");
    expect(payeeOf("Sent to Juan Dela Cruz")).toBe("Juan Dela Cruz");
    expect(payeeOf("Card payment: Upwork Dublin (11.19 USD)")).toBe("Upwork Dublin");
    expect(payeeOf("Card Payment: Grok Xai")).toBe("Grok Xai");
    expect(payeeOf("Load - Regular: DITO 100")).toBe("DITO 100");
    expect(payeeOf("ATM cash withdrawal")).toBe("ATM cash withdrawal");
  });
  test("the same payee matches across invoice numbers", () => {
    expect(payeeKey("Received money from Romer Martin LLC with reference 806096")).toBe(payeeKey("Received from Romer Martin LLC"));
  });
});
