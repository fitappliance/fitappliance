import { createHash } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertInstallationBundleReplacementAllowed,
  auditInstallationEvidenceBundle,
  auditInstallationFitPublication,
  buildInstallationCanaryReceiptBundle,
  buildInstallationEvidenceControlPlane,
  createInstallationEvidenceBundle,
  createInstallationFieldReceipt,
  extractMineruItemText,
  mergeInstallationEvidenceBundle,
  receiptToModelRequirement,
  replayInstallationFieldReceipt,
  resolveInstallationEvidenceBundle,
  validateInstallationEvidenceReplayAudit,
} from '../../src/domain/installation-evidence-pipeline.mjs';

const MODEL = 'DW60UT4I2';
const PRODUCT_ID = 'fa_prod_dw60ut4i2';
const PDF_SHA256 = 'a'.repeat(64);
const MODEL_REVISION = 'ed6b654c018d742e65a17671e379c5e6ecc87ec9';
const SOURCE_URL = 'https://www.fisherpaykel.com/on/demandware.static/example/QRG-AU-82440.pdf';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function mineruFixture(model = MODEL) {
  return [[
    {
      type: 'page_header',
      content: { page_header_content: [{ type: 'text', content: `QUICK REFERENCE GUIDE > ${model} > Integrated Dishwasher` }] },
      bbox: [35, 40, 228, 58],
    },
    {
      type: 'paragraph',
      content: { paragraph_content: [{ type: 'text', content: 'Height 857 - 917 mm Width 597 mm Depth 554 mm' }] },
      bbox: [354, 141, 634, 225],
    },
  ]];
}

function fixtureContext(model = MODEL) {
  const jsonBytes = Buffer.from(JSON.stringify(mineruFixture(model)));
  const contentSha256 = sha256(jsonBytes);
  return {
    jsonBytes,
    indexEntry: {
      sourcePdfSha256: PDF_SHA256,
      status: 'indexed',
      parserVersion: '3.4.4',
      modelRevision: MODEL_REVISION,
      derivedArtifact: {
        schemaVersion: 1,
        format: 'content_list_v2',
        parserName: 'MinerU',
        parserVersion: '3.4.4',
        modelRevision: MODEL_REVISION,
        sourcePdfSha256: PDF_SHA256,
        contentSha256,
        objectPath: `evidence/derived/mineru-json/sha256/${contentSha256.slice(0, 2)}/${contentSha256.slice(2, 4)}/${contentSha256}.json`,
        pageCount: 1,
      },
    },
  };
}

function receipt(overrides = {}) {
  const context = fixtureContext(overrides.identityModel ?? MODEL);
  const contentSha256 = context.indexEntry.derivedArtifact.contentSha256;
  return createInstallationFieldReceipt({
    canonicalProductId: PRODUCT_ID,
    category: 'dishwasher',
    brand: 'Fisher & Paykel',
    model: MODEL,
    formFactor: 'integrated',
    field: 'closedEnvelope.widthMm',
    applicability: 'required',
    value: 597,
    unit: 'mm',
    sourceUrl: SOURCE_URL,
    sourceStatus: 'current',
    observedAt: '2026-07-19T00:00:00.000Z',
    pdfSha256: PDF_SHA256,
    mineru: {
      format: 'content_list_v2',
      contentSha256,
      objectPath: context.indexEntry.derivedArtifact.objectPath,
      parserName: 'MinerU',
      parserVersion: overrides.parserVersion ?? '3.4.4',
      modelRevision: MODEL_REVISION,
    },
    locator: {
      page: 1,
      itemIndex: 1,
      itemType: 'paragraph',
      bbox: [354, 141, 634, 225],
    },
    quote: 'Height 857 - 917 mm Width 597 mm Depth 554 mm',
    identityOutcome: 'exact',
    applicableModels: overrides.applicableModels ?? [MODEL],
    identityLocators: [{
      page: 1,
      itemIndex: 0,
      itemType: 'page_header',
      bbox: [35, 40, 228, 58],
      quote: `QUICK REFERENCE GUIDE > ${overrides.identityModel ?? MODEL} > Integrated Dishwasher`,
    }],
    ...overrides.input,
  });
}

test('field receipt binds an exact official model to one replayable MinerU item', () => {
  const context = fixtureContext();
  const accepted = receipt();

  assert.match(accepted.receiptId, /^inst_receipt_[a-f0-9]{24}$/);
  assert.match(accepted.semanticReceiptSha256, /^[a-f0-9]{64}$/);
  assert.equal(accepted.evidence.fragmentSha256, sha256('Height 857 - 917 mm Width 597 mm Depth 554 mm'));
  assert.equal(replayInstallationFieldReceipt(accepted, context).status, 'PASS');

  const requirement = receiptToModelRequirement(accepted);
  assert.equal(requirement.value, 597);
  assert.equal(requirement.evidence.receiptBindingSha256, accepted.semanticReceiptSha256);
  assert.deepEqual(requirement.evidence.locator.bbox, [354, 141, 634, 225]);
  assert.equal(accepted.evidence.formFactorLocator.quote.includes('Integrated Dishwasher'), true);
});

test('MinerU table evidence excludes parser-internal table metadata', () => {
  const item = {
    type: 'table',
    content: {
      image_source: { path: 'images/example.jpg' },
      table_caption: [],
      table_footnote: [],
      html: '<table><tr><td>Minimum air clearance - at rear 30 mm</td></tr></table>',
      table_type: 'simple_table',
      table_nest_level: 1,
    },
    bbox: [1, 2, 3, 4],
  };
  assert.equal(
    extractMineruItemText(item),
    '<table><tr><td>Minimum air clearance - at rear 30 mm</td></tr></table>',
  );
});

test('receipt creation rejects legacy parsing, sibling donation, unknown coercion and non-official sources', () => {
  assert.throws(() => receipt({ parserVersion: 'pdftotext-26.06.0' }), /MinerU|parser|pdftotext/i);
  assert.throws(() => receipt({ identityModel: 'DW60UT4I2B' }), /exact model|identity/i);
  assert.throws(() => receipt({ applicableModels: ['DW60UT4I2B'] }), /apply only|exact target model/i);
  assert.throws(() => receipt({ input: { applicability: 'unknown', value: 0 } }), /unknown/i);
  assert.throws(
    () => receipt({ input: { sourceUrl: 'https://www.thegoodguys.com.au/example.pdf' } }),
    /official/i,
  );
  assert.throws(
    () => receipt({ input: { field: 'installationClearance.rearMm', value: 597 } }),
    /semantic|label/i,
  );
});

test('table evidence binds a field label and value within one row or header-value column', () => {
  const splitCells = receipt({
    input: {
      quote: '<table><tr><th>Width</th><td>597 mm</td></tr><tr><th>Rear clearance</th><td>30 mm</td></tr></table>',
    },
  });
  assert.equal(splitCells.value, 597);
  assert.throws(
    () => receipt({
      input: {
        field: 'installationClearance.rearMm',
        value: 597,
        quote: '<table><tr><th>Width</th><td>597 mm</td></tr><tr><th>Rear clearance</th><td>30 mm</td></tr></table>',
      },
    }),
    /semantic|label/i,
  );

  const headerColumns = receipt({
    input: {
      quote: '<table><tr><th>Height</th><th>Width</th><th>Depth</th></tr><tr><td>857 mm</td><td>597 mm</td><td>554 mm</td></tr></table>',
    },
  });
  assert.equal(headerColumns.value, 597);

  const unrelatedNegativeRow = '<table><tr><th>Professional installation</th><td>Required</td></tr><tr><th>Water connection</th><td>Not required</td></tr></table>';
  assert.throws(
    () => receipt({
      input: {
        field: 'professionalInstallation.required',
        applicability: 'not_applicable',
        value: null,
        unit: null,
        quote: unrelatedNegativeRow,
      },
    }),
    /semantic|same|label/i,
  );
  assert.throws(
    () => receipt({
      input: {
        field: 'professionalInstallation.required',
        value: false,
        unit: null,
        quote: unrelatedNegativeRow,
      },
    }),
    /semantic|same|label/i,
  );
});

test('zero, adjustable ranges and explicit not-applicable remain distinct receipt values', () => {
  const zero = receipt({
    input: {
      field: 'ventilation.rearMm',
      value: 0,
      quote: 'Minimum ventilation clearance at rear 0 mm',
    },
  });
  assert.equal(receiptToModelRequirement(zero).value, 0);

  const range = receipt({
    input: {
      field: 'closedEnvelope.heightMm',
      value: { minimumMm: 857, maximumMm: 917 },
    },
  });
  assert.deepEqual(receiptToModelRequirement(range).value, { minimumMm: 857, maximumMm: 917 });

  const notApplicable = receipt({
    input: {
      field: 'professionalInstallation.required',
      applicability: 'not_applicable',
      value: null,
      unit: null,
      quote: 'Professional installation is not required for this exact model.',
      locator: { page: 1, itemIndex: 1, itemType: 'paragraph', bbox: [354, 141, 634, 225] },
    },
  });
  assert.equal(notApplicable.applicability, 'not_applicable');
  assert.equal(receiptToModelRequirement(notApplicable).value, null);

  const sideNotApplicable = receipt({
    input: {
      field: 'installationClearance.leftMm',
      applicability: 'not_applicable',
      value: null,
      unit: null,
      quote: 'Left-side clearance is not required for this exact model.',
    },
  });
  assert.equal(sideNotApplicable.applicability, 'not_applicable');
});

test('replay fails closed on page, bbox, item text, object hash and index metadata drift', () => {
  const accepted = receipt();
  const context = fixtureContext();

  const bboxDrift = structuredClone(context);
  bboxDrift.jsonBytes = Buffer.from(JSON.stringify(mineruFixture()));
  const parsed = JSON.parse(bboxDrift.jsonBytes);
  parsed[0][1].bbox[0] = 355;
  bboxDrift.jsonBytes = Buffer.from(JSON.stringify(parsed));
  assert.throws(() => replayInstallationFieldReceipt(accepted, bboxDrift), /hash|bbox/i);

  const wrongPdf = structuredClone(context);
  wrongPdf.jsonBytes = context.jsonBytes;
  wrongPdf.indexEntry.sourcePdfSha256 = 'b'.repeat(64);
  assert.throws(() => replayInstallationFieldReceipt(accepted, wrongPdf), /PDF|hash/i);

  const wrongRevision = structuredClone(context);
  wrongRevision.jsonBytes = context.jsonBytes;
  wrongRevision.indexEntry.modelRevision = 'f'.repeat(40);
  assert.throws(() => replayInstallationFieldReceipt(accepted, wrongRevision), /revision/i);
});

test('cumulative bundle merge is idempotent and quarantines conflicting field values', () => {
  const first = receipt();
  const bundle = createInstallationEvidenceBundle({
    generatedAt: '2026-07-19T00:00:00.000Z',
    receipts: [first],
  });
  const idempotent = mergeInstallationEvidenceBundle(bundle, [first], {
    generatedAt: '2026-07-19T00:00:00.000Z',
  });
  assert.equal(idempotent.receipts.length, 1);

  const conflicting = receipt({
    input: {
      value: 598,
      quote: 'Height 857 - 917 mm Width 598 mm Depth 554 mm',
    },
  });
  const conflicted = mergeInstallationEvidenceBundle(bundle, [conflicting], {
    generatedAt: '2026-07-19T00:00:00.000Z',
  });
  const resolution = resolveInstallationEvidenceBundle(conflicted);
  assert.equal(resolution.accepted.length, 0);
  assert.equal(resolution.conflicts.length, 1);
  assert.equal(conflicted.summary.conflictingFields, 1);
});

test('destructive bundle replacement requires the exact current bundle hash', () => {
  const bundle = createInstallationEvidenceBundle({
    generatedAt: '2026-07-19T00:00:00.000Z',
    receipts: [receipt()],
  });

  assert.throws(
    () => assertInstallationBundleReplacementAllowed({ replace: true, currentBundle: bundle }),
    /expected current bundle sha/i,
  );
  assert.throws(
    () => assertInstallationBundleReplacementAllowed({
      replace: true,
      expectedCurrentBundleSha256: 'f'.repeat(64),
      currentBundle: bundle,
    }),
    /changed|match/i,
  );
  assert.equal(assertInstallationBundleReplacementAllowed({
    replace: true,
    expectedCurrentBundleSha256: bundle.bundleSha256,
    currentBundle: bundle,
  }).status, 'REPLACEMENT_ALLOWED');
  assert.equal(assertInstallationBundleReplacementAllowed({ replace: false }).status, 'MERGE_REQUIRED');
});

test('bundle replay audit binds the bundle hash and records every receipt result', () => {
  const accepted = receipt();
  const bundle = createInstallationEvidenceBundle({
    generatedAt: '2026-07-19T00:00:00.000Z',
    receipts: [accepted],
  });
  const context = fixtureContext();
  const audit = auditInstallationEvidenceBundle(bundle, {
    auditedAt: '2026-07-19T01:00:00.000Z',
    readEvidence: () => context,
  });

  assert.equal(audit.bundleSha256, bundle.bundleSha256);
  assert.deepEqual(audit.summary, { receipts: 1, passed: 1, failed: 0 });
  assert.equal(audit.results[0].status, 'PASS');
  assert.equal(validateInstallationEvidenceReplayAudit(bundle, audit).status, 'CURRENT_PASS');

  assert.throws(
    () => validateInstallationEvidenceReplayAudit(bundle, { ...audit, bundleSha256: 'f'.repeat(64) }),
    /stale|bundle/i,
  );
  assert.throws(
    () => validateInstallationEvidenceReplayAudit(bundle, {
      ...audit,
      results: [],
      summary: { receipts: 0, passed: 0, failed: 0 },
    }),
    /receipt|result/i,
  );
});

test('canary recipe builds receipts only from a frozen exact-model pilot and replays before output', async () => {
  const context = fixtureContext();
  const pilot = {
    schemaVersion: 1,
    frozen: true,
    products: [{
      canonicalProductId: PRODUCT_ID,
      legacyRuntimeId: 'dishwasher-adw0959',
      category: 'dishwasher',
      brand: 'Fisher & Paykel',
      model: MODEL,
      formFactor: null,
    }],
  };
  const recipes = {
    schemaVersion: 1,
    generatedAt: '2026-07-19T00:00:00.000Z',
    products: [{
      canonicalProductId: PRODUCT_ID,
      category: 'dishwasher',
      brand: 'Fisher & Paykel',
      model: MODEL,
      formFactor: 'integrated',
      sourceUrl: SOURCE_URL,
      pdfSha256: PDF_SHA256,
      observedAt: '2026-07-19T00:00:00.000Z',
      identityLocators: [{ page: 1, itemIndex: 0, itemType: 'page_header', bbox: [35, 40, 228, 58] }],
      fields: [{
        field: 'closedEnvelope.widthMm',
        applicability: 'required',
        value: 597,
        unit: 'mm',
        locator: { page: 1, itemIndex: 1, itemType: 'paragraph', bbox: [354, 141, 634, 225] },
      }],
    }],
  };

  const bundle = await buildInstallationCanaryReceiptBundle({
    pilot,
    recipes,
    mineruIndex: { schemaVersion: 1, entries: [context.indexEntry] },
    readObject: async () => context.jsonBytes,
  });
  assert.equal(bundle.receipts.length, 1);
  assert.equal(bundle.receipts[0].model, MODEL);

  const inferredConflictPilot = {
    ...pilot,
    products: [{ ...pilot.products[0], formFactor: 'built_in' }],
  };
  const exactOverride = await buildInstallationCanaryReceiptBundle({
    pilot: inferredConflictPilot,
    recipes,
    mineruIndex: { schemaVersion: 1, entries: [context.indexEntry] },
    readObject: async () => context.jsonBytes,
  });
  assert.equal(exactOverride.receipts[0].formFactor, 'integrated');

  await assert.rejects(
    () => buildInstallationCanaryReceiptBundle({
      pilot,
      recipes: {
        ...recipes,
        products: [{ ...recipes.products[0], model: 'DW60UT4I2B' }],
      },
      mineruIndex: { schemaVersion: 1, entries: [context.indexEntry] },
      readObject: async () => context.jsonBytes,
    }),
    /frozen pilot|identity/i,
  );
});

test('control plane projects every pilot model once and keeps source, MinerU, grammar and replay lanes separate', () => {
  const accepted = receipt();
  const bundle = createInstallationEvidenceBundle({
    generatedAt: '2026-07-19T00:00:00.000Z',
    receipts: [accepted],
  });
  const context = fixtureContext();
  const replayAudit = auditInstallationEvidenceBundle(bundle, {
    auditedAt: '2026-07-19T01:00:00.000Z',
    readEvidence: () => context,
  });
  const product = (id, model, formFactor = 'integrated') => ({
    canonicalProductId: id,
    legacyRuntimeId: `legacy-${id}`,
    category: 'dishwasher',
    brand: 'Fisher & Paykel',
    model,
    formFactor,
  });
  const pilot = {
    schemaVersion: 1,
    frozen: true,
    products: [
      product(PRODUCT_ID, MODEL),
      product('prod-grammar', 'MODEL-GRAMMAR'),
      product('prod-mineru', 'MODEL-MINERU'),
      product('prod-identity', 'MODEL-IDENTITY'),
      product('prod-source', 'MODEL-SOURCE'),
      product('prod-closed-a', 'MODEL-CLOSED-A'),
      product('prod-closed-b', 'MODEL-CLOSED-B'),
    ],
  };
  const sourceCandidates = [
    {
      canonicalProductId: 'prod-grammar',
      sourceUrl: 'https://www.fisherpaykel.com/grammar.pdf',
      pdfSha256: 'b'.repeat(64),
      identityOutcome: 'exact',
      mineru: { format: 'content_list_v2', contentSha256: 'c'.repeat(64) },
    },
    {
      canonicalProductId: 'prod-mineru',
      sourceUrl: 'https://www.fisherpaykel.com/mineru.pdf',
      pdfSha256: 'd'.repeat(64),
      identityOutcome: 'exact',
      mineru: null,
    },
    {
      canonicalProductId: 'prod-identity',
      sourceUrl: 'https://www.fisherpaykel.com/identity.pdf',
      pdfSha256: 'e'.repeat(64),
      identityOutcome: 'pending_visual_review',
      mineru: { format: 'content_list_v2', contentSha256: 'f'.repeat(64) },
    },
    {
      canonicalProductId: 'prod-closed-a',
      sourceUrl: 'https://www.fisherpaykel.com/closed-a.pdf',
      pdfSha256: '1'.repeat(64),
      identityOutcome: 'exact',
      mineru: { format: 'content_list_v2', contentSha256: '2'.repeat(64) },
    },
    {
      canonicalProductId: 'prod-closed-b',
      sourceUrl: 'https://www.fisherpaykel.com/closed-b.pdf',
      pdfSha256: '3'.repeat(64),
      identityOutcome: 'exact',
      mineru: { format: 'content_list_v2', contentSha256: '4'.repeat(64) },
    },
  ];

  const control = buildInstallationEvidenceControlPlane({
    generatedAt: '2026-07-19T02:00:00.000Z',
    pilot,
    sourceCandidates,
    receiptBundle: bundle,
    replayAudit,
    batchSize: 2,
    documentFamiliesByPdfSha256: {
      [PDF_SHA256]: ['document_family_a0a0'],
      ['b'.repeat(64)]: ['document_family_a0a0'],
      ['c'.repeat(64)]: ['document_family_a0a0'],
      ['1'.repeat(64)]: ['document_family_c105ed'],
      ['3'.repeat(64)]: ['document_family_c105ed'],
    },
  });
  assert.equal(control.candidates.length, 7);
  assert.deepEqual(
    Object.fromEntries(control.candidates.map((row) => [row.canonicalProductId, row.state])),
    {
      [PRODUCT_ID]: 'RECEIPT_PARTIAL',
      'prod-grammar': 'GRAMMAR_REQUIRED',
      'prod-mineru': 'MINERU_REQUIRED',
      'prod-identity': 'IDENTITY_BLOCKED',
      'prod-source': 'SOURCE_DISCOVERY_REQUIRED',
      'prod-closed-a': 'GRAMMAR_REQUIRED',
      'prod-closed-b': 'GRAMMAR_REQUIRED',
    },
  );
  assert.deepEqual(
    Object.fromEntries(control.parserGaps.map((row) => [row.canonicalProductId, row.lane])),
    {
      [PRODUCT_ID]: 'SOURCE_REQUIRED',
      'prod-grammar': 'GRAMMAR_REQUIRED',
      'prod-mineru': 'MINERU_REQUIRED',
      'prod-identity': 'IDENTITY_BLOCKED',
      'prod-source': 'SOURCE_REQUIRED',
      'prod-closed-a': 'GRAMMAR_REQUIRED',
      'prod-closed-b': 'GRAMMAR_REQUIRED',
    },
  );
  assert.equal(control.summary.fitEvidenceComplete, 0);
  assert.equal(control.summary.receiptPartial, 1);
  assert.ok(control.batches.every((batch) => batch.targets.length <= 2));
  const openFamily = control.batches.find((batch) => batch.documentFamilyId === 'document_family_a0a0');
  assert.equal(openFamily.gateStatus, 'CANARY_PARTIAL_PASS');
  assert.equal(openFamily.canary.canonicalProductId, PRODUCT_ID);
  assert.equal(openFamily.targets.length, 2);
  const closedFamily = control.batches.find((batch) => batch.documentFamilyId === 'document_family_c105ed');
  assert.equal(closedFamily.gateStatus, 'CANARY_REQUIRED');
  assert.equal(closedFamily.targets.length, 1);
  assert.ok(control.batches
    .filter((batch) => batch.gateStatus === 'DOCUMENT_FAMILY_REQUIRED')
    .every((batch) => batch.targets.length === 1));

  assert.throws(
    () => buildInstallationEvidenceControlPlane({
      generatedAt: '2026-07-19T02:00:00.000Z',
      pilot,
      sourceCandidates: [{
        canonicalProductId: 'prod-source',
        sourceUrl: 'https://www.thegoodguys.com.au/retailer.pdf',
        pdfSha256: 'a'.repeat(64),
        identityOutcome: 'exact',
        mineru: null,
      }],
      receiptBundle: bundle,
      replayAudit,
    }),
    /official/i,
  );
});

test('stale replay audit demotes accepted receipts to replay-ready instead of publishing them', () => {
  const accepted = receipt();
  const bundle = createInstallationEvidenceBundle({
    generatedAt: '2026-07-19T00:00:00.000Z',
    receipts: [accepted],
  });
  const context = fixtureContext();
  const replayAudit = auditInstallationEvidenceBundle(bundle, {
    auditedAt: '2026-07-19T01:00:00.000Z',
    readEvidence: () => context,
  });
  const control = buildInstallationEvidenceControlPlane({
    generatedAt: '2026-07-19T02:00:00.000Z',
    pilot: {
      schemaVersion: 1,
      frozen: true,
      products: [{
        canonicalProductId: PRODUCT_ID,
        legacyRuntimeId: 'dishwasher-adw0959',
        category: 'dishwasher',
        brand: 'Fisher & Paykel',
        model: MODEL,
        formFactor: 'integrated',
      }],
    },
    sourceCandidates: [],
    receiptBundle: bundle,
    replayAudit: { ...replayAudit, bundleSha256: 'f'.repeat(64) },
  });
  assert.equal(control.candidates[0].state, 'REPLAY_REQUIRED');
  assert.equal(control.parserGaps[0].lane, 'REPLAY_READY');
  assert.deepEqual(control.candidates[0].acceptedFields, []);
});

test('publication audit rejects VERIFIED_FIT declarations backed only by partial installation receipts', () => {
  const accepted = receipt();
  const bundle = createInstallationEvidenceBundle({
    generatedAt: '2026-07-19T00:00:00.000Z',
    receipts: [accepted],
  });
  const context = fixtureContext();
  const replayAudit = auditInstallationEvidenceBundle(bundle, {
    auditedAt: '2026-07-19T01:00:00.000Z',
    readEvidence: () => context,
  });
  const controlPlane = buildInstallationEvidenceControlPlane({
    generatedAt: '2026-07-19T02:00:00.000Z',
    pilot: {
      schemaVersion: 1,
      frozen: true,
      products: [{
        canonicalProductId: PRODUCT_ID,
        legacyRuntimeId: 'dishwasher-adw0959',
        category: 'dishwasher',
        brand: 'Fisher & Paykel',
        model: MODEL,
        formFactor: 'integrated',
      }],
    },
    sourceCandidates: [],
    receiptBundle: bundle,
    replayAudit,
  });
  const replayAuditSha256 = sha256(JSON.stringify(replayAudit));
  const publication = auditInstallationFitPublication({
    projection: { products: [{
      id: 'dishwasher-adw0959',
      canonicalProductId: PRODUCT_ID,
      cat: 'dishwasher',
      brand: 'Fisher & Paykel',
      model: MODEL,
      fit_v3_provenance: {
        schemaVersion: 1,
        outcome: 'VERIFIED_FIT',
        installationReceiptBundleSha256: bundle.bundleSha256,
        installationReplayAuditSha256: replayAuditSha256,
        hardConditionReceiptIds: [accepted.receiptId],
      },
    }] },
    receiptBundle: bundle,
    replayAudit,
    replayAuditSha256,
    controlPlane,
  });
  assert.equal(publication.summary.verifiedDeclarations, 1);
  assert.equal(publication.summary.violations, 1);
  assert.ok(publication.violations[0].reasons.includes('installation_evidence_incomplete'));

  const clean = auditInstallationFitPublication({
    projection: { products: [] },
    receiptBundle: bundle,
    replayAudit,
    replayAuditSha256,
    controlPlane,
  });
  assert.deepEqual(clean.summary, { products: 0, verifiedDeclarations: 0, receiptBoundVerified: 0, violations: 0 });
});
