import test from 'node:test';
import assert from 'node:assert/strict';

import {
  claimV2GeometryValue,
  upgradeLegacyDimensionClaim,
  validateDimensionEvidenceClaimV2,
  validateDimensionEvidenceClaimsV2,
} from '../../src/domain/dimension-evidence-claim.mjs';

const HASH = 'a'.repeat(64);

function fixed(overrides = {}) {
  return {
    field: 'closedEnvelope.widthMm',
    value: { kind: 'fixed', mm: 598 },
    sourceLabel: 'Overall width',
    sourceAxisOrder: ['width'],
    sourceUnit: 'mm',
    measurementScope: 'product_closed_external',
    includesDoor: null,
    includesHandle: null,
    page: 1,
    fragmentSha256: HASH,
    bbox: [10, 20, 300, 80],
    ...overrides,
  };
}

test('claim semantics v2 requires explicit value kind, axis order and measurement scope', () => {
  assert.deepEqual(validateDimensionEvidenceClaimV2(fixed()), fixed());
  assert.throws(() => validateDimensionEvidenceClaimV2({
    ...fixed(), measurementScope: 'package',
  }), /scope/i);
  assert.throws(() => validateDimensionEvidenceClaimV2({
    ...fixed(), sourceAxisOrder: ['height'],
  }), /axis/i);
  assert.throws(() => validateDimensionEvidenceClaimV2({
    ...fixed(), extra: true,
  }), /unknown key/i);
});

test('legacy fixed and adjustable-height evidence upgrades without collapsing ranges', () => {
  const width = upgradeLegacyDimensionClaim({
    field: 'closedEnvelope.widthMm', value: 598, unit: 'mm', label: 'Width',
    page: 1, fragmentSha256: HASH, bbox: [10, 20, 300, 80],
  });
  const height = upgradeLegacyDimensionClaim({
    field: 'closedEnvelope.heightMm', value: { minimumMm: 818, maximumMm: 878 },
    unit: 'mm', label: 'Adjustable height', sourceUnit: 'mm',
    page: 1, fragmentSha256: HASH, bbox: [10, 20, 300, 80],
  });
  assert.deepEqual(width.value, { kind: 'fixed', mm: 598 });
  assert.deepEqual(height.value, { kind: 'range', minMm: 818, maxMm: 878 });
  assert.equal(claimV2GeometryValue(width), 598);
  assert.deepEqual(claimV2GeometryValue(height), { minimumMm: 818, maximumMm: 878 });
});

test('width/depth ranges remain valid internal evidence but cannot become geometry scalars', () => {
  const range = fixed({
    field: 'closedEnvelope.depthMm',
    value: { kind: 'range', minMm: 570, maxMm: 600 },
    sourceLabel: 'Depth range',
    sourceAxisOrder: ['depth'],
  });
  assert.deepEqual(validateDimensionEvidenceClaimV2(range), range);
  assert.equal(claimV2GeometryValue(range), null);
});

test('door, handle, package, cavity and service semantics stay independent', () => {
  const claims = [
    fixed({
      field: 'closedEnvelope.depthMm', value: { kind: 'fixed', mm: 735 },
      sourceLabel: 'Overall depth including handles', sourceAxisOrder: ['depth'],
      includesDoor: true, includesHandle: true,
    }),
    fixed({
      field: 'operation.doorOpenDepthMm', value: { kind: 'fixed', mm: 1199 },
      sourceLabel: 'Depth with door open 90 degrees', sourceAxisOrder: ['depth'],
      measurementScope: 'door_open_envelope', includesDoor: true,
    }),
    fixed({
      field: 'installation.rearMm', value: { kind: 'fixed', mm: 50 },
      sourceLabel: 'Minimum rear clearance', sourceAxisOrder: ['rear'],
      measurementScope: 'installation_clearance',
    }),
  ];
  assert.deepEqual(validateDimensionEvidenceClaimsV2(claims), claims);
});
