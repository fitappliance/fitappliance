#!/usr/bin/env node
'use strict';
require('dotenv').config({ quiet: true });

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { fetchPdf } = require('./1-fetch');
const { extractText } = require('./2-extract-text');
const { extractStructuredData } = require('./3-ai-parse');
const { validateApplianceDimension, validateExtracted } = require('./4-validate');

const CATEGORY_FILES = Object.freeze([
  'fridges.json',
  'dishwashers.json',
  'dryers.json',
  'washing-machines.json'
]);

function parseArgs(argv) {
  const args = {};
  for (const item of argv.slice(2)) {
    const match = item.match(/^--([^=]+)=(.*)$/);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function findProduct(repoRoot, productId) {
  for (const fileName of CATEGORY_FILES) {
    const doc = readJson(path.join(repoRoot, 'public', 'data', fileName));
    const product = (doc.products || []).find((row) => row.id === productId);
    if (product) return product;
  }
  return null;
}

function getApprovedEvidence(repoRoot, productId) {
  const doc = readJson(path.join(repoRoot, 'data', 'manual-evidence.json'));
  const evidenceRows = doc.products?.[productId]?.evidence || [];
  return evidenceRows.find((row) => row.status === 'approved' && row.source_url) || null;
}

function numberFromMatch(text, regex) {
  const match = String(text || '').match(regex);
  if (!match) return null;
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) ? value : null;
}

function parseHisenseSpecText(text, { sourceUrl, extractionDate }) {
  const normalized = String(text || '').replace(/\u00d7/g, 'x');
  const model = normalized.match(/Model Number\s+([A-Z0-9-]+)/i)?.[1] || null;
  const netDims = normalized.match(/Dimensions \(Net\) \(W X H X D\)\s*(\d+)\s*x\s*(\d+)\s*x\s*(\d+)\s*mm/i);
  const clearance = normalized.match(/Cabinet clearance \[Sides \/ Back \/ Top\]\s*(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)\s*mm/i);
  const reversibleText = normalized.match(/Reversible door\s+(Yes|No|N\/A)/i)?.[1] || null;
  const waterText = [
    normalized.match(/Water Tank\s+(.+)/i)?.[1],
    normalized.match(/Water dispenser\s+(.+)/i)?.[1]
  ].filter(Boolean).join(' ');

  if (!model || !netDims || !clearance) {
    throw new Error('Pilot parser could not locate model, net dimensions, and clearance lines');
  }

  const sourceQuote = [
    normalized.match(/Model Number\s+[A-Z0-9-]+/i)?.[0],
    normalized.match(/Cabinet clearance \[Sides \/ Back \/ Top\]\s*\d+\s*\/\s*\d+\s*\/\s*\d+\s*mm/i)?.[0],
    normalized.match(/Dimensions \(Net\) \(W X H X D\)\s*\d+\s*x\s*\d+\s*x\s*\d+\s*mm/i)?.[0]
  ].filter(Boolean).join(' | ');

  return {
    brand: 'Hisense',
    model,
    category: 'fridge',
    dimensions_mm: {
      width: Number.parseInt(netDims[1], 10),
      height: Number.parseInt(netDims[2], 10),
      depth: Number.parseInt(netDims[3], 10)
    },
    clearance_mm: {
      side: Number.parseInt(clearance[1], 10),
      top: Number.parseInt(clearance[3], 10),
      rear: Number.parseInt(clearance[2], 10),
      front: null
    },
    capacity_litres: numberFromMatch(normalized, /Total volume\s+(\d+)\s+litre/i),
    energy_stars: Number.parseFloat(normalized.match(/Star rating\s+([\d.]+)\s+star/i)?.[1] || 'NaN'),
    annual_kwh: numberFromMatch(normalized, /CEC\s+(\d+)\s*kWh\/y/i),
    door_swing_mm: null,
    weight_kg: numberFromMatch(normalized, /Product Weight \(Net\)\s+(\d+)\s+kg/i),
    noise_db: numberFromMatch(normalized, /Noise level\s+(\d+)\s*dB/i),
    confidence: 'high',
    source_quote: sourceQuote,
    source_pdf_url: sourceUrl,
    extraction_date: extractionDate,
    flags: {
      requires_plumbing: !/N\/A/i.test(waterText),
      ventilation_required: true,
      reversible_door: reversibleText ? reversibleText.toLowerCase() === 'yes' : null
    }
  };
}

function toStrictCandidate(extracted) {
  return {
    brand: extracted.brand,
    sku: extracted.model,
    category: extracted.category,
    dimensions: {
      height_mm: extracted.dimensions_mm.height,
      width_mm: extracted.dimensions_mm.width,
      depth_mm: extracted.dimensions_mm.depth,
      door_open_90_depth_mm: null
    },
    clearance_requirements: {
      top_mm: extracted.clearance_mm.top,
      left_mm: extracted.clearance_mm.side,
      right_mm: extracted.clearance_mm.side,
      rear_mm: extracted.clearance_mm.rear
    },
    flags: extracted.flags,
    metadata: {
      source_pdf_url: extracted.source_pdf_url,
      extraction_date: extracted.extraction_date,
      confidence_score: 0.97
    }
  };
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

async function main() {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const args = parseArgs(process.argv);
  const productId = args.productId || 'fridge-arf3335';
  const product = findProduct(repoRoot, productId);
  const evidence = getApprovedEvidence(repoRoot, productId);
  if (!product) throw new Error(`No runtime product found for ${productId}`);
  if (!evidence) throw new Error(`No approved PDF evidence found for ${productId}`);

  const sku = String(product.model || evidence.model || productId).replace(/[^a-z0-9-]/gi, '_');
  const brandSlug = String(product.brand || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const pdfPath = path.join(repoRoot, '.tmp', 'pdfs', brandSlug, `${sku}.pdf`);
  const extractionDate = args.extractionDate || '2026-05-08T00:00:00.000Z';

  const fetched = await fetchPdf(evidence.source_url, pdfPath, { force: args.force === '1' });
  const extractedText = await extractText(fetched.path);
  const parsed = await extractStructuredData(extractedText.text, {
    llmCaller: async (_prompt, text) => JSON.stringify(parseHisenseSpecText(text, {
      sourceUrl: evidence.source_url,
      extractionDate
    }))
  });
  const legacyValidation = validateExtracted(parsed);
  const strictCandidate = toStrictCandidate(parsed);
  const strictValidation = validateApplianceDimension(strictCandidate);

  const report = {
    product_id: productId,
    selected: {
      brand: product.brand,
      sku: product.model,
      category: product.cat
    },
    fetch: {
      path: fetched.path,
      cached: fetched.cached,
      bytes: fetched.bytes,
      sha256: sha256(fetched.path)
    },
    extraction: {
      page_count: extractedText.pageCount,
      pdf_info: extractedText.info
    },
    legacy_validation: legacyValidation,
    zod_validation: {
      valid: strictValidation.valid,
      requiresManualReview: strictValidation.requiresManualReview,
      errors: strictValidation.errors
    },
    validated_json: strictValidation.data
  };

  console.log(JSON.stringify(report, null, 2));
  if (!legacyValidation.valid || !strictValidation.valid) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

exports.parseHisenseSpecText = parseHisenseSpecText;
exports.toStrictCandidate = toStrictCandidate;
