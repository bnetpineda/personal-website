import "server-only";
import { getDocumentProxy } from "unpdf";
import type { PdfPage } from "./maribank";
import { ImportError } from "./types";

/** Positioned text of each page. Nothing in the PDF is executed or rendered. */
export async function pdfPages(bytes: Uint8Array, maxPages = 30): Promise<PdfPage[]> {
  let pdf;
  try {
    pdf = await getDocumentProxy(bytes);
  } catch (error) {
    if ((error as { name?: string })?.name === "PasswordException") throw new ImportError("This PDF is password-protected. Save a copy without the password and upload that.");
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
