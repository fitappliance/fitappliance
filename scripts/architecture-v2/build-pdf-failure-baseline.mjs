#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { architectureV2Paths } from '../../src/domain/architecture-v2-paths.mjs';
import { buildPdfFailureBaseline } from '../../src/domain/pdf-failure-baseline.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const reportPath = join(root, 'docs/architecture-v2/pdf-failure-baseline-100.md');
const inputPaths = {
  queue: architectureV2Paths.historicalEvidenceRecoveryQueue,
  sourceDocuments: architectureV2Paths.sourceDocuments,
  mineruAudit: architectureV2Paths.historicalMineruBackfillAudit,
  evidenceObjectIndex: architectureV2Paths.evidenceObjectIndex,
};

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function markdownTable(rows) {
  return rows.map((row) => `| ${row.join(' | ')} |`).join('\n');
}

const rawInputs = Object.fromEntries(await Promise.all(
  Object.entries(inputPaths).map(async ([key, path]) => [key, await readFile(join(root, path), 'utf8')]),
));
const parsedInputs = Object.fromEntries(
  Object.entries(rawInputs).map(([key, source]) => [key, JSON.parse(source)]),
);
const baseline = buildPdfFailureBaseline({
  ...parsedInputs,
  inputHashes: Object.fromEntries(Object.entries(rawInputs).map(([key, source]) => [key, sha256(source)])),
});
const serialized = `${JSON.stringify(baseline, null, 2)}\n`;
const artifactSha256 = sha256(serialized);
const outputPath = join(root, architectureV2Paths.pdfFailureBaseline100);
const shaPath = join(root, architectureV2Paths.pdfFailureBaseline100Sha256);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, serialized);
await writeFile(shaPath, `${artifactSha256}  pdf-failure-baseline-100.json\n`);

const categoryRows = Object.entries(baseline.summary.byCategory).map(([category, count]) => [category, count]);
const layerRows = Object.entries(baseline.summary.byPrimaryLayer).map(([layer, count]) => [layer, count]);
const familyRows = baseline.familyBacklog.topFive.map((family, index) => [
  index + 1,
  family.familyId,
  family.category,
  family.brand,
  family.sourceFamilyHint,
  family.candidateTargets,
  family.acquiredSampleDocuments,
]);
const report = `# PDF Failure Baseline: 100 Stratified Candidates

**Built:** ${baseline.builtOn}

**Artifact SHA-256:** \`${artifactSha256}\`
**Parser mutations during baseline:** ${baseline.parserMutationCount}

## Scope

This is a frozen diagnostic baseline, not a parser acceptance result. It selects 25
recovery candidates from each of the four appliance categories and assigns exactly one
primary failure: the first pipeline layer that does not have durable evidence.

The current recovery queue mostly contains legacy source references without immutable
PDF hashes. A URL path can supply a family hint, but it does not prove whether a PDF is
scanned, tabular, multi-model or diagram-only. Those characteristics remain unconfirmed
until acquisition and MinerU indexing succeed.

## Selection

${markdownTable([
  ['Category', 'Candidates'],
  ['---', '---:'],
  ...categoryRows,
])}

- Total candidates: **${baseline.summary.total}**
- Distinct brands: **${baseline.summary.distinctBrands}**
- Distinct source hosts: **${baseline.summary.distinctSourceHosts}**
- Distinct acquisition routes: **${baseline.summary.distinctAcquisitionRoutes}**
- Existing immutable PDF objects in the sample: **${baseline.summary.acquiredObjects}**
- Policy-compatible MinerU objects in the sample: **${baseline.summary.mineruIndexedObjects}**

## Primary Failure

${markdownTable([
  ['First failed layer', 'Candidates'],
  ['---', '---:'],
  ...layerRows,
])}

This distribution means parser-rule work is not yet the first operation for most of the
sample. The source PDF must be acquired, hashed and validated before document layout or
axis semantics can be diagnosed. Existing acquired objects continue to the first later
unclosed layer rather than being counted as acquisition failures.

## Candidate Families

${markdownTable([
  ['Rank', 'Family', 'Category', 'Brand', 'URL hint', 'Candidate upper bound', 'Acquired sample PDFs'],
  ['---:', '---', '---', '---', '---', '---:', '---:'],
  ...familyRows,
])}

The candidate count is only an upper bound. A family becomes eligible for a shared parser
rule after acquisition and replay demonstrate at least
${baseline.familyBacklog.eligibilityThresholdExactModelReceipts} exact-model receipts from
one reusable change. URL similarity alone does not approve a parser rule.

## Next Gate

1. Acquire and content-address the selected candidates without changing extraction rules.
2. Re-run this baseline to expose MinerU, association, identity and geometry failures.
3. Confirm document patterns from MinerU regions, not filenames.
4. Approve only families whose projected recovery is at least ten exact-model receipts.
`;
await writeFile(reportPath, report);

process.stdout.write(`${JSON.stringify({
  outputPath: architectureV2Paths.pdfFailureBaseline100,
  reportPath: 'docs/architecture-v2/pdf-failure-baseline-100.md',
  artifactSha256,
  summary: baseline.summary,
  topFiveFamilies: baseline.familyBacklog.topFive.map(({ familyId }) => familyId),
}, null, 2)}\n`);
