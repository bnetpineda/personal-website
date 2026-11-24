import { expect, test } from "bun:test";
import { pdfPages } from "./pdf-text";

/** A one-page PDF per page text, built by hand (pdf.js rebuilds the missing cross-reference table). */
function tinyPdf(texts: string[]) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${texts.map((_, i) => `${3 + i * 2} 0 R`).join(" ")}] /Count ${texts.length} >>`,
  ];
  texts.forEach((text, i) => {
    const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${4 + i * 2} 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  const body = objects.map((o, i) => `${i + 1} 0 obj\n${o}\nendobj\n`).join("");
  return new TextEncoder().encode(`%PDF-1.4\n${body}trailer\n<< /Root 1 0 R /Size ${objects.length + 1} >>\n%%EOF`);
}

test("reads each page's positioned text, and frees the document afterwards", async () => {
  const pages = await pdfPages(tinyPdf(["Opening balance 100.00", "Closing balance 90.00"]));
  expect(pages.map((page) => page.map((item) => item.text).join(" "))).toEqual(["Opening balance 100.00", "Closing balance 90.00"]);
  expect(pages[0][0]).toMatchObject({ x: 72, y: 720 });
});

test("too many pages is refused (the document is still freed)", async () => {
  await expect(pdfPages(tinyPdf(["a", "b"]), { maxPages: 1 })).rejects.toThrow("at most 1 pages");
});
