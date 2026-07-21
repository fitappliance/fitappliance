import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildEvidenceProcessorEpochs,
  EVIDENCE_PROCESSOR_IMPLEMENTATION_PATHS,
  historicalAttemptProcessorCapability,
  legacyEvidenceProcessorEpoch,
} from '../../src/domain/evidence-processor-epoch.mjs';
import { BEKO_AU_PRODUCT_DIMENSIONS_CAPABILITY } from '../../src/domain/beko-product-page-dimensions.mjs';
import { BEKO_AU_PRODUCT_IDENTITY_CAPABILITY } from '../../src/domain/beko-product-page-identity.mjs';
import { SMEG_AU_TECHSPEC_PDF_DIMENSIONS_CAPABILITY } from '../../src/domain/smeg-pdf-dimensions.mjs';

const implementationPaths = [...new Set(Object.values(EVIDENCE_PROCESSOR_IMPLEMENTATION_PATHS).flat())];

test('Beko AU claim parser capability is exact to brand, route, and failure class', () => {
  const sourceUrl = 'https://www.beko.com/au-en/home-appliances/fridge-freezer/example-bbm450x';
  assert.equal(historicalAttemptProcessorCapability({
    brand: 'Beko', sourceUrl, failureCode: 'claim_semantics',
  }), BEKO_AU_PRODUCT_DIMENSIONS_CAPABILITY);
  assert.equal(historicalAttemptProcessorCapability({
    brand: 'Beko', sourceUrl, failureCode: 'identity',
  }), BEKO_AU_PRODUCT_IDENTITY_CAPABILITY);
  assert.equal(historicalAttemptProcessorCapability({
    brand: 'Example', sourceUrl, failureCode: 'claim_semantics',
  }), null);
  assert.equal(historicalAttemptProcessorCapability({
    brand: 'Beko', sourceUrl: 'https://www.beko.com/content/manual.pdf', failureCode: 'claim_semantics',
  }), null);
});

test('processor epoch changes only when its bounded implementation changes', () => {
  const files = new Map(implementationPaths.map((path) => [path, `first:${path}`]));
  const first = buildEvidenceProcessorEpochs(files);
  const same = buildEvidenceProcessorEpochs(new Map(files));
  const changedFiles = new Map(files);
  changedFiles.set('src/domain/beko-product-page-dimensions.mjs', 'changed');
  const changed = buildEvidenceProcessorEpochs(changedFiles);
  assert.equal(first[BEKO_AU_PRODUCT_DIMENSIONS_CAPABILITY], same[BEKO_AU_PRODUCT_DIMENSIONS_CAPABILITY]);
  assert.notEqual(first[BEKO_AU_PRODUCT_DIMENSIONS_CAPABILITY], changed[BEKO_AU_PRODUCT_DIMENSIONS_CAPABILITY]);
  assert.equal(first[BEKO_AU_PRODUCT_IDENTITY_CAPABILITY], changed[BEKO_AU_PRODUCT_IDENTITY_CAPABILITY]);
  assert.notEqual(legacyEvidenceProcessorEpoch({
    capability: BEKO_AU_PRODUCT_DIMENSIONS_CAPABILITY, toolchainSha256: 'a'.repeat(64),
  }), first[BEKO_AU_PRODUCT_DIMENSIONS_CAPABILITY]);
});

test('Smeg AU PDF capability is exact to brand, Techspec route, and MinerU failure class', () => {
  const sourceUrl = 'https://sys.smeg.com.au/Product/Techspecs/DWAI6314X.pdf';
  assert.equal(historicalAttemptProcessorCapability({
    brand: 'Smeg', sourceUrl, failureCode: 'mineru',
  }), SMEG_AU_TECHSPEC_PDF_DIMENSIONS_CAPABILITY);
  assert.equal(historicalAttemptProcessorCapability({
    brand: 'Smeg', sourceUrl, failureCode: 'identity',
  }), null);
  assert.equal(historicalAttemptProcessorCapability({
    brand: 'Example', sourceUrl, failureCode: 'mineru',
  }), null);
  assert.equal(historicalAttemptProcessorCapability({
    brand: 'Smeg', sourceUrl: 'https://sys.smeg.com.au/Manuals/DWAI6314X.pdf', failureCode: 'mineru',
  }), null);
});

test('changing the Smeg parser changes only the Smeg processor epoch', () => {
  const files = new Map(implementationPaths.map((path) => [path, `first:${path}`]));
  const first = buildEvidenceProcessorEpochs(files);
  const changedFiles = new Map(files);
  changedFiles.set('src/domain/smeg-pdf-dimensions.mjs', 'changed');
  const changed = buildEvidenceProcessorEpochs(changedFiles);

  assert.notEqual(
    first[SMEG_AU_TECHSPEC_PDF_DIMENSIONS_CAPABILITY],
    changed[SMEG_AU_TECHSPEC_PDF_DIMENSIONS_CAPABILITY],
  );
  assert.equal(
    first[BEKO_AU_PRODUCT_DIMENSIONS_CAPABILITY],
    changed[BEKO_AU_PRODUCT_DIMENSIONS_CAPABILITY],
  );
  assert.equal(
    first[BEKO_AU_PRODUCT_IDENTITY_CAPABILITY],
    changed[BEKO_AU_PRODUCT_IDENTITY_CAPABILITY],
  );
});
