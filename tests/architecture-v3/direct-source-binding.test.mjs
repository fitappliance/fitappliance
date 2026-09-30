import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { verifyAndAttestResolutionArtifact, verifyAttestedResolutionArtifact } from '../../src/domain/evidence-artifact-verifier.mjs';
import {
  createInstallationFieldReceipt,
  replayInstallationFieldReceipt,
} from '../../src/domain/installation-evidence-pipeline.mjs';
import {
  FRAGMENT_IDENTITY_DOMAIN,
  FRAGMENT_SCHEMA_VERSION,
  createArtifactRecord,
  createFragment,
} from '../../src/domain/architecture-v3/artifact-lineage.mjs';
import {
  CANONICAL_EVIDENCE_JSON_VERSION,
  canonicalEvidenceJson,
} from '../../src/shared/canonical-evidence-json.mjs';
import { compileV3Semantics } from '../../src/domain/architecture-v3/semantics.mjs';
import {
  createDirectClaimReceipt,
  EvidenceClaimReceiptValidationError,
  verifyDirectClaimReceipt,
} from '../../src/domain/architecture-v3/evidence-claim-receipt.mjs';
import { createEvidenceClaimV3 } from '../../src/domain/architecture-v3/evidence-claim-v3.mjs';
import { inspectExtractionRegions } from '../../src/domain/architecture-v3/region-router.mjs';
import {
  replayVerifiedSourceBinding,
  verifyAndBindSource,
} from '../../src/domain/architecture-v3/verified-source-binding.mjs';

const EVIDENCE_ROOT = '/Volumes/UGREEN-1TB/FitAppliance';
const INSTALLATION_RECEIPT_IDS = [
  'inst_receipt_7a78ab6806465717a18f37f8',
  'inst_receipt_a13c0761a515ef294f80de6e',
];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function jsonBytes(value) {
  return Buffer.from(JSON.stringify(value));
}

function fragment({ content, parentArtifactSha256, locator }) {
  return createFragment({
    fragmentSha256: sha256(canonicalEvidenceJson({
      fragmentIdentityDomain: FRAGMENT_IDENTITY_DOMAIN,
      schemaVersion: FRAGMENT_SCHEMA_VERSION,
      canonicalizationVersion: CANONICAL_EVIDENCE_JSON_VERSION,
      content,
      parentArtifactSha256,
      locator,
    })),
    content,
    parentArtifactSha256,
    locator,
  });
}

const SEMANTICS = compileV3Semantics({
  fieldDictionary: JSON.parse(readFileSync(
    new URL('../../data/architecture-v2/policies/product-data-field-rights-dictionary.json', import.meta.url),
    'utf8',
  )),
  installationMatrix: JSON.parse(readFileSync(
    new URL('../../data/architecture-v2/generated/installation-evidence-applicability-matrix.json', import.meta.url),
    'utf8',
  )),
  overlay: JSON.parse(readFileSync(
    new URL('../../data/architecture-v3/policies/semantics-overlay.json', import.meta.url),
    'utf8',
  )),
});

function textSpan(text, value, offset = 0) {
  const startUtf16CodeUnit = text.indexOf(value, offset);
  assert.notEqual(startUtf16CodeUnit, -1, `fixture text must contain ${value}`);
  return {
    kind: 'text_span',
    startUtf16CodeUnit,
    endUtf16CodeUnit: startUtf16CodeUnit + value.length,
  };
}

function fileReference(path) {
  const bytes = readFileSync(new URL(path, import.meta.url));
  return {
    bytes,
    ref: { sha256: sha256(bytes), objectPath: path.replace(/^\.\.\/\.\.\//u, ''), byteSize: bytes.length },
  };
}

function existingBdfProfileReplay() {
  const fixturePath = '../../tests/fixtures/architecture-v3/profile-canaries/bdf1620w-p1-structured.json';
  const fixture = JSON.parse(readFileSync(new URL(fixturePath, import.meta.url), 'utf8'));
  const inspection = inspectExtractionRegions({
    nativeObservations: fixture.nativeObservations,
    mineruDocument: { ...fixture.mineruDocument, sourcePdfSha256: fixture.document.sourcePdfSha256 },
    pageImageMetadata: fixture.pageImageMetadata,
  });
  const regionObservation = inspection.regions.find((region) => region.sourceJsonPointer === '/0/15');
  assert.ok(regionObservation, 'BDF G3b profile region must exist');
  const profilePolicy = fileReference('../../data/architecture-v3/policies/document-family-profiles.json');
  const brandRegistry = fileReference('../../data/architecture-v3/generated/brand-registry.json');
  return {
    profileReplay: {
      profilePolicyRef: profilePolicy.ref,
      brandRegistryRef: brandRegistry.ref,
      documentType: fixture.document.documentType,
      regionObservation,
    },
    profileOwners: [profilePolicy, brandRegistry],
  };
}

function originalSourceFixture({
  caseIdentity = { brand: 'Westinghouse', model: 'WHE6874BA', category: 'fridge' },
  sourceUrl = 'https://www.westinghouse.com.au/fridges/whe6874ba/',
  sourceLabel = 'Total width (mm)',
  sourceValue = 913,
  sourceScalar = String(sourceValue),
  sourceUnit = 'mm',
  subjectAnchorText = caseIdentity.model,
  canonicalProductId = 'fa_prod_111111111111111111111111',
  tableTailHtml = '',
  afterTableHtml = '',
  omitTableEnd = false,
} = {}) {
  const sourceBytes = Buffer.from(`<!doctype html><html><head>
    <title>${caseIdentity.model} | ${caseIdentity.brand} Australia</title>
    <link rel="canonical" href="${sourceUrl}">
  </head><body data-product-model="${subjectAnchorText}">
    <table><caption>${subjectAnchorText}</caption><tr><td>${sourceLabel}</td><td>${sourceScalar} ${sourceUnit}</td></tr>${tableTailHtml}${omitTableEnd ? '' : '</table>'}${afterTableHtml}
  </body></html>`);
  const sourceHash = sha256(sourceBytes);
  const sourceRecord = verifyAndAttestResolutionArtifact({
    source: {
      authority: 'manufacturer',
      sourceType: 'official_exact_model_product_page',
      sourceUrl,
      finalUrl: sourceUrl,
      redirectChain: [],
      retrievedAt: '2026-07-11T14:30:00.000Z',
      contentSha256: sourceHash,
      objectPath: `evidence/web/sha256/${sourceHash.slice(0, 2)}/${sourceHash.slice(2, 4)}/${sourceHash}.html`,
      contentType: 'text/html',
      byteSize: sourceBytes.length,
      identity: { brand: caseIdentity.brand, model: caseIdentity.model, outcome: 'exact' },
      claims: [{
        field: 'closedEnvelope.widthMm',
        value: { kind: 'fixed', mm: sourceValue },
        sourceLabel,
        sourceAxisOrder: ['width'],
        sourceUnit,
        measurementScope: 'product_closed_external',
        includesDoor: null,
        includesHandle: null,
        page: null,
        fragmentSha256: null,
        bbox: null,
      }],
    },
    caseIdentity,
    bytes: sourceBytes,
    verifiedAt: '2026-07-11T14:35:00.000Z',
    claimSemanticsVersion: 2,
  });
  const ownerContainer = {
    entries: [{
      targetId: `g4b_case_${caseIdentity.model.toLowerCase()}`,
      canonicalProductId,
      ...caseIdentity,
      sources: [sourceRecord],
    }],
  };
  const ownerBytes = jsonBytes(ownerContainer);
  const ownerHash = sha256(ownerBytes);
  const ownerPath = 'evidence/owners/g4b-fixtures/westinghouse-case.json';
  const caseInput = {
    ownerOrigin: {
      containerSha256: ownerHash,
      objectPath: ownerPath,
      byteSize: ownerBytes.length,
      jsonPointer: '/entries/0',
    },
    selectedIndex: 0,
  };

  const sourceText = sourceBytes.toString('utf8');
  const sourceArtifact = createArtifactRecord({
    sha256: sourceHash,
    parentSha256: null,
    mediaType: 'text/html',
    toolRevision: null,
    optionsSha256: null,
  });
  const subject = fragment({
    content: subjectAnchorText,
    parentArtifactSha256: sourceHash,
    locator: textSpan(sourceText, subjectAnchorText, sourceText.indexOf('<caption>')),
  });
  const label = fragment({
    content: sourceLabel,
    parentArtifactSha256: sourceHash,
    locator: textSpan(sourceText, sourceLabel),
  });
  const value = fragment({
    content: sourceScalar,
    parentArtifactSha256: sourceHash,
    locator: textSpan(sourceText, sourceScalar, sourceText.indexOf('<table>')),
  });
  const unitStart = sourceText.indexOf(`${sourceScalar} ${sourceUnit}`) + `${sourceScalar} `.length;
  const unit = fragment({
    content: sourceUnit,
    parentArtifactSha256: sourceHash,
    locator: {
      kind: 'text_span',
      startUtf16CodeUnit: unitStart,
      endUtf16CodeUnit: unitStart + sourceUnit.length,
    },
  });
  const witnesses = [
    { kind: 'relation_witness', relationKind: 'exact_model_scope', fromFragmentSha256: subject.fragmentSha256, toFragmentSha256: label.fragmentSha256 },
    { kind: 'relation_witness', relationKind: 'same_table_row', fromFragmentSha256: label.fragmentSha256, toFragmentSha256: value.fragmentSha256 },
    { kind: 'relation_witness', relationKind: 'same_table_row', fromFragmentSha256: value.fragmentSha256, toFragmentSha256: unit.fragmentSha256 },
  ];
  const witnessBytes = jsonBytes(witnesses);
  const witnessHash = sha256(witnessBytes);
  const witnessArtifact = createArtifactRecord({
    sha256: witnessHash,
    parentSha256: sourceHash,
    mediaType: 'application/json',
    toolRevision: 'fixture-anchor-witness@1',
    optionsSha256: sha256('fixture-anchor-witness-options-v1'),
  });
  const witnessFragments = witnesses.map((content, index) => fragment({
    content,
    parentArtifactSha256: witnessHash,
    locator: { kind: 'json_pointer', pointer: `/${index}` },
  }));
  const anchors = [
    { anchorId: 'subject', role: 'subject', fragmentSha256: subject.fragmentSha256 },
    { anchorId: 'label', role: 'legend', fragmentSha256: label.fragmentSha256 },
    { anchorId: 'value', role: 'value', fragmentSha256: value.fragmentSha256 },
    { anchorId: 'unit', role: 'unit', fragmentSha256: unit.fragmentSha256 },
    ...witnessFragments.map((fragment, index) => ({
      anchorId: `witness_${index + 1}`,
      role: 'condition',
      fragmentSha256: fragment.fragmentSha256,
    })),
  ];
  const relations = [
    { kind: 'exact_model_scope', fromAnchorId: 'subject', toAnchorId: 'label', witnessAnchorIds: ['witness_1'] },
    { kind: 'same_table_row', fromAnchorId: 'label', toAnchorId: 'value', witnessAnchorIds: ['witness_2'] },
    { kind: 'same_table_row', fromAnchorId: 'value', toAnchorId: 'unit', witnessAnchorIds: ['witness_3'] },
  ];
  const objectBytes = new Map([
    [ownerPath, ownerBytes],
    [sourceRecord.objectPath, sourceBytes],
    ['evidence/derived/g4b-fixtures/witnesses.json', witnessBytes],
  ]);
  const objectRefs = [
    { sha256: sourceHash, objectPath: sourceRecord.objectPath, byteSize: sourceBytes.length },
    { sha256: witnessHash, objectPath: 'evidence/derived/g4b-fixtures/witnesses.json', byteSize: witnessBytes.length },
  ];
  return {
    input: {
      adapterKind: 'manufacturer',
      caseInput,
      originalSourceReceipt: sourceRecord.verificationReceipt,
      sourceRecord,
      artifactRecords: [sourceArtifact, witnessArtifact],
      fragments: [subject, label, value, unit, ...witnessFragments],
      readObject: (objectPath) => objectBytes.get(objectPath),
      fieldAttestations: [{
        kind: 'manufacturer_v2',
        sourceClaimIndex: 0,
        factBindingId: `fact_${caseIdentity.model.toLowerCase()}_width`,
        anchorIds: ['subject', 'label', 'value', 'unit'],
        anchorProof: {
          sourceArtifactSha256: sourceHash,
          anchors,
          relations,
        },
        objectRefs,
      }],
      historicalPolicies: {
        canonicalizationVersion: CANONICAL_EVIDENCE_JSON_VERSION,
        semantics: SEMANTICS,
        rightsDictionary: JSON.parse(readFileSync(
          new URL('../../data/architecture-v2/policies/product-data-field-rights-dictionary.json', import.meta.url),
          'utf8',
        )),
      },
    },
    caseInput,
    canonicalProductId: ownerContainer.entries[0].canonicalProductId,
    objectBytes,
  };
}

function installationSourceFixture() {
  const identity = {
    canonicalProductId: 'fa_prod_222222222222222222222222',
    brand: 'Fisher & Paykel',
    model: 'DW60UT4I2',
    category: 'dishwasher',
  };
  const pdfBytes = Buffer.from('%PDF-1.7\nG4b direct-installation fixture\n%%EOF\n');
  const pdfHash = sha256(pdfBytes);
  const pdfPath = `evidence/objects/sha256/${pdfHash.slice(0, 2)}/${pdfHash}.pdf`;
  const dimensionsHtml = '<table><caption>DW60UT4I2</caption>'
    + '<tr><td>Width</td><td>597 mm</td></tr>'
    + '</table>';
  const mineruDocument = [[
    {
      type: 'page_header',
      content: {
        page_header_content: [{ type: 'text', content: 'QUICK REFERENCE GUIDE > DW60UT4I2 > Integrated Dishwasher' }],
      },
      bbox: [35, 40, 228, 58],
    },
    {
      type: 'table',
      content: { html: dimensionsHtml },
      bbox: [354, 141, 634, 225],
    },
  ]];
  const mineruBytes = jsonBytes(mineruDocument);
  const mineruHash = sha256(mineruBytes);
  const mineruPath = `evidence/derived/mineru-json/sha256/${mineruHash.slice(0, 2)}/${mineruHash.slice(2, 4)}/${mineruHash}.json`;
  const indexEntry = {
    sourcePdfSha256: pdfHash,
    byteSize: pdfBytes.length,
    paths: [pdfPath],
    status: 'indexed',
    parserVersion: '3.4.4',
    modelRevision: 'ed6b654c018d742e65a17671e379c5e6ecc87ec9',
    derivedArtifact: {
      schemaVersion: 1,
      format: 'content_list_v2',
      parserName: 'MinerU',
      parserVersion: '3.4.4',
      modelRevision: 'ed6b654c018d742e65a17671e379c5e6ecc87ec9',
      sourcePdfSha256: pdfHash,
      contentSha256: mineruHash,
      objectPath: mineruPath,
      byteSize: mineruBytes.length,
      pageCount: 1,
    },
  };
  const sourceUrl = 'https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/example/QRG/AU/QRG-AU-82440.pdf';
  const receipt = createInstallationFieldReceipt({
    ...identity,
    formFactor: 'integrated',
    field: 'closedEnvelope.widthMm',
    applicability: 'required',
    value: 597,
    unit: 'mm',
    sourceUrl,
    sourceStatus: 'current',
    observedAt: '2026-07-11T00:00:00.000Z',
    pdfSha256: pdfHash,
    mineru: {
      format: 'content_list_v2',
      contentSha256: mineruHash,
      objectPath: mineruPath,
      parserName: 'MinerU',
      parserVersion: '3.4.4',
      modelRevision: indexEntry.modelRevision,
    },
    locator: {
      page: 1,
      itemIndex: 1,
      itemType: 'table',
      bbox: [354, 141, 634, 225],
    },
    quote: dimensionsHtml,
    identityOutcome: 'exact',
    applicableModels: [identity.model],
    identityLocators: [{
      page: 1,
      itemIndex: 0,
      itemType: 'page_header',
      bbox: [35, 40, 228, 58],
      quote: 'QUICK REFERENCE GUIDE > DW60UT4I2 > Integrated Dishwasher',
    }],
    formFactorLocator: {
      page: 1,
      itemIndex: 0,
      itemType: 'page_header',
      bbox: [35, 40, 228, 58],
      quote: 'QUICK REFERENCE GUIDE > DW60UT4I2 > Integrated Dishwasher',
    },
  });
  const ownerContainer = { receipts: [receipt] };
  const ownerBytes = jsonBytes(ownerContainer);
  const ownerHash = sha256(ownerBytes);
  const ownerPath = 'evidence/owners/g4b-fixtures/installation-receipts.json';
  const mineruText = mineruBytes.toString('utf8');
  const subject = fragment({
    content: identity.model,
    parentArtifactSha256: mineruHash,
    locator: textSpan(mineruText, identity.model, mineruText.indexOf('<caption>')),
  });
  const label = fragment({
    content: 'Width',
    parentArtifactSha256: mineruHash,
    locator: textSpan(mineruText, 'Width'),
  });
  const value = fragment({
    content: '597',
    parentArtifactSha256: mineruHash,
    locator: textSpan(mineruText, '597'),
  });
  const unitStart = mineruText.indexOf('597 mm') + '597 '.length;
  const unit = fragment({
    content: 'mm',
    parentArtifactSha256: mineruHash,
    locator: {
      kind: 'text_span',
      startUtf16CodeUnit: unitStart,
      endUtf16CodeUnit: unitStart + 2,
    },
  });
  const witnesses = [
    { kind: 'relation_witness', relationKind: 'exact_model_scope', fromFragmentSha256: subject.fragmentSha256, toFragmentSha256: label.fragmentSha256 },
    { kind: 'relation_witness', relationKind: 'same_table_row', fromFragmentSha256: label.fragmentSha256, toFragmentSha256: value.fragmentSha256 },
    { kind: 'relation_witness', relationKind: 'same_table_row', fromFragmentSha256: value.fragmentSha256, toFragmentSha256: unit.fragmentSha256 },
  ];
  const witnessBytes = jsonBytes(witnesses);
  const witnessHash = sha256(witnessBytes);
  const witnessPath = 'evidence/derived/g4b-fixtures/installation-witnesses.json';
  const pdfArtifact = createArtifactRecord({
    sha256: pdfHash,
    parentSha256: null,
    mediaType: 'application/pdf',
    toolRevision: null,
    optionsSha256: null,
  });
  const mineruArtifact = createArtifactRecord({
    sha256: mineruHash,
    parentSha256: pdfHash,
    mediaType: 'application/json',
    toolRevision: 'MinerU@3.4.4',
    optionsSha256: sha256('fixture-mineru-options-v1'),
  });
  const witnessArtifact = createArtifactRecord({
    sha256: witnessHash,
    parentSha256: pdfHash,
    mediaType: 'application/json',
    toolRevision: 'fixture-anchor-witness@1',
    optionsSha256: sha256('fixture-anchor-witness-options-v1'),
  });
  const witnessFragments = witnesses.map((content, index) => fragment({
    content,
    parentArtifactSha256: witnessHash,
    locator: { kind: 'json_pointer', pointer: `/${index}` },
  }));
  const anchors = [
    { anchorId: 'subject', role: 'subject', fragmentSha256: subject.fragmentSha256 },
    { anchorId: 'label', role: 'legend', fragmentSha256: label.fragmentSha256 },
    { anchorId: 'value', role: 'value', fragmentSha256: value.fragmentSha256 },
    { anchorId: 'unit', role: 'unit', fragmentSha256: unit.fragmentSha256 },
    ...witnessFragments.map((entry, index) => ({
      anchorId: `witness_${index + 1}`,
      role: 'condition',
      fragmentSha256: entry.fragmentSha256,
    })),
  ];
  const relations = [
    { kind: 'exact_model_scope', fromAnchorId: 'subject', toAnchorId: 'label', witnessAnchorIds: ['witness_1'] },
    { kind: 'same_table_row', fromAnchorId: 'label', toAnchorId: 'value', witnessAnchorIds: ['witness_2'] },
    { kind: 'same_table_row', fromAnchorId: 'value', toAnchorId: 'unit', witnessAnchorIds: ['witness_3'] },
  ];
  const objectBytes = new Map([
    [ownerPath, ownerBytes],
    [pdfPath, pdfBytes],
    [mineruPath, mineruBytes],
    [witnessPath, witnessBytes],
  ]);
  const objectRefs = [
    { sha256: pdfHash, objectPath: pdfPath, byteSize: pdfBytes.length },
    { sha256: mineruHash, objectPath: mineruPath, byteSize: mineruBytes.length },
    { sha256: witnessHash, objectPath: witnessPath, byteSize: witnessBytes.length },
  ];
  return {
    input: {
      adapterKind: 'installation',
      caseInput: {
        ownerOrigin: {
          containerSha256: ownerHash,
          objectPath: ownerPath,
          byteSize: ownerBytes.length,
          jsonPointer: '/receipts/0',
        },
        selectedIndex: null,
      },
      originalSourceReceipt: null,
      sourceRecord: null,
      artifactRecords: [pdfArtifact, mineruArtifact, witnessArtifact],
      fragments: [subject, label, value, unit, ...witnessFragments],
      readObject: (objectPath) => objectBytes.get(objectPath),
      fieldAttestations: [{
        kind: 'installation_v1',
        installationReceipt: receipt,
        mineruIndexEntry: indexEntry,
        factBindingId: 'fact_dw60ut4i2_width',
        anchorIds: ['subject', 'label', 'value', 'unit'],
        anchorProof: {
          sourceArtifactSha256: pdfHash,
          anchors,
          relations,
        },
        objectRefs,
      }],
      historicalPolicies: {
        canonicalizationVersion: CANONICAL_EVIDENCE_JSON_VERSION,
        semantics: SEMANTICS,
        rightsDictionary: JSON.parse(readFileSync(
          new URL('../../data/architecture-v2/policies/product-data-field-rights-dictionary.json', import.meta.url),
          'utf8',
        )),
      },
    },
    identity,
    objectBytes,
  };
}

// This is intentionally an in-memory, synthetic test product sheet. Its URL,
// PDF, MinerU JSON, owner container and G3a closure are byte-bound test
// material only; it is not a claim about Beko's real BDF1620W evidence.
function portableSyntheticInstallationFixture({ structure = 'table', scalar = '598', selected = 'width', field = 'closedEnvelope.widthMm', labelText = 'Unpackaged Width', extraModelHeading = false, headingHtml = '', htmlPrefix = '', tableTailHtml = '', afterTableHtml = '', omitTableEnd = false, omitCellEnd = false, explicitScalarRow = true, scalarPadding = '', scalarSeparator = ' ', headerLabel = 'Dimensions' } = {}) {
  const structured = structure === 'table';
  const identity = {
    canonicalProductId: 'fa_prod_444444444444444444444444',
    brand: structured ? 'Electrolux' : 'Beko',
    model: structured ? 'EWF7524CDWA-PORTABLE-SYNTHETIC' : 'BDF1620W-PORTABLE-SYNTHETIC',
    category: structured ? 'washing_machine' : 'dishwasher',
  };
  const pdfBytes = Buffer.from('%PDF-1.7\n% G4b synthetic product sheet: ' + identity.model + '\n%%EOF\n');
  const pdfHash = sha256(pdfBytes);
  const pdfPath = `evidence/test-fixtures/g4b/sha256/${pdfHash.slice(0, 2)}/${pdfHash}.pdf`;
  const sourceUrl = structured
    ? 'https://www.electrolux.com.au/test-fixtures/EWF7524CDWA-PORTABLE-SYNTHETIC.pdf'
    : 'https://www.beko.com/au-en/test-fixtures/BDF1620W-PORTABLE-SYNTHETIC-product-sheet.pdf';
  const table = (model) => htmlPrefix + '<table><caption>' + model + '</caption>'
    + '<tr><th>' + headerLabel + '</th><th>Value</th></tr>'
    + (extraModelHeading ? '<tr><th>EWFOTHER-SYNTHETIC</th></tr>' : '')
    + headingHtml
    + (explicitScalarRow ? '<tr>' : '') + '<td>' + labelText + (omitCellEnd ? '' : '</td>') + '<td>'
    + scalarPadding + scalar + scalarSeparator + 'mm' + scalarPadding + (omitCellEnd ? '' : '</td>')
    + (explicitScalarRow ? '</tr>' : '')
    + (selected === 'cross_row' ? '<tr><td>Unpackaged Depth</td><td>' + scalar + ' mm</td></tr>' : '')
    + tableTailHtml
    + (omitTableEnd ? '' : '</table>')
    + afterTableHtml
    + (selected === 'wrong_field' ? '<table><caption>' + model + '</caption>'
      + '<tr><td>Unpackaged Depth</td><td>' + scalar + ' mm</td></tr></table>' : '');
  const mineruDocument = [[
    {
      type: 'page_header',
      content: {
        page_header_content: [{
          type: 'text',
          content: identity.model + ' Freestanding Product Dimensions',
        }],
      },
      bbox: [40, 40, 880, 90],
    },
    {
      type: structured ? 'table' : 'paragraph',
      content: structured ? { html: table(identity.model) } : {
        paragraph_content: [{ type: 'text', content: 'Unpackaged Width ' + scalar + ' mm' }],
      },
      bbox: [80, 180, 540, 240],
    },
    ...(structured ? [{
      type: 'table',
      content: { html: table('EWFOTHER-SYNTHETIC') },
      bbox: [80, 400, 540, 550],
    }] : []),
  ]];
  if (selected === 'shadow') mineruDocument[0].push({
    type: 'paragraph', bbox: [30, 700, 100, 800],
    content: { paragraph_content: [{ type: 'text', content: 'No measurements here' }] },
    metadata: { copiedHtml: table(identity.model) },
  });
  const mineruBytes = selected === 'shadow'
    ? Buffer.from(JSON.stringify(mineruDocument).replace('"html":"<table>', '"html":"\\u003ctable>'))
    : jsonBytes(mineruDocument);
  const mineruHash = sha256(mineruBytes);
  const mineruPath = `evidence/derived/mineru-json/sha256/${mineruHash.slice(0, 2)}/${mineruHash.slice(2, 4)}/${mineruHash}.json`;
  const indexEntry = {
    sourcePdfSha256: pdfHash,
    byteSize: pdfBytes.length,
    paths: [pdfPath],
    status: 'indexed',
    parserVersion: '3.4.4',
    modelRevision: 'ed6b654c018d742e65a17671e379c5e6ecc87ec9',
    derivedArtifact: {
      schemaVersion: 1,
      format: 'content_list_v2',
      parserName: 'MinerU',
      parserVersion: '3.4.4',
      modelRevision: 'ed6b654c018d742e65a17671e379c5e6ecc87ec9',
      sourcePdfSha256: pdfHash,
      contentSha256: mineruHash,
      objectPath: mineruPath,
      byteSize: mineruBytes.length,
      pageCount: 1,
    },
  };
  const receipt = createInstallationFieldReceipt({
    ...identity,
    formFactor: null,
    field,
    applicability: 'required',
    value: Number(scalar),
    unit: 'mm',
    sourceUrl,
    sourceStatus: 'current',
    observedAt: '2026-09-15T00:00:00.000Z',
    pdfSha256: pdfHash,
    mineru: {
      format: 'content_list_v2',
      contentSha256: mineruHash,
      objectPath: mineruPath,
      parserName: 'MinerU',
      parserVersion: '3.4.4',
      modelRevision: indexEntry.modelRevision,
    },
    locator: {
      page: 1,
      itemIndex: 1,
      itemType: structured ? 'table' : 'paragraph',
      bbox: [80, 180, 540, 240],
    },
    quote: structured ? table(identity.model) : 'Unpackaged Width ' + scalar + ' mm',
    identityOutcome: 'exact',
    applicableModels: [identity.model],
    identityLocators: [{
      page: 1,
      itemIndex: 0,
      itemType: 'page_header',
      bbox: [40, 40, 880, 90],
      quote: identity.model + ' Freestanding Product Dimensions',
    }],
  });
  const ownerContainer = { receipts: [receipt] };
  const ownerBytes = jsonBytes(ownerContainer);
  const ownerPath = 'evidence/test-fixtures/g4b/portable-synthetic-installation-receipts.json';
  const mineruText = mineruBytes.toString('utf8');
  const headerRaw = fragment({
    content: mineruDocument[0][0],
    parentArtifactSha256: mineruHash,
    locator: { kind: 'json_pointer', pointer: '/0/0' },
  });
  const regionRaw = fragment({
    content: mineruDocument[0][1],
    parentArtifactSha256: mineruHash,
    locator: { kind: 'json_pointer', pointer: '/0/1' },
  });
  const firstCaption = mineruText.indexOf('<caption>');
  const subjectOffset = selected === 'wrong_field'
    ? mineruText.indexOf('<caption>', firstCaption + 1)
    : selected === 'shadow' ? mineruText.indexOf('"copiedHtml"') : firstCaption;
  const subject = fragment({
    content: identity.model,
    parentArtifactSha256: mineruHash,
    locator: textSpan(mineruText, identity.model, structured ? subjectOffset : 0),
  });
  const selectedLabel = selected === 'wrong_field' ? 'Unpackaged Depth' : labelText;
  const fieldOffset = mineruText.indexOf(selectedLabel,
    selected === 'wrong_sku' ? mineruText.indexOf('<caption>EWFOTHER-SYNTHETIC')
      : selected === 'shadow' ? mineruText.indexOf('"copiedHtml"') : 0);
  const valueOffset = selected === 'cross_row' ? mineruText.indexOf('Unpackaged Depth') : fieldOffset;
  const label = fragment({
    content: selectedLabel,
    parentArtifactSha256: mineruHash,
    locator: textSpan(mineruText, selectedLabel, fieldOffset),
  });
  const value = fragment({
    content: scalar,
    parentArtifactSha256: mineruHash,
    locator: textSpan(mineruText, scalar, valueOffset),
  });
  const unitStart = mineruText.indexOf('mm', mineruText.indexOf(scalar, valueOffset));
  const unit = fragment({
    content: 'mm',
    parentArtifactSha256: mineruHash,
    locator: {
      kind: 'text_span',
      startUtf16CodeUnit: unitStart,
      endUtf16CodeUnit: unitStart + 2,
    },
  });
  const witnesses = [
    { kind: 'relation_witness', relationKind: 'exact_model_scope', fromFragmentSha256: subject.fragmentSha256, toFragmentSha256: label.fragmentSha256 },
    { kind: 'relation_witness', relationKind: 'same_table_row', fromFragmentSha256: label.fragmentSha256, toFragmentSha256: value.fragmentSha256 },
    { kind: 'relation_witness', relationKind: 'same_table_row', fromFragmentSha256: value.fragmentSha256, toFragmentSha256: unit.fragmentSha256 },
  ];
  const witnessBytes = jsonBytes(witnesses);
  const witnessHash = sha256(witnessBytes);
  const witnessPath = 'evidence/test-fixtures/g4b/portable-synthetic-anchor-witnesses.json';
  const witnessFragments = witnesses.map((content, index) => fragment({
    content,
    parentArtifactSha256: witnessHash,
    locator: { kind: 'json_pointer', pointer: `/${index}` },
  }));
  const anchors = [
    { anchorId: 'subject', role: 'subject', fragmentSha256: subject.fragmentSha256 },
    { anchorId: 'label', role: 'legend', fragmentSha256: label.fragmentSha256 },
    { anchorId: 'value', role: 'value', fragmentSha256: value.fragmentSha256 },
    { anchorId: 'unit', role: 'unit', fragmentSha256: unit.fragmentSha256 },
    ...witnessFragments.map((entry, index) => ({
      anchorId: `witness_${index + 1}`,
      role: 'condition',
      fragmentSha256: entry.fragmentSha256,
    })),
  ];
  const relations = [
    { kind: 'exact_model_scope', fromAnchorId: 'subject', toAnchorId: 'label', witnessAnchorIds: ['witness_1'] },
    { kind: 'same_table_row', fromAnchorId: 'label', toAnchorId: 'value', witnessAnchorIds: ['witness_2'] },
    { kind: 'same_table_row', fromAnchorId: 'value', toAnchorId: 'unit', witnessAnchorIds: ['witness_3'] },
  ];
  const inspection = inspectExtractionRegions({
    nativeObservations: [],
    mineruDocument: {
      contentSha256: mineruHash,
      sourcePdfSha256: pdfHash,
      pageCount: 1,
      blocks: [
        { sourceJsonPointer: '/0/0', fragmentSha256: headerRaw.fragmentSha256, rawBlock: mineruDocument[0][0] },
        { sourceJsonPointer: '/0/1', fragmentSha256: regionRaw.fragmentSha256, rawBlock: mineruDocument[0][1] },
      ],
    },
    pageImageMetadata: [],
  });
  assert.equal(inspection.status, 'inspected');
  const regionObservation = inspection.regions.find((region) => region.sourceJsonPointer === '/0/1');
  assert.ok(regionObservation, 'synthetic MinerU region must be inspectable');
  const profilePolicy = fileReference('../../data/architecture-v3/policies/document-family-profiles.json');
  const brandRegistry = fileReference('../../data/architecture-v3/generated/brand-registry.json');
  const profileReplay = {
    profilePolicyRef: profilePolicy.ref,
    brandRegistryRef: brandRegistry.ref,
    documentType: 'manufacturer_product_sheet',
    regionObservation,
  };
  const pdfArtifact = createArtifactRecord({
    sha256: pdfHash,
    parentSha256: null,
    mediaType: 'application/pdf',
    toolRevision: null,
    optionsSha256: null,
  });
  const mineruArtifact = createArtifactRecord({
    sha256: mineruHash,
    parentSha256: pdfHash,
    mediaType: 'application/json',
    toolRevision: 'MinerU@3.4.4',
    optionsSha256: sha256('portable-synthetic-mineru-options-v1'),
  });
  const witnessArtifact = createArtifactRecord({
    sha256: witnessHash,
    parentSha256: mineruHash,
    mediaType: 'application/json',
    toolRevision: 'g4b-portable-synthetic-relation-witness@1',
    optionsSha256: sha256('portable-synthetic-witness-options-v1'),
  });
  const objectBytes = new Map([
    [ownerPath, ownerBytes],
    [pdfPath, pdfBytes],
    [mineruPath, mineruBytes],
    [witnessPath, witnessBytes],
    [profilePolicy.ref.objectPath, profilePolicy.bytes],
    [brandRegistry.ref.objectPath, brandRegistry.bytes],
  ]);
  const objectRefs = [
    { sha256: pdfHash, objectPath: pdfPath, byteSize: pdfBytes.length },
    { sha256: mineruHash, objectPath: mineruPath, byteSize: mineruBytes.length },
    { sha256: witnessHash, objectPath: witnessPath, byteSize: witnessBytes.length },
    profilePolicy.ref,
    brandRegistry.ref,
  ];
  return {
    input: {
      adapterKind: 'installation',
      caseInput: {
        ownerOrigin: {
          containerSha256: sha256(ownerBytes),
          objectPath: ownerPath,
          byteSize: ownerBytes.length,
          jsonPointer: '/receipts/0',
        },
        selectedIndex: null,
      },
      originalSourceReceipt: null,
      sourceRecord: null,
      artifactRecords: [pdfArtifact, mineruArtifact, witnessArtifact],
      fragments: [headerRaw, regionRaw, subject, label, value, unit, ...witnessFragments],
      readObject: (objectPath) => objectBytes.get(objectPath),
      fieldAttestations: [{
        kind: 'installation_v1',
        installationReceipt: receipt,
        mineruIndexEntry: indexEntry,
        factBindingId: 'fact_beko_portable_synthetic_width',
        anchorIds: ['subject', 'label', 'value', 'unit'],
        anchorProof: {
          sourceArtifactSha256: pdfHash,
          anchors,
          relations,
        },
        objectRefs,
        profileReplay,
      }],
      historicalPolicies: {
        canonicalizationVersion: CANONICAL_EVIDENCE_JSON_VERSION,
        semantics: SEMANTICS,
        rightsDictionary: JSON.parse(readFileSync(
          new URL('../../data/architecture-v2/policies/product-data-field-rights-dictionary.json', import.meta.url),
          'utf8',
        )),
      },
    },
    identity,
    receipt,
    indexEntry,
    objectBytes,
    pdfPath,
    mineruDocument,
  };
}

function directClaimReceiptRequest({ sourceBinding, factBindingId, readObject }) {
  const fact = sourceBinding.verifiedFactBindings.find((candidate) => (
    candidate.factBindingId === factBindingId
  ));
  assert.ok(fact, 'direct receipt test fixture must resolve its fact binding');
  const claim = createEvidenceClaimV3({
    subject: {
      canonicalProductId: sourceBinding.case.canonicalProductId,
      market: sourceBinding.case.market,
    },
    field: fact.field,
    value: fact.value,
    semantics: fact.semantics,
    context: fact.context,
    sourceRepresentation: fact.sourceRepresentation,
    evidence: {
      sourceArtifactSha256: fact.evidence.sourceArtifactSha256,
      anchors: fact.evidence.anchors,
      relations: fact.evidence.relations,
    },
    applicabilityProof: fact.applicabilityProof,
    semanticPolicySha256: sourceBinding.policy.semanticPolicySha256,
    extractionProfileSha256: fact.extractionProfileSha256,
    derivedFromClaimId: null,
    validationInputs: {
      semantics: sourceBinding.replayInputs.historicalPolicies.semantics,
      witnessedConditions: [],
      artifactRecords: sourceBinding.g3aProof.artifactRecords,
      fragments: sourceBinding.g3aProof.fragments,
    },
  });
  return {
    claim,
    sourceBinding,
    factBindingId,
    anchors: fact.evidence,
    toolchain: {
      g3aProofSha256: sourceBinding.g3aProof.g3aProofSha256,
      profileIdentity: fact.profileResolution.profileIdentity,
    },
    policy: {
      source: sourceBinding.policy.source,
      semanticPolicySha256: sourceBinding.policy.semanticPolicySha256,
      rightsDictionary: sourceBinding.policy.rightsDictionary,
    },
    rightsDecisions: {
      providerId: 'g4b_portable_synthetic_test_provider',
      requests: [],
    },
    readObject,
  };
}

function resealClaim(claim) {
  const { claimId: ignoredClaimId, ...identityPayload } = claim;
  return {
    ...claim,
    claimId: sha256(canonicalEvidenceJson(identityPayload)),
  };
}

function resealReceipt(receipt) {
  const { receiptId: ignoredReceiptId, ...identityPayload } = receipt;
  return {
    ...receipt,
    receiptId: sha256(canonicalEvidenceJson(identityPayload)),
  };
}

function bdfRealSourceProfileFixture() {
  const ownerPath = 'data/architecture-v2/reviews/automated/historical-evidence-recovery-acceptance-bundle.json';
  const ownerBytes = readFileSync(new URL('../../data/architecture-v2/reviews/automated/historical-evidence-recovery-acceptance-bundle.json', import.meta.url));
  const owner = JSON.parse(ownerBytes.toString('utf8'));
  const entryIndex = 289;
  const sourceRecord = owner.entries[entryIndex].sources[0];
  const sourceBytes = readFileSync(resolve(EVIDENCE_ROOT, sourceRecord.objectPath));
  const mineruBytes = readFileSync(resolve(EVIDENCE_ROOT, sourceRecord.derivedArtifact.objectPath));
  const fallbackBytes = readFileSync(resolve(EVIDENCE_ROOT, sourceRecord.derivedArtifact.fallbackTrigger.objectPath));
  const discoveryBytes = readFileSync(resolve(EVIDENCE_ROOT, sourceRecord.discoveryProvenance.discoveryObjectPath));
  const mineruDocument = JSON.parse(mineruBytes.toString('utf8'));
  const mineruText = mineruBytes.toString('utf8');
  const sourceHash = sourceRecord.contentSha256;
  const mineruHash = sourceRecord.derivedArtifact.contentSha256;
  const regionContent = mineruDocument[0][15];
  const region = fragment({
    content: regionContent,
    parentArtifactSha256: mineruHash,
    locator: { kind: 'json_pointer', pointer: '/0/15' },
  });
  const subject = fragment({
    content: 'BDF1620W',
    parentArtifactSha256: mineruHash,
    locator: textSpan(mineruText, 'BDF1620W'),
  });
  const dimensionsOffset = mineruText.indexOf('Unpackaged Width');
  const label = fragment({
    content: 'Unpackaged Width',
    parentArtifactSha256: mineruHash,
    locator: textSpan(mineruText, 'Unpackaged Width', dimensionsOffset),
  });
  const value = fragment({
    content: '598',
    parentArtifactSha256: mineruHash,
    locator: textSpan(mineruText, '598', dimensionsOffset),
  });
  const unitStart = mineruText.indexOf('mm', mineruText.indexOf('598', dimensionsOffset));
  const unit = fragment({
    content: 'mm',
    parentArtifactSha256: mineruHash,
    locator: { kind: 'text_span', startUtf16CodeUnit: unitStart, endUtf16CodeUnit: unitStart + 2 },
  });
  // This is a test-only G3a relation closure over real BDF bytes. It verifies
  // profile-owner replay only; the test must never produce a Claim or receipt.
  const witnesses = [
    { kind: 'relation_witness', relationKind: 'exact_model_scope', fromFragmentSha256: subject.fragmentSha256, toFragmentSha256: label.fragmentSha256 },
    { kind: 'relation_witness', relationKind: 'same_table_row', fromFragmentSha256: label.fragmentSha256, toFragmentSha256: value.fragmentSha256 },
    { kind: 'relation_witness', relationKind: 'same_table_row', fromFragmentSha256: value.fragmentSha256, toFragmentSha256: unit.fragmentSha256 },
  ];
  const witnessBytes = jsonBytes(witnesses);
  const witnessHash = sha256(witnessBytes);
  const witnessPath = 'evidence/derived/g4b-fixtures/bdf-profile-test-witnesses.json';
  const witnessFragments = witnesses.map((content, index) => fragment({
    content,
    parentArtifactSha256: witnessHash,
    locator: { kind: 'json_pointer', pointer: `/${index}` },
  }));
  const anchors = [
    { anchorId: 'subject', role: 'subject', fragmentSha256: subject.fragmentSha256 },
    { anchorId: 'label', role: 'legend', fragmentSha256: label.fragmentSha256 },
    { anchorId: 'value', role: 'value', fragmentSha256: value.fragmentSha256 },
    { anchorId: 'unit', role: 'unit', fragmentSha256: unit.fragmentSha256 },
    ...witnessFragments.map((entry, index) => ({ anchorId: `witness_${index + 1}`, role: 'condition', fragmentSha256: entry.fragmentSha256 })),
  ];
  const relations = [
    { kind: 'exact_model_scope', fromAnchorId: 'subject', toAnchorId: 'label', witnessAnchorIds: ['witness_1'] },
    { kind: 'same_table_row', fromAnchorId: 'label', toAnchorId: 'value', witnessAnchorIds: ['witness_2'] },
    { kind: 'same_table_row', fromAnchorId: 'value', toAnchorId: 'unit', witnessAnchorIds: ['witness_3'] },
  ];
  const { profileReplay, profileOwners } = existingBdfProfileReplay();
  const objectRefs = [
    { sha256: sourceHash, objectPath: sourceRecord.objectPath, byteSize: sourceBytes.length },
    { sha256: mineruHash, objectPath: sourceRecord.derivedArtifact.objectPath, byteSize: mineruBytes.length },
    { sha256: sourceRecord.derivedArtifact.fallbackTrigger.contentSha256, objectPath: sourceRecord.derivedArtifact.fallbackTrigger.objectPath, byteSize: fallbackBytes.length },
    { sha256: sourceRecord.discoveryProvenance.discoveryContentSha256, objectPath: sourceRecord.discoveryProvenance.discoveryObjectPath, byteSize: discoveryBytes.length },
    { sha256: witnessHash, objectPath: witnessPath, byteSize: witnessBytes.length },
    ...profileOwners.map(({ ref }) => ref),
  ];
  const objectBytes = new Map([
    [ownerPath, ownerBytes],
    [sourceRecord.objectPath, sourceBytes],
    [sourceRecord.derivedArtifact.objectPath, mineruBytes],
    [sourceRecord.derivedArtifact.fallbackTrigger.objectPath, fallbackBytes],
    [sourceRecord.discoveryProvenance.discoveryObjectPath, discoveryBytes],
    [witnessPath, witnessBytes],
    ...profileOwners.map(({ ref, bytes }) => [ref.objectPath, bytes]),
  ]);
  return {
    input: {
      adapterKind: 'manufacturer',
      caseInput: {
        ownerOrigin: {
          containerSha256: sha256(ownerBytes),
          objectPath: ownerPath,
          byteSize: ownerBytes.length,
          jsonPointer: `/entries/${entryIndex}`,
        },
        selectedIndex: 0,
      },
      originalSourceReceipt: sourceRecord.verificationReceipt,
      sourceRecord,
      artifactRecords: [
        createArtifactRecord({ sha256: sourceHash, parentSha256: null, mediaType: 'application/pdf', toolRevision: null, optionsSha256: null }),
        createArtifactRecord({ sha256: mineruHash, parentSha256: sourceHash, mediaType: 'application/json', toolRevision: 'MinerU@3.4.4:bff20d4ae2bf202df9f45284b4d43681555a97ed', optionsSha256: 'd513469d6132acf55bd8d7d4c4170e09e3b9ba918654973e30abeb1deed0c1e1' }),
        createArtifactRecord({ sha256: witnessHash, parentSha256: mineruHash, mediaType: 'application/json', toolRevision: 'g4b-test-relation-witness@1', optionsSha256: sha256('g4b-test-relation-witness-options-v1') }),
      ],
      fragments: [region, subject, label, value, unit, ...witnessFragments],
      readObject: (objectPath) => objectBytes.get(objectPath),
      fieldAttestations: [{
        kind: 'manufacturer_v2',
        sourceClaimIndex: 0,
        factBindingId: 'fact_bdf1620w_width',
        anchorIds: ['subject', 'label', 'value', 'unit'],
        anchorProof: { sourceArtifactSha256: sourceHash, anchors, relations },
        objectRefs,
        profileReplay,
      }],
      historicalPolicies: {
        canonicalizationVersion: CANONICAL_EVIDENCE_JSON_VERSION,
        semantics: SEMANTICS,
        rightsDictionary: JSON.parse(readFileSync(
          new URL('../../data/architecture-v2/policies/product-data-field-rights-dictionary.json', import.meta.url),
          'utf8',
        )),
      },
    },
    profileSha256: 'c32ffcf74bfe0d99b06039d4900ef6ba413603f54ecef5cb710f1e4e5d92bee2',
  };
}

function realInstallationReplayFixture(receiptId) {
  const ownerPath = 'data/architecture-v2/reviews/automated/installation-evidence-receipts.json';
  const auditPath = 'data/architecture-v2/reviews/automated/historical-mineru-backfill-audit.json';
  const ownerBytes = readFileSync(new URL('../../data/architecture-v2/reviews/automated/installation-evidence-receipts.json', import.meta.url));
  const owner = JSON.parse(ownerBytes.toString('utf8'));
  const receiptIndex = owner.receipts.findIndex((receipt) => receipt.receiptId === receiptId);
  assert.notEqual(receiptIndex, -1, `real installation receipt must exist: ${receiptId}`);
  const receipt = owner.receipts[receiptIndex];
  const audit = JSON.parse(readFileSync(
    new URL('../../data/architecture-v2/reviews/automated/historical-mineru-backfill-audit.json', import.meta.url),
    'utf8',
  ));
  const indexEntry = audit.entries.find((entry) => entry.sourcePdfSha256 === receipt.evidence.pdfSha256);
  assert.ok(indexEntry, `real MinerU index entry must exist: ${receiptId}`);
  const pdfPath = indexEntry.paths[0];
  const pdfBytes = readFileSync(resolve(EVIDENCE_ROOT, pdfPath));
  const mineruBytes = readFileSync(resolve(EVIDENCE_ROOT, receipt.evidence.mineru.objectPath));
  const objectBytes = new Map([
    [ownerPath, ownerBytes],
    [pdfPath, pdfBytes],
    [receipt.evidence.mineru.objectPath, mineruBytes],
  ]);
  const objectRefs = [
    { sha256: receipt.evidence.pdfSha256, objectPath: pdfPath, byteSize: pdfBytes.length },
    {
      sha256: receipt.evidence.mineru.contentSha256,
      objectPath: receipt.evidence.mineru.objectPath,
      byteSize: mineruBytes.length,
    },
  ];
  return {
    receipt,
    indexEntry,
    mineruBytes,
    input: {
      adapterKind: 'installation',
      caseInput: {
        ownerOrigin: {
          containerSha256: sha256(ownerBytes),
          objectPath: ownerPath,
          byteSize: ownerBytes.length,
          jsonPointer: `/receipts/${receiptIndex}`,
        },
        selectedIndex: null,
      },
      originalSourceReceipt: null,
      sourceRecord: null,
      artifactRecords: [],
      fragments: [],
      readObject: (objectPath) => objectBytes.get(objectPath),
      fieldAttestations: [{
        kind: 'installation_v1',
        installationReceipt: receipt,
        mineruIndexEntry: indexEntry,
        factBindingId: `candidate_${receipt.receiptId}`,
        anchorIds: ['missing_g3a_anchor'],
        anchorProof: {
          sourceArtifactSha256: receipt.evidence.pdfSha256,
          anchors: [],
          relations: [],
        },
        objectRefs,
      }],
      historicalPolicies: {
        canonicalizationVersion: CANONICAL_EVIDENCE_JSON_VERSION,
        semantics: SEMANTICS,
        rightsDictionary: JSON.parse(readFileSync(
          new URL('../../data/architecture-v2/policies/product-data-field-rights-dictionary.json', import.meta.url),
          'utf8',
        )),
      },
    },
  };
}

function realInstallationCanariesAvailable() {
  try {
    const receipts = JSON.parse(readFileSync(
      new URL('../../data/architecture-v2/reviews/automated/installation-evidence-receipts.json', import.meta.url),
      'utf8',
    )).receipts;
    const audit = JSON.parse(readFileSync(
      new URL('../../data/architecture-v2/reviews/automated/historical-mineru-backfill-audit.json', import.meta.url),
      'utf8',
    ));
    return INSTALLATION_RECEIPT_IDS.every((receiptId) => {
      const receipt = receipts.find((candidate) => candidate.receiptId === receiptId);
      const indexEntry = audit.entries.find((entry) => entry.sourcePdfSha256 === receipt?.evidence?.pdfSha256);
      return Boolean(receipt && indexEntry
        && existsSync(resolve(EVIDENCE_ROOT, indexEntry.paths[0]))
        && existsSync(resolve(EVIDENCE_ROOT, receipt.evidence.mineru.objectPath)));
    });
  } catch {
    return false;
  }
}

test('verifyAndBindSource replays original manufacturer bytes before deriving an exact fact binding', () => {
  const { input, canonicalProductId } = originalSourceFixture();

  const binding = verifyAndBindSource(input);

  assert.equal(binding.case.canonicalProductId, canonicalProductId);
  assert.equal(binding.authority, 'manufacturer');
  assert.equal(binding.verifiedFactBindings.length, 1);
  assert.deepEqual(binding.verifiedFactBindings[0].value, {
    kind: 'fixed', value: 913, unit: 'mm',
  });
  assert.equal(binding.verifiedFactBindings[0].field, 'closedEnvelope.widthMm');
});

test('verifyAndBindSource replays a standalone installation receipt with its PDF, MinerU and index', () => {
  const { input, identity } = installationSourceFixture();

  const binding = verifyAndBindSource(input);

  assert.equal(binding.case.canonicalProductId, identity.canonicalProductId);
  assert.equal(binding.case.market, 'AU');
  assert.equal(binding.authority, 'official');
  assert.equal(binding.documentRole, 'unknown');
  assert.deepEqual(binding.verifiedFactBindings[0].value, {
    kind: 'fixed', value: 597, unit: 'mm',
  });
});

test('leaves sources without an existing profile owner as factual candidates and never uses the G3a proof digest as a profile', () => {
  const fixtures = [originalSourceFixture(), installationSourceFixture()];

  for (const { input } of fixtures) {
    const binding = verifyAndBindSource(input);
    const fact = binding.verifiedFactBindings[0];

    assert.equal(fact.claimEligible, false);
    assert.deepEqual(fact.profileResolution, {
      status: 'unresolved',
      reason: 'EXTRACTION_PROFILE_UNRESOLVED',
    });
    assert.equal(Object.hasOwn(fact, 'extractionProfileSha256'), false);
    assert.match(binding.g3aProof.g3aProofSha256, /^[a-f0-9]{64}$/u);
    assert.equal(Object.hasOwn(binding.g3aProof, 'extractionProfileSha256'), false);
  }
});

test('never exposes mutable shared UNKNOWN_CONTEXT through either direct binding adapter', () => {
  const fixtures = [originalSourceFixture(), installationSourceFixture()];

  for (const { input } of fixtures) {
    const binding = verifyAndBindSource(input);
    const context = binding.verifiedFactBindings[0].context;

    assert.ok(Object.isFrozen(context));
    assert.ok(Object.isFrozen(context.conditions));
    assert.ok(Object.isFrozen(context.operatingState));
    assert.throws(() => context.conditions.push({ parameter: 'tamper' }), TypeError);
    assert.throws(() => { context.operatingState.kind = 'closed'; }, TypeError);

    assert.deepEqual(verifyAndBindSource(input), binding);
    assert.deepEqual(
      replayVerifiedSourceBinding({ sourceBinding: binding, readObject: input.readObject }),
      binding,
    );
  }
});

test('binds case identity only from the immutable owner and rejects a caller-mutated source record', () => {
  const injectedCase = originalSourceFixture();
  injectedCase.input.caseInput.market = 'AU';
  assert.throws(
    () => verifyAndBindSource(injectedCase.input),
    (error) => error?.code === 'UNKNOWN_KEY',
  );

  const mutatedSource = originalSourceFixture();
  mutatedSource.input.sourceRecord = {
    ...mutatedSource.input.sourceRecord,
    sourceUrl: 'https://www.westinghouse.com.au/fridges/different-sku/',
  };
  assert.throws(
    () => verifyAndBindSource(mutatedSource.input),
    (error) => error?.code === 'CASE_SOURCE_MISMATCH',
  );
});

test('rejects source-byte drift and an unproved multi-model subject row', () => {
  const byteDrift = originalSourceFixture();
  const sourcePath = byteDrift.input.sourceRecord.objectPath;
  const changedBytes = Buffer.from(byteDrift.objectBytes.get(sourcePath));
  changedBytes[0] = changedBytes[0] === 60 ? 33 : 60;
  byteDrift.objectBytes.set(sourcePath, changedBytes);
  assert.throws(
    () => verifyAndBindSource(byteDrift.input),
    (error) => error?.code === 'OBJECT_HASH_DRIFT',
  );

  const multiModel = originalSourceFixture({ subjectAnchorText: 'WHE6874BA / WHE6874SA' });
  assert.throws(
    () => verifyAndBindSource(multiModel.input),
    (error) => error?.code === 'UNPROVED_MODEL_SCOPE',
  );
});

test('preserves real BDF historical replay while its paragraph row assertion stays a candidate gap', {
  skip: !existsSync(resolve(EVIDENCE_ROOT, 'evidence/web/sha256/fe/73/fe7384670caa100d2845dd16570af6143a7bf649cb670742d5b399af18c2e283.pdf')),
}, () => {
  const { input } = bdfRealSourceProfileFixture();
  const source = input.sourceRecord;
  verifyAttestedResolutionArtifact({
    source,
    caseIdentity: { brand: 'Beko', model: 'BDF1620W', category: 'dishwasher' },
    bytes: input.readObject(source.objectPath),
    derivedArtifactBytes: input.readObject(source.derivedArtifact.objectPath),
    fallbackTriggerArtifactBytes: input.readObject(source.derivedArtifact.fallbackTrigger.objectPath),
    discoveryArtifactBytes: input.readObject(source.discoveryProvenance.discoveryObjectPath),
  });
  assert.throws(() => verifyAndBindSource(input),
    (error) => error?.code === 'SOURCE_RELATION_CANDIDATE_GAP');
});

test('rejects a closed profile replay when its existing G3b region belongs to a different original source', () => {
  const { input, objectBytes } = originalSourceFixture({
    caseIdentity: { brand: 'Beko', model: 'BDF1620W', category: 'dishwasher' },
    sourceUrl: 'https://www.beko.com/au-en/bdf1620w',
    sourceLabel: 'Unpackaged Width',
    sourceValue: 598,
    canonicalProductId: 'fa_prod_333333333333333333333333',
  });
  const { profileReplay, profileOwners } = existingBdfProfileReplay();
  input.fieldAttestations[0].profileReplay = profileReplay;
  for (const { ref, bytes } of profileOwners) {
    input.fieldAttestations[0].objectRefs.push(ref);
    objectBytes.set(ref.objectPath, bytes);
  }

  assert.throws(
    () => verifyAndBindSource(input),
    (error) => error?.code === 'PROFILE_SOURCE_ROOT_MISMATCH',
  );
});

test('direct receipt construction replays the standalone installation binding and blocks its unresolved profile before considering caller Claim bytes', async () => {
  const { input } = installationSourceFixture();
  const sourceBinding = verifyAndBindSource(input);

  await assert.rejects(
    createDirectClaimReceipt({
      claim: {},
      sourceBinding,
      factBindingId: 'fact_dw60ut4i2_width',
      anchors: {},
      toolchain: {},
      policy: {},
      rightsDecisions: {},
      readObject: input.readObject,
    }),
    (error) => error instanceof EvidenceClaimReceiptValidationError
      && error.code === 'EXTRACTION_PROFILE_UNRESOLVED',
  );
});

test('receipt replay cannot turn the real BDF paragraph candidate into a direct Claim', {
  skip: !existsSync(resolve(EVIDENCE_ROOT, 'evidence/web/sha256/fe/73/fe7384670caa100d2845dd16570af6143a7bf649cb670742d5b399af18c2e283.pdf')),
}, async () => {
  const { input } = bdfRealSourceProfileFixture();
  const sourceBinding = { ...JSON.parse(JSON.stringify({
    schemaVersion: 1, canonicalizationVersion: CANONICAL_EVIDENCE_JSON_VERSION,
    adapterKind: 'manufacturer', case: {}, source: {}, authority: 'manufacturer', documentRole: 'unknown',
    verifiedFactBindings: [], g3aProof: {}, policy: {}, replayInputs: { ...input, readObject: undefined },
    bindingId: '0'.repeat(64),
  })) };

  await assert.rejects(
    createDirectClaimReceipt({
      claim: {},
      sourceBinding,
      factBindingId: 'fact_bdf1620w_width',
      anchors: {},
      toolchain: {},
      policy: {},
      rightsDecisions: {},
      readObject: input.readObject,
    }),
    (error) => error instanceof EvidenceClaimReceiptValidationError
      && error.code === 'SOURCE_BINDING_REPLAY_FAILED' && /table/.test(error.message),
  );
});

test('constructs, serializes and replays one portable synthetic Electrolux table Claim receipt through the existing installation and profile producers', async (t) => {
  const portable = portableSyntheticInstallationFixture();
  const installationReplay = replayInstallationFieldReceipt(portable.receipt, {
    jsonBytes: portable.input.readObject(portable.receipt.evidence.mineru.objectPath),
    indexEntry: portable.indexEntry,
  });
  assert.equal(installationReplay.status, 'PASS');

  const sourceBinding = verifyAndBindSource(portable.input);
  const fact = sourceBinding.verifiedFactBindings[0];
  assert.equal(sourceBinding.case.market, 'AU');
  assert.equal(fact.claimEligible, true);
  assert.deepEqual(fact.context, {
    configurationKey: null,
    conditions: [],
    referenceDatum: 'unknown',
    operatingState: { kind: 'unknown', angleDegrees: null },
  });
  assert.deepEqual(fact.profileResolution.profileIdentity, {
    profileId: 'electrolux-au-washer-table-v1',
    profileSha256: '9791f3b295cefaa62840b610ad156a9be8223747eb10ae4ce6aac28b3369b4e2',
  });
  assert.notEqual(fact.extractionProfileSha256, sourceBinding.g3aProof.g3aProofSha256);

  const request = directClaimReceiptRequest({
    sourceBinding,
    factBindingId: fact.factBindingId,
    readObject: portable.input.readObject,
  });
  assert.deepEqual(Object.keys(request.claim.evidence).sort(), [
    'anchors',
    'relations',
    'sourceArtifactSha256',
  ]);
  assert.deepEqual(request.claim.evidence, {
    sourceArtifactSha256: fact.evidence.sourceArtifactSha256,
    anchors: fact.evidence.anchors,
    relations: fact.evidence.relations,
  });
  assert.equal(Object.hasOwn(request.claim.evidence, 'artifactRecords'), false);
  const constructed = await createDirectClaimReceipt(request);
  const serialized = JSON.parse(JSON.stringify(constructed));
  const replayed = await verifyDirectClaimReceipt({
    receipt: serialized,
    readObject: portable.input.readObject,
  });

  t.diagnostic('G4b-portable-receipt ' + JSON.stringify({ scenario: 'table-width', receiptId: constructed.receiptId }));
  assert.equal(constructed.receiptType, 'EvidenceClaimReceipt');
  assert.equal(Object.hasOwn(serialized.sourceBinding, 'verified'), false);
  assert.deepEqual(constructed.anchors, fact.evidence);
  assert.ok(Object.hasOwn(constructed.anchors, 'artifactRecords'));
  assert.notDeepEqual(constructed.claim.evidence, constructed.anchors);
  assert.deepEqual(replayed, constructed);
  assert.ok(serialized.rightsDecisions.length > 0);
  assert.ok(serialized.rightsDecisions.every((decision) => decision.state === 'unknown_blocked'));
});

test('rejects portable receipt mutations to byte source, Claim projection, full anchors, profile, policy, rights and proof-only metadata', async () => {
  const portable = portableSyntheticInstallationFixture();
  const sourceBinding = verifyAndBindSource(portable.input);
  const factBindingId = sourceBinding.verifiedFactBindings[0].factBindingId;
  const receipt = JSON.parse(JSON.stringify(await createDirectClaimReceipt(directClaimReceiptRequest({
    sourceBinding,
    factBindingId,
    readObject: portable.input.readObject,
  }))));

  const sourceDriftObjects = new Map(portable.objectBytes);
  const driftedPdf = Buffer.from(sourceDriftObjects.get(portable.pdfPath));
  driftedPdf[driftedPdf.length - 2] ^= 1;
  sourceDriftObjects.set(portable.pdfPath, driftedPdf);
  await assert.rejects(
    verifyDirectClaimReceipt({ receipt, readObject: (objectPath) => sourceDriftObjects.get(objectPath) }),
    (error) => error instanceof EvidenceClaimReceiptValidationError
      && error.code === 'SOURCE_BINDING_REPLAY_FAILED',
  );

  const changedClaimSourceArtifact = JSON.parse(JSON.stringify(receipt));
  changedClaimSourceArtifact.claim = resealClaim({
    ...changedClaimSourceArtifact.claim,
    evidence: {
      ...changedClaimSourceArtifact.claim.evidence,
      sourceArtifactSha256: 'c'.repeat(64),
    },
  });
  await assert.rejects(
    verifyDirectClaimReceipt({
      receipt: resealReceipt(changedClaimSourceArtifact),
      readObject: portable.input.readObject,
    }),
    (error) => error instanceof EvidenceClaimReceiptValidationError
      && error.code === 'CLAIM_VALIDATION_FAILED',
  );

  const changedClaimAnchors = JSON.parse(JSON.stringify(receipt));
  changedClaimAnchors.claim = resealClaim({
    ...changedClaimAnchors.claim,
    evidence: {
      ...changedClaimAnchors.claim.evidence,
      anchors: changedClaimAnchors.claim.evidence.anchors.map((anchor, index) => (
        index === 0 ? { ...anchor, fragmentSha256: 'd'.repeat(64) } : anchor
      )),
    },
  });
  await assert.rejects(
    verifyDirectClaimReceipt({ receipt: resealReceipt(changedClaimAnchors), readObject: portable.input.readObject }),
    (error) => error instanceof EvidenceClaimReceiptValidationError
      && error.code === 'CLAIM_VALIDATION_FAILED',
  );

  const changedClaimRelations = JSON.parse(JSON.stringify(receipt));
  changedClaimRelations.claim = resealClaim({
    ...changedClaimRelations.claim,
    evidence: {
      ...changedClaimRelations.claim.evidence,
      relations: changedClaimRelations.claim.evidence.relations.map((relation, index) => (
        index === 0 ? { ...relation, kind: 'diagram_legend' } : relation
      )),
    },
  });
  await assert.rejects(
    verifyDirectClaimReceipt({ receipt: resealReceipt(changedClaimRelations), readObject: portable.input.readObject }),
    (error) => error instanceof EvidenceClaimReceiptValidationError
      && error.code === 'CLAIM_VALIDATION_FAILED',
  );

  const changedClaim = JSON.parse(JSON.stringify(receipt));
  changedClaim.claim = resealClaim({
    ...changedClaim.claim,
    value: { ...changedClaim.claim.value, value: 599 },
    sourceRepresentation: { ...changedClaim.claim.sourceRepresentation, value: 599 },
  });
  await assert.rejects(
    verifyDirectClaimReceipt({ receipt: resealReceipt(changedClaim), readObject: portable.input.readObject }),
    (error) => error instanceof EvidenceClaimReceiptValidationError
      && error.code === 'CLAIM_FACT_MISMATCH',
  );

  const changedAnchors = JSON.parse(JSON.stringify(receipt));
  changedAnchors.anchors.anchors[0].anchorId = 'tampered_subject';
  await assert.rejects(
    verifyDirectClaimReceipt({ receipt: resealReceipt(changedAnchors), readObject: portable.input.readObject }),
    (error) => error instanceof EvidenceClaimReceiptValidationError
      && error.code === 'ANCHOR_BINDING_MISMATCH',
  );

  const changedProfile = JSON.parse(JSON.stringify(receipt));
  changedProfile.toolchain.profileIdentity.profileSha256 = 'a'.repeat(64);
  await assert.rejects(
    verifyDirectClaimReceipt({ receipt: resealReceipt(changedProfile), readObject: portable.input.readObject }),
    (error) => error instanceof EvidenceClaimReceiptValidationError
      && error.code === 'TOOLCHAIN_BINDING_MISMATCH',
  );

  const changedPolicy = JSON.parse(JSON.stringify(receipt));
  changedPolicy.policy.semanticPolicySha256 = 'b'.repeat(64);
  await assert.rejects(
    verifyDirectClaimReceipt({ receipt: resealReceipt(changedPolicy), readObject: portable.input.readObject }),
    (error) => error instanceof EvidenceClaimReceiptValidationError
      && error.code === 'POLICY_BINDING_MISMATCH',
  );

  const changedRights = JSON.parse(JSON.stringify(receipt));
  changedRights.rightsRequest.providerId = 'g4b_portable_synthetic_tampered_provider';
  await assert.rejects(
    verifyDirectClaimReceipt({ receipt: resealReceipt(changedRights), readObject: portable.input.readObject }),
    (error) => error instanceof EvidenceClaimReceiptValidationError
      && error.code === 'RECEIPT_REPLAY_MISMATCH',
  );

  const changedProofMetadata = JSON.parse(JSON.stringify(receipt));
  const proofOnlyRecord = changedProofMetadata.sourceBinding.replayInputs.artifactRecords
    .find((record) => record.parentSha256 !== null);
  assert.ok(proofOnlyRecord, 'portable fixture must include a derived G3a artifact record');
  proofOnlyRecord.toolRevision = `${proofOnlyRecord.toolRevision}-tampered`;
  assert.equal(Object.hasOwn(changedProofMetadata.claim.evidence, 'artifactRecords'), false);
  await assert.rejects(
    verifyDirectClaimReceipt({ receipt: resealReceipt(changedProofMetadata), readObject: portable.input.readObject }),
    (error) => error instanceof EvidenceClaimReceiptValidationError
      && error.code === 'SOURCE_BINDING_REPLAY_FAILED',
  );
});

test('replays both genuine standalone installation receipts before retaining their missing G3a closure as a candidate gap', {
  skip: !realInstallationCanariesAvailable(),
}, () => {
  for (const receiptId of INSTALLATION_RECEIPT_IDS) {
    const { receipt, indexEntry, mineruBytes, input } = realInstallationReplayFixture(receiptId);
    const historicalReplay = replayInstallationFieldReceipt(receipt, { jsonBytes: mineruBytes, indexEntry });

    assert.deepEqual(historicalReplay, {
      receiptId,
      canonicalProductId: receipt.canonicalProductId,
      field: receipt.field,
      status: 'PASS',
      pdfSha256: receipt.evidence.pdfSha256,
      mineruContentSha256: receipt.evidence.mineru.contentSha256,
    });
    assert.throws(
      () => verifyAndBindSource(input),
      (error) => error?.code === 'INVALID_G3A_ANCHOR_PROOF',
    );
  }
});

test('direct receipt verification dispatches by the named receipt contract, not schemaVersion alone', async () => {
  const legacySchemaThree = {
    receiptType: 'ManufacturerVerificationReceipt',
    schemaVersion: 3,
    canonicalizationVersion: CANONICAL_EVIDENCE_JSON_VERSION,
    claim: {},
    sourceBinding: { bindingId: 'a'.repeat(64) },
    sourceBindingId: 'a'.repeat(64),
    factBindingId: 'legacy_width',
    anchors: {},
    toolchain: {},
    policy: {},
    rightsRequest: {},
    rightsDecisions: [],
    receiptId: 'b'.repeat(64),
  };

  await assert.rejects(
    verifyDirectClaimReceipt({ receipt: legacySchemaThree, readObject: () => undefined }),
    (error) => error instanceof EvidenceClaimReceiptValidationError
      && error.code === 'UNSUPPORTED_RECEIPT_TYPE',
  );
});

test('rejects a self-consistent caller semantics policy that is not the frozen G4b policy identity', () => {
  const { input } = originalSourceFixture();
  const tamperedSemantics = JSON.parse(canonicalEvidenceJson(input.historicalPolicies.semantics));
  tamperedSemantics.semanticPolicy.policyVersion = 'caller-invented-policy-version';
  tamperedSemantics.semanticPolicySha256 = sha256(canonicalEvidenceJson(tamperedSemantics.semanticPolicy));
  input.historicalPolicies.semantics = tamperedSemantics;

  assert.throws(
    () => verifyAndBindSource(input),
    (error) => error?.code === 'UNSUPPORTED_SEMANTIC_POLICY',
  );
});

test('rejects a caller-mutated rights action set instead of silently omitting public_display', () => {
  const { input } = originalSourceFixture();
  input.historicalPolicies.rightsDictionary.rights.actions = input.historicalPolicies.rightsDictionary
    .rights.actions.filter((action) => action.id !== 'public_display');

  assert.throws(
    () => verifyAndBindSource(input),
    (error) => error?.code === 'UNSUPPORTED_RIGHTS_DICTIONARY',
  );
});

test('direct receipt construction rejects a rehashed serialized binding whose G3a proof digest was changed', async () => {
  const { input } = installationSourceFixture();
  const sourceBinding = JSON.parse(canonicalEvidenceJson(verifyAndBindSource(input)));
  sourceBinding.g3aProof.g3aProofSha256 = 'a'.repeat(64);
  const { bindingId: ignoredBindingId, ...bindingIdentity } = sourceBinding;
  sourceBinding.bindingId = sha256(canonicalEvidenceJson(bindingIdentity));

  await assert.rejects(
    createDirectClaimReceipt({
      claim: {},
      sourceBinding,
      factBindingId: 'fact_dw60ut4i2_width',
      anchors: {},
      toolchain: {},
      policy: {},
      rightsDecisions: {},
      readObject: input.readObject,
    }),
    (error) => error instanceof EvidenceClaimReceiptValidationError
      && error.code === 'SOURCE_BINDING_REPLAY_FAILED',
  );
});

test('source binding rejects accessor input without running its getter', () => {
  const { input } = originalSourceFixture();
  let getterReads = 0;
  Object.defineProperty(input, 'adapterKind', {
    enumerable: true,
    get() {
      getterReads += 1;
      return 'manufacturer';
    },
  });

  assert.throws(
    () => verifyAndBindSource(input),
    (error) => error?.code === 'UNSAFE_JSON',
  );
  assert.equal(getterReads, 0);
});

test('direct receipt creation rejects an accessor readObject without running its getter', async () => {
  const { input } = installationSourceFixture();
  const request = {
    claim: {},
    sourceBinding: verifyAndBindSource(input),
    factBindingId: 'fact_dw60ut4i2_width',
    anchors: {},
    toolchain: {},
    policy: {},
    rightsDecisions: {},
  };
  let getterReads = 0;
  Object.defineProperty(request, 'readObject', {
    enumerable: true,
    get() {
      getterReads += 1;
      return input.readObject;
    },
  });

  await assert.rejects(
    createDirectClaimReceipt(request),
    (error) => error instanceof EvidenceClaimReceiptValidationError
      && error.code === 'UNSAFE_JSON',
  );
  assert.equal(getterReads, 0);
});

function rehashRelationWitnesses(fixture) {
  const input = fixture.input;
  const attestation = input.fieldAttestations[0];
  const oldWitnessIds = new Set(attestation.anchorProof.relations.flatMap((r) => r.witnessAnchorIds));
  const oldWitnesses = attestation.anchorProof.anchors.filter((a) => oldWitnessIds.has(a.anchorId));
  const oldFragmentIds = new Set(oldWitnesses.map((a) => a.fragmentSha256));
  const oldArtifactIds = new Set(input.fragments.filter((f) => oldFragmentIds.has(f.fragmentSha256)).map((f) => f.parentArtifactSha256));
  const byId = new Map(attestation.anchorProof.anchors.map((a) => [a.anchorId, a]));
  // Fresh bytes, hashes, witness fragments, refs and later binding/receipt IDs.
  // This tool name is intentionally unrelated to the auditor's PoC name.
  const contents = attestation.anchorProof.relations.map((r) => ({
    kind: 'relation_witness', relationKind: r.kind,
    fromFragmentSha256: byId.get(r.fromAnchorId).fragmentSha256,
    toFragmentSha256: byId.get(r.toAnchorId).fragmentSha256,
  }));
  const bytes = Buffer.from(JSON.stringify(contents, null, 3));
  const hash = sha256(bytes);
  const path = 'evidence/test-fixtures/g4b/recalculated-relations.json';
  const fragments = contents.map((content, i) => fragment({
    content, parentArtifactSha256: hash, locator: { kind: 'json_pointer', pointer: '/' + i },
  }));
  input.artifactRecords = input.artifactRecords.filter((a) => !oldArtifactIds.has(a.sha256));
  input.artifactRecords.push(createArtifactRecord({
    sha256: hash, parentSha256: attestation.anchorProof.sourceArtifactSha256,
    mediaType: 'application/json', toolRevision: 'ordinary-json-writer@37',
    optionsSha256: sha256('independent-rehashed-request'),
  }));
  input.fragments = input.fragments.filter((f) => !oldFragmentIds.has(f.fragmentSha256)).concat(fragments);
  attestation.anchorProof.anchors = attestation.anchorProof.anchors.filter((a) => !oldWitnessIds.has(a.anchorId))
    .concat(fragments.map((f, i) => ({ anchorId: 'rehashed_' + i, role: 'condition', fragmentSha256: f.fragmentSha256 })));
  attestation.anchorProof.relations.forEach((r, i) => { r.witnessAnchorIds = ['rehashed_' + i]; });
  attestation.objectRefs = attestation.objectRefs.filter((r) => !oldArtifactIds.has(r.sha256));
  attestation.objectRefs.push({ sha256: hash, objectPath: path, byteSize: bytes.length });
  fixture.objectBytes.set(path, bytes);
}

function assertHistoricalInstallationPass(fixture) {
  assert.equal(replayInstallationFieldReceipt(fixture.receipt, {
    jsonBytes: fixture.input.readObject(fixture.receipt.evidence.mineru.objectPath),
    indexEntry: fixture.indexEntry,
  }).status, 'PASS');
}

test('repair F1: paragraph cannot assert same_table_row after full historical replay', () => {
  const fixture = portableSyntheticInstallationFixture({ structure: 'paragraph' });
  assertHistoricalInstallationPass(fixture);
  assert.throws(() => verifyAndBindSource(fixture.input),
    (error) => error?.code === 'SOURCE_RELATION_CANDIDATE_GAP');
});

test('repair F1: fully rehashed false witness cannot acquire semantic authority with unchanged source', () => {
  const fixture = portableSyntheticInstallationFixture({ structure: 'paragraph' });
  const original = {
    receipt: JSON.stringify(fixture.receipt),
    pdf: sha256(fixture.input.readObject(fixture.pdfPath)),
    mineru: sha256(fixture.input.readObject(fixture.receipt.evidence.mineru.objectPath)),
  };
  rehashRelationWitnesses(fixture);
  assert.deepEqual({
    receipt: JSON.stringify(fixture.receipt),
    pdf: sha256(fixture.input.readObject(fixture.pdfPath)),
    mineru: sha256(fixture.input.readObject(fixture.receipt.evidence.mineru.objectPath)),
  }, original);
  assertHistoricalInstallationPass(fixture);
  assert.throws(() => verifyAndBindSource(fixture.input),
    (error) => error?.code === 'SOURCE_RELATION_CANDIDATE_GAP');
});

for (const selected of ['wrong_sku', 'cross_row']) {
  test('repair F1: same PDF ' + selected + ' rejects with every fragment and witness rehashed', () => {
    const fixture = portableSyntheticInstallationFixture({ selected });
    assertHistoricalInstallationPass(fixture);
    rehashRelationWitnesses(fixture);
    assert.throws(() => verifyAndBindSource(fixture.input),
      (error) => error?.code === 'SOURCE_RELATION_CANDIDATE_GAP');
  });
}

test('repair F2: manufacturer factory preserves decimal cm under existing integer-mm legacy rules', () => {
  const { input } = originalSourceFixture({ sourceValue: 598, sourceScalar: '59.8', sourceUnit: 'cm', sourceLabel: 'Width' });
  const binding = verifyAndBindSource(input);
  assert.deepEqual(binding.verifiedFactBindings[0].value, { kind: 'fixed', value: 598, unit: 'mm' });
  assert.equal(binding.verifiedFactBindings[0].sourceRepresentation.value, 59.8);
  assert.equal(binding.verifiedFactBindings[0].sourceRepresentation.sourceUnit, 'cm');
});

test('repair F2: installation factory preserves allowed fractional hose mm through receipt JSON replay', async (t) => {
  const fixture = portableSyntheticInstallationFixture({
    scalar: '598.5', field: 'waterConnection.hoseReachMm', labelText: 'Water inlet hose length',
  });
  assertHistoricalInstallationPass(fixture);
  const sourceBinding = verifyAndBindSource(fixture.input);
  const fact = sourceBinding.verifiedFactBindings[0];
  assert.deepEqual(fact.value, { kind: 'fixed', value: 598.5, unit: 'mm' });
  const receipt = await createDirectClaimReceipt(directClaimReceiptRequest({
    sourceBinding, factBindingId: fact.factBindingId, readObject: fixture.input.readObject,
  }));
  const replayed = await verifyDirectClaimReceipt({
    receipt: JSON.parse(JSON.stringify(receipt)), readObject: fixture.input.readObject,
  });
  t.diagnostic('G4b-portable-receipt ' + JSON.stringify({ scenario: 'fractional-hose', receiptId: receipt.receiptId }));
  assert.equal(replayed.claim.sourceRepresentation.value, 598.5);
  assert.equal(replayed.claim.value.value, 598.5);
});

test('repair F1: row semantic replay rejects a same-valued depth row claimed as width', () => {
  const fixture = portableSyntheticInstallationFixture({ selected: 'wrong_field' });
  assertHistoricalInstallationPass(fixture);
  rehashRelationWitnesses(fixture);
  assert.throws(() => verifyAndBindSource(fixture.input),
    (error) => error?.code === 'SOURCE_RELATION_CANDIDATE_GAP');
});

test('repair F2: legacy width precision remains an explicit rejection without rounding', () => {
  const fixture = portableSyntheticInstallationFixture({ scalar: '598.5' });
  assertHistoricalInstallationPass(fixture);
  assert.throws(() => verifyAndBindSource(fixture.input),
    (error) => error?.code === 'FIELD_SEMANTICS_MISMATCH' && /whole canonical millimetre/.test(error.message));
});

test('repair F1: every extra emitted relation must have source authority', () => {
  const fixture = portableSyntheticInstallationFixture();
  assertHistoricalInstallationPass(fixture);
  fixture.input.fieldAttestations[0].anchorProof.relations.push({
    kind: 'same_table_row', fromAnchorId: 'subject', toAnchorId: 'value', witnessAnchorIds: ['witness_1'],
  });
  rehashRelationWitnesses(fixture);
  assert.throws(() => verifyAndBindSource(fixture.input),
    (error) => error?.code === 'SOURCE_RELATION_CANDIDATE_GAP');
});

test('repair F1: caller-derived table bytes cannot replace the attested MinerU relation endpoints', () => {
  const fixture = portableSyntheticInstallationFixture();
  assertHistoricalInstallationPass(fixture);
  const text = fixture.mineruDocument[0][1].content.html;
  const bytes = Buffer.from(text);
  const hash = sha256(bytes);
  const path = 'evidence/test-fixtures/g4b/unattested-table.html';
  fixture.objectBytes.set(path, bytes);
  fixture.input.artifactRecords.push(createArtifactRecord({
    sha256: hash, parentSha256: fixture.receipt.evidence.mineru.contentSha256,
    mediaType: 'text/html', toolRevision: 'MinerU@3.4.4', optionsSha256: sha256('ordinary-options'),
  }));
  const attestation = fixture.input.fieldAttestations[0];
  attestation.objectRefs.push({ sha256: hash, objectPath: path, byteSize: bytes.length });
  for (const id of ['subject', 'label', 'value', 'unit']) {
    const anchor = attestation.anchorProof.anchors.find((a) => a.anchorId === id);
    const oldFragment = fixture.input.fragments.find((f) => f.fragmentSha256 === anchor.fragmentSha256);
    const newFragment = fragment({
      content: oldFragment.content, parentArtifactSha256: hash,
      locator: textSpan(text, oldFragment.content),
    });
    fixture.input.fragments.push(newFragment);
    anchor.fragmentSha256 = newFragment.fragmentSha256;
  }
  rehashRelationWitnesses(fixture);
  assert.throws(() => verifyAndBindSource(fixture.input),
    (error) => error?.code === 'SOURCE_RELATION_CANDIDATE_GAP');
});

test('repair F1: truthful rehashed witnesses replay as a distinct binding under the same actual source row', async (t) => {
  const fixture = portableSyntheticInstallationFixture();
  const before = verifyAndBindSource(fixture.input);
  rehashRelationWitnesses(fixture);
  const after = verifyAndBindSource(fixture.input);
  assert.notEqual(after.bindingId, before.bindingId);
  assert.notEqual(after.g3aProof.g3aProofSha256, before.g3aProof.g3aProofSha256);
  assert.deepEqual(after.source, before.source);
  assert.throws(() => replayVerifiedSourceBinding({
    sourceBinding: { ...before, replayInputs: after.replayInputs }, readObject: fixture.input.readObject,
  }), (error) => error?.code === 'BINDING_REPLAY_MISMATCH');
  const receipt = await createDirectClaimReceipt(directClaimReceiptRequest({
    sourceBinding: after, factBindingId: after.verifiedFactBindings[0].factBindingId,
    readObject: fixture.input.readObject,
  }));
  assert.deepEqual(await verifyDirectClaimReceipt({
    receipt: JSON.parse(JSON.stringify(receipt)), readObject: fixture.input.readObject,
  }), receipt);
  t.diagnostic('G4b-portable-receipt ' + JSON.stringify({ scenario: 'rehashed-truthful-row', receiptId: receipt.receiptId }));
});

test('repair F2: actual manufacturer factory rejects malformed decimal tokens', () => {
  for (const sourceScalar of ['5.98e2', '+598', '0598', '598..0', String.raw`598\a`]) {
    const { input } = originalSourceFixture({ sourceValue: 598, sourceScalar });
    assert.throws(() => verifyAndBindSource(input),
      (error) => error?.code === 'UNSUPPORTED_SOURCE_VALUE', sourceScalar);
  }
});

test('repair F1: an intervening wrong-SKU heading cannot borrow an earlier exact caption', () => {
  const fixture = portableSyntheticInstallationFixture({ extraModelHeading: true });
  assertHistoricalInstallationPass(fixture);
  rehashRelationWitnesses(fixture);
  assert.throws(() => verifyAndBindSource(fixture.input),
    (error) => error?.code === 'SOURCE_RELATION_CANDIDATE_GAP');
});

test('repair F1: noncanonical JSON cannot redirect a table locator into copied metadata bytes', () => {
  const fixture = portableSyntheticInstallationFixture({ selected: 'shadow' });
  assertHistoricalInstallationPass(fixture);
  rehashRelationWitnesses(fixture);
  assert.throws(() => verifyAndBindSource(fixture.input),
    (error) => error?.code === 'SOURCE_RELATION_CANDIDATE_GAP');
});

for (const cell of ['th', 'td']) {
  test(`repair R2: orphan ${cell} wrong-model row cannot issue or replay an exact-model receipt`, async (t) => {
    // Rebuild the original bytes, historical receipt and entire G3a closure
    // from this malformed source, rather than corrupting an existing digest.
    const fixture = portableSyntheticInstallationFixture({ headingHtml: `<${cell}>EWFOTHER-SYNTHETIC</${cell}>` });
    assertHistoricalInstallationPass(fixture);
    t.diagnostic(`G4b-r2-historical-PASS orphan-${cell}`);
    await assert.rejects(async () => {
      const binding = verifyAndBindSource(fixture.input);
      const receipt = await createDirectClaimReceipt(directClaimReceiptRequest({
        sourceBinding: binding, factBindingId: binding.verifiedFactBindings[0].factBindingId,
        readObject: fixture.input.readObject,
      }));
      assert.deepEqual(await verifyDirectClaimReceipt({
        receipt: JSON.parse(JSON.stringify(receipt)), readObject: fixture.input.readObject,
      }), receipt);
      // A RED-only full capture of what the actual pre-fix factories issued.
      // The private R2 replay diagnostic rechecks these exact serialized receipts.
      t.diagnostic('G4b-r2-bypass-receipt ' + JSON.stringify({ cell, receipt }));
    }, (error) => error?.code === 'SOURCE_RELATION_CANDIDATE_GAP');

    // A stored envelope may replace its replay inputs and rehash its outer ID;
    // replay must still reject on source semantics, not just digest inequality.
    const control = portableSyntheticInstallationFixture();
    const controlBinding = verifyAndBindSource(control.input);
    const stored = JSON.parse(JSON.stringify(await createDirectClaimReceipt(directClaimReceiptRequest({
      sourceBinding: controlBinding, factBindingId: controlBinding.verifiedFactBindings[0].factBindingId,
      readObject: control.input.readObject,
    }))));
    const { readObject, ...replayInputs } = fixture.input;
    stored.sourceBinding.replayInputs = replayInputs;
    await assert.rejects(verifyDirectClaimReceipt({ receipt: resealReceipt(stored), readObject }),
      (error) => error?.code === 'SOURCE_BINDING_REPLAY_FAILED' && /exact source table row/.test(error.message));
  });
}

test('repair R2: UTF-16 prefix preserves exact original MinerU spans through receipt JSON replay', async (t) => {
  const fixture = portableSyntheticInstallationFixture({ htmlPrefix: '<!--测🧭-->\n' });
  assertHistoricalInstallationPass(fixture);
  const control = portableSyntheticInstallationFixture();
  for (const id of ['subject', 'label', 'value', 'unit']) {
    const selected = (f) => {
      const hash = f.input.fieldAttestations[0].anchorProof.anchors.find((a) => a.anchorId === id).fragmentSha256;
      return f.input.fragments.find((entry) => entry.fragmentSha256 === hash);
    };
    const actual = selected(fixture), baseline = selected(control);
    // Hand-derived: 11 UTF-16 units; JSON newline escaping adds one unit.
    // UTF-8 bytes/code points are NOT the original text_span coordinate space.
    assert.equal(actual.locator.startUtf16CodeUnit - baseline.locator.startUtf16CodeUnit, 12);
    const raw = fixture.input.readObject(fixture.receipt.evidence.mineru.objectPath).toString('utf8');
    assert.equal(raw.slice(actual.locator.startUtf16CodeUnit, actual.locator.endUtf16CodeUnit), actual.content);
  }
  const binding = verifyAndBindSource(fixture.input);
  const receipt = await createDirectClaimReceipt(directClaimReceiptRequest({
    sourceBinding: binding, factBindingId: binding.verifiedFactBindings[0].factBindingId,
    readObject: fixture.input.readObject,
  }));
  assert.deepEqual(receipt.claim.value, { kind: 'fixed', value: 598, unit: 'mm' });
  assert.deepEqual(await verifyDirectClaimReceipt({
    receipt: JSON.parse(JSON.stringify(receipt)), readObject: fixture.input.readObject,
  }), receipt);
  t.diagnostic('G4b-portable-receipt ' + JSON.stringify({ scenario: 'r2-utf16-prefix', receiptId: receipt.receiptId }));
});

test('repair R2: an implicit scalar row without an original row span remains a candidate gap', () => {
  const fixture = portableSyntheticInstallationFixture({ explicitScalarRow: false });
  assertHistoricalInstallationPass(fixture);
  assert.throws(() => verifyAndBindSource(fixture.input),
    (error) => error?.code === 'SOURCE_RELATION_CANDIDATE_GAP');
});

test('repair R2: CRLF scalar edge whitespace retains raw offsets after a UTF-16 prefix', async (t) => {
  const fixture = portableSyntheticInstallationFixture({ htmlPrefix: '<!--测🧭-->\n', scalarPadding: '\r\n' });
  assertHistoricalInstallationPass(fixture);
  t.diagnostic('G4b-r2-historical-PASS CRLF-scalar-edges');
  const control = portableSyntheticInstallationFixture();
  for (const [id, expectedShift] of [['subject', 12], ['label', 12], ['value', 16], ['unit', 16]]) {
    const selected = (f) => {
      const hash = f.input.fieldAttestations[0].anchorProof.anchors.find((a) => a.anchorId === id).fragmentSha256;
      return f.input.fragments.find((entry) => entry.fragmentSha256 === hash);
    };
    // Prefix contributes 12 raw-JSON UTF-16 units; escaped CRLF adds FOUR,
    // not the one normalized LF that parse5 exposes as node.data.
    assert.equal(selected(fixture).locator.startUtf16CodeUnit - selected(control).locator.startUtf16CodeUnit, expectedShift);
  }
  const binding = verifyAndBindSource(fixture.input);
  const receipt = await createDirectClaimReceipt(directClaimReceiptRequest({
    sourceBinding: binding, factBindingId: binding.verifiedFactBindings[0].factBindingId,
    readObject: fixture.input.readObject,
  }));
  assert.deepEqual(receipt.claim.value, { kind: 'fixed', value: 598, unit: 'mm' });
  assert.deepEqual(await verifyDirectClaimReceipt({
    receipt: JSON.parse(JSON.stringify(receipt)), readObject: fixture.input.readObject,
  }), receipt);
  t.diagnostic('G4b-portable-receipt ' + JSON.stringify({ scenario: 'r2-crlf-edges', receiptId: receipt.receiptId }));
});

for (const [name, scalarSeparator] of [['interior CRLF', '\r\n'], ['encoded space entity', '&#32;']]) {
  test(`repair R2: scalar ${name} cannot be normalized into supported source syntax`, () => {
    const fixture = portableSyntheticInstallationFixture({ scalarSeparator });
    assertHistoricalInstallationPass(fixture);
    assert.throws(() => verifyAndBindSource(fixture.input),
      (error) => error?.code === 'SOURCE_RELATION_CANDIDATE_GAP');
  });
}

for (const [name, options, oldReceiptId] of [
  ['fostered heading', { headingHtml: '<h2>EWFOTHER-SYNTHETIC</h2>' },
    'df2ddb9d86bd6326188830012197b59a12cf40d9a9e2b9e5ed24ea7b3abcb78e'],
  ['fostered text', { headingHtml: 'EWFOTHER-SYNTHETIC' },
    'e8e286aa198196dfc117421c05445e56f1a61f9b1acff27c1fc0ad76b3e3f1e5'],
  ['discarded token between rows', { headingHtml: '</section>' }, null],
  ['discarded token within header text', { headerLabel: 'Dimen</section>sions' }, null],
]) {
  test(`repair R3: ${name} cannot disappear from original table scope`, async (t) => {
    // These bytes are rebuilt through all original producers. The discarded
    // end tag has no DOM node; it is unsupported raw markup, not an invented
    // model conflict. A text-node span must not hide it by spanning the gap.
    const fixture = portableSyntheticInstallationFixture(options);
    assertHistoricalInstallationPass(fixture);
    t.diagnostic(`G4b-r3-historical-PASS ${name}`);
    await assert.rejects(async () => {
      const binding = verifyAndBindSource(fixture.input);
      const receipt = await createDirectClaimReceipt(directClaimReceiptRequest({
        sourceBinding: binding, factBindingId: binding.verifiedFactBindings[0].factBindingId,
        readObject: fixture.input.readObject,
      }));
      assert.deepEqual(await verifyDirectClaimReceipt({
        receipt: JSON.parse(JSON.stringify(receipt)), readObject: fixture.input.readObject,
      }), receipt);
      if (oldReceiptId) assert.equal(receipt.receiptId, oldReceiptId);
      t.diagnostic('G4b-r3-bypass-receipt ' + JSON.stringify({ scenario: name, receipt }));
    }, (error) => error?.code === 'SOURCE_RELATION_CANDIDATE_GAP');

    const control = portableSyntheticInstallationFixture();
    const binding = verifyAndBindSource(control.input);
    const stored = JSON.parse(JSON.stringify(await createDirectClaimReceipt(directClaimReceiptRequest({
      sourceBinding: binding, factBindingId: binding.verifiedFactBindings[0].factBindingId,
      readObject: control.input.readObject,
    }))));
    const { readObject, ...replayInputs } = fixture.input;
    stored.sourceBinding.replayInputs = replayInputs;
    await assert.rejects(verifyDirectClaimReceipt({ receipt: resealReceipt(stored), readObject }),
      (error) => error?.code === 'SOURCE_BINDING_REPLAY_FAILED' && /exact source table row/.test(error.message));
  });
}

test('repair R3: benign original table whitespace preserves supported binding and implicit tbody grouping', () => {
  const fixture = portableSyntheticInstallationFixture({ headingHtml: ' \t\r\n ' });
  assertHistoricalInstallationPass(fixture);
  const binding = verifyAndBindSource(fixture.input);
  assert.equal(binding.verifiedFactBindings[0].claimEligible, true);
  assert.deepEqual(binding.verifiedFactBindings[0].value, { kind: 'fixed', value: 598, unit: 'mm' });
  assert.deepEqual(replayVerifiedSourceBinding({ sourceBinding: binding, readObject: fixture.input.readObject }), binding);
});

test('repair R3-1: an implicitly terminated source table cannot hide a conflicting tail', async () => {
  const fixture = portableSyntheticInstallationFixture({
    tableTailHtml: '<table></table><h2>EWFOTHER-SYNTHETIC</h2>',
  });
  assertHistoricalInstallationPass(fixture);
  assert.throws(() => verifyAndBindSource(fixture.input),
    (error) => error?.code === 'SOURCE_RELATION_CANDIDATE_GAP');

  const control = portableSyntheticInstallationFixture();
  const binding = verifyAndBindSource(control.input);
  const stored = JSON.parse(JSON.stringify(await createDirectClaimReceipt(directClaimReceiptRequest({
    sourceBinding: binding, factBindingId: binding.verifiedFactBindings[0].factBindingId,
    readObject: control.input.readObject,
  }))));
  const { readObject, ...replayInputs } = fixture.input;
  stored.sourceBinding.replayInputs = replayInputs;
  await assert.rejects(verifyDirectClaimReceipt({ receipt: resealReceipt(stored), readObject }),
    (error) => error?.code === 'SOURCE_BINDING_REPLAY_FAILED');
});

test('repair R3-1: EOF cannot stand in for the selected table end tag', () => {
  const fixture = portableSyntheticInstallationFixture({ omitTableEnd: true });
  assertHistoricalInstallationPass(fixture);
  assert.throws(() => verifyAndBindSource(fixture.input),
    (error) => error?.code === 'SOURCE_RELATION_CANDIDATE_GAP');
});

test('repair R3-1: an explicitly closed table remains valid before a separate table', () => {
  const fixture = portableSyntheticInstallationFixture({
    afterTableHtml: '<table><caption>EWFOTHER-SYNTHETIC</caption><tr><td>Depth</td><td>777 mm</td></tr></table>',
  });
  assertHistoricalInstallationPass(fixture);
  const binding = verifyAndBindSource(fixture.input);
  assert.equal(binding.verifiedFactBindings[0].claimEligible, true);
  assert.deepEqual(replayVerifiedSourceBinding({ sourceBinding: binding, readObject: fixture.input.readObject }), binding);
});

test('repair R3-1: omitted child cell end tags preserve a bounded table', () => {
  const fixture = portableSyntheticInstallationFixture({ omitCellEnd: true });
  assertHistoricalInstallationPass(fixture);
  const binding = verifyAndBindSource(fixture.input);
  assert.equal(binding.verifiedFactBindings[0].claimEligible, true);
  assert.deepEqual(replayVerifiedSourceBinding({ sourceBinding: binding, readObject: fixture.input.readObject }), binding);
});

test('repair R3-1: manufacturer HTML also rejects an implicit table boundary', () => {
  const fixture = originalSourceFixture({ tableTailHtml: '<table></table><h2>OTHER-MODEL</h2>' });
  assert.throws(() => verifyAndBindSource(fixture.input),
    (error) => error?.code === 'SOURCE_RELATION_CANDIDATE_GAP');
});

test('repair R3-1: manufacturer HTML retains an explicitly bounded table', () => {
  const fixture = originalSourceFixture({
    afterTableHtml: '<table><caption>OTHER-MODEL</caption><tr><td>Depth</td><td>777 mm</td></tr></table>',
  });
  const binding = verifyAndBindSource(fixture.input);
  assert.deepEqual(binding.verifiedFactBindings[0].value, { kind: 'fixed', value: 913, unit: 'mm' });
  assert.deepEqual(replayVerifiedSourceBinding({ sourceBinding: binding, readObject: fixture.input.readObject }), binding);
});

test('repair R3-1: a literal end tag inside a comment cannot close a table', () => {
  const fixture = portableSyntheticInstallationFixture({
    tableTailHtml: '<!-- </table> -->', omitTableEnd: true,
  });
  assertHistoricalInstallationPass(fixture);
  assert.throws(() => verifyAndBindSource(fixture.input),
    (error) => error?.code === 'SOURCE_RELATION_CANDIDATE_GAP');
});

test('repair R3-1: unaccounted non-ASCII content inside the table is a gap', () => {
  const fixture = portableSyntheticInstallationFixture({ tableTailHtml: '\u00a0' });
  assertHistoricalInstallationPass(fixture);
  assert.throws(() => verifyAndBindSource(fixture.input),
    (error) => error?.code === 'SOURCE_RELATION_CANDIDATE_GAP');
});
