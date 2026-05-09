require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const { PDFParse } = require('pdf-parse');

function cleanExtractedText(rawText) {
  const lines = String(rawText || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trimEnd());

  const counts = new Map();
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) {
      counts.set(trimmed, (counts.get(trimmed) || 0) + 1);
    }
  }

  const cleaned = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^\d+$/.test(trimmed)) continue;
    if (/^--\s*\d+\s+of\s+\d+\s*--$/i.test(trimmed)) continue;
    if (/copyright|©|all rights reserved|bsh home appliances/i.test(trimmed)) continue;
    if (trimmed.length < 80 && counts.get(trimmed) > 2) continue;
    cleaned.push(line);
  }

  return cleaned.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function extractText(pdfPath) {
  const data = fs.readFileSync(pdfPath);
  const parser = new PDFParse({ data });

  try {
    const textResult = await parser.getText();
    const metaResult = await parser.getInfo().catch(() => ({}));
    return {
      text: cleanExtractedText(textResult.text),
      pageCount: textResult.total || textResult.pages?.length || 0,
      info: metaResult.info || metaResult || {}
    };
  } finally {
    await parser.destroy();
  }
}

exports.extractText = extractText;
exports.cleanExtractedText = cleanExtractedText;
