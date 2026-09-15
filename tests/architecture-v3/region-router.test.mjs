import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { createArtifactRecord, createFragment } from '../../src/domain/architecture-v3/artifact-lineage.mjs';
import { validateEvidenceAnchors } from '../../src/domain/architecture-v3/evidence-anchors.mjs';
import { selectDocumentProfile } from '../../src/domain/architecture-v3/document-family-registry.mjs';
import * as regionRouter from '../../src/domain/architecture-v3/region-router.mjs';
import { canonicalEvidenceJson } from '../../src/shared/canonical-evidence-json.mjs';

const { inspectExtractionRegions, routeExtractionRegion } = regionRouter;

const repositoryRoot = resolve(import.meta.dirname, '..', '..');
const fixtureRoot = resolve(import.meta.dirname, '..', 'fixtures', 'architecture-v3', 'profile-canaries');
const evidenceStore = '/Volumes/UGREEN-1TB/FitAppliance';
const profileCanaryRunner = resolve(repositoryRoot, 'scripts/architecture-v3/run-profile-canaries.mjs');

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function readFixture(fileName) {
  return readJson(resolve(fixtureRoot, fileName));
}

async function portableCanaryInput() {
  const manifest = await readJson(resolve(fixtureRoot, 'manifest.json'));
  const registry = await registryInput();
  const fixtures = await Promise.all(manifest.fixtures.map(async (expected) => {
    const path = resolve(fixtureRoot, expected.fixtureFile);
    const bytes = await readFile(path);
    return {
      fixtureId: expected.fixtureId,
      fileSha256: sha256(bytes),
      payload: JSON.parse(bytes.toString('utf8')),
    };
  }));
  const codeIdentity = {
    schemaVersion: 1,
    files: await Promise.all(manifest.codeIdentity.files.map(async (expected) => ({
      path: expected.path,
      sha256: sha256(await readFile(resolve(repositoryRoot, expected.path))),
    }))),
  };
  return {
    manifest,
    portableFixtures: { schemaVersion: 1, mode: 'portable', registry, fixtures },
    codeIdentity,
  };
}

function resealCanaryManifest(manifest) {
  const sealed = structuredClone(manifest);
  sealed.manifestSha256 = sha256(canonicalEvidenceJson(without(sealed, ['manifestSha256'])));
  return sealed;
}

async function originalCanaryInput() {
  const input = await portableCanaryInput();
  async function observed(relativePath) {
    const bytes = await readFile(join(evidenceStore, relativePath));
    return { objectPath: relativePath, bytesBase64: bytes.toString('base64') };
  }
  input.portableFixtures = {
    ...input.portableFixtures,
    mode: 'original-objects',
    originalObjects: {
      schemaVersion: 1,
      acceptedBatch: await observed(input.manifest.acceptedBatch.objectPath),
      historicalOcrAttempt: await observed(input.manifest.historicalOcrAttempt.recordObjectPath),
      sources: await Promise.all(input.manifest.sourceExpectations.map(async (source) => ({
        sourceId: source.sourceId,
        sourcePdf: await observed(source.sourcePdfObjectPath),
        selectedMineruJson: await observed(source.selectedMineruJsonObjectPath),
        lineage: await observed(source.lineageObjectPath),
        renderedPages: await Promise.all(source.renderedPages.map(async (page) => ({
          pageNumber: page.pageNumber,
          ...(await observed(page.objectPath)),
        }))),
      }))),
    },
  };
  return input;
}

function runCanaryCli(argumentsList) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [profileCanaryRunner, ...argumentsList], {
      cwd: repositoryRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (exitCode, signal) => {
      let report = null;
      try {
        report = JSON.parse(stdout);
      } catch {
        // The assertion below reports the bounded child output if parsing fails.
      }
      resolveResult({ exitCode, signal, stdout, stderr, report });
    });
  });
}

async function evidenceStoreIsAvailable() {
  try {
    return (await lstat(evidenceStore)).isDirectory();
  } catch {
    return false;
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function without(object, keys) {
  const copy = { ...object };
  for (const key of keys) delete copy[key];
  return copy;
}

function sealPolicy(policy) {
  const sealed = structuredClone(policy);
  sealed.profiles = sealed.profiles.map((profile) => ({
    ...profile,
    profileSha256: sha256(canonicalEvidenceJson(without(profile, ['profileSha256']))),
  }));
  sealed.policySha256 = sha256(canonicalEvidenceJson(without(sealed, ['policySha256'])));
  return sealed;
}

async function registryInput(policyOverride) {
  const [brandRegistryArtifact, policy] = await Promise.all([
    readJson(resolve(repositoryRoot, 'data/architecture-v3/generated/brand-registry.json')),
    readJson(resolve(repositoryRoot, 'data/architecture-v3/policies/document-family-profiles.json')),
  ]);
  return {
    brandRegistry: brandRegistryArtifact.registry,
    brandRegistrySha256: brandRegistryArtifact.registrySha256,
    profilePolicy: policyOverride ?? policy,
  };
}

function inspectFixture(fixture, overrides = {}) {
  return inspectExtractionRegions({
    nativeObservations: overrides.nativeObservations ?? fixture.nativeObservations,
    mineruDocument: {
      ...fixture.mineruDocument,
      sourcePdfSha256: fixture.document.sourcePdfSha256,
      ...(overrides.mineruDocument ?? {}),
    },
    pageImageMetadata: overrides.pageImageMetadata ?? fixture.pageImageMetadata,
  });
}

function regionAt(inspection, sourceJsonPointer) {
  const region = inspection.regions.find((candidate) => candidate.sourceJsonPointer === sourceJsonPointer);
  assert.ok(region, `missing inspected region ${sourceJsonPointer}`);
  return region;
}

async function selectFor({ fixture, inspection, sourceJsonPointer, policy }) {
  return selectDocumentProfile({
    registry: await registryInput(policy),
    brandId: fixture.document.brandId,
    category: fixture.document.category,
    documentType: fixture.document.documentType,
    regionObservation: regionAt(inspection, sourceJsonPointer),
  });
}

function mutateRawBlock(fixture, sourceJsonPointer, mutate) {
  const mutated = structuredClone(fixture);
  // These text-only counterexamples do not reuse real image fragments for
  // synthetic text. The JSON-pointer contract requires no image representation.
  mutated.pageImageMetadata = [];
  const block = mutated.mineruDocument.blocks.find((candidate) => candidate.sourceJsonPointer === sourceJsonPointer);
  assert.ok(block, `missing fixture block ${sourceJsonPointer}`);
  mutate(block.rawBlock);
  block.fragmentSha256 = sha256(canonicalEvidenceJson({
    fragmentIdentityDomain: 'fitappliance.fragment.v1',
    schemaVersion: 1,
    canonicalizationVersion: 'fit-evidence-json-v3-1',
    content: block.rawBlock,
    parentArtifactSha256: mutated.mineruDocument.contentSha256,
    locator: { kind: 'json_pointer', pointer: sourceJsonPointer },
  }));
  return mutated;
}

test('policy artifact is sealed and tied to the generated G2a brand registry', async () => {
  const policy = await readJson(resolve(repositoryRoot, 'data/architecture-v3/policies/document-family-profiles.json'));
  const sealed = sealPolicy(policy);

  assert.equal(policy.policySha256, sealed.policySha256);
  assert.deepEqual(
    policy.profiles.map((profile) => profile.profileSha256),
    sealed.profiles.map((profile) => profile.profileSha256),
  );
  assert.equal(policy.profiles.length, 6);
});

test('selects and routes BDF structured text using its raw fragment identity', async () => {
  const fixture = await readFixture('bdf1620w-p1-structured.json');
  const inspection = inspectFixture(fixture);
  const region = regionAt(inspection, '/0/15');
  const selected = await selectFor({ fixture, inspection, sourceJsonPointer: '/0/15' });

  assert.equal(inspection.status, 'inspected');
  assert.equal(region.fragmentSha256, '5c29b215ebddebc521c81510101cd080a8028309c43bd410cbf003416f1e43cd');
  assert.equal(selected.status, 'selected');
  assert.equal(selected.profile.profileId, 'beko-au-dishwasher-structured-v1');

  const route = routeExtractionRegion({ regionObservation: region, selectedProfile: selected });
  assert.equal(route.status, 'routed');
  assert.equal(route.route, 'mineru');
  assert.equal(route.candidateStatus, 'STRUCTURAL_CANDIDATE_ONLY');
  assert.equal(route.reasons.includes('MISSING_UNIT'), false);
  for (const forbidden of ['claim', 'receipt', 'fit', 'public']) assert.equal(forbidden in route, false);
});

test('does not flag complete attached or separated units as missing while retaining actual missing units', async () => {
  const fixture = await readFixture('bdf1620w-p1-structured.json');
  const completeAttached = mutateRawBlock(fixture, '/0/15', (rawBlock) => {
    rawBlock.content.paragraph_content[0].content = 'Height: 850mm';
  });
  const completeSeparated = mutateRawBlock(fixture, '/0/15', (rawBlock) => {
    rawBlock.content.paragraph_content[0].content = 'Height: 850 mm';
  });
  const missing = mutateRawBlock(fixture, '/0/15', (rawBlock) => {
    rawBlock.content.paragraph_content[0].content = 'Height: 850';
  });

  assert.equal(regionAt(inspectFixture(completeAttached), '/0/15').routingGaps.includes('MISSING_UNIT'), false);
  assert.equal(regionAt(inspectFixture(completeSeparated), '/0/15').routingGaps.includes('MISSING_UNIT'), false);
  assert.equal(regionAt(inspectFixture(missing), '/0/15').routingGaps.includes('MISSING_UNIT'), true);
});

test('does not donate a readable native header to a separate empty image region', async () => {
  const fixture = await readFixture('bdf1620w-p2-image.json');
  const inspection = inspectFixture(fixture);
  const image = regionAt(inspection, '/1/4');
  const header = regionAt(inspection, '/1/5');
  const selected = await selectFor({ fixture, inspection, sourceJsonPointer: '/1/4' });

  assert.equal(image.nativeText, null);
  assert.equal(image.mineruText, '');
  assert.equal(header.nativeText, 'BDF1620W');
  assert.equal(selected.status, 'selected');
  assert.equal(selected.profile.profileId, 'beko-au-dishwasher-image-v1');

  const route = routeExtractionRegion({ regionObservation: image, selectedProfile: selected });
  assert.equal(route.route, 'ocr_or_vision');
  assert.equal(route.candidateStatus, 'STRUCTURAL_CANDIDATE_ONLY');
});

test('keeps BDP split labels and values separate and records their unwitnessed join', async () => {
  const fixture = await readFixture('bdp810w-p1-split-columns.json');
  const inspection = inspectFixture(fixture);
  const labels = regionAt(inspection, '/0/30');
  const values = regionAt(inspection, '/0/47');
  const selectedLabels = await selectFor({ fixture, inspection, sourceJsonPointer: '/0/30' });
  const selectedValues = await selectFor({ fixture, inspection, sourceJsonPointer: '/0/47' });

  assert.notEqual(labels.regionId, values.regionId);
  assert.equal(selectedLabels.profile.profileId, 'beko-au-dryer-split-columns-v1');
  assert.equal(selectedValues.profile.profileId, 'beko-au-dryer-split-columns-v1');

  const route = routeExtractionRegion({ regionObservation: values, selectedProfile: selectedValues });
  assert.equal(route.route, 'mineru');
  assert.ok(route.reasons.includes('AXIS_OR_LEGEND_GAP'));
  assert.equal(route.candidateStatus, 'STRUCTURAL_CANDIDATE_ONLY');
});

test('selects table and separate image/disclaimer profiles without a semantic result', async () => {
  const [bdpFixture, ewfTableFixture, ewfImageFixture] = await Promise.all([
    readFixture('bdp810w-p2-table.json'),
    readFixture('ewf7524cdwa-p3-table.json'),
    readFixture('ewf7524cdwa-p6-image-context.json'),
  ]);
  const bdpInspection = inspectFixture(bdpFixture);
  const ewfTableInspection = inspectFixture(ewfTableFixture);
  const ewfImageInspection = inspectFixture(ewfImageFixture);
  const [bdpSelected, ewfTableSelected, imageSelected, disclaimerSelected] = await Promise.all([
    selectFor({ fixture: bdpFixture, inspection: bdpInspection, sourceJsonPointer: '/1/7' }),
    selectFor({ fixture: ewfTableFixture, inspection: ewfTableInspection, sourceJsonPointer: '/2/4' }),
    selectFor({ fixture: ewfImageFixture, inspection: ewfImageInspection, sourceJsonPointer: '/5/1' }),
    selectFor({ fixture: ewfImageFixture, inspection: ewfImageInspection, sourceJsonPointer: '/5/3' }),
  ]);

  assert.equal(bdpSelected.profile.profileId, 'beko-au-dryer-table-v1');
  assert.equal(ewfTableSelected.profile.profileId, 'electrolux-au-washer-table-v1');
  assert.equal(imageSelected.profile.profileId, 'electrolux-au-washer-image-context-v1');
  assert.equal(disclaimerSelected.profile.profileId, 'electrolux-au-washer-image-context-v1');

  const image = regionAt(ewfImageInspection, '/5/1');
  const disclaimer = regionAt(ewfImageInspection, '/5/3');
  assert.notEqual(image.regionId, disclaimer.regionId);
  assert.equal(routeExtractionRegion({ regionObservation: image, selectedProfile: imageSelected }).route, 'mineru');
  assert.equal(routeExtractionRegion({ regionObservation: disclaimer, selectedProfile: disclaimerSelected }).route, 'mineru');
});

test('fails closed for invalid registry identity, disabled profiles, and ambiguous profile matches', async () => {
  const fixture = await readFixture('bdf1620w-p1-structured.json');
  const inspection = inspectFixture(fixture);
  const region = regionAt(inspection, '/0/15');
  const basePolicy = await readJson(resolve(repositoryRoot, 'data/architecture-v3/policies/document-family-profiles.json'));
  const structured = basePolicy.profiles.find((profile) => profile.profileId === 'beko-au-dishwasher-structured-v1');

  const disabled = structuredClone(basePolicy);
  disabled.profiles.find((profile) => profile.profileId === structured.profileId).status = 'disabled';
  const disabledResult = await selectFor({
    fixture,
    inspection,
    sourceJsonPointer: '/0/15',
    policy: sealPolicy(disabled),
  });
  assert.equal(disabledResult.status, 'unsupported');
  assert.ok(disabledResult.reasons.includes('PROFILE_DISABLED'));

  const ambiguous = structuredClone(basePolicy);
  ambiguous.profiles.push({ ...structured, profileId: 'beko-au-dishwasher-structured-shadow-v1' });
  const ambiguousResult = await selectFor({
    fixture,
    inspection,
    sourceJsonPointer: '/0/15',
    policy: sealPolicy(ambiguous),
  });
  assert.equal(ambiguousResult.status, 'ambiguous');
  assert.deepEqual(
    ambiguousResult.profileIds,
    ['beko-au-dishwasher-structured-shadow-v1', 'beko-au-dishwasher-structured-v1'],
  );

  const unknownBrand = selectDocumentProfile({
    registry: await registryInput(),
    brandId: `fa_brand_${'0'.repeat(64)}`,
    category: fixture.document.category,
    documentType: fixture.document.documentType,
    regionObservation: region,
  });
  assert.equal(unknownBrand.status, 'unsupported');
  assert.ok(unknownBrand.reasons.includes('UNKNOWN_BRAND_ID'));
});

test('keeps pure JSON-pointer text usable without fake page evidence while image and crop paths stay bound', async () => {
  const fixture = await readFixture('bdf1620w-p1-structured.json');
  const missingPage = inspectFixture(fixture, { pageImageMetadata: [] });
  assert.equal(missingPage.status, 'inspected');
  assert.equal(regionAt(missingPage, '/0/15').pageImageMetadata, null);
  assert.equal(
    (await selectFor({ fixture, inspection: missingPage, sourceJsonPointer: '/0/15' })).status,
    'selected',
  );

  const imageFixture = await readFixture('bdf1620w-p2-image.json');
  const missingImagePage = inspectFixture(imageFixture, { pageImageMetadata: [] });
  assert.equal(missingImagePage.status, 'incomplete');
  assert.ok(missingImagePage.reasons.includes('MISSING_PAGE_IMAGE_METADATA'));

  const invalidImageRotation = inspectFixture(imageFixture, {
    pageImageMetadata: [{ ...imageFixture.pageImageMetadata[0], rotationDegreesClockwise: 45 }],
  });
  assert.equal(invalidImageRotation.status, 'incomplete');
  assert.ok(invalidImageRotation.reasons.includes('UNSUPPORTED_PAGE_ROTATION'));

  const tableFixture = await readFixture('ewf7524cdwa-p3-table.json');
  const tableWithoutPageImage = inspectFixture(tableFixture, { pageImageMetadata: [] });
  assert.equal(tableWithoutPageImage.status, 'inspected');
  assert.equal(
    (await selectFor({ fixture: tableFixture, inspection: tableWithoutPageImage, sourceJsonPointer: '/2/4' })).status,
    'selected',
  );

  const cropped = inspectFixture(fixture, {
    pageImageMetadata: [{
      ...fixture.pageImageMetadata[0],
      transform: { kind: 'crop', normalizedTopLeftBox: [0, 0, 525.5, 731.5] },
    }],
  });
  assert.equal(cropped.status, 'incomplete');
  assert.ok(cropped.reasons.includes('INVALID_PAGE_TRANSFORM'));
});

test('keeps unit, capacity, model, configuration, angle, and cross-page gaps structural only', async () => {
  const fixture = await readFixture('bdf1620w-p1-structured.json');
  const mutated = mutateRawBlock(fixture, '/0/15', (rawBlock) => {
    rawBlock.content.paragraph_content[0].content = [
      'Unpackaged Height: 850 mm',
      'Width: 598',
      'Depth: 60 cm',
      'Capacity: 7 kg',
      'Models AB12 and CD34',
      'Worktop removed',
      'Door opened 90 degrees',
      'Continued from previous page',
    ].join(' ');
  });
  const inspection = inspectFixture(mutated);
  const region = regionAt(inspection, '/0/15');
  const selection = await selectFor({ fixture: mutated, inspection, sourceJsonPointer: '/0/15' });

  assert.equal(selection.status, 'unsupported');
  assert.ok(selection.reasons.includes('NO_ELIGIBLE_PROFILE'));

  const originalFixture = await readFixture('bdf1620w-p1-structured.json');
  const originalInspection = inspectFixture(originalFixture);
  const originalSelection = await selectFor({
    fixture: originalFixture,
    inspection: originalInspection,
    sourceJsonPointer: '/0/15',
  });
  const route = routeExtractionRegion({ regionObservation: region, selectedProfile: originalSelection });

  assert.equal(route.status, 'unresolved');
  assert.ok(route.reasons.includes('PROFILE_REGION_BINDING_MISMATCH'));
  const expectedGaps = [
    'MISSING_UNIT',
    'MIXED_UNITS',
    'CAPACITY_ADJACENT_TO_DIMENSIONS',
    'MULTI_MODEL_ROW',
    'CONFIGURATION_VARIANT_OBSERVED',
    'OPERATING_ANGLE_OBSERVED',
    'UNWITNESSED_CROSS_PAGE_CONTINUATION',
  ];
  assert.deepEqual(
    region.routingGaps.filter((reason) => expectedGaps.includes(reason)).sort(),
    [...expectedGaps].sort(),
  );
});

test('replays raw observation and profile selection bindings before routing', async () => {
  const [structuredFixture, imageFixture] = await Promise.all([
    readFixture('bdf1620w-p1-structured.json'),
    readFixture('bdf1620w-p2-image.json'),
  ]);
  const structuredInspection = inspectFixture(structuredFixture);
  const imageInspection = inspectFixture(imageFixture);
  const structuredRegion = regionAt(structuredInspection, '/0/15');
  const structuredSelection = await selectFor({
    fixture: structuredFixture,
    inspection: structuredInspection,
    sourceJsonPointer: '/0/15',
  });
  const imageSelection = await selectFor({
    fixture: imageFixture,
    inspection: imageInspection,
    sourceJsonPointer: '/1/4',
  });

  const forgedText = structuredClone(structuredRegion);
  forgedText.mineruText = 'caller-authored text';
  const forgedRoute = routeExtractionRegion({
    regionObservation: forgedText,
    selectedProfile: structuredSelection,
  });
  assert.equal(forgedRoute.status, 'unresolved');
  assert.ok(forgedRoute.reasons.includes('REGION_REPLAY_MISMATCH'));

  const forgedNativeText = structuredClone(structuredRegion);
  forgedNativeText.nativeText = 'caller-authored native text';
  const forgedNativeRoute = routeExtractionRegion({
    regionObservation: forgedNativeText,
    selectedProfile: structuredSelection,
  });
  assert.equal(forgedNativeRoute.status, 'unresolved');
  assert.ok(forgedNativeRoute.reasons.includes('REGION_REPLAY_MISMATCH'));

  const wrongRegionRoute = routeExtractionRegion({
    regionObservation: structuredRegion,
    selectedProfile: imageSelection,
  });
  assert.equal(wrongRegionRoute.status, 'unresolved');
  assert.ok(wrongRegionRoute.reasons.includes('PROFILE_REGION_BINDING_MISMATCH'));

  const forgedProfile = structuredClone(structuredSelection);
  forgedProfile.profile.extractorChain = ['native', 'unresolved'];
  const profileRoute = routeExtractionRegion({
    regionObservation: structuredRegion,
    selectedProfile: forgedProfile,
  });
  assert.equal(profileRoute.status, 'unresolved');
  assert.ok(profileRoute.reasons.includes('PROFILE_SELECTION_REPLAY_MISMATCH'));

  const disabledProfile = structuredClone(structuredSelection);
  disabledProfile.profile.status = 'disabled';
  const disabledRoute = routeExtractionRegion({
    regionObservation: structuredRegion,
    selectedProfile: disabledProfile,
  });
  assert.equal(disabledRoute.status, 'unresolved');
  assert.ok(disabledRoute.reasons.includes('PROFILE_SELECTION_REPLAY_MISMATCH'));
});

test('revalidates raw region identity and rejects rehashed malformed profile policy data', async () => {
  const fixture = await readFixture('bdf1620w-p1-structured.json');
  const inspection = inspectFixture(fixture);
  const region = regionAt(inspection, '/0/15');
  const forgedRegion = structuredClone(region);
  forgedRegion.rawBlock.content.paragraph_content[0].content = 'caller-authored raw text';
  const forgedSelection = selectDocumentProfile({
    registry: await registryInput(),
    brandId: fixture.document.brandId,
    category: fixture.document.category,
    documentType: fixture.document.documentType,
    regionObservation: forgedRegion,
  });
  assert.equal(forgedSelection.status, 'invalid');
  assert.ok(forgedSelection.reasons.includes('INVALID_REGION_REPLAY'));

  const basePolicy = await readJson(resolve(repositoryRoot, 'data/architecture-v3/policies/document-family-profiles.json'));
  const invalidRoute = structuredClone(basePolicy);
  invalidRoute.profiles[0].extractorChain = ['not_an_extractor', 'unresolved'];
  const unknownBrandReference = structuredClone(basePolicy);
  unknownBrandReference.profiles[0].brandIds = [`fa_brand_${'f'.repeat(64)}`];
  const unexpectedProfileKey = structuredClone(basePolicy);
  unexpectedProfileKey.profiles[0].unexpected = 'rehashed but forbidden';

  for (const policy of [invalidRoute, unknownBrandReference, unexpectedProfileKey].map(sealPolicy)) {
    const result = await selectFor({
      fixture,
      inspection,
      sourceJsonPointer: '/0/15',
      policy,
    });
    assert.equal(result.status, 'invalid');
  }

  const accessorPolicy = structuredClone(basePolicy);
  Object.defineProperty(accessorPolicy, 'profiles', {
    enumerable: true,
    get() {
      throw new Error('untrusted accessor must not execute');
    },
  });
  const accessorRegistry = { ...(await registryInput()), profilePolicy: accessorPolicy };
  assert.doesNotThrow(() => selectDocumentProfile({
    registry: accessorRegistry,
    brandId: fixture.document.brandId,
    category: fixture.document.category,
    documentType: fixture.document.documentType,
    regionObservation: region,
  }));
  const accessorResult = selectDocumentProfile({
    registry: accessorRegistry,
    brandId: fixture.document.brandId,
    category: fixture.document.category,
    documentType: fixture.document.documentType,
    regionObservation: region,
  });
  assert.equal(accessorResult.status, 'invalid');
});

test('exposes a data-only profile canary verifier without treating a missing run as pass', () => {
  assert.equal(typeof regionRouter.verifyProfileCanaryAttestation, 'function');
  const result = regionRouter.verifyProfileCanaryAttestation({});
  assert.equal(result.status, 'not_run');
  assert.ok(result.reasons.includes('MISSING_CANARY_INPUT'));
});

test('fix2 legitimate JSON-pointer index retains its split-column route and axis gap', async () => {
  const fixture = await readFixture('bdp810w-p1-split-columns.json');
  const inspection = inspectFixture(fixture, { pageImageMetadata: [] });
  const region = regionAt(inspection, '/0/47');
  const selection = await selectFor({ fixture, inspection, sourceJsonPointer: '/0/47' });
  assert.equal(region.status, 'inspected');
  assert.equal(region.contentMode, 'structured_text');
  assert.equal(selection.status, 'selected');
  assert.equal(selection.profile.profileId, 'beko-au-dryer-split-columns-v1');
  const route = routeExtractionRegion({ regionObservation: region, selectedProfile: selection });
  assert.equal(route.route, 'mineru');
  assert.ok(route.reasons.includes('AXIS_OR_LEGEND_GAP'));
});

// N1 adversarial inputs are synthetic, in-memory raw-kind mutations. They
// rehash their own raw fragment and use no borrowed page-image representation.
for (const [name, mutate] of [
  ['unknown', (raw) => { raw.type = 'unrecognized_raw_kind'; }],
  ['missing', (raw) => { delete raw.type; }],
]) {
  test(`fix2 ${name} raw kind remains visible but cannot select or route`, async () => {
    const fixture = mutateRawBlock(await readFixture('bdp810w-p1-split-columns.json'), '/0/47', mutate);
    const inspection = inspectFixture(fixture);
    const region = regionAt(inspection, '/0/47');
    const sourceBlock = fixture.mineruDocument.blocks.find((block) => block.sourceJsonPointer === '/0/47');
    assert.equal(region.status, 'incomplete');
    assert.equal(region.contentMode, 'unsupported');
    assert.equal(region.fragmentSha256, sourceBlock.fragmentSha256);
    assert.equal(region.sourcePdfSha256, fixture.document.sourcePdfSha256);
    assert.deepEqual(region.rawBlock, sourceBlock.rawBlock);
    assert.deepEqual(region.bbox, sourceBlock.rawBlock.bbox);
    assert.equal(inspection.regions.length, fixture.mineruDocument.blocks.length);
    assert.deepEqual(region.structuralSignals, ['raw_block_identity']);
    assert.deepEqual(region.routingGaps, ['UNSUPPORTED_RAW_KIND']);

    const selection = await selectFor({ fixture, inspection, sourceJsonPointer: '/0/47' });
    assert.equal(selection.status, 'invalid');
    assert.deepEqual(selection.reasons, ['UNINSPECTED_REGION']);
    const route = routeExtractionRegion({ regionObservation: region, selectedProfile: selection });
    assert.equal(route.route, 'unresolved');
    assert.deepEqual(route.reasons, ['UNINSPECTED_REGION']);

    const forged = JSON.parse(JSON.stringify(region));
    forged.status = 'inspected';
    const spoof = selectDocumentProfile({
      registry: await registryInput(),
      brandId: fixture.document.brandId,
      category: fixture.document.category,
      documentType: fixture.document.documentType,
      regionObservation: forged,
    });
    assert.deepEqual(spoof.reasons, ['REGION_REPLAY_MISMATCH']);
  });
}

test('fix2 non-string, malformed and derived-signal raw kinds do not become structured text', async () => {
  const base = await readFixture('bdp810w-p1-split-columns.json');
  for (const kind of [null, 0, true, [], {}, '', ' index ', 'constructor', '__proto__',
    'structured_text', 'dimension_context', 'image_region', 'raw_block_identity']) {
    const fixture = mutateRawBlock(base, '/0/47', (raw) => { raw.type = kind; });
    const inspection = inspectFixture(fixture);
    const region = regionAt(inspection, '/0/47');
    assert.equal(region.status, 'incomplete', JSON.stringify(kind));
    assert.equal(region.contentMode, 'unsupported');
    assert.deepEqual(region.routingGaps, ['UNSUPPORTED_RAW_KIND']);
    assert.deepEqual(region.structuralSignals, ['raw_block_identity']);
    const selection = await selectFor({ fixture, inspection, sourceJsonPointer: '/0/47' });
    assert.equal(selection.status, 'invalid');
    assert.equal(routeExtractionRegion({ regionObservation: region, selectedProfile: selection }).route, 'unresolved');
  }
});

test('fix2 mixed same-page regions retain the unknown region and a usable supported neighbour', async () => {
  const fixture = mutateRawBlock(await readFixture('bdf1620w-p1-structured.json'), '/0/14', (raw) => {
    raw.type = 'unrecognized_raw_kind';
  });
  const inspection = inspectFixture(fixture);
  const unknown = regionAt(inspection, '/0/14');
  const supported = regionAt(inspection, '/0/15');
  assert.equal(inspection.status, 'incomplete');
  assert.ok(inspection.reasons.includes('UNSUPPORTED_RAW_KIND'));
  assert.equal(inspection.regions.length, 2);
  assert.equal(unknown.status, 'incomplete');
  assert.equal(supported.status, 'inspected');
  const selection = await selectFor({ fixture, inspection, sourceJsonPointer: '/0/15' });
  assert.equal(selection.status, 'selected');
  assert.equal(selection.profile.profileId, 'beko-au-dishwasher-structured-v1');
  const route = routeExtractionRegion({ regionObservation: JSON.parse(JSON.stringify(supported)), selectedProfile: selection });
  assert.equal(route.status, 'routed');
  assert.equal(route.route, 'mineru');
});

test('fix1 direct selection rejects a forged inspected status and derived signals', async () => {
  const fixture = await readFixture('bdf1620w-p2-image.json');
  const missing = regionAt(inspectFixture(fixture, { pageImageMetadata: [] }), '/1/4');
  assert.equal(missing.status, 'incomplete');
  const input = {
    registry: await registryInput(),
    brandId: fixture.document.brandId,
    category: fixture.document.category,
    documentType: fixture.document.documentType,
    regionObservation: { ...missing, status: 'inspected' },
  };
  const spoof = selectDocumentProfile(input);
  assert.equal(spoof.status, 'invalid');
  assert.deepEqual(spoof.reasons, ['REGION_REPLAY_MISMATCH']);

  const valid = regionAt(inspectFixture(fixture), '/1/4');
  assert.equal(selectDocumentProfile({ ...input, regionObservation: JSON.parse(JSON.stringify(valid)) }).status, 'selected');
  const forgedSignals = { ...valid, structuralSignals: [...valid.structuralSignals, 'mixed_units'] };
  assert.equal(selectDocumentProfile({ ...input, regionObservation: forgedSignals }).status, 'invalid');
});

// Synthetic G3a crop records for structural replay only: no image bytes are
// rendered or claimed acquired. Raw content/pointer is the accepted BDF region.
async function syntheticG3aCrop({ rotated = false } = {}) {
  const fixture = await readFixture('bdf1620w-p2-image.json');
  fixture.mineruDocument.blocks = fixture.mineruDocument.blocks.filter((block) => block.sourceJsonPointer === '/1/4');
  fixture.nativeObservations = [];
  const rawBlock = fixture.mineruDocument.blocks[0].rawBlock;
  const source = fixture.document.sourcePdfSha256;
  const fullSha = sha256('synthetic G3a full page, rotation ' + (rotated ? 90 : 0));
  const cropSha = sha256('synthetic G3a crop, rotation ' + (rotated ? 90 : 0));
  // G3a's producer preserves MinerU's already-normalized top-left page box
  // and records page rotation separately. Do not apply that rotation twice.
  const normalizedTopLeftBox = [67, 543, 915, 909];
  const normalizedCropBox = [50.25, 500.5, 950.75, 950.25];
  const artifacts = [
    createArtifactRecord({ sha256: source, parentSha256: null, mediaType: 'application/pdf', toolRevision: null, optionsSha256: null }),
    createArtifactRecord({ sha256: fullSha, parentSha256: source, mediaType: 'image/png', toolRevision: 'synthetic-structural-test@1', optionsSha256: sha256('synthetic full page') }),
    createArtifactRecord({ sha256: cropSha, parentSha256: fullSha, mediaType: 'image/png', toolRevision: 'synthetic-structural-test@1', optionsSha256: sha256('synthetic crop') }),
  ];
  const fullLocator = {
    kind: 'pdf_bbox', pageNumber: 2, normalizedTopLeftBox,
    renderedPageArtifactSha256: fullSha,
    renderedPixels: rotated ? { width: 1754, height: 1241 } : { width: 1241, height: 1754 },
    rotationDegreesClockwise: rotated ? 90 : 0,
    transform: { kind: 'full_page' },
    rawCoordinates: { coordinateSpace: 'mineru_normalized_top_left_1000', values: rawBlock.bbox },
  };
  const cropLocator = {
    ...fullLocator, renderedPageArtifactSha256: cropSha, renderedPixels: { width: 800, height: 800 },
    transform: { kind: 'crop_from_full_page', fullPageArtifactSha256: fullSha, normalizedCropBox },
  };
  const fragments = [fullLocator, cropLocator].map((locator) => resealImageFragment({
    content: rawBlock, parentArtifactSha256: source, locator,
  }));
  fixture.pageImageMetadata = [{
    sourcePdfSha256: source, pageNumber: 2, renderedPageArtifactSha256: cropSha,
    renderedPixels: cropLocator.renderedPixels,
    rotationDegreesClockwise: cropLocator.rotationDegreesClockwise,
    transform: cropLocator.transform, artifactRecords: artifacts, fragments,
  }];
  return fixture;
}

function resealImageFragment(fragment) {
  const payload = { content: fragment.content, parentArtifactSha256: fragment.parentArtifactSha256, locator: fragment.locator };
  return createFragment({
    ...payload,
    fragmentSha256: sha256(canonicalEvidenceJson({
      fragmentIdentityDomain: 'fitappliance.fragment.v1', schemaVersion: 1,
      canonicalizationVersion: 'fit-evidence-json-v3-1', ...payload,
    })),
  });
}

test('fix1 accepts G3a crop locators with full-page ancestry and decimal rotation-aware bounds', async () => {
  for (const rotated of [false, true]) {
    const fixture = await syntheticG3aCrop({ rotated });
    const metadata = fixture.pageImageMetadata[0];
    assert.doesNotThrow(() => validateEvidenceAnchors({
      sourceArtifactSha256: fixture.document.sourcePdfSha256,
      artifactRecords: metadata.artifactRecords, fragments: metadata.fragments,
      anchors: [{ anchorId: 'region', role: 'value', fragmentSha256: metadata.fragments[1].fragmentSha256 }],
      relations: [],
    }));
    const inspection = inspectFixture(fixture);
    assert.equal(inspection.status, 'inspected', JSON.stringify(inspection.reasons));
    const selection = await selectFor({ fixture, inspection, sourceJsonPointer: '/1/4' });
    assert.equal(selection.status, 'selected');
    assert.equal(routeExtractionRegion({ regionObservation: regionAt(inspection, '/1/4'), selectedProfile: selection }).route, 'ocr_or_vision');
    assert.deepEqual(regionAt(inspection, '/1/4').pageImageMetadata.transform.normalizedCropBox, metadata.transform.normalizedCropBox);
  }
});

test('fix1 rejects same-PDF wrong-page, ancestry, raw-coordinate, crop and rotation substitutions', async () => {
  const valid = await syntheticG3aCrop({ rotated: true });
  const mutations = [
    (m) => { m.fragments[0].locator.pageNumber = 1; },
    (m) => { m.artifactRecords[2].parentSha256 = valid.document.sourcePdfSha256; },
    (m) => { m.fragments[1].locator.rawCoordinates.values[0] += 0.125; },
    (m) => { m.fragments[1].locator.rawCoordinates.coordinateSpace = 'unknown_frame'; },
    (m) => { m.fragments[1].locator.rotationDegreesClockwise = 0; },
    (m) => {
      m.transform.normalizedCropBox = [50.25, 50.5, 500.75, 950.25];
      m.fragments[1].locator.transform = structuredClone(m.transform);
    },
  ];
  for (const [index, mutate] of mutations.entries()) {
    const fixture = structuredClone(valid);
    const metadata = fixture.pageImageMetadata[0];
    mutate(metadata);
    metadata.fragments = metadata.fragments.map(resealImageFragment);
    const inspection = inspectFixture(fixture);
    assert.equal(inspection.status, 'incomplete', `mutation ${index}`);
    assert.notEqual((await selectFor({ fixture, inspection, sourceJsonPointer: '/1/4' })).status, 'selected');
  }
  const weak = await readFixture('bdf1620w-p2-image.json');
  weak.pageImageMetadata[0].transform = { kind: 'crop', normalizedTopLeftBox: [0, 0, 1000, 1000] };
  assert.equal(inspectFixture(weak).status, 'incomplete');
});

test('fix1 negative profile witnesses inspect genuine alternate regions separately from hash tampering', async () => {
  const input = await portableCanaryInput();
  const result = regionRouter.verifyProfileCanaryAttestation(input);
  assert.equal(result.status, 'pass', JSON.stringify(result));
  assert.equal(result.negativeWitnessResults.length, 12);
  for (const row of result.negativeWitnessResults) {
    assert.equal(row.inspectionStatus, 'inspected');
    assert.equal(row.selectionStatus, 'selected');
    assert.notEqual(row.selectedProfileId, row.profileId);
    assert.equal(row.reason, 'TARGET_PROFILE_NOT_SELECTED');
    const alternate = input.manifest.fixtures.find((fixture) => fixture.fixtureId === row.fixtureId);
    assert.ok(alternate);
    assert.equal(row.sourceJsonPointer, alternate.target.sourceJsonPointer);
    assert.equal(row.fragmentSha256, alternate.target.fragmentSha256);
    const source = input.manifest.sourceExpectations.find((source) => source.sourceId === alternate.sourceId);
    assert.equal(row.sourcePdfSha256, source.sourcePdfSha256);
  }
  assert.equal(result.sourceIdentityTamperResults.length, 12);
  assert.ok(result.sourceIdentityTamperResults.every((row) => row.reason === 'FIXTURE_SOURCE_PDF_MISMATCH'));
});

test('fix1 negative witnesses reject a rehashed wrong selection expectation or donated positive identity', async () => {
  const input = await portableCanaryInput();
  const wrongOutcome = structuredClone(input);
  wrongOutcome.manifest.profileWitnesses[0].negativeWitnesses[0].expected.profileId = 'electrolux-au-washer-table-v1';
  wrongOutcome.manifest = resealCanaryManifest(wrongOutcome.manifest);
  assert.deepEqual(regionRouter.verifyProfileCanaryAttestation(wrongOutcome).reasons, ['NEGATIVE_PROFILE_WITNESS_MISMATCH']);

  const donatedPositive = structuredClone(input);
  donatedPositive.manifest.profileWitnesses[0].negativeWitnesses[0].fixtureId = 'bdf-image';
  donatedPositive.manifest = resealCanaryManifest(donatedPositive.manifest);
  assert.deepEqual(regionRouter.verifyProfileCanaryAttestation(donatedPositive).reasons, ['INVALID_CANARY_MANIFEST']);
});

test('replays every active profile from independently expected portable canary inputs', async () => {
  const input = await portableCanaryInput();
  const result = regionRouter.verifyProfileCanaryAttestation(input);

  assert.equal(result.status, 'pass', JSON.stringify(result));
  assert.equal(result.mode, 'portable');
  assert.equal(result.summary.fixtures, 6);
  assert.equal(result.summary.activeProfiles, 6);
  assert.equal(result.summary.negativeSourceWitnesses, 12);
  assert.equal(result.historicalOcrToolAttestation, 'INCOMPLETE_RECORDED_TOOL_PROVENANCE');
  assert.equal(result.fixtureResults.every((row) => row.status === 'pass'), true);
});

test('fails closed for changed code, policy, source, derived, expected, and tool identities', async () => {
  const input = await portableCanaryInput();
  const alternateSource = '1b8980e6e6e287657658fd2b5c7b58c6013f21d544cf7b2c5393cd7d877e5244';

  const changedCode = structuredClone(input);
  changedCode.codeIdentity.files[0].sha256 = '0'.repeat(64);
  assert.deepEqual(
    regionRouter.verifyProfileCanaryAttestation(changedCode).reasons,
    ['CODE_IDENTITY_MISMATCH'],
  );

  const changedSource = structuredClone(input);
  changedSource.portableFixtures.fixtures.find((fixture) => fixture.fixtureId === 'bdf-structured')
    .payload.document.sourcePdfSha256 = alternateSource;
  assert.deepEqual(
    regionRouter.verifyProfileCanaryAttestation(changedSource).reasons,
    ['FIXTURE_SOURCE_PDF_MISMATCH'],
  );

  const changedDerived = structuredClone(input);
  changedDerived.portableFixtures.fixtures.find((fixture) => fixture.fixtureId === 'bdf-structured')
    .payload.mineruDocument.contentSha256 = alternateSource;
  assert.deepEqual(
    regionRouter.verifyProfileCanaryAttestation(changedDerived).reasons,
    ['FIXTURE_MINERU_IDENTITY_MISMATCH'],
  );

  const changedExpected = structuredClone(input);
  changedExpected.manifest.fixtures.find((fixture) => fixture.fixtureId === 'bdf-structured').expected.route = 'native';
  changedExpected.manifest = resealCanaryManifest(changedExpected.manifest);
  assert.deepEqual(
    regionRouter.verifyProfileCanaryAttestation(changedExpected).reasons,
    ['FIXTURE_ROUTE_MISMATCH'],
  );

  const changedTool = structuredClone(input);
  changedTool.manifest.toolIdentity.selectedMineru.acceptedToolRevisions.push('MinerU@0.0.0:unsupported');
  changedTool.manifest = resealCanaryManifest(changedTool.manifest);
  assert.deepEqual(
    regionRouter.verifyProfileCanaryAttestation(changedTool).reasons,
    ['FROZEN_SOURCE_CONTRACT_MISMATCH'],
  );

  const changedPolicy = structuredClone(input);
  changedPolicy.portableFixtures.registry.profilePolicy.profiles[0].status = 'disabled';
  changedPolicy.portableFixtures.registry.profilePolicy = sealPolicy(changedPolicy.portableFixtures.registry.profilePolicy);
  assert.deepEqual(
    regionRouter.verifyProfileCanaryAttestation(changedPolicy).reasons,
    ['REGISTRY_OR_POLICY_IDENTITY_MISMATCH'],
  );

  const blocked = structuredClone(input);
  blocked.portableFixtures.mode = 'original-objects';
  assert.deepEqual(
    regionRouter.verifyProfileCanaryAttestation(blocked).status,
    'blocked',
  );
});

test('strict CLI keeps portable, invalid-argument, and missing-store outcomes separate', async () => {
  const [portable, invalid, missingStore] = await Promise.all([
    runCanaryCli(['--portable']),
    runCanaryCli(['--portable', '--unexpected']),
    runCanaryCli(['--original-objects', '--evidence-store', '/definitely-missing-fitappliance-g3b-store']),
  ]);
  assert.equal(portable.exitCode, 0, portable.stderr);
  assert.equal(portable.signal, null);
  assert.equal(portable.report.status, 'pass');
  assert.equal(portable.stdout.includes('"registry"'), false);
  assert.equal(portable.stdout.includes('"rawBlock"'), false);

  assert.equal(invalid.exitCode, 2, invalid.stderr);
  assert.equal(invalid.report.status, 'not_run');
  assert.deepEqual(invalid.report.reasons, ['INVALID_CLI_ARGUMENTS']);

  assert.equal(missingStore.exitCode, 2, missingStore.stderr);
  assert.equal(missingStore.report.status, 'blocked');
  assert.deepEqual(missingStore.report.reasons, ['EVIDENCE_STORE_UNAVAILABLE']);
});

test('original-object mode replays actual bytes and rejects PDF, page, and crop substitutions', async (t) => {
  if (!await evidenceStoreIsAvailable()) t.skip('bounded original evidence store is not mounted');
  const portable = await portableCanaryInput();
  const before = await readFile(join(evidenceStore, portable.manifest.acceptedBatch.objectPath));
  const child = await runCanaryCli([
    '--original-objects',
    '--evidence-store',
    evidenceStore,
  ]);
  const after = await readFile(join(evidenceStore, portable.manifest.acceptedBatch.objectPath));
  assert.equal(child.exitCode, 0, child.stderr);
  assert.equal(child.signal, null);
  assert.equal(child.report.status, 'pass');
  assert.equal(child.report.summary.originalObjectsBound, true);
  assert.deepEqual(after, before);

  const input = await originalCanaryInput();
  const changedAnchor = structuredClone(input);
  const anchorMetadata = changedAnchor.portableFixtures.fixtures.find((fixture) => fixture.fixtureId === 'bdf-image')
    .payload.pageImageMetadata[0];
  anchorMetadata.fragments[0].locator.rawCoordinates.values[0] += 0.125;
  anchorMetadata.fragments[0] = resealImageFragment(anchorMetadata.fragments[0]);
  assert.deepEqual(
    regionRouter.verifyProfileCanaryAttestation(changedAnchor).reasons,
    ['ORIGINAL_IMAGE_ANCHOR_MISMATCH'],
  );
  const changedPdf = structuredClone(input);
  const pdfBytes = Buffer.from(changedPdf.portableFixtures.originalObjects.sources[0].sourcePdf.bytesBase64, 'base64');
  pdfBytes[0] ^= 0x01;
  changedPdf.portableFixtures.originalObjects.sources[0].sourcePdf.bytesBase64 = pdfBytes.toString('base64');
  assert.deepEqual(
    regionRouter.verifyProfileCanaryAttestation(changedPdf).reasons,
    ['ORIGINAL_PDF_IDENTITY_MISMATCH'],
  );

  const changedPage = structuredClone(input);
  changedPage.portableFixtures.originalObjects.sources[0].renderedPages[0].pageNumber = 2;
  assert.deepEqual(
    regionRouter.verifyProfileCanaryAttestation(changedPage).reasons,
    ['ORIGINAL_RENDER_PROVENANCE_MISMATCH'],
  );

  const changedCrop = structuredClone(input);
  changedCrop.portableFixtures.fixtures.find((fixture) => fixture.fixtureId === 'bdf-image')
    .payload.pageImageMetadata[0].transform = { kind: 'crop', normalizedTopLeftBox: [0, 0, 1000, 1000] };
  assert.deepEqual(
    regionRouter.verifyProfileCanaryAttestation(changedCrop).reasons,
    ['FIXTURE_PAGE_PROVENANCE_MISMATCH'],
  );
});
