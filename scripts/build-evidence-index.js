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
  if (trustLevel !== 'verified_fit') return ['dimensions'];
  if (Array.isArray(fields)) {
    const next = [...new Set(fields.filter((field) => ['dimensions', 'clearance'].includes(field)))];
    if (next.length > 0) return next;
  }
  return ['dimensions', 'clearance'];
}

function getHostname(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function isRetailerOrThirdPartySource(sourceType, sourceUrl) {
  const normalizedSource = String(sourceType ?? '').toLowerCase();
  if (normalizedSource.includes('retailer') || normalizedSource.includes('third_party')) return true;
  const host = getHostname(sourceUrl);
  return [
    'appliancesonline.com.au',
    'commercial.appliancesonline.com.au',
    'thegoodguys.com.au',
    'harveynorman.com.au',
    'binglee.com.au',
    'device.report',
    'manualslib.com',
    'usermanuals.au',
  ].some((domain) => host === domain || host.endsWith(`.${domain}`));
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

function hasNonZeroExtractedClearance(evidence) {
  const clearance = evidence?.extracted?.clearance_requirements;
  return ['top_mm', 'left_mm', 'right_mm', 'rear_mm'].some((key) => (
    typeof clearance?.[key] === 'number' && Number.isFinite(clearance[key]) && clearance[key] > 0
  ));
}

function hasExplicitClearanceEvidence(evidence) {
  if (evidence?.clearance_verified === true) return true;
  if (Array.isArray(evidence?.verified_fields) && evidence.verified_fields.includes('clearance')) return true;
  const metadata = evidence?.extracted?.metadata ?? {};
  if (String(evidence?.clearance_source ?? '').trim() || String(metadata.clearance_source ?? '').trim()) return true;
  return hasExtractedClearanceEvidence(evidence) && hasNonZeroExtractedClearance(evidence);
}

function inferTrustLevel(evidence, hasPdfEvidence, sourceType, sourceUrl = '') {
  const explicit = String(evidence?.trust_level ?? '').trim();
  if (explicit === 'retailer_spec') return 'retailer_spec';
  if (hasPdfEvidence === false || isRetailerOrThirdPartySource(sourceType, sourceUrl)) {
    return 'retailer_spec';
  }
  if (explicit === 'verified_fit' && hasExplicitClearanceEvidence(evidence)) return 'verified_fit';
  if (explicit === 'dimensions_verified') return 'dimensions_verified';
  if (
    hasExtractedDimensionsEvidence(evidence)
    && hasExplicitClearanceEvidence(evidence)
  ) {
    return 'verified_fit';
  }
  return 'dimensions_verified';
}

function normalizeSourceTypeForTrust(sourceType, sourceUrl) {
  if (!isRetailerOrThirdPartySource(sourceType, sourceUrl)) return sourceType;
  const normalized = String(sourceType ?? '').toLowerCase();
  return ['official_pdf', 'manual_evidence', 'spec_sheet', 'installation_manual'].includes(normalized)
    ? 'retailer_spec'
    : sourceType;
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
    const effectiveSourceType = normalizeSourceTypeForTrust(sourceType, sourceUrl);
    const confidence = Number(evidence?.extracted?.metadata?.confidence_score ?? evidence?.metadata?.confidence_score);
    const trustLevel = inferTrustLevel(evidence, hasPdfEvidence, sourceType, sourceUrl);
    const verifiedFields = normalizeVerifiedFields(evidence?.verified_fields, trustLevel);
    const clearanceVerified = trustLevel !== 'verified_fit'
      ? false
      : typeof evidence?.clearance_verified === 'boolean'
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
      source_type: effectiveSourceType,
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
