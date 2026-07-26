export const HISTORICAL_EVIDENCE_EPOCH_DEFINITIONS = Object.freeze([
  ['identity-registry', 'src/domain/canonical-registry.mjs', [
    'src/domain/canonical-registry.mjs', 'scripts/architecture-v2/build-canonical-registry.mjs',
  ]],
  ['observation', 'src/domain/retailer-observation.mjs', [
    'src/domain/retailer-observation.mjs', 'src/domain/retailer-source-adapter.mjs',
  ]],
  ['lifecycle-policy', 'src/domain/retail-lifecycle-shadow.mjs', [
    'src/domain/historical-appliance-reference.mjs', 'src/domain/retail-lifecycle-shadow.mjs',
    'data/architecture-v2/policies/retail-lifecycle-release-policy.json',
    'data/architecture-v2/policies/reference-artifact-policy.json',
  ]],
  ['resolver-contract', 'scripts/pdf-pipeline/architecture-v2-resolver-adapters.mjs', [
    'scripts/pdf-pipeline/architecture-v2-resolver-adapters.mjs',
    'data/architecture-v2/policies/official-discovery-seed-policy.json',
  ]],
  ['source-authority-policy', 'data/architecture-v2/policies/manufacturer-source-policy.json', [
    'data/architecture-v2/policies/manufacturer-source-policy.json',
    'data/architecture-v2/policies/retailer-source-policy.json',
  ]],
  ['mineru-toolchain', 'src/domain/mineru-tool-identity.mjs', [
    'src/domain/mineru-tool-identity.mjs', 'src/domain/mineru-runner.mjs',
    'scripts/architecture-v2/parse-pdf-with-mineru.mjs',
  ]],
  ['parser', 'src/domain/mineru-document.mjs', [
    'src/domain/mineru-document.mjs', 'src/domain/dimension-expression-knowledge.mjs',
  ]],
  ['scale-metrics', 'src/domain/historical-dimensions-scale-control.mjs', [
    'src/domain/evidence-candidate-inventory.mjs',
    'src/domain/historical-dimensions-scale-control.mjs',
    'src/domain/receipt-bound-evidence-batch-runner.mjs',
  ]],
  ['receipt-policy', 'src/domain/historical-evidence-recovery-contract.mjs', [
    'src/domain/historical-evidence-recovery-contract.mjs',
    'data/architecture-v2/policies/historical-evidence-recovery-policy.json',
  ]],
  ['publication', 'src/domain/historical-evidence-publication.mjs', [
    'src/domain/historical-evidence-publication.mjs', 'src/domain/public-projection.mjs',
    'src/domain/historical-reference-publication.mjs',
  ]],
  ['fit-policy', 'src/domain/fit-v3.mjs', [
    'src/domain/fit-v3.mjs', 'src/domain/installation-evidence-pipeline.mjs',
  ]],
].map(([id, owner, paths]) => Object.freeze([id, owner, Object.freeze([...paths])])));
