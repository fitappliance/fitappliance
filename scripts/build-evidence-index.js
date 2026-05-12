#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs');

function warnDefault(message) {
  console.warn(`[evidence-index] ${message}`);
}

function isSafeHttpUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function dateStamp(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const direct = raw.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? '';
  if (direct) return direct;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : '';
}

function sourceUrlForEvidence(evidence = {}) {
  return String(
    evidence.source_url ??
    evidence.sourceUrl ??
    evidence.extracted?.metadata?.source_pdf_url ??
    evidence.metadata?.source_pdf_url ??
    ''
  ).trim();
}

function extractedAtForEvidence(evidence = {}) {
  return dateStamp(
    evidence.verified_at ??
    evidence.verifiedAt ??
    evidence.extracted_at ??
    evidence.extractedAt ??
    evidence.extracted?.metadata?.extraction_date ??
    evidence.metadata?.extraction_date ??
    ''
  );
}

function approvedEvidenceForProduct(product = {}) {
  const evidenceList = Array.isArray(product.evidence) ? product.evidence : [];
  return evidenceList.find((entry) => String(entry?.status ?? '').toLowerCase() === 'approved') ?? null;
}

function buildEvidenceIndex(manualEvidence = {}, options = {}) {
  const warn = options.warn ?? warnDefault;
  const products = manualEvidence.products && typeof manualEvidence.products === 'object'
    ? manualEvidence.products
    : {};
  const index = {};

  for (const productId of Object.keys(products).sort()) {
    const approved = approvedEvidenceForProduct(products[productId]);
    if (!approved) continue;

    const pdfUrl = sourceUrlForEvidence(approved);
    if (!isSafeHttpUrl(pdfUrl)) {
      warn(`Skipping ${productId}: approved evidence has no safe http(s) source_url`);
      continue;
    }

    index[productId] = {
      verified: approved.verified === false ? false : true,
      pdfUrl,
      extractedAt: extractedAtForEvidence(approved),
      source: String(approved.type ?? approved.source ?? 'manufacturer_pdf').trim() || 'manufacturer_pdf'
    };
  }

  return index;
}

function writeEvidenceIndex(index, outputPath) {
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
}

function buildEvidenceIndexFromFile(options = {}) {
  const repoRoot = options.repoRoot ?? path.resolve(__dirname, '..');
  const inputPath = options.inputPath ?? path.join(repoRoot, 'data', 'manual-evidence.json');
  const outputPath = options.outputPath ?? path.join(repoRoot, 'public', 'data', 'evidence-index.json');
  const manualEvidence = JSON.parse(readFileSync(inputPath, 'utf8'));
  const index = buildEvidenceIndex(manualEvidence, { warn: options.warn });
  writeEvidenceIndex(index, outputPath);
  return index;
}

function main() {
  const index = buildEvidenceIndexFromFile();
  console.log(`Wrote ${Object.keys(index).length} verified evidence entries to public/data/evidence-index.json`);
}

if (require.main === module) {
  main();
}

module.exports = {
  buildEvidenceIndex,
  buildEvidenceIndexFromFile,
  writeEvidenceIndex
};
