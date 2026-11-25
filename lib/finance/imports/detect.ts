import { parseGoTymeStatement } from "./gotyme";
import { parseMariBankStatement, type PdfPage } from "./maribank";
import type { StatementBalance } from "../statement-balances";
import { ImportError, type ImportEntry } from "./types";

/*
 * One upload for every bank: a statement says which bank it is from, so nobody has to pick the right
 * button first. CSVs are Wise's; a PDF goes to the parser of the bank it names. Each parser checks its
 * own layout and totals, so a wrong guess fails instead of importing wrong numbers.
 */

export type StatementFileType = "csv" | "pdf";

/** By extension, as the file picker filters them. Anything else is refused before it is read. */
export function statementFileType(name: string): StatementFileType | null {
  if (/\.csv$/i.test(name)) return "csv";
  if (/\.pdf$/i.test(name)) return "pdf";
  return null;
}

type Parsed = { entries: ImportEntry[]; balances: StatementBalance[] };
export interface PdfParser { bank: string; brand: RegExp; parse: (pages: PdfPage[]) => Parsed }

export const PDF_PARSERS: readonly PdfParser[] = [
  { bank: "MariBank", brand: /maribank/i, parse: parseMariBankStatement },
  { bank: "GoTyme", brand: /gotyme/i, parse: parseGoTymeStatement },
];

/**
 * Parses a statement PDF from whichever bank it is. The bank named on the first page is tried first:
 * a MariBank statement can list a transfer to GoTyme, and the other way round. When no parser reads
 * it, the error is the one from the bank it names, which says what is wrong with that statement.
 */
export function parseStatementPdf(pages: PdfPage[], parsers: readonly PdfParser[] = PDF_PARSERS): Parsed & { bank: string } {
  const text = (page: PdfPage | undefined) => (page ?? []).map((item) => item.text).join(" ");
  const first = text(pages[0]), all = pages.map(text).join(" ");
  const named = (p: PdfParser) => (p.brand.test(first) ? 2 : p.brand.test(all) ? 1 : 0);
  const ordered = [...parsers].filter((p) => named(p) > 0).sort((a, b) => named(b) - named(a));
  if (!ordered.length) throw new ImportError(`This PDF isn't a ${parsers.map((p) => p.bank).join(" or ")} statement.`);
  let firstError: unknown;
  for (const parser of ordered) {
    try { return { ...parser.parse(pages), bank: parser.bank }; }
    catch (error) {
      if (!(error instanceof ImportError)) throw error;
      firstError ??= error;
    }
  }
  throw firstError;
}
