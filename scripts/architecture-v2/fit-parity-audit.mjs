#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { evaluateFit } from '../../src/domain/fit-decision.mjs';

const root = resolve(new URL('../..', import.meta.url).pathname);
const catalog = JSON.parse(await readFile(resolve(root, 'public/data/appliances.json'), 'utf8'));
const widths = [540, 580, 600, 620, 640, 700, 800, 900];
const mismatches = [];
let comparisons = 0;
for (const product of catalog.products) {
  if (![product.w, product.h, product.d].every((value) => Number.isFinite(value) && value > 0)) continue;
  for (const widthMm of widths) {
    comparisons += 1;
    const legacyFits = widthMm - (product.w + 10) >= 0;
    const decision = evaluateFit({
      geometry: {
        closedEnvelope: { widthMm: product.w, heightMm: { minimumMm: product.h, maximumMm: product.h }, depthMm: product.d },
        installation: { leftMm: 5, rightMm: 5, topMm: 20, rearMm: 10, frontMm: 0 },
      },
      cavity: { widthMm, heightMm: product.h + 20, depthMm: product.d + 10 },
      evidenceLevel: 'none', advisoryChecks: [],
    });
    const v2Fits = decision.outcome !== 'NO_FIT';
    if (legacyFits !== v2Fits) mismatches.push({ legacyId: product.id, widthMm, legacyFits, v2Outcome: decision.outcome });
  }
}
const report = {
  generatedAt: catalog.last_updated ?? null, comparisonScope: 'legacy fit-check width semantics only',
  comparisons, mismatches: mismatches.length, classifications: { legacyDefect: 0, v2Defect: 0, evidenceDifference: 0, intentionalSemanticChange: 0 },
  mismatchSamples: mismatches.slice(0, 100),
};
await writeFile(resolve(root, 'reports/architecture-v2/fit-parity.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ comparisons, mismatches: mismatches.length }));
