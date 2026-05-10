#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_INPUT = path.join('reports', 'samsung-batch-results.json');
const DEFAULT_OUTPUT = path.join('reports', 'samsung-evidence-gap-report.md');
const DEFAULT_MANUAL_EVIDENCE = path.join('data', 'manual-evidence.json');

const BUCKETS = {
  MISSING_SOURCE: 'A',
  MISSING_CLEARANCE: 'B',
  UNVERIFIED_ALIAS: 'C',
  UNREADABLE_LAYOUT: 'D'
};

const BUCKET_META = {
  [BUCKETS.MISSING_SOURCE]: {
    title: 'Bucket A: Missing Source (PDP 404)',
    description: 'No official or approved source PDF could be located.'
  },
  [BUCKETS.MISSING_CLEARANCE]: {
    title: 'Bucket B: Missing Clearance',
    description: 'A readable PDF exists and dimensions may be present, but explicit installation clearance is missing.'
  },
  [BUCKETS.UNVERIFIED_ALIAS]: {
    title: 'Bucket C: Unverified Alias',
    description: 'A document appears to describe an engineering/family model rather than the target marketing SKU.'
  },
  [BUCKETS.UNREADABLE_LAYOUT]: {
    title: 'Bucket D: Unreadable Layout',
    description: 'A source document exists, but the current layout-aware parser cannot extract safe dimensions.'
  }
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function cleanCell(value) {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSku(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function classifyFailure(failure = {}) {
  const reason = String(failure.reason || '');
  const error = String(failure.error || '');
  const text = `${reason} ${error}`;

  if (/alias|model mismatch|does not match|engineering model|marketing model/i.test(text)) {
    return BUCKETS.UNVERIFIED_ALIAS;
  }
  if (/PDP Not Found|source missing|official fetch failed|HTTP 404|source URL not found|PDF source URL not found/i.test(text)) {
    return BUCKETS.MISSING_SOURCE;
  }
  if (/clearance/i.test(text)) {
    return BUCKETS.MISSING_CLEARANCE;
  }
  return BUCKETS.UNREADABLE_LAYOUT;
}

function normalizeFailure(failure = {}) {
  return {
    key: failure.key || failure.id || '',
    sku: failure.sku || failure.entry?.model || failure.entry?.sku || '',
    brand: failure.brand || failure.entry?.brand || 'Samsung',
    category: failure.category || failure.entry?.category || '',
    reason: failure.reason || '',
    error: failure.error || ''
  };
}

function emptyBuckets() {
  return Object.fromEntries(Object.values(BUCKETS).map((bucket) => [
    bucket,
    {
      ...BUCKET_META[bucket],
      items: []
    }
  ]));
}

function entryHasApprovedEvidence(entry) {
  if (!entry) return false;
  if (entry.has_pdf_evidence === true) return true;
  return (entry.evidence || []).some((item) => (
    item?.has_pdf_evidence === true
    || (item?.status === 'approved' && item?.raw_json_path)
  ));
}

function findManualEvidenceEntryForFailure(failure, manualEvidence) {
  const products = manualEvidence?.products || {};
  if (failure.key && products[failure.key]) return products[failure.key];
  const sku = normalizeSku(failure.sku);
  if (!sku) return null;
  return Object.values(products).find((entry) => {
    const entrySkus = [
      entry?.model,
      entry?.sku,
      entry?.product?.model,
      entry?.product?.sku
    ].map(normalizeSku).filter(Boolean);
    return entrySkus.includes(sku);
  }) || null;
}

function analyzeSamsungGapsData(data = {}, opts = {}) {
  const buckets = emptyBuckets();
  const failures = Array.isArray(data.failures) ? data.failures : [];
  const resolved = [];

  for (const rawFailure of failures) {
    const failure = normalizeFailure(rawFailure);
    const manualEntry = findManualEvidenceEntryForFailure(failure, opts.manualEvidence);
    if (entryHasApprovedEvidence(manualEntry)) {
      resolved.push(failure);
      continue;
    }
    const bucket = classifyFailure(failure);
    buckets[bucket].items.push(failure);
  }

  return {
    runDate: data.runDate || new Date().toISOString(),
    summary: {
      total_failures: failures.length,
      unresolved_failures: failures.length - resolved.length,
      resolved_after_run: resolved.length,
      bucket_counts: Object.fromEntries(Object.entries(buckets).map(([key, bucket]) => [key, bucket.items.length]))
    },
    resolved,
    buckets
  };
}

function renderBucket(bucket) {
  const rows = bucket.items.length
    ? [
      '| SKU | Category | Reason | Error |',
      '| --- | --- | --- | --- |',
      ...bucket.items.map((item) => `| ${cleanCell(item.sku)} | ${cleanCell(item.category)} | ${cleanCell(item.reason)} | ${cleanCell(item.error)} |`)
    ].join('\n')
    : 'No failures in this bucket.';

  return [
    `## ${bucket.title}`,
    '',
    bucket.description,
    '',
    `Count: ${bucket.items.length}`,
    '',
    rows
  ].join('\n');
}

function renderSamsungGapReport(analysis) {
  const bucketOrder = [
    BUCKETS.MISSING_SOURCE,
    BUCKETS.MISSING_CLEARANCE,
    BUCKETS.UNVERIFIED_ALIAS,
    BUCKETS.UNREADABLE_LAYOUT
  ];

  return [
    '# Samsung Evidence Gap Report',
    '',
    `Source run: ${analysis.runDate}`,
    '',
    '## Summary',
    '',
    `Total failed Samsung candidates: ${analysis.summary.total_failures}`,
    `Resolved after source run: ${analysis.summary.resolved_after_run}`,
    `Remaining unresolved candidates: ${analysis.summary.unresolved_failures}`,
    '',
    ...bucketOrder.map((key) => `- ${analysis.buckets[key].title}: ${analysis.buckets[key].items.length}`),
    '',
    '## Interpretation',
    '',
    'This report is diagnostic only. Parser improvements may increase format coverage, but no bucket authorizes guessed clearances, inferred aliases, or retailer-only conclusions.',
    '',
    '## Resolved Since Source Run',
    '',
    analysis.resolved.length
      ? [
        '| SKU | Category | Previous reason |',
        '| --- | --- | --- |',
        ...analysis.resolved.map((item) => `| ${cleanCell(item.sku)} | ${cleanCell(item.category)} | ${cleanCell(item.reason)} |`)
      ].join('\n')
      : 'No previously failed Samsung candidates have approved evidence yet.',
    '',
    ...bucketOrder.map((key) => renderBucket(analysis.buckets[key]))
  ].join('\n') + '\n';
}

function writeSamsungGapReport({
  repoRoot = process.cwd(),
  inputPath = path.join(repoRoot, DEFAULT_INPUT),
  outputPath = path.join(repoRoot, DEFAULT_OUTPUT),
  manualEvidencePath = path.join(repoRoot, DEFAULT_MANUAL_EVIDENCE)
} = {}) {
  const data = readJson(inputPath);
  const manualEvidence = fs.existsSync(manualEvidencePath) ? readJson(manualEvidencePath) : { products: {} };
  const analysis = analyzeSamsungGapsData(data, { manualEvidence });
  const markdown = renderSamsungGapReport(analysis);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, markdown);
  return { analysis, outputPath };
}

if (require.main === module) {
  const { analysis, outputPath } = writeSamsungGapReport();
  console.log(`Samsung gap report written: ${outputPath}`);
  console.log(JSON.stringify(analysis.summary, null, 2));
}

module.exports = {
  BUCKETS,
  analyzeSamsungGapsData,
  classifyFailure,
  renderSamsungGapReport,
  writeSamsungGapReport
};
