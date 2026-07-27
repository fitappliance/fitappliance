import { CLAIM_PARSER_IMPLEMENTATION_PATHS } from './evidence-processor-epoch.mjs';

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
    'scripts/pdf-pipeline/artusi-official.js',
    'scripts/pdf-pipeline/asko-official.js',
    'scripts/pdf-pipeline/beko-official.js',
    'scripts/pdf-pipeline/bosch-official.js',
    'scripts/pdf-pipeline/chiq-official.js',
    'scripts/pdf-pipeline/electrolux-group-official.js',
    'scripts/pdf-pipeline/esatto-official.js',
    'scripts/pdf-pipeline/euromaid-official.js',
    'scripts/pdf-pipeline/fisher-paykel-official.js',
    'scripts/pdf-pipeline/haier-official.js',
    'scripts/pdf-pipeline/hisense-official.js',
    'scripts/pdf-pipeline/inalto-official.js',
    'scripts/pdf-pipeline/kogan-official.js',
    'scripts/pdf-pipeline/lg-official.js',
    'scripts/pdf-pipeline/liebherr-official.js',
    'scripts/pdf-pipeline/midea-official.js',
    'scripts/pdf-pipeline/miele-official.js',
    'scripts/pdf-pipeline/omega-official.js',
    'scripts/pdf-pipeline/robinhood-official.js',
    'scripts/pdf-pipeline/samsung-official.js',
    'scripts/pdf-pipeline/smeg-official.js',
    'scripts/pdf-pipeline/sub-zero-official.js',
    'scripts/pdf-pipeline/teco-official.js',
    'scripts/pdf-pipeline/vogue-official.js',
    'scripts/pdf-pipeline/westinghouse-official.js',
    'scripts/architecture-v2/run-historical-evidence-recovery.mjs',
    'src/domain/evidence-source-adapter-contract.mjs',
    'src/domain/evidence-source-verifier.mjs',
    'data/architecture-v2/policies/manufacturer-document-strategies.json',
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
    ...new Set([
      ...CLAIM_PARSER_IMPLEMENTATION_PATHS,
      'src/domain/dimension-expression-knowledge.mjs',
    ]),
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
