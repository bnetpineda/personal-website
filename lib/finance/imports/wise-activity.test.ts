import { describe, expect, test } from "bun:test";
import { parseWiseCsv } from "./wise-csv";
import { wiseKind, tidyWiseDescription } from "./wise-activity";

describe("Wise activity classification", () => {
  test("money received from someone else is a payment, so it can be categorized as income", () => {
    expect(wiseKind("TRANSFER-1", 500, "DEPOSIT")).toBe("payment");
    expect(wiseKind("TRANSFER-1", 500, "TRANSFER")).toBe("payment");
    expect(wiseKind("TRANSFER-1", 500, "", "Received money from Test Client LLC with reference INV-7")).toBe("payment");
  });
  test("own-money movements stay transfers and charges stay fees", () => {
    expect(wiseKind("BALANCE-1", -100, "CONVERSION")).toBe("transfer");
    expect(wiseKind("TRANSFER-2", 100, "MONEY_ADDED")).toBe("transfer");
    expect(wiseKind("TRANSFER-3", -100, "TRANSFER")).toBe("transfer");
    expect(wiseKind("TRANSFER-3", -100)).toBe("transfer");
    expect(wiseKind("FEE-1", -2)).toBe("fee");
    expect(wiseKind("CARD-1", -2)).toBe("payment");
  });
});

describe("Wise CSV classification", () => {
  test("CSV exports with a details type column use it to separate income from own-money moves", () => {
    const csv = '"TransferWise ID",Date,Amount,Currency,Description,"Transaction Details Type"\nTRANSFER-5,20-09-2026,300,USD,"Received money from Test Client LLC",DEPOSIT\nBALANCE-6,20-09-2026,-50,USD,"Converted USD to PHP",CONVERSION';
    expect(parseWiseCsv(csv, "separate").map((e) => e.kind)).toEqual(["payment", "transfer"]);
  });
});

describe("Wise wording", () => {
  test("drops fee notes, references, card terminals and cities", () => {
    const cases: [string, string, string][] = [
      ["Card transaction of 11.19 USD issued by Upwork -938290560membersh Dublin (fee: 2.33 PHP)", "PHP", "Card payment: Upwork Dublin (11.19 USD)"],
      ["Card transaction of 54.48 USD issued by Ovhcloud SINGAPORE (fee: 11.23 PHP)", "PHP", "Card payment: Ovhcloud (54.48 USD)"],
      ["Card transaction of 649.00 PHP issued by Opencode ANOMA.LY", "PHP", "Card payment: Opencode"],
      ["Received money from Romer Martin LLC with reference 806096", "PHP", "Received from Romer Martin LLC"],
      ["Sent money to Interactive Brokers LLC (fee: 1.27 USD)", "USD", "Sent to Interactive Brokers LLC"],
      ["Converted 260.00 USD to 15,662.31 PHP (fee: 1.65 USD)", "USD", "Converted 260.00 USD to 15,662.31 PHP"],
      ["Wise Charges for: TRANSFER-2386852673", "PHP", "Wise transfer fee"],
      ["Wise Charges for: BALANCE-6127889969", "USD", "Wise conversion fee"],
      ["Balance cashback", "PHP", "Balance cashback"],
    ];
    for (const [raw, currency, tidy] of cases) expect(tidyWiseDescription(raw, currency)).toBe(tidy);
  });
});
