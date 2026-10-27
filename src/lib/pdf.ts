import { PAGE_BREAK, pageItemsToText } from "@/lib/pdfText";

export interface ExtractedDocument {
  text: string;
  pages: number;
}

/** Extract text from a PDF in the browser; pages are separated by PAGE_BREAK. */
export async function extractPdfText(file: File): Promise<ExtractedDocument> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  // Japanese PDFs often use CID fonts: without the CMaps, text comes out garbled or without digits.
  const pdf = await pdfjs.getDocument({
    data: await file.arrayBuffer(),
    cMapUrl: "/pdfjs/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/pdfjs/standard_fonts/",
  }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(pageItemsToText(content.items));
  }
  return { text: pages.join(`\n${PAGE_BREAK}\n`), pages: pdf.numPages };
}
