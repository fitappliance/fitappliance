#!/usr/bin/env node
'use strict';

const { mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const manualEvidencePath = path.join(repoRoot, 'data', 'manual-evidence.json');
const outputPath = path.join(repoRoot, 'public', 'data', 'evidence-index.json');

function toDateStamp(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const direct = raw.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? '';
  if (direct) return direct;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : '';
}

function pickEvidenceEntry(entry = {}) {
  const rows = Array.isArray(entry.evidence) ? entry.evidence : [];
  const approved = rows.find((row) => row?.status === 'approved' || row?.has_pdf_evidence === true);
  if (approved) return approved;
  const pending = rows.find((row) => row?.status && row.status !== 'invalid');
  if (pending) return pending;
  return rows[0] ?? null;
}

function normalizeVerifiedFields(fields, trustLevel) {
  if (Array.isArray(fields)) {
    const next = [...new Set(fields.filter((field) => ['dimensions', 'clearance'].includes(field)))];
    if (next.length > 0) return next;
  }
  return trustLevel === 'verified_fit' ? ['dimensions', 'clearance'] : ['dimensions'];
}

function hasExtractedDimensionsEvidence(evidence) {
  const dimensions = evidence?.extracted?.dimensions;
  return ['height_mm', 'width_mm', 'depth_mm'].every((key) => (
    typeof dimensions?.[key] === 'number' && Number.isFinite(dimensions[key]) && dimensions[key] > 0
  ));
}

function hasExtractedClearanceEvidence(evidence) {
  const clearance = evidence?.extracted?.clearance_requirements;
  return ['top_mm', 'left_mm', 'right_mm', 'rear_mm'].every((key) => (
    typeof clearance?.[key] === 'number' && Number.isFinite(clearance[key]) && clearance[key] >= 0
  ));
}

function inferTrustLevel(evidence, hasPdfEvidence, sourceType) {
  const explicit = String(evidence?.trust_level ?? '').trim();
  if (['verified_fit', 'dimensions_verified', 'retailer_spec'].includes(explicit)) return explicit;
  const normalizedSource = String(sourceType ?? '').toLowerCase();
  if (hasPdfEvidence === false || normalizedSource.includes('retailer') || normalizedSource.includes('third_party')) {
    return 'retailer_spec';
  }
  if (
    evidence?.clearance_verified === true
    || (hasExtractedDimensionsEvidence(evidence) && hasExtractedClearanceEvidence(evidence))
  ) {
    return 'verified_fit';
  }
  return 'dimensions_verified';
}

function buildIndex(manualEvidence) {
  const products = manualEvidence?.products && typeof manualEvidence.products === 'object'
    ? manualEvidence.products
    : {};
  const index = {};

  for (const productId of Object.keys(products).sort()) {
    const entry = products[productId] ?? {};
    if (entry.status === 'invalid' || entry.invalid === true) continue;

    const evidence = pickEvidenceEntry(entry);
    const hasPdfEvidence = typeof evidence?.has_pdf_evidence === 'boolean'
      ? evidence.has_pdf_evidence
      : (entry.has_pdf_evidence === true || evidence?.status === 'approved');
    const isApproved = entry.has_pdf_evidence === true || evidence?.status === 'approved' || evidence?.has_pdf_evidence === true;
    const status = isApproved ? 'verified' : evidence ? 'pending' : 'pending';
    const sourceUrl = String(evidence?.source_url ?? evidence?.metadata?.source_pdf_url ?? '').trim();
    const verifiedAt = toDateStamp(evidence?.verified_at ?? evidence?.metadata?.extraction_date ?? entry.verified_at);
    const sourceType = String(evidence?.source_type ?? evidence?.type ?? 'manual_evidence').trim() || 'manual_evidence';
    const confidence = Number(evidence?.extracted?.metadata?.confidence_score ?? evidence?.metadata?.confidence_score);
    const trustLevel = inferTrustLevel(evidence, hasPdfEvidence, sourceType);
    const verifiedFields = normalizeVerifiedFields(evidence?.verified_fields, trustLevel);
    const clearanceVerified = typeof evidence?.clearance_verified === 'boolean'
      ? evidence.clearance_verified
      : trustLevel === 'verified_fit';

    index[productId] = {
      product_id: productId,
      status,
      category: entry.category ?? '',
      brand: entry.brand ?? '',
      model: entry.model ?? '',
      has_pdf_evidence: hasPdfEvidence,
      trust_level: trustLevel,
      verified_fields: verifiedFields,
      clearance_verified: clearanceVerified,
      source_type: sourceType,
      source_url: sourceUrl,
      verified_at: verifiedAt,
      confidence_score: Number.isFinite(confidence) ? confidence : null
    };
  }

  return {
    schema_version: 1,
    source: 'data/manual-evidence.json',
    last_updated: manualEvidence?.last_updated ?? '',
    products: index
  };
}

function main() {
  const manualEvidence = JSON.parse(readFileSync(manualEvidencePath, 'utf8'));
  const index = buildIndex(manualEvidence);
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(index, null, 2)}\n`);
  console.log(`Built evidence index with ${Object.keys(index.products).length} products -> ${path.relative(repoRoot, outputPath)}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  buildIndex,
  pickEvidenceEntry,
  toDateStamp
};
