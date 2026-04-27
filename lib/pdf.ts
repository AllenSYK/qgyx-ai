import "server-only";

export async function extractPdfText(buffer: Buffer) {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({
    data: new Uint8Array(buffer)
  });

  try {
    const result = await parser.getText();
    return result.text.replace(/\s+\n/g, "\n").trim();
  } finally {
    await parser.destroy();
  }
}
