import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';

import { strToU8, zipSync } from 'fflate';

import {
  buildProviderExistingGeometryClaims,
  buildProviderKnownModelCatalogue,
  parseAndQuarantineProviderResponse,
  persistQuarantinedProviderResponse,
} from '../../src/domain/provider-response-quarantine.mjs';
import {
  buildProviderShadowAcceptance,
  persistProviderShadowAcceptance,
} from '../../src/domain/provider-response-shadow-acceptance.mjs';

const RIGHTS_BYTES = Buffer.from('Example provider written cache and display grant, 2026-07-28.');
const HASH = createHash('sha256').update(RIGHTS_BYTES).digest('hex');
const RIGHTS_EVIDENCE = Object.freeze([{ contentSha256: HASH, bytes: RIGHTS_BYTES }]);
const execFileAsync = promisify(execFile);
const PROVIDER = Object.freeze({
  organizationId: 'example-appliances-australia',
  providerId: 'example-appliances',
  sourceId: 'sample-export-2026-07-28',
  receivedAt: '2026-07-28T09:30:00.000Z',
});
const KNOWN_MODELS = Object.freeze([{ category: 'dishwasher', brand: 'Example', model: 'EXD600AU' }]);
const MAPPING = Object.freeze({
  sheetName: 'Products',
  headerRow: 1,
  columns: [
    {
      source: 'Category',
      fieldId: 'identity.category',
      valueMap: { Dishwasher: 'dishwasher' },
    },
    { source: 'Brand', fieldId: 'identity.brand' },
    { source: 'Model', fieldId: 'identity.model' },
    { source: 'GTIN', fieldId: 'identity.gtin' },
    { source: 'Market', fieldId: 'identity.market', role: 'market', acceptedValues: ['AU', 'Australia'] },
    {
      source: 'Product Width (mm)',
      fieldId: 'closedEnvelope.widthMm',
      axis: 'width',
      unit: 'mm',
      sourceScope: 'product_closed',
    },
    {
      source: 'Product Height (mm)',
      fieldId: 'closedEnvelope.heightMm',
      axis: 'height',
      unit: 'mm',
      sourceScope: 'product_closed',
    },
    {
      source: 'Product Depth (mm)',
      fieldId: 'closedEnvelope.depthMm',
      axis: 'depth',
      unit: 'mm',
      sourceScope: 'product_closed',
    },
    {
      source: 'Carton Width (mm)',
      fieldId: 'packagedEnvelope.widthMm',
      axis: 'width',
      unit: 'mm',
      sourceScope: 'package',
    },
  ],
});

const ROW = Object.freeze({
  Category: 'Dishwasher',
  Brand: 'Example',
  Model: 'EXD600AU',
  GTIN: '09312345678901',
  Market: 'AU',
  'Product Width (mm)': 598,
  'Product Height (mm)': 820,
  'Product Depth (mm)': 570,
  'Carton Width (mm)': 645,
});

function rightsFor(mapping = MAPPING, overrides = []) {
  const decisions = [];
  for (const { fieldId } of mapping.columns.filter((column) => column.fieldId)) {
    for (const actionId of ['cache_source', 'cache_normalized_fields', 'public_display']) {
      decisions.push({
        providerId: PROVIDER.providerId,
        sourceId: PROVIDER.sourceId,
        fieldId,
        actionId,
        decision: 'granted',
        evidenceSha256: HASH,
      });
    }
  }
  for (const override of overrides) {
    const index = decisions.findIndex((item) => (
      item.fieldId === override.fieldId && item.actionId === override.actionId
    ));
    if (index >= 0) decisions[index] = { ...decisions[index], ...override };
  }
  return { decisions };
}

function csvBytes(row = ROW) {
  const headers = Object.keys(row);
  const values = headers.map((header) => String(row[header]));
  return Buffer.from(`${headers.join(',')}\n${values.join(',')}\n`);
}

function jsonBytes(row = ROW) {
  return Buffer.from(JSON.stringify({ rows: [row] }));
}

function xmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function columnName(index) {
  let value = index + 1;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function worksheetXml(row = ROW, { headerRow = 1 } = {}) {
  const headers = Object.keys(row);
  const dataRow = headerRow + 1;
  const headerCells = headers.map((value, index) => (
    `<c r="${columnName(index)}${headerRow}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`
  )).join('');
  const dataCells = headers.map((header, index) => {
    const value = row[header];
    const ref = `${columnName(index)}${dataRow}`;
    return typeof value === 'number'
      ? `<c r="${ref}"><v>${value}</v></c>`
      : `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData><row r="${headerRow}">${headerCells}</row><row r="${dataRow}">${dataCells}</row></sheetData>
</worksheet>`;
}

function xlsxBytes(row = ROW, { formula = false, macro = false, headerRow = 1 } = {}) {
  let sheet = worksheetXml(row, { headerRow });
  if (formula) {
    const widthColumn = columnName(Object.keys(row).indexOf('Product Width (mm)'));
    const widthRef = `${widthColumn}${headerRow + 1}`;
    sheet = sheet.replace(
      `<c r="${widthRef}"><v>598</v></c>`,
      `<c r="${widthRef}"><f>SUM(500,98)</f><v>598</v></c>`,
    );
  }
  const entries = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Products" sheetId="1" r:id="rId1"/></sheets>
</workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`),
    'xl/worksheets/sheet1.xml': strToU8(sheet),
  };
  if (macro) entries['xl/vbaProject.bin'] = new Uint8Array([1, 2, 3]);
  return Buffer.from(zipSync(entries));
}

function withOversizedCentralEntry(bytes) {
  const result = Buffer.from(bytes);
  for (let offset = result.length - 46; offset >= 0; offset -= 1) {
    if (result.readUInt32LE(offset) === 0x02014b50) {
      result.writeUInt32LE((25 * 1024 * 1024) + 1, offset + 24);
      return result;
    }
  }
  throw new Error('test XLSX central directory not found');
}

async function ingest(format, bytes, overrides = {}) {
  return parseAndQuarantineProviderResponse({
    ...PROVIDER,
    format,
    bytes,
    fileName: `sample.${format}`,
    schemaMapping: MAPPING,
    rights: rightsFor(),
    rightsEvidence: RIGHTS_EVIDENCE,
    knownModels: KNOWN_MODELS,
    ...overrides,
  });
}

function comparableClaims(result) {
  return result.claims.map(({ fieldId, normalizedValue, originalUnit, identity, market, scope, axis }) => ({
    fieldId,
    normalizedValue,
    originalUnit,
    identity,
    market,
    scope,
    axis,
  }));
}

test('provider identity catalogue combines current and historical exact models without alias collapse', () => {
  const catalogue = buildProviderKnownModelCatalogue({
    currentProjection: {
      products: [
        { cat: 'dishwasher', brand: 'Example', model: 'EXD600AU' },
        { cat: 'dishwasher', brand: 'Example', model: 'EXD600A' },
      ],
    },
    historicalClassification: {
      records: [
        { category: 'dishwasher', canonicalBrand: 'Example', model: 'EXD600AU' },
        { category: 'fridge', canonicalBrand: 'Legacy', model: 'OLD100' },
      ],
    },
  });

  assert.deepEqual(catalogue, [
    { category: 'dishwasher', brand: 'Example', model: 'EXD600A' },
    { category: 'dishwasher', brand: 'Example', model: 'EXD600AU' },
    { category: 'fridge', brand: 'Legacy', model: 'OLD100' },
  ]);
});

test('current catalogue W/H/D become automatic conflict claims, not provider truth', () => {
  const claims = buildProviderExistingGeometryClaims({
    currentProjection: {
      products: [{
        cat: 'dishwasher',
        brand: 'Example',
        model: 'EXD600AU',
        w: 598,
        h: 820,
        d: 570,
      }],
    },
  });

  assert.deepEqual(claims.map(({ fieldId, normalizedValue, authority }) => ({
    fieldId,
    normalizedValue,
    authority,
  })), [
    { fieldId: 'closedEnvelope.widthMm', normalizedValue: 598, authority: 'existing_value_requires_evidence_comparison' },
    { fieldId: 'closedEnvelope.heightMm', normalizedValue: 820, authority: 'existing_value_requires_evidence_comparison' },
    { fieldId: 'closedEnvelope.depthMm', normalizedValue: 570, authority: 'existing_value_requires_evidence_comparison' },
  ]);
});

test('repository current and historical catalogues form a non-empty exact identity allowlist', async () => {
  const [currentProjection, historicalClassification] = await Promise.all([
    readFile('data/architecture-v2/generated/public-catalog-projection.json', 'utf8').then(JSON.parse),
    readFile('data/architecture-v2/generated/historical-model-evidence-classification.json', 'utf8').then(JSON.parse),
  ]);
  const catalogue = buildProviderKnownModelCatalogue({ currentProjection, historicalClassification });

  assert.ok(catalogue.length >= historicalClassification.records.length);
  assert.equal(new Set(catalogue.map(({ category, brand, model }) => (
    `${category}\0${brand.toUpperCase()}\0${model.toUpperCase()}`
  ))).size, catalogue.length);
});

test('equivalent CSV, JSON, and XLSX samples produce identical quarantined shadow claims', async () => {
  const results = await Promise.all([
    ingest('csv', csvBytes()),
    ingest('json', jsonBytes()),
    ingest('xlsx', xlsxBytes()),
  ]);

  for (const result of results) {
    assert.equal(result.status, 'QUARANTINED_CANDIDATES');
    assert.equal(result.publicationEligible, false);
    assert.equal(result.fitEligible, false);
    assert.equal(result.publicProjection, null);
    assert.equal(result.claims.length, 5);
    assert.equal(result.rowDiagnostics[0].outcome, 'CANDIDATE');
  }
  assert.deepEqual(comparableClaims(results[0]), comparableClaims(results[1]));
  assert.deepEqual(comparableClaims(results[0]), comparableClaims(results[2]));
  assert.equal(results[0].claims[0].fieldId, 'identity.gtin');
  assert.equal(results[0].claims[0].normalizedValue, '09312345678901');
  assert.equal(results[0].claims.at(-1).fieldId, 'packagedEnvelope.widthMm');
  assert.equal(results[0].claims.at(-1).scope, 'package');
});

test('XLSX headerRow uses the actual sparse worksheet row number', async () => {
  const schemaMapping = { ...MAPPING, headerRow: 3 };
  const result = await ingest('xlsx', xlsxBytes(ROW, { headerRow: 3 }), {
    schemaMapping,
    rights: rightsFor(schemaMapping),
  });

  assert.equal(result.status, 'QUARANTINED_CANDIDATES');
  assert.equal(result.rowDiagnostics[0].rowNumber, 4);
  assert.equal(result.claims.length, 5);
});

test('provider model strings require an exact AU catalog identity and never collapse suffixes', async () => {
  const result = await ingest('json', jsonBytes({ ...ROW, Model: 'EXD600' }));

  assert.equal(result.status, 'IDENTITY_UNPROVEN');
  assert.deepEqual(result.claims, []);
  assert.equal(result.rowDiagnostics[0].inputModel, 'EXD600');
  assert.equal(result.rowDiagnostics[0].outputModel, null);
  assert.ok(result.rowDiagnostics[0].codes.includes('EXACT_MODEL_NOT_FOUND'));
});

test('non-Australian rows and absent market signals fail closed', async () => {
  const wrongMarket = await ingest('json', jsonBytes({ ...ROW, Market: 'NZ' }));
  assert.equal(wrongMarket.status, 'IDENTITY_UNPROVEN');
  assert.ok(wrongMarket.rowDiagnostics[0].codes.includes('AU_MARKET_NOT_PROVEN'));

  const mapping = {
    ...MAPPING,
    columns: MAPPING.columns.filter(({ role }) => role !== 'market'),
  };
  await assert.rejects(
    () => ingest('json', jsonBytes(), { schemaMapping: mapping, rights: rightsFor(mapping) }),
    /market mapping/i,
  );
});

test('the AU market gate must be mapped to a rights-bound identity field', async () => {
  const unboundMarketMapping = {
    ...MAPPING,
    columns: MAPPING.columns.map((mapping) => (
      mapping.role === 'market'
        ? { source: mapping.source, role: mapping.role, acceptedValues: mapping.acceptedValues }
        : mapping
    )),
  };

  await assert.rejects(
    () => ingest('csv', csvBytes(), {
      schemaMapping: unboundMarketMapping,
      rights: rightsFor(unboundMarketMapping),
    }),
    /identity\.market/i,
  );
});

test('unknown cache or display rights block all normalized candidates', async () => {
  for (const actionId of ['cache_source', 'cache_normalized_fields', 'public_display']) {
    const rights = rightsFor(MAPPING, [{
      fieldId: 'closedEnvelope.widthMm',
      actionId,
      decision: 'unknown',
    }]);
    const result = await ingest('csv', csvBytes(), { rights });
    assert.equal(result.status, 'RIGHTS_BLOCKED');
    assert.deepEqual(result.claims, []);
    assert.ok(result.rightsDiagnostics.some((item) => (
      item.fieldId === 'closedEnvelope.widthMm' && item.actionId === actionId
    )));
  }
});

test('a syntactically valid rights hash is blocked unless its original evidence bytes are supplied', async () => {
  const result = await ingest('csv', csvBytes(), { rightsEvidence: [] });

  assert.equal(result.status, 'RIGHTS_BLOCKED');
  assert.deepEqual(result.claims, []);
  assert.ok(result.rightsDiagnostics.every(({ decision }) => decision === 'missing_evidence_object'));
});

test('geometry mappings require explicit axis, unit, and matching product/package scope', async () => {
  const widthIndex = MAPPING.columns.findIndex(({ fieldId }) => fieldId === 'closedEnvelope.widthMm');
  for (const mutation of [
    { axis: undefined },
    { unit: undefined },
    { sourceScope: 'package' },
  ]) {
    const columns = MAPPING.columns.map((column, index) => (
      index === widthIndex ? { ...column, ...mutation } : column
    ));
    const mapping = { ...MAPPING, columns };
    await assert.rejects(
      () => ingest('json', jsonBytes(), { schemaMapping: mapping, rights: rightsFor(mapping) }),
      /axis|unit|scope/i,
    );
  }
});

test('conflicting values for one exact model and field are isolated from claims', async () => {
  const rows = [ROW, { ...ROW, 'Product Width (mm)': 600 }];
  const result = await ingest('json', Buffer.from(JSON.stringify({ rows })));

  assert.equal(result.status, 'QUARANTINED_WITH_CONFLICTS');
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].fieldId, 'closedEnvelope.widthMm');
  assert.deepEqual(result.conflicts[0].values, [598, 600]);
  assert.equal(result.claims.some(({ fieldId }) => fieldId === 'closedEnvelope.widthMm'), false);
});

test('provider dimensions conflicting with current catalogue geometry are isolated by default', async () => {
  const existingClaims = buildProviderExistingGeometryClaims({
    currentProjection: {
      products: [{
        cat: 'dishwasher',
        brand: 'Example',
        model: 'EXD600AU',
        w: 600,
        h: 820,
        d: 570,
      }],
    },
  });
  const result = await ingest('json', jsonBytes(), { existingClaims });

  assert.equal(result.status, 'QUARANTINED_WITH_CONFLICTS');
  assert.equal(result.conflicts[0].type, 'existing_catalog_mismatch');
  assert.equal(result.conflicts[0].fieldId, 'closedEnvelope.widthMm');
  assert.equal(result.claims.some(({ fieldId }) => fieldId === 'closedEnvelope.widthMm'), false);
});

test('malformed, formula-bearing, macro-enabled, and oversized inputs are rejected', async () => {
  await assert.rejects(() => ingest('json', Buffer.from('{bad')), /JSON/i);
  await assert.rejects(() => ingest('xlsx', xlsxBytes(ROW, { formula: true })), /formula/i);
  await assert.rejects(() => ingest('xlsx', xlsxBytes(ROW, { macro: true })), /macro/i);
  await assert.rejects(
    () => ingest('xlsx', withOversizedCentralEntry(xlsxBytes())),
    /uncompressed size limit/i,
  );
  await assert.rejects(
    () => ingest('csv', Buffer.alloc((10 * 1024 * 1024) + 1, 65)),
    /size limit/i,
  );
});

test('approved samples persist original bytes and a private receipt by content hash only', async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), 'fitappliance-provider-response-'));
  const bytes = csvBytes();
  const result = await ingest('csv', bytes);
  const persisted = await persistQuarantinedProviderResponse(storageRoot, bytes, result, {
    rightsEvidence: RIGHTS_EVIDENCE,
  });

  assert.match(persisted.contentSha256, /^[a-f0-9]{64}$/);
  assert.equal((await stat(persisted.sourcePath)).isFile(), true);
  assert.equal((await stat(persisted.receiptPath)).isFile(), true);
  assert.equal(persisted.rightsObjectPaths.length, 1);
  assert.deepEqual(await readFile(persisted.rightsObjectPaths[0]), RIGHTS_BYTES);
  assert.deepEqual(await readFile(persisted.sourcePath), bytes);
  const receipt = JSON.parse(await readFile(persisted.receiptPath, 'utf8'));
  assert.equal(receipt.contentSha256, persisted.contentSha256);
  assert.equal(receipt.publicationEligible, false);
  assert.equal(receipt.fitEligible, false);
  assert.equal(persisted.sourcePath.startsWith(join(storageRoot, 'outreach', 'provider-samples')), true);
});

test('rights-blocked samples cannot be persisted into the private evidence store', async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), 'fitappliance-provider-response-'));
  const rights = rightsFor(MAPPING, [{
    fieldId: 'identity.model',
    actionId: 'cache_source',
    decision: 'unknown',
  }]);
  const result = await ingest('csv', csvBytes(), { rights });

  await assert.rejects(
    () => persistQuarantinedProviderResponse(storageRoot, csvBytes(), result, {
      rightsEvidence: RIGHTS_EVIDENCE,
    }),
    /cache_source rights/i,
  );
});

test('partial rights and forged quarantine flags are rejected at the persistence boundary', async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), 'fitappliance-provider-response-'));
  const bytes = csvBytes();
  const partialRights = rightsFor(MAPPING, [{
    fieldId: 'identity.model',
    actionId: 'public_display',
    decision: 'unknown',
  }]);
  const blocked = await ingest('csv', bytes, { rights: partialRights });

  assert.equal(blocked.cacheSourceAuthorized, true);
  assert.equal(blocked.publicDisplayAuthorized, false);
  await assert.rejects(
    () => persistQuarantinedProviderResponse(storageRoot, bytes, blocked, {
      rightsEvidence: RIGHTS_EVIDENCE,
    }),
    /all provider response rights/i,
  );

  const valid = await ingest('csv', bytes);
  const forgedReports = [
    { ...valid, classification: 'public_provider_response' },
    { ...valid, originalBytesPreserved: true },
    { ...valid, publicationEligible: true },
    { ...valid, fitEligible: true },
    { ...valid, publicProjection: {} },
    { ...valid, providerId: 'different-provider' },
  ];
  for (const forged of forgedReports) {
    await assert.rejects(
      () => persistQuarantinedProviderResponse(storageRoot, bytes, forged, {
        rightsEvidence: RIGHTS_EVIDENCE,
      }),
      /private quarantine report/i,
    );
  }
});

test('CLI drill persists private objects while stdout remains Git-safe and row-free', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fitappliance-provider-cli-'));
  const storageRoot = join(root, 'storage');
  const samplePath = join(root, 'sample.csv');
  const rightsPath = join(root, 'rights.txt');
  const manifestPath = join(root, 'manifest.json');
  const currentProjection = JSON.parse(await readFile(
    'data/architecture-v2/generated/public-catalog-projection.json',
    'utf8',
  ));
  const current = currentProjection.products.find(({ brand, model }) => (
    brand === 'AEG' && model === 'FBF7573SBB'
  ));
  assert.ok(current, 'CLI drill model must remain in the current projection');
  const row = {
    ...ROW,
    Brand: current.brand,
    Model: current.model,
    'Product Width (mm)': current.w,
    'Product Height (mm)': current.h,
    'Product Depth (mm)': current.d,
  };
  await writeFile(samplePath, csvBytes(row));
  await writeFile(rightsPath, RIGHTS_BYTES);
  await writeFile(manifestPath, JSON.stringify({
    schemaVersion: 1,
    ...PROVIDER,
    format: 'csv',
    schemaMapping: MAPPING,
    rights: rightsFor(),
    rightsEvidenceFiles: [{ path: 'rights.txt', contentSha256: HASH }],
  }));

  const { stdout } = await execFileAsync(process.execPath, [
    'scripts/architecture-v2/quarantine-provider-response.mjs',
    '--file', samplePath,
    '--manifest', manifestPath,
    '--storage-root', storageRoot,
  ], { cwd: process.cwd() });
  const summary = JSON.parse(stdout);

  assert.equal(summary.status, 'QUARANTINED_CANDIDATES');
  assert.equal(summary.persisted, true);
  assert.equal(summary.publicationEligible, false);
  assert.equal(summary.fitEligible, false);
  assert.equal(stdout.includes('FBF7573SBB'), false);
  assert.equal(stdout.includes(root), false);
  assert.equal((await stat(join(storageRoot, 'outreach', summary.storage.sourceObjectPath))).isFile(), true);
  assert.equal((await stat(join(storageRoot, 'outreach', summary.storage.receiptObjectPath))).isFile(), true);
});

test('CLI reports partial rights as typed blocked intake without persisting provider bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fitappliance-provider-cli-blocked-'));
  const storageRoot = join(root, 'storage');
  const samplePath = join(root, 'sample.csv');
  const rightsPath = join(root, 'rights.txt');
  const manifestPath = join(root, 'manifest.json');
  const currentProjection = JSON.parse(await readFile(
    'data/architecture-v2/generated/public-catalog-projection.json',
    'utf8',
  ));
  const current = currentProjection.products.find(({ brand, model }) => (
    brand === 'AEG' && model === 'FBF7573SBB'
  ));
  assert.ok(current, 'CLI drill model must remain in the current projection');
  await writeFile(samplePath, csvBytes({
    ...ROW,
    Brand: current.brand,
    Model: current.model,
    'Product Width (mm)': current.w,
    'Product Height (mm)': current.h,
    'Product Depth (mm)': current.d,
  }));
  await writeFile(rightsPath, RIGHTS_BYTES);
  await writeFile(manifestPath, JSON.stringify({
    schemaVersion: 1,
    ...PROVIDER,
    format: 'csv',
    schemaMapping: MAPPING,
    rights: rightsFor(MAPPING, [{
      fieldId: 'identity.model',
      actionId: 'public_display',
      decision: 'unknown',
    }]),
    rightsEvidenceFiles: [{ path: 'rights.txt', contentSha256: HASH }],
  }));

  let failure;
  try {
    await execFileAsync(process.execPath, [
      'scripts/architecture-v2/quarantine-provider-response.mjs',
      '--file', samplePath,
      '--manifest', manifestPath,
      '--storage-root', storageRoot,
    ], { cwd: process.cwd() });
  } catch (error) {
    failure = error;
  }
  assert.equal(failure?.code, 2);
  const summary = JSON.parse(failure.stdout);
  assert.equal(summary.status, 'RIGHTS_BLOCKED');
  assert.equal(summary.persisted, false);
  assert.equal(summary.storage, null);
  assert.equal(summary.counts.blockedRights, 1);
  assert.equal(failure.stdout.includes('FBF7573SBB'), false);
  assert.equal(failure.stdout.includes(root), false);
});

test('sealed provider quarantine issues field receipts into private shadow acceptance only', async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), 'fitappliance-provider-shadow-'));
  const bytes = csvBytes();
  const report = await ingest('csv', bytes);
  const persisted = await persistQuarantinedProviderResponse(storageRoot, bytes, report, {
    rightsEvidence: RIGHTS_EVIDENCE,
  });
  const quarantineReceiptBytes = await readFile(persisted.receiptPath);
  const result = buildProviderShadowAcceptance({
    quarantineReceiptBytes,
    quarantineReceiptSha256: persisted.receiptSha256,
    sourceBytes: bytes,
    rightsEvidence: RIGHTS_EVIDENCE,
    acceptedAt: '2026-07-29T13:00:00.000Z',
  });

  assert.equal(result.status, 'SHADOW_ACCEPTED');
  assert.equal(result.fieldReceipts.length, 5);
  assert.equal(result.shadowAcceptance.fieldReceiptIds.length, 5);
  assert.ok(result.fieldReceipts.every((receipt) => receipt.status === 'RECEIPT_ISSUED'));
  assert.ok(result.fieldReceipts.every((receipt) => receipt.publicationEligible === false));
  assert.ok(result.fieldReceipts.every((receipt) => receipt.fitEligible === false));
  assert.equal(result.shadowAcceptance.publicProjection, null);
  assert.deepEqual(
    result.fieldReceipts.filter(({ fieldId }) => fieldId.startsWith('closedEnvelope.')).map(({ fieldId }) => fieldId).sort(),
    ['closedEnvelope.depthMm', 'closedEnvelope.heightMm', 'closedEnvelope.widthMm'],
  );

  const shadowObjects = await persistProviderShadowAcceptance(storageRoot, result);
  assert.equal(shadowObjects.fieldReceiptPaths.length, 5);
  assert.equal((await stat(shadowObjects.shadowAcceptancePath)).isFile(), true);
  assert.ok(shadowObjects.fieldReceiptPaths.every((path) => path.startsWith(join(storageRoot, 'outreach'))));
});

test('provider shadow acceptance rejects source, rights, and sealed-receipt drift', async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), 'fitappliance-provider-shadow-drift-'));
  const bytes = csvBytes();
  const report = await ingest('csv', bytes);
  const persisted = await persistQuarantinedProviderResponse(storageRoot, bytes, report, {
    rightsEvidence: RIGHTS_EVIDENCE,
  });
  const quarantineReceiptBytes = await readFile(persisted.receiptPath);
  const input = {
    quarantineReceiptBytes,
    quarantineReceiptSha256: persisted.receiptSha256,
    sourceBytes: bytes,
    rightsEvidence: RIGHTS_EVIDENCE,
    acceptedAt: '2026-07-29T13:00:00.000Z',
  };

  assert.throws(
    () => buildProviderShadowAcceptance({ ...input, sourceBytes: Buffer.from('changed') }),
    /source.*hash|source.*bytes/i,
  );
  assert.throws(
    () => buildProviderShadowAcceptance({ ...input, rightsEvidence: [] }),
    /rights evidence/i,
  );
  const forged = JSON.parse(quarantineReceiptBytes);
  forged.claims[0].normalizedValue = 'forged';
  assert.throws(
    () => buildProviderShadowAcceptance({
      ...input,
      quarantineReceiptBytes: Buffer.from(`${JSON.stringify(forged)}\n`),
    }),
    /receipt hash|sealed.*receipt|report.*binding/i,
  );
});

test('provider shadow CLI replays private objects without exposing product rows', async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), 'fitappliance-provider-shadow-cli-'));
  const bytes = csvBytes();
  const report = await ingest('csv', bytes);
  const persisted = await persistQuarantinedProviderResponse(storageRoot, bytes, report, {
    rightsEvidence: RIGHTS_EVIDENCE,
  });

  const { stdout } = await execFileAsync(process.execPath, [
    'scripts/architecture-v2/accept-provider-response-shadow.mjs',
    '--receipt', persisted.receiptPath,
    '--storage-root', storageRoot,
    '--accepted-at', '2026-07-29T13:00:00.000Z',
  ], { cwd: process.cwd() });
  const summary = JSON.parse(stdout);

  assert.equal(summary.status, 'SHADOW_ACCEPTED');
  assert.equal(summary.counts.fieldReceipts, 5);
  assert.equal(summary.publicationEligible, false);
  assert.equal(summary.fitEligible, false);
  assert.equal(stdout.includes('EXD600AU'), false);
  assert.equal(stdout.includes(storageRoot), false);
});
