import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildEvidenceProcessorEpochs,
  CLAIM_PARSER_IMPLEMENTATION_PATHS,
  EVIDENCE_PROCESSOR_IMPLEMENTATION_PATHS,
  historicalAttemptProcessorCapability,
  legacyEvidenceProcessorEpoch,
  SAMSUNG_AU_RF71A_SUPPORT_FAMILY_CAPABILITY,
} from '../../src/domain/evidence-processor-epoch.mjs';
import {
  HISTORICAL_EVIDENCE_EPOCH_DEFINITIONS,
} from '../../src/domain/historical-evidence-epoch-definitions.mjs';
import { BEKO_AU_PRODUCT_DIMENSIONS_CAPABILITY } from '../../src/domain/beko-product-page-dimensions.mjs';
import { BEKO_AU_PRODUCT_IDENTITY_CAPABILITY } from '../../src/domain/beko-product-page-identity.mjs';
import {
  ESATTO_AU_DISHWASHER_PRODUCT_CARD_DIMENSIONS_CAPABILITY,
  ESATTO_AU_PRODUCT_CARD_DIMENSIONS_CAPABILITY,
  OMEGA_AU_PRODUCT_CARD_DIMENSIONS_CAPABILITY,
} from '../../src/domain/mineru-document.mjs';
import {
  MIELE_AU_PRODUCT_MATERIAL_IDENTITY_CAPABILITY,
} from '../../src/domain/official-product-material-discovery-evidence.mjs';
import { SMEG_AU_TECHSPEC_PDF_DIMENSIONS_CAPABILITY } from '../../src/domain/smeg-pdf-dimensions.mjs';

const implementationPaths = [...new Set(Object.values(EVIDENCE_PROCESSOR_IMPLEMENTATION_PATHS).flat())];

test('scale parser epoch covers every claim parser implementation file', () => {
  const parserEpoch = HISTORICAL_EVIDENCE_EPOCH_DEFINITIONS.find(([id]) => id === 'parser');
  assert.ok(parserEpoch, 'parser epoch definition required');
  const parserEpochPaths = new Set(parserEpoch[2]);
  for (const path of CLAIM_PARSER_IMPLEMENTATION_PATHS) {
    assert.ok(parserEpochPaths.has(path), `parser epoch missing claim parser input: ${path}`);
  }
});

test('claim parser and resolver epochs include transitive evidence implementations', () => {
  for (const path of [
    'src/domain/evidence-source-companion-policy.mjs',
    'src/domain/official-product-page-discovery-evidence.mjs',
    'src/domain/official-product-material-discovery-evidence.mjs',
  ]) {
    assert.ok(CLAIM_PARSER_IMPLEMENTATION_PATHS.includes(path), `claim parser missing dependency: ${path}`);
  }
  const resolverEpoch = HISTORICAL_EVIDENCE_EPOCH_DEFINITIONS.find(([id]) => id === 'resolver-contract');
  assert.ok(resolverEpoch, 'resolver-contract epoch definition required');
  assert.ok(
    resolverEpoch[2].includes('scripts/pdf-pipeline/samsung-official.js'),
    'resolver-contract epoch missing Samsung implementation',
  );
  assert.ok(
    resolverEpoch[2].includes('scripts/pdf-pipeline/smeg-official.js'),
    'resolver-contract epoch missing Smeg implementation',
  );
  assert.ok(
    resolverEpoch[2].includes('scripts/architecture-v2/run-historical-evidence-recovery.mjs'),
    'resolver-contract epoch missing shared resolver option wiring',
  );
});

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

test('Samsung AU support-family capability reopens only exact official UM parser failures', () => {
  const sourceUrl = 'https://org.downloadcenter.samsung.com/downloadfile/ContentsFile.aspx?CDSite=UNI_AU&ModelName=SRF9700BFH&CttFileID=8134461&CDCttType=UM&VPath=UM%2F202105%2F20210513095755777%2FDA68-04024C-00_MANUAL_USERS_F-Hub_EN.pdf';
  for (const failureCode of ['identity', 'claim_semantics', 'mineru']) {
    assert.equal(historicalAttemptProcessorCapability({
      brand: 'Samsung', model: 'SRF9700BFH', category: 'fridge', sourceUrl, failureCode,
    }), SAMSUNG_AU_RF71A_SUPPORT_FAMILY_CAPABILITY);
  }
  assert.equal(historicalAttemptProcessorCapability({
    brand: 'Samsung',
    model: 'SRF9700BFH',
    category: 'fridge',
    sourceUrl: sourceUrl.replace('CDCttType=UM', 'CDCttType=PM'),
    failureCode: 'identity',
  }), null);
  assert.equal(historicalAttemptProcessorCapability({
    brand: 'Other', model: 'SRF9700BFH', category: 'fridge', sourceUrl, failureCode: 'identity',
  }), null);
  assert.equal(historicalAttemptProcessorCapability({
    brand: 'Samsung', model: 'WW12BB944DGB', category: 'washing_machine',
    sourceUrl: sourceUrl
      .replaceAll('SRF9700BFH', 'WW12BB944DGB')
      .replace('DA68-04024C-00_MANUAL_USERS_F-Hub_EN.pdf', 'DC68-04464A-02_IB_WASHER_EN.pdf'),
    failureCode: 'identity',
  }), null);
  assert.equal(historicalAttemptProcessorCapability({
    brand: 'Samsung', model: 'SRF9400BFH', category: 'fridge',
    sourceUrl: sourceUrl
      .replaceAll('SRF9700BFH', 'SRF9400BFH')
      .replace('DA68-04024C-00_MANUAL_USERS_F-Hub_EN.pdf', 'OID74664-05_T-TYPE_RF9000D_EN.pdf'),
    failureCode: 'identity',
  }), null);
  assert.equal(historicalAttemptProcessorCapability({
    brand: 'Samsung', model: 'SRF9700BFH', category: 'dishwasher', sourceUrl,
    failureCode: 'identity',
  }), null);
  assert.equal(historicalAttemptProcessorCapability({
    brand: 'Samsung', model: 'SRF9700BFH', category: 'fridge',
    sourceUrl: sourceUrl.replace('ModelName=SRF9700BFH', 'ModelName=SRF9700BFHXX'),
    failureCode: 'identity',
  }), null);
  assert.ok(EVIDENCE_PROCESSOR_IMPLEMENTATION_PATHS[
    SAMSUNG_AU_RF71A_SUPPORT_FAMILY_CAPABILITY
  ].includes('src/domain/official-product-page-discovery-evidence.mjs'));
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

test('Esatto ProductCard capability is exact to the official PDF route and MinerU failures', () => {
  const sourceUrl = 'https://esatto.house/s/Esatto_ProductCard_EDW7CS.pdf';
  assert.equal(historicalAttemptProcessorCapability({
    brand: 'Esatto', sourceUrl, failureCode: 'mineru',
  }), ESATTO_AU_DISHWASHER_PRODUCT_CARD_DIMENSIONS_CAPABILITY);
  assert.equal(historicalAttemptProcessorCapability({
    brand: 'Esatto', sourceUrl, failureCode: 'identity',
  }), null);
  assert.equal(historicalAttemptProcessorCapability({
    brand: 'Other', sourceUrl, failureCode: 'mineru',
  }), null);
  assert.equal(historicalAttemptProcessorCapability({
    brand: 'Esatto',
    sourceUrl: 'https://esatto.house/s/EDW7CS_UserManual_V30_0223.pdf',
    failureCode: 'mineru',
  }), null);
  assert.equal(historicalAttemptProcessorCapability({
    brand: 'Esatto',
    sourceUrl: 'https://static1.squarespace.com/static/example/Esatto_ProductCard_EDW7CS.pdf',
    failureCode: 'mineru',
  }), null);
  assert.equal(historicalAttemptProcessorCapability({
    brand: 'Esatto',
    sourceUrl: 'https://esatto.house/s/Esatto_ProductCard_%ZZ.pdf',
    failureCode: 'mineru',
  }), null);
});

test('changing MinerU changes the bounded Esatto ProductCard processor epoch', () => {
  const files = new Map(implementationPaths.map((path) => [path, `first:${path}`]));
  const first = buildEvidenceProcessorEpochs(files);
  const changedFiles = new Map(files);
  changedFiles.set('src/domain/mineru-document.mjs', 'changed');
  const changed = buildEvidenceProcessorEpochs(changedFiles);

  assert.notEqual(
    first[ESATTO_AU_DISHWASHER_PRODUCT_CARD_DIMENSIONS_CAPABILITY],
    changed[ESATTO_AU_DISHWASHER_PRODUCT_CARD_DIMENSIONS_CAPABILITY],
  );
  assert.equal(
    first[BEKO_AU_PRODUCT_DIMENSIONS_CAPABILITY],
    changed[BEKO_AU_PRODUCT_DIMENSIONS_CAPABILITY],
  );
});

test('Esatto AU ProductCard v2 capability accepts bounded Squarespace suffixes across categories', () => {
  const sourceUrl = 'https://esatto.house/s/Esatto_ProductCard-EUF172W-m95s.pdf';
  assert.equal(historicalAttemptProcessorCapability({
    brand: 'Esatto', sourceUrl, failureCode: 'mineru',
  }), ESATTO_AU_PRODUCT_CARD_DIMENSIONS_CAPABILITY);
  assert.equal(historicalAttemptProcessorCapability({
    brand: 'Esatto', sourceUrl, failureCode: 'identity',
  }), null);
  assert.equal(historicalAttemptProcessorCapability({
    brand: 'Other', sourceUrl, failureCode: 'mineru',
  }), null);
  assert.equal(historicalAttemptProcessorCapability({
    brand: 'Esatto',
    sourceUrl: 'https://static1.squarespace.com/static/example/Esatto_ProductCard-EUF172W-m95s.pdf',
    failureCode: 'mineru',
  }), null);
  assert.equal(historicalAttemptProcessorCapability({
    brand: 'Esatto',
    sourceUrl: 'https://esatto.house/s/EUF172W_EUF172S_UserManual_V20.pdf',
    failureCode: 'mineru',
  }), null);
});

test('changing MinerU changes the cross-category Esatto ProductCard processor epoch', () => {
  const files = new Map(implementationPaths.map((path) => [path, `first:${path}`]));
  const first = buildEvidenceProcessorEpochs(files);
  const changedFiles = new Map(files);
  changedFiles.set('src/domain/mineru-document.mjs', 'changed');
  const changed = buildEvidenceProcessorEpochs(changedFiles);

  assert.notEqual(
    first[ESATTO_AU_PRODUCT_CARD_DIMENSIONS_CAPABILITY],
    changed[ESATTO_AU_PRODUCT_CARD_DIMENSIONS_CAPABILITY],
  );
  assert.equal(
    first[BEKO_AU_PRODUCT_DIMENSIONS_CAPABILITY],
    changed[BEKO_AU_PRODUCT_DIMENSIONS_CAPABILITY],
  );
});

test('Omega AU ProductCard capability is exact to the official spec-sheet route and MinerU failures', () => {
  const sourceUrl = 'https://omegaappliances.com.au/s/ODW101W_Specsheet_40.pdf';
  assert.equal(historicalAttemptProcessorCapability({
    brand: 'Omega', sourceUrl, failureCode: 'mineru',
  }), OMEGA_AU_PRODUCT_CARD_DIMENSIONS_CAPABILITY);
  assert.equal(historicalAttemptProcessorCapability({
    brand: 'Omega', sourceUrl, failureCode: 'identity',
  }), null);
  assert.equal(historicalAttemptProcessorCapability({
    brand: 'Other', sourceUrl, failureCode: 'mineru',
  }), null);
  assert.equal(historicalAttemptProcessorCapability({
    brand: 'Omega',
    sourceUrl: 'https://omegaappliances.com.au/s/ODW101W_V21_FA_0523-9dbx.pdf',
    failureCode: 'mineru',
  }), null);
  assert.equal(historicalAttemptProcessorCapability({
    brand: 'Omega',
    sourceUrl: 'https://static1.squarespace.com/static/example/ODW101W_Specsheet_40.pdf',
    failureCode: 'mineru',
  }), null);
});

test('changing MinerU changes the bounded Omega ProductCard processor epoch', () => {
  const files = new Map(implementationPaths.map((path) => [path, `first:${path}`]));
  const first = buildEvidenceProcessorEpochs(files);
  const changedFiles = new Map(files);
  changedFiles.set('src/domain/mineru-document.mjs', 'changed');
  const changed = buildEvidenceProcessorEpochs(changedFiles);

  assert.notEqual(
    first[OMEGA_AU_PRODUCT_CARD_DIMENSIONS_CAPABILITY],
    changed[OMEGA_AU_PRODUCT_CARD_DIMENSIONS_CAPABILITY],
  );
  assert.equal(
    first[BEKO_AU_PRODUCT_DIMENSIONS_CAPABILITY],
    changed[BEKO_AU_PRODUCT_DIMENSIONS_CAPABILITY],
  );
});

test('Miele AU material-bound identity capability is exact to the official specs route', () => {
  const sourceUrl = 'https://www.miele.com.au/media/ex/au/specsheets/12531610.pdf';
  assert.equal(historicalAttemptProcessorCapability({
    brand: 'Miele', sourceUrl, failureCode: 'identity',
  }), MIELE_AU_PRODUCT_MATERIAL_IDENTITY_CAPABILITY);
  assert.equal(historicalAttemptProcessorCapability({
    brand: 'Miele', sourceUrl, failureCode: 'mineru',
  }), MIELE_AU_PRODUCT_MATERIAL_IDENTITY_CAPABILITY);
  assert.equal(historicalAttemptProcessorCapability({
    brand: 'Miele', sourceUrl, failureCode: 'claim_semantics',
  }), MIELE_AU_PRODUCT_MATERIAL_IDENTITY_CAPABILITY);
  assert.equal(historicalAttemptProcessorCapability({
    brand: 'Other', sourceUrl, failureCode: 'identity',
  }), null);
  assert.equal(historicalAttemptProcessorCapability({
    brand: 'Miele',
    sourceUrl: 'https://shop.miele.com.au/en/kitchen/dishwashers/example/',
    failureCode: 'identity',
  }), null);
});

test('changing the Miele product-material verifier changes only its identity epoch', () => {
  const files = new Map(implementationPaths.map((path) => [path, `first:${path}`]));
  const first = buildEvidenceProcessorEpochs(files);
  const changedFiles = new Map(files);
  changedFiles.set('src/domain/official-product-material-discovery-evidence.mjs', 'changed');
  const changed = buildEvidenceProcessorEpochs(changedFiles);

  assert.notEqual(
    first[MIELE_AU_PRODUCT_MATERIAL_IDENTITY_CAPABILITY],
    changed[MIELE_AU_PRODUCT_MATERIAL_IDENTITY_CAPABILITY],
  );
  assert.equal(
    first[BEKO_AU_PRODUCT_DIMENSIONS_CAPABILITY],
    changed[BEKO_AU_PRODUCT_DIMENSIONS_CAPABILITY],
  );
  assert.equal(
    first[SMEG_AU_TECHSPEC_PDF_DIMENSIONS_CAPABILITY],
    changed[SMEG_AU_TECHSPEC_PDF_DIMENSIONS_CAPABILITY],
  );

  const changedMineruFiles = new Map(files);
  changedMineruFiles.set('src/domain/mineru-document.mjs', 'changed');
  const changedMineru = buildEvidenceProcessorEpochs(changedMineruFiles);
  assert.notEqual(
    first[MIELE_AU_PRODUCT_MATERIAL_IDENTITY_CAPABILITY],
    changedMineru[MIELE_AU_PRODUCT_MATERIAL_IDENTITY_CAPABILITY],
  );
});
