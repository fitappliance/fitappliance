import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createInstallationFieldReceipt } from '../../src/domain/installation-evidence-pipeline.mjs';
import { evidenceSourcePolicy } from '../../src/domain/evidence-source-verifier.mjs';
import { FRAGMENT_IDENTITY_DOMAIN, FRAGMENT_SCHEMA_VERSION, createArtifactRecord, createFragment } from '../../src/domain/architecture-v3/artifact-lineage.mjs';
import { CANONICAL_EVIDENCE_JSON_VERSION, canonicalEvidenceJson } from '../../src/shared/canonical-evidence-json.mjs';
import { compileV3Semantics } from '../../src/domain/architecture-v3/semantics.mjs';
import { createDirectClaimReceipt, verifyDirectClaimReceipt } from '../../src/domain/architecture-v3/evidence-claim-receipt.mjs';
import { createEvidenceClaimV3 } from '../../src/domain/architecture-v3/evidence-claim-v3.mjs';
import { inspectExtractionRegions } from '../../src/domain/architecture-v3/region-router.mjs';
import { verifyAndBindSource } from '../../src/domain/architecture-v3/verified-source-binding.mjs';
import { createClaimReviewDecision } from '../../src/domain/architecture-v3/claim-review-decision.mjs';
import { createProductRelationshipAssertion } from '../../src/domain/architecture-v3/product-relationship-assertion.mjs';
import { computeCurrentEligibility } from '../../src/domain/architecture-v3/current-eligibility.mjs';

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

// Synthetic portable producer fixture, preserved from direct-source-binding tests.
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

const NOW = '2026-09-30T12:00:00.000Z';
const START = '2026-09-01T00:00:00.000Z';
const END = '2026-10-31T00:00:00.000Z';
const REVIEW_POLICY = { policyId: 'synthetic-g5a-review', policySha256: sha256('synthetic-g5a-review-v1') };
const INTERNAL_ACTIONS = ['cache_source', 'cache_normalized_fields', 'retain_audit_copy'];
function clone(value) { return JSON.parse(canonicalEvidenceJson(value)); }
function hash(value) { return sha256(canonicalEvidenceJson(value)); }
function seal(value) { const { sha256: ignored, ...payload } = value; void ignored; return { ...payload, sha256: hash(payload) }; }
function node(kind, record, dependencies = []) {
  const recordSha256 = hash(record);
  return { nodeId: 'fa_eligibility_' + hash({ schemaVersion: 1, nodeIdentityDomain: 'fit-current-eligibility-node-v1', kind, recordSha256 }), kind, recordSha256, record, dependencies: [...dependencies].sort() };
}
function status(value) { return { ...value, validFrom: START, validUntil: END, actor: 'synthetic-current-authority', reason: { code: 'fixture_reviewed', scope: 'synthetic_fixture' } }; }
function review(claim, validationInputs, changes = {}) {
  return createClaimReviewDecision({ claim, validationInputs, state: 'admitted', reason: { code: 'fixture_reviewed', scope: claim.claimId }, ...REVIEW_POLICY, actor: 'synthetic-reviewer', decidedAt: START, idempotencyKey: 'review-' + claim.claimId, supersedesDecisionIds: [], forkResolution: false, ...changes });
}
function resultFor(result, nodeId) { return result.results.find((entry) => entry.nodeId === nodeId); }
function codes(result, nodeId) { return resultFor(result, nodeId).reasons.map((reason) => reason.code); }

async function buildEligibilityFixture() {
  const fixture = portableSyntheticInstallationFixture();
  const sourceBinding = verifyAndBindSource(fixture.input);
  const request = directClaimReceiptRequest({ sourceBinding, factBindingId: sourceBinding.verifiedFactBindings[0].factBindingId, readObject: fixture.input.readObject });
  const receipt = await createDirectClaimReceipt(request);
  // This is a real successful G4b byte/anchor/profile replay before any eligibility policy negatives.
  assert.deepEqual(await verifyDirectClaimReceipt({ receipt, readObject: fixture.input.readObject }), receipt);
  assert.ok(receipt.rightsDecisions.every((decision) => decision.state === 'unknown_blocked'));
  const claim = receipt.claim;
  const validationInputs = { semantics: sourceBinding.replayInputs.historicalPolicies.semantics, witnessedConditions: [], artifactRecords: sourceBinding.g3aProof.artifactRecords, fragments: sourceBinding.g3aProof.fragments };
  const bindingNode = node('source-binding', { sourceBinding });
  const receiptNode = node('receipt', { receipt }, [bindingNode.nodeId]);
  const claimNode = node('claim', { claim, validationInputs, relationshipAssertionIds: [] }, [receiptNode.nodeId]);
  const objectBytes = new Map(fixture.objectBytes);
  const grantBytes = Buffer.from('Synthetic reviewed unconditional internal grant; no real rights grant.');
  const grantPath = 'evidence/test-fixtures/g5a/synthetic-rights.txt';
  objectBytes.set(grantPath, grantBytes);
  const usageNodes = [];
  for (const kind of ['adjudication', 'readiness', 'release-candidate']) {
    const artifactBytes = Buffer.from(JSON.stringify({ syntheticDependencyWitness: kind }));
    const artifactPath = 'evidence/test-fixtures/g5a/' + kind + '.json';
    objectBytes.set(artifactPath, artifactBytes);
    const inputNodeIds = [usageNodes.at(-1)?.nodeId ?? claimNode.nodeId];
    usageNodes.push(node(kind, { schemaVersion: 1, recordDomain: 'fit-current-dependency-use-v1', kind, artifactRef: { objectPath: artifactPath, sha256: sha256(artifactBytes), byteSize: artifactBytes.length }, inputNodeIds }, inputNodeIds));
  }
  const profilePolicy = JSON.parse(readFileSync(new URL('../../data/architecture-v3/policies/document-family-profiles.json', import.meta.url), 'utf8'));
  const brandRegistry = JSON.parse(readFileSync(new URL('../../data/architecture-v3/generated/brand-registry.json', import.meta.url), 'utf8'));
  const profileIdentity = receipt.toolchain.profileIdentity;
  const input = {
    asOf: NOW,
    activeHeads: { claims: [{ claim, validationInputs }], decisions: [review(claim, validationInputs)], policy: REVIEW_POLICY },
    sourcePolicy: seal({ schemaVersion: 1, recordDomain: 'fit-current-source-policy-v1', policyId: 'synthetic-current-source', purpose: 'adjudication', validFrom: START, validUntil: END, reviewPolicy: REVIEW_POLICY, semantics: SEMANTICS,
      sourcePolicies: Object.fromEntries(['manufacturerPolicy', 'resolutionPolicy'].map((key) => [key, { sha256: hash(evidenceSourcePolicy[key]), value: clone(evidenceSourcePolicy[key]) }])),
      sources: [status({ bindingId: sourceBinding.bindingId, sourceId: sourceBinding.source.sourceId, sourceArtifactSha256: claim.evidence.sourceArtifactSha256, state: 'active' })], relationships: [] }),
    profileStatus: seal({ schemaVersion: 1, recordDomain: 'fit-current-profile-status-v1', validFrom: START, validUntil: END, expectedProfilePolicySha256: profilePolicy.policySha256, policy: { sha256: hash(profilePolicy), value: profilePolicy }, brandRegistry,
      profiles: [status({ ...profileIdentity, expectedProfilePolicySha256: profilePolicy.policySha256, state: 'active' })] }),
    rightsDecisions: seal({ schemaVersion: 1, recordDomain: 'fit-current-rights-v1', validFrom: START, validUntil: END, dictionary: sourceBinding.replayInputs.historicalPolicies.rightsDictionary,
      decisions: INTERNAL_ACTIONS.map((actionId) => status({ providerId: receipt.rightsRequest.providerId, sourceId: sourceBinding.source.sourceId, fieldId: claim.field, actionId, decision: 'granted', evidenceSha256: sha256(grantBytes), conditions: [] })) }),
    dependencyGraph: { schemaVersion: 1, graphDomain: 'fit-current-eligibility-graph-v1', nodes: [bindingNode, receiptNode, claimNode, ...usageNodes], objects: [...objectBytes].map(([objectPath, bytes]) => ({ objectPath, sha256: sha256(bytes), bytesBase64: bytes.toString('base64') })) },
  };
  return { input, fixture, receipt, sourceBinding, validationInputs, claimNode, receiptNode, bindingNode, usageNodes };
}

let baselineFixture;
async function eligibilityFixture() {
  baselineFixture ??= buildEligibilityFixture();
  const original = await baselineFixture;
  const input = clone(original.input);
  const bindingNode = input.dependencyGraph.nodes.find((entry) => entry.kind === 'source-binding');
  const receiptNode = input.dependencyGraph.nodes.find((entry) => entry.kind === 'receipt');
  const claimNode = input.dependencyGraph.nodes.find((entry) => entry.kind === 'claim');
  return { input, bindingNode, receiptNode, claimNode, sourceBinding: bindingNode.record.sourceBinding,
    receipt: receiptNode.record.receipt, validationInputs: claimNode.record.validationInputs,
    usageNodes: input.dependencyGraph.nodes.filter((entry) => ['adjudication', 'readiness', 'release-candidate'].includes(entry.kind)) };
}

test('actual direct receipt and exact current authority inputs make the Claim and dependency witnesses eligible', async () => {
  const f = await eligibilityFixture();
  const before = canonicalEvidenceJson(f.input);
  const result = await computeCurrentEligibility(f.input);
  assert.equal(resultFor(result, f.claimNode.nodeId).status, 'eligible');
  assert.ok(f.usageNodes.every((entry) => resultFor(result, entry.nodeId).status === 'eligible'));
  assert.ok(Object.isFrozen(result.results[0].reasons));
  assert.equal(canonicalEvidenceJson(f.input), before);
  assert.ok(f.receipt.rightsDecisions.every((entry) => entry.state === 'unknown_blocked'));
});

test('source revocation propagates from the actual binding through Claim, readiness and candidate', async () => {
  const f = await eligibilityFixture();
  f.input.sourcePolicy.sources[0].state = 'revoked'; f.input.sourcePolicy = seal(f.input.sourcePolicy);
  const result = await computeCurrentEligibility(f.input);
  for (const entry of [f.claimNode, ...f.usageNodes]) {
    assert.equal(resultFor(result, entry.nodeId).status, 'ineligible');
    assert.ok(codes(result, entry.nodeId).includes('SOURCE_REVOKED'));
  }
});

test('omitting the resolved receipt dependency cannot silently make a Claim usable', async () => {
  const f = await eligibilityFixture(); f.claimNode.dependencies = [];
  await assert.rejects(computeCurrentEligibility(f.input), { code: 'DEPENDENCY_MISMATCH' });
});

test('cache grants cannot authorize public display', async () => {
  const f = await eligibilityFixture(); f.input.sourcePolicy.purpose = 'public_display'; f.input.sourcePolicy = seal(f.input.sourcePolicy);
  const result = await computeCurrentEligibility(f.input);
  assert.equal(resultFor(result, f.claimNode.nodeId).status, 'ineligible');
  assert.ok(codes(result, f.claimNode.nodeId).includes('RIGHTS_MISSING'));
});

test('a disabled current profile propagates without changing receipt history', async () => {
  const f = await eligibilityFixture(); f.input.profileStatus.profiles[0].state = 'disabled'; f.input.profileStatus = seal(f.input.profileStatus);
  const result = await computeCurrentEligibility(f.input);
  assert.ok(codes(result, f.usageNodes.at(-1).nodeId).includes('PROFILE_DISABLED'));
  assert.equal(f.receipt.toolchain.profileIdentity.profileSha256, f.input.profileStatus.profiles[0].profileSha256);
});

for (const purpose of ['public_display', 'quote_excerpt', 'link_documents']) {
  test('purpose ' + purpose + ' requires its own exact action grant in addition to cache grants', async () => {
    const f = await eligibilityFixture();
    f.input.sourcePolicy.purpose = purpose; f.input.sourcePolicy = seal(f.input.sourcePolicy);
    const blocked = await computeCurrentEligibility(f.input);
    assert.ok(codes(blocked, f.claimNode.nodeId).includes('RIGHTS_MISSING'));
    f.input.rightsDecisions.decisions.push({ ...clone(f.input.rightsDecisions.decisions[0]), actionId: purpose });
    f.input.rightsDecisions = seal(f.input.rightsDecisions);
    const eligible = await computeCurrentEligibility(f.input);
    assert.equal(resultFor(eligible, f.claimNode.nodeId).status, 'eligible');
    assert.equal(Object.hasOwn(eligible, 'accepted'), false); assert.equal(Object.hasOwn(eligible, 'public'), false);
  });
}

for (const [label, change, expected] of [
  ['missing grant', (f) => f.input.rightsDecisions.decisions.pop(), 'RIGHTS_MISSING'],
  ['wrong provider scope', (f) => { f.input.rightsDecisions.decisions[0].providerId = 'unrelated-provider'; }, 'RIGHTS_MISSING'],
  ['wrong source scope', (f) => { f.input.rightsDecisions.decisions[0].sourceId = 'unrelated-source'; }, 'RIGHTS_MISSING'],
  ['wrong field scope', (f) => { f.input.rightsDecisions.decisions[0].fieldId = 'closedEnvelope.depthMm'; }, 'RIGHTS_MISSING'],
  ['conflicting duplicate', (f) => f.input.rightsDecisions.decisions.push({ ...clone(f.input.rightsDecisions.decisions[0]), decision: 'denied' }), 'RIGHTS_CONFLICT'],
  ['conditions on grant', (f) => { f.input.rightsDecisions.decisions[0].conditions = ['requires future approval']; }, 'RIGHTS_CONDITIONAL'],
  ['conditional state', (f) => { f.input.rightsDecisions.decisions[0].decision = 'granted_with_conditions'; }, 'RIGHTS_GRANTED_WITH_CONDITIONS'],
  ['withdrawn grant', (f) => { f.input.rightsDecisions.decisions[0].decision = 'withdrawn'; }, 'RIGHTS_WITHDRAWN'],
  ['unresolved evidence', (f) => { f.input.rightsDecisions.decisions[0].evidenceSha256 = 'a'.repeat(64); }, 'RIGHTS_EVIDENCE_MISSING'],
]) {
  test('rights ' + label + ' lowers transitive eligibility without changing historical decisions', async () => {
    const f = await eligibilityFixture(); const historical = canonicalEvidenceJson(f.receipt);
    change(f); f.input.rightsDecisions = seal(f.input.rightsDecisions);
    const result = await computeCurrentEligibility(f.input);
    for (const entry of [f.claimNode, ...f.usageNodes]) assert.ok(codes(result, entry.nodeId).includes(expected));
    assert.equal(canonicalEvidenceJson(f.receipt), historical);
    assert.ok(f.receipt.rightsDecisions.every((entry) => entry.state === 'unknown_blocked'));
  });
}

for (const [inputName, entryName, prefix] of [
  ['sourcePolicy', 'sources', 'SOURCE'], ['profileStatus', 'profiles', 'PROFILE'], ['rightsDecisions', 'decisions', 'RIGHTS'],
]) {
  for (const boundary of ['future', 'expired']) {
    test(inputName + ' status ' + boundary + ' is evaluated against explicit asOf with a half-open expiry boundary', async () => {
      const f = await eligibilityFixture();
      const entry = f.input[inputName][entryName][0];
      if (boundary === 'future') entry.validFrom = '2026-10-01T00:00:00.000Z'; else entry.validUntil = NOW;
      f.input[inputName] = seal(f.input[inputName]);
      const result = await computeCurrentEligibility(f.input);
      assert.ok(codes(result, f.usageNodes.at(-1).nodeId).includes(prefix + '_' + boundary.toUpperCase()));
    });
    test(inputName + ' snapshot ' + boundary + ' also blocks its apparently active records', async () => {
      const f = await eligibilityFixture();
      if (boundary === 'future') f.input[inputName].validFrom = '2026-10-01T00:00:00.000Z'; else f.input[inputName].validUntil = NOW;
      f.input[inputName] = seal(f.input[inputName]);
      const result = await computeCurrentEligibility(f.input);
      assert.ok(codes(result, f.claimNode.nodeId).includes(prefix + '_POLICY_' + boundary.toUpperCase()));
    });
  }
}

test('missing and unknown source/profile status stay typed and ineligible', async () => {
  const f = await eligibilityFixture(); f.input.sourcePolicy.sources = []; f.input.sourcePolicy = seal(f.input.sourcePolicy);
  f.input.profileStatus.profiles[0].state = 'unknown'; f.input.profileStatus = seal(f.input.profileStatus);
  const result = await computeCurrentEligibility(f.input);
  assert.ok(codes(result, f.claimNode.nodeId).includes('SOURCE_MISSING'));
  assert.ok(codes(result, f.claimNode.nodeId).includes('PROFILE_UNKNOWN'));
});

test('current semantics v2 cannot silently reuse a historical v1 receipt', async () => {
  const f = await eligibilityFixture();
  const overlay = JSON.parse(readFileSync(new URL('../../data/architecture-v3/policies/semantics-overlay.json', import.meta.url), 'utf8'));
  overlay.policyVersion = 'synthetic-current-v2';
  f.input.sourcePolicy.semantics = compileV3Semantics({ fieldDictionary: f.input.rightsDecisions.dictionary,
    installationMatrix: JSON.parse(readFileSync(new URL('../../data/architecture-v2/generated/installation-evidence-applicability-matrix.json', import.meta.url), 'utf8')), overlay });
  f.input.sourcePolicy = seal(f.input.sourcePolicy);
  const result = await computeCurrentEligibility(f.input);
  assert.ok(codes(result, f.claimNode.nodeId).includes('SEMANTIC_POLICY_MISMATCH'));
  assert.equal(f.receipt.policy.semanticPolicySha256, SEMANTICS.semanticPolicySha256);
});

test('changed current source policy identity blocks otherwise valid historical replay', async () => {
  const f = await eligibilityFixture();
  const policy = f.input.sourcePolicy.sourcePolicies.manufacturerPolicy;
  policy.value.policyVersion = 'synthetic-current-source-v2'; policy.sha256 = hash(policy.value);
  f.input.sourcePolicy = seal(f.input.sourcePolicy);
  const result = await computeCurrentEligibility(f.input);
  assert.ok(codes(result, f.claimNode.nodeId).includes('SOURCE_POLICY_MISMATCH'));
});

test('a newer correctly hashed profile policy cannot impersonate the historical extraction policy', async () => {
  const f = await eligibilityFixture(); const profile = f.input.profileStatus;
  profile.policy.value.policyVersion = '2026-10-01.1';
  const { policySha256: ignored, ...payload } = profile.policy.value; void ignored;
  profile.policy.value.policySha256 = hash(payload); profile.policy.sha256 = hash(profile.policy.value);
  profile.expectedProfilePolicySha256 = profile.policy.value.policySha256;
  profile.profiles[0].expectedProfilePolicySha256 = profile.expectedProfilePolicySha256;
  f.input.profileStatus = seal(profile);
  const result = await computeCurrentEligibility(f.input);
  assert.ok(codes(result, f.claimNode.nodeId).includes('PROFILE_POLICY_MISMATCH'));
});

test('current review policy identity is exact, even if the historical head was admitted', async () => {
  const f = await eligibilityFixture();
  f.input.sourcePolicy.reviewPolicy = { policyId: 'synthetic-review-v2', policySha256: 'a'.repeat(64) };
  f.input.sourcePolicy = seal(f.input.sourcePolicy);
  const result = await computeCurrentEligibility(f.input);
  assert.ok(codes(result, f.claimNode.nodeId).includes('REVIEW_POLICY_MISMATCH'));
});

test('future heads and unresolved forks cannot be replaced by a timestamp winner', async () => {
  const f = await eligibilityFixture(); const claim = f.claimNode.record.claim;
  const past = review(claim, f.validationInputs, { idempotencyKey: 'past-head' });
  const future = review(claim, f.validationInputs, { idempotencyKey: 'future-head', decidedAt: '2026-10-01T00:00:00.000Z', supersedesDecisionIds: [past.decisionId] });
  f.input.activeHeads.decisions = [past, future];
  const result = await computeCurrentEligibility(f.input);
  assert.ok(codes(result, f.claimNode.nodeId).includes('REVIEW_FUTURE'));
  const sibling = review(claim, f.validationInputs, { idempotencyKey: 'sibling-head', supersedesDecisionIds: [past.decisionId] });
  f.input.activeHeads.decisions.push(sibling);
  const fork = await computeCurrentEligibility(f.input);
  assert.ok(codes(fork, f.claimNode.nodeId).includes('REVIEW_FORK_QUARANTINED'));
  assert.ok(codes(fork, f.claimNode.nodeId).includes('REVIEW_FUTURE'));
});

for (const state of ['rejected', 'quarantined', 'superseded']) {
  test('terminal review state ' + state + ' lowers readiness', async () => {
    const f = await eligibilityFixture(); f.input.activeHeads.decisions = [review(f.claimNode.record.claim, f.validationInputs, { state })];
    const result = await computeCurrentEligibility(f.input);
    assert.ok(codes(result, f.usageNodes.at(-1).nodeId).includes('REVIEW_' + state.toUpperCase()));
  });
}

test('a missing resolved receipt stays ineligible even without an unresolved ID', async () => {
  const f = await eligibilityFixture(); f.input.dependencyGraph.nodes = [f.claimNode]; f.claimNode.dependencies = [];
  const result = await computeCurrentEligibility(f.input);
  assert.ok(codes(result, f.claimNode.nodeId).includes('RECEIPT_MISSING'));
});

test('resolved graph order and historical event order do not change eligibility identity', async () => {
  const f = await eligibilityFixture(); const first = await computeCurrentEligibility(f.input);
  f.input.dependencyGraph.nodes.reverse(); f.input.dependencyGraph.objects.reverse(); f.input.activeHeads.decisions.reverse();
  assert.deepEqual(await computeCurrentEligibility(f.input), first);
});

test('nested result mutation fails while all immutable source history remains unchanged', async () => {
  const f = await eligibilityFixture(); f.input.sourcePolicy.sources[0].state = 'revoked'; f.input.sourcePolicy = seal(f.input.sourcePolicy);
  const before = canonicalEvidenceJson(f.input); const result = await computeCurrentEligibility(f.input);
  const entry = resultFor(result, f.claimNode.nodeId);
  assert.throws(() => { entry.reasons[0].code = 'allowed'; }, TypeError);
  assert.throws(() => { result.results.push({ status: 'eligible' }); }, TypeError);
  assert.equal(canonicalEvidenceJson(f.input), before);
});

for (const [label, mutate, expected] of [
  ['dangling dependency', (f) => { f.claimNode.dependencies = ['fa_eligibility_' + 'a'.repeat(64)]; }, 'DANGLING_DEPENDENCY'],
  ['duplicate node', (f) => { f.input.dependencyGraph.nodes.push(clone(f.claimNode)); }, 'DUPLICATE_RECORD'],
  ['cycle', (f) => { f.bindingNode.dependencies = [f.claimNode.nodeId]; }, 'DEPENDENCY_CYCLE'],
  ['extra dependency', (f) => { f.claimNode.dependencies.push(f.bindingNode.nodeId); }, 'DEPENDENCY_MISMATCH'],
  ['type substitution', (f) => { f.claimNode.kind = 'upgrade-audit'; }, 'INVALID_NODE_TYPE'],
  ['record hash substitution', (f) => { f.claimNode.recordSha256 = 'a'.repeat(64); }, 'NODE_HASH_MISMATCH'],
  ['byte substitution', (f) => { f.input.dependencyGraph.objects[0].bytesBase64 = Buffer.from('substituted').toString('base64'); }, 'OBJECT_HASH_MISMATCH'],
  ['current snapshot hash substitution', (f) => { f.input.sourcePolicy.sources[0].state = 'revoked'; }, 'HASH_MISMATCH'],
  ['invalid asOf', (f) => { f.input.asOf = '2026-02-30T00:00:00.000Z'; }, 'INVALID_TIMESTAMP'],
  ['invalid status timestamp', (f) => { f.input.profileStatus.profiles[0].validUntil = '2026-02-30T00:00:00.000Z'; f.input.profileStatus = seal(f.input.profileStatus); }, 'INVALID_TIMESTAMP'],
  ['unknown purpose', (f) => { f.input.sourcePolicy.purpose = 'publish-everything'; f.input.sourcePolicy = seal(f.input.sourcePolicy); }, 'INVALID_PURPOSE'],
  ['null snapshot', (f) => { f.input.profileStatus = null; }, 'INVALID_SCHEMA'],
]) {
  test('rejects ' + label + ' before returning any eligible result', async () => {
    const f = await eligibilityFixture(); mutate(f);
    await assert.rejects(computeCurrentEligibility(f.input), { code: expected });
  });
}

test('no wall clock coercion, arbitrary booleans, nonfinite values or getters can enter current inputs', async () => {
  for (const change of [
    (f) => { delete f.input.asOf; },
    (f) => { f.input.rightsDecisions.decisions[0].allowed = true; f.input.rightsDecisions = seal(f.input.rightsDecisions); },
    (f) => { f.input.sourcePolicy.extra = Infinity; },
    (f) => { Object.defineProperty(f.input, 'asOf', { enumerable: true, get: () => NOW }); },
  ]) { const f = await eligibilityFixture(); change(f); await assert.rejects(computeCurrentEligibility(f.input)); }
});

async function addDerivedClaim(f) {
  const parent = f.claimNode.record.claim;
  const derivedId = 'fa_prod_555555555555555555555555';
  const namedModels = [...clone(parent.applicabilityProof.namedModels), { canonicalProductId: derivedId, model: 'DERIVED-PORTABLE-SYNTHETIC' }];
  const assertion = createProductRelationshipAssertion({ relation: { kind: 'ASSERTED_SHARED_PLATFORM', target: null }, market: 'AU', namedModels,
    sharedFields: [parent.field], contexts: [parent.context], evidence: { status: 'unverified_candidate', references: [] }, semantics: SEMANTICS });
  const relationshipNode = node('relationship', { assertion, semantics: SEMANTICS });
  const { claimId: ignoredId, schemaVersion: ignoredSchema, canonicalizationVersion: ignoredCodec, ...payload } = clone(parent);
  void ignoredId; void ignoredSchema; void ignoredCodec;
  const derived = createEvidenceClaimV3({ ...payload, subject: { canonicalProductId: derivedId, market: 'AU' },
    applicabilityProof: { kind: 'FINITE_OFFICIAL_RELATION', namedModels, relationshipAssertionIds: [assertion.assertionId] }, derivedFromClaimId: parent.claimId, validationInputs: f.validationInputs });
  const derivedNode = node('claim', { claim: derived, validationInputs: f.validationInputs, relationshipAssertionIds: [assertion.assertionId] }, [f.claimNode.nodeId, relationshipNode.nodeId]);
  const witnessRecord = { ...clone(f.usageNodes[0].record), inputNodeIds: [derivedNode.nodeId] };
  const witness = node('adjudication', witnessRecord, witnessRecord.inputNodeIds);
  f.input.dependencyGraph.nodes.push(relationshipNode, derivedNode, witness);
  f.input.activeHeads.claims.push({ claim: derived, validationInputs: f.validationInputs });
  f.input.activeHeads.decisions.push(review(derived, f.validationInputs));
  f.input.sourcePolicy.relationships.push(status({ assertionId: assertion.assertionId, state: 'active' })); f.input.sourcePolicy = seal(f.input.sourcePolicy);
  return { relationshipNode, derivedNode, witness };
}

test('research relationships and derived Claims stay blocked and still propagate source and relationship revocation', async () => {
  const f = await eligibilityFixture(); const d = await addDerivedClaim(f);
  const before = await computeCurrentEligibility(f.input);
  assert.equal(resultFor(before, f.claimNode.nodeId).status, 'eligible');
  assert.ok(codes(before, d.derivedNode.nodeId).includes('DERIVATION_PROOF_UNAVAILABLE'));
  assert.ok(codes(before, d.derivedNode.nodeId).includes('RELATIONSHIP_UNVERIFIED'));
  f.input.sourcePolicy.sources[0].state = 'revoked'; f.input.sourcePolicy.relationships[0].state = 'revoked'; f.input.sourcePolicy = seal(f.input.sourcePolicy);
  const after = await computeCurrentEligibility(f.input);
  for (const entry of [d.derivedNode, d.witness]) {
    assert.ok(codes(after, entry.nodeId).includes('DERIVATION_PROOF_UNAVAILABLE'));
    assert.ok(codes(after, entry.nodeId).includes('SOURCE_REVOKED'));
    assert.ok(codes(after, entry.nodeId).includes('RELATIONSHIP_REVOKED'));
  }
});

test('a derived Claim cannot omit one actual payload relationship behind a smaller metadata list', async () => {
  const f = await eligibilityFixture(); const d = await addDerivedClaim(f);
  const original = d.relationshipNode.record.assertion;
  const omitted = createProductRelationshipAssertion({ relation: { kind: 'HYPOTHESISED_SHARED_PLATFORM', target: null }, market: original.market,
    namedModels: original.namedModels, sharedFields: original.sharedFields, contexts: original.contexts, evidence: original.evidence, semantics: SEMANTICS });
  const { claimId: ignoredId, schemaVersion: ignoredSchema, canonicalizationVersion: ignoredCodec, ...payload } = clone(d.derivedNode.record.claim);
  void ignoredId; void ignoredSchema; void ignoredCodec;
  const derived = createEvidenceClaimV3({ ...payload, applicabilityProof: { ...payload.applicabilityProof, relationshipAssertionIds: [original.assertionId, omitted.assertionId] }, validationInputs: f.validationInputs });
  const replacement = node('claim', { claim: derived, validationInputs: f.validationInputs, relationshipAssertionIds: [original.assertionId] }, [f.claimNode.nodeId, d.relationshipNode.nodeId]);
  f.input.dependencyGraph.nodes = [f.bindingNode, f.receiptNode, f.claimNode, d.relationshipNode, node('relationship', { assertion: omitted, semantics: SEMANTICS }), replacement];
  f.input.activeHeads.claims = [{ claim: f.claimNode.record.claim, validationInputs: f.validationInputs }, { claim: derived, validationInputs: f.validationInputs }];
  f.input.activeHeads.decisions = [review(f.claimNode.record.claim, f.validationInputs), review(derived, f.validationInputs)];
  await assert.rejects(computeCurrentEligibility(f.input), { code: 'DEPENDENCY_MISMATCH' });
});

test('a resolved Claim proof must exactly join its receipt binding proof rather than substitute reordered validation records', async () => {
  const f = await eligibilityFixture();
  const validationInputs = clone(f.validationInputs); validationInputs.artifactRecords.reverse();
  const replacement = node('claim', { ...f.claimNode.record, validationInputs }, f.claimNode.dependencies);
  f.input.dependencyGraph.nodes = [f.bindingNode, f.receiptNode, replacement];
  f.input.activeHeads.claims = [{ claim: replacement.record.claim, validationInputs }];
  await assert.rejects(computeCurrentEligibility(f.input), { code: 'RECEIPT_JOIN_MISMATCH' });
});

test('a real Claim with an invalid value cannot enter eligibility after resealing only its graph node', async () => {
  const f = await eligibilityFixture(); const record = clone(f.claimNode.record); record.claim.value.value += 1;
  f.input.dependencyGraph.nodes = [f.bindingNode, f.receiptNode, node('claim', record, f.claimNode.dependencies)];
  await assert.rejects(computeCurrentEligibility(f.input), { code: 'INVALID_EVIDENCE_CLAIM_V3' });
});

test('a self-consistent receipt hash cannot substitute its producer-bound policy', async () => {
  const f = await eligibilityFixture(); const receipt = clone(f.receipt); receipt.policy.semanticPolicySha256 = 'a'.repeat(64);
  const { receiptId: ignored, ...payload } = receipt; void ignored; receipt.receiptId = hash(payload);
  const replacement = node('receipt', { receipt }, f.receiptNode.dependencies);
  f.input.dependencyGraph.nodes = [f.bindingNode, replacement];
  await assert.rejects(computeCurrentEligibility(f.input), { code: 'POLICY_BINDING_MISMATCH' });
});

test('a resolved receipt cannot create a ghost Claim absent from the dependency graph', async () => {
  const f = await eligibilityFixture(); f.input.dependencyGraph.nodes = [f.bindingNode, f.receiptNode];
  f.input.activeHeads.claims = []; f.input.activeHeads.decisions = [];
  await assert.rejects(computeCurrentEligibility(f.input), { code: 'RECEIPT_JOIN_MISMATCH' });
});

test('a missing review remains typed and lowers all dependency witnesses', async () => {
  const f = await eligibilityFixture(); f.input.activeHeads.decisions = [];
  const result = await computeCurrentEligibility(f.input);
  for (const entry of [f.claimNode, ...f.usageNodes]) assert.ok(codes(result, entry.nodeId).includes('REVIEW_MISSING'));
});
