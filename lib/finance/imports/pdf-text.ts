import "server-only";
import { getDocumentProxy } from "unpdf";
import type { PdfPage } from "./maribank";
import { ImportError } from "./types";

/** A locked PDF: no password was given, or the one given did not open it. */
export class PdfPasswordError extends ImportError {
  constructor(readonly wrong: boolean) {
    super(wrong ? "That password did not open the statement. Check it and try again." : "This PDF is password-protected. Enter its password to import it.");
  }
}

/**
 * Positioned text of each page. Nothing in the PDF is executed or rendered. A password only opens
 * the file in memory: it is not saved, logged or sent anywhere else.
 */
export async function pdfPages(bytes: Uint8Array, { maxPages = 30, password }: { maxPages?: number; password?: string } = {}): Promise<PdfPage[]> {
  let pdf;
  try {
    pdf = await getDocumentProxy(bytes, password ? { password } : undefined);
  } catch (error) {
    // pdf.js: code 1 needs a password, code 2 was given a wrong one.
    const e = error as { name?: string; code?: number };
    if (e?.name === "PasswordException") throw new PdfPasswordError(e.code === 2 || Boolean(password));
    throw new ImportError("The file could not be read as a PDF.");
  }
  if (pdf.numPages > maxPages) throw new ImportError(`Upload a statement of at most ${maxPages} pages.`);
  const pages: PdfPage[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const { items } = await (await pdf.getPage(n)).getTextContent();
    pages.push(items.flatMap((item) => "str" in item && item.str.trim()
      ? [{ text: item.str, x: item.transform[4], y: item.transform[5], width: item.width }] : []));
  }
  return pages;
}
