import { PDFParse } from 'pdf-parse';

import pdfExtractor from '../../../scripts/pdf-pipeline/2-extract-text.js';

export function installMineruTestProcessor() {
  process.env.FITAPPLIANCE_ALLOW_TEST_PDF_PROCESSOR = '1';
  pdfExtractor.setPdfProcessorForTests(async (bytes) => {
    const parser = new PDFParse({ data: bytes });
    try {
      const result = await parser.getText();
      const pageTexts = Array.isArray(result.pages) && result.pages.length
        ? result.pages.map((page) => page.text)
        : [result.text];
      return {
        jsonBytes: Buffer.from(JSON.stringify(pageTexts.map((text) => [{
          type: 'paragraph',
          content: { paragraph_content: [{ type: 'text', content: text }] },
          bbox: [0, 0, 1000, 1000],
        }]))),
        derivedArtifact: { parserVersion: '3.4.4' },
      };
    } finally {
      await parser.destroy();
    }
  });
}
