import { describe, expect, test } from "bun:test";
import { parseStatementPdf, statementFileType, type PdfParser } from "./detect";
import type { PdfPage } from "./maribank";
import { ImportError } from "./types";

const page = (...texts: string[]): PdfPage => texts.map((text, i) => ({ text, x: 0, y: 800 - i * 12, width: 50 }));

/** A stand-in parser: reads only a page that says `marker`, like the real ones check their own layout. */
const parser = (bank: string, marker: RegExp): PdfParser => ({
  bank, brand: new RegExp(bank, "i"),
  parse: (pages) => {
    if (!pages.flat().some((i) => marker.test(i.text))) throw new ImportError(`This does not look like a ${bank} statement.`);
    return { entries: [], balances: [] };
  },
});
const parsers = [parser("MariBank", /TOTAL OUTGOING/), parser("GoTyme", /Statement of Account/)];

describe("statementFileType", () => {
  test("knows CSVs and PDFs by extension, in any case", () => {
    expect(statementFileType("wise-USD.csv")).toBe("csv");
    expect(statementFileType("Statement.PDF")).toBe("pdf");
    expect(statementFileType("photo.png")).toBeNull();
    expect(statementFileType("statement.pdf.exe")).toBeNull();
  });
});

describe("parseStatementPdf", () => {
  test("reads a statement with the parser of the bank it names", () => {
    expect(parseStatementPdf([page("GoTyme Bank", "Statement of Account")], parsers).bank).toBe("GoTyme");
    expect(parseStatementPdf([page("MariBank", "TOTAL OUTGOING")], parsers).bank).toBe("MariBank");
  });

  test("tries the bank on the first page before one that only appears in a transaction", () => {
    const pages = [page("GoTyme Bank", "Statement of Account"), page("Transfer from MariBank savings")];
    expect(parseStatementPdf(pages, parsers).bank).toBe("GoTyme");
  });

  test("falls back to another named bank when the first one's layout doesn't match", () => {
    const pages = [page("Sent to GoTyme"), page("MariBank", "TOTAL OUTGOING")];
    expect(parseStatementPdf(pages, parsers).bank).toBe("MariBank");
  });

  test("a PDF from no known bank is refused by name", () => {
    expect(() => parseStatementPdf([page("BPI", "Statement")], parsers)).toThrow("This PDF isn't a MariBank or GoTyme statement.");
  });

  test("a damaged statement reports the error of the bank on its first page", () => {
    expect(() => parseStatementPdf([page("MariBank e-statement"), page("paid to GoTyme")], parsers)).toThrow("This does not look like a MariBank statement.");
  });

  test("errors that aren't about the statement's layout are not swallowed", () => {
    const broken: PdfParser = { bank: "MariBank", brand: /maribank/i, parse: () => { throw new TypeError("bug"); } };
    expect(() => parseStatementPdf([page("MariBank")], [broken, parsers[1]])).toThrow(TypeError);
  });
});
