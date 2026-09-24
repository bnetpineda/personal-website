import { describe, expect, test } from "bun:test";
import { parseWiseCsv } from "./wise-csv";
import { wiseKind } from "./wise-activity";

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
