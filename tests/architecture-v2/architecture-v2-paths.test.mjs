import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import {
  ARCHITECTURE_V2_BUILD_GRAPH,
  ARCHITECTURE_V2_BUILD_ORDER,
  architectureV2Paths,
} from '../../src/domain/architecture-v2-paths.mjs';

test('Architecture V2 data is separated by ownership and has no flat JSON artifacts', () => {
  const expectedRoots = [
    'decisions/',
    'generated/',
    'ledgers/',
    'observations/',
    'policies/',
    'reviews/',
  ];
  const paths = Object.values(architectureV2Paths);
  assert.ok(paths.every((path) => expectedRoots.some((prefix) => path.startsWith(`data/architecture-v2/${prefix}`))));
  assert.ok(paths.every(existsSync), 'every registered Architecture V2 path must exist');
  assert.deepEqual(
    readdirSync('data/architecture-v2').filter((name) => name.endsWith('.json')),
    [],
  );
});

test('Architecture V2 generated artifact graph is acyclic and follows declared build order', () => {
  const positions = new Map(ARCHITECTURE_V2_BUILD_ORDER.map((stage, index) => [stage, index]));
  assert.deepEqual([...positions.keys()], Object.keys(ARCHITECTURE_V2_BUILD_GRAPH));
  for (const [stage, dependencies] of Object.entries(ARCHITECTURE_V2_BUILD_GRAPH)) {
    for (const dependency of dependencies) {
      assert.ok(positions.has(dependency), `unknown dependency ${dependency}`);
      assert.ok(positions.get(dependency) < positions.get(stage), `${stage} cannot depend on later stage ${dependency}`);
    }
  }
});

test('released and identity-migration candidate registries are separate build epochs', () => {
  assert.equal(
    architectureV2Paths.canonicalRegistryMigrationCandidate,
    'data/architecture-v2/generated/canonical-registry-migration-candidate.json',
  );
  assert.deepEqual(
    ARCHITECTURE_V2_BUILD_GRAPH.canonicalRegistry,
    ['evidenceResolutionManifest'],
  );
  assert.deepEqual(
    ARCHITECTURE_V2_BUILD_GRAPH.canonicalRegistryMigrationCandidate,
    ['canonicalRegistry', 'retailerIdentityMigration'],
  );
});

test('historical reference artifacts follow identity before publication ordering', () => {
  assert.equal(
    architectureV2Paths.historicalEvidenceRecoveryPolicy,
    'data/architecture-v2/policies/historical-evidence-recovery-policy.json',
  );
  assert.equal(
    architectureV2Paths.historicalEvidenceSystemContract,
    'data/architecture-v2/reviews/automated/historical-evidence-system-contract.json',
  );
  assert.equal(
    architectureV2Paths.historicalApplianceReference,
    'data/architecture-v2/generated/historical-appliance-reference.json',
  );
  assert.equal(
    architectureV2Paths.historicalReferencePublicationManifest,
    'data/architecture-v2/generated/historical-reference-publication-manifest.json',
  );
  assert.equal(
    architectureV2Paths.historicalReplacementAudit,
    'data/architecture-v2/reviews/automated/historical-replacement-audit.json',
  );
  assert.equal(
    architectureV2Paths.historicalEvidenceRecoveryQueue,
    'data/architecture-v2/reviews/automated/historical-evidence-recovery-queue.json',
  );
  assert.equal(
    architectureV2Paths.historicalEvidenceRecoveryBatch,
    'data/architecture-v2/reviews/automated/historical-evidence-recovery-batch.json',
  );
  assert.equal(
    architectureV2Paths.historicalEvidenceRecoveryAcceptanceBundle,
    'data/architecture-v2/reviews/automated/historical-evidence-recovery-acceptance-bundle.json',
  );
  assert.deepEqual(
    ARCHITECTURE_V2_BUILD_GRAPH.historicalApplianceReference,
    ['officialRegistrySnapshots', 'publicProjection', 'historicalEvidenceRecoveryAcceptanceBundle'],
  );
  assert.deepEqual(
    ARCHITECTURE_V2_BUILD_GRAPH.historicalReferencePublicationManifest,
    ['historicalApplianceReference'],
  );
  assert.deepEqual(
    ARCHITECTURE_V2_BUILD_GRAPH.historicalReplacementAudit,
    ['historicalReferencePublicationManifest', 'publicProjection'],
  );
  assert.deepEqual(
    ARCHITECTURE_V2_BUILD_GRAPH.historicalEvidenceRecoveryQueue,
    ['sourceDocuments', 'historicalApplianceReference'],
  );
  assert.deepEqual(
    ARCHITECTURE_V2_BUILD_GRAPH.historicalEvidenceRecoveryBatch,
    ['historicalEvidenceRecoveryQueue'],
  );
  assert.deepEqual(
    ARCHITECTURE_V2_BUILD_GRAPH.historicalEvidenceRecoveryAcceptanceBundle,
    [],
  );
  assert.ok(
    ARCHITECTURE_V2_BUILD_GRAPH.publicProjection.includes(
      'historicalEvidenceRecoveryAcceptanceBundle',
    ),
  );
});

test('review bundle builder cannot read final registry or public projection', () => {
  const source = readFileSync('scripts/architecture-v2/build-evidence-review-bundles.mjs', 'utf8');
  assert.doesNotMatch(source, /resolveArchitectureV2Path\(root, '(sourceDocuments|publicProjection)'\)/);
  assert.match(source, /buildLegacySourceDocuments/);
  assert.match(source, /phase08DimensionInput/);
});
