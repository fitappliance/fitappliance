import test from 'node:test';
import assert from 'node:assert/strict';
import { createCategoryGeometry, auditCategoryGeometry } from '../../src/domain/category-geometry.mjs';

const shared = {
  closedEnvelope: { widthMm: 900, heightMm: 1780, depthMm: 700 },
  installation: { leftMm: 10, rightMm: 10, topMm: 20, rearMm: 50, frontMm: 0 },
};

test('refrigerator geometry preserves unknown operation and service requirements', () => {
  const geometry = createCategoryGeometry('fridge', {
    ...shared,
    formFactor: 'upright',
    operation: { doorOpenDepthMm: null, hingeSideSpaceMm: null },
    service: { plumbingRearMm: null },
    delivery: { widthMm: null, heightMm: null, depthMm: null },
  });
  assert.equal(geometry.operation.doorOpenDepthMm, null);
  assert.ok(auditCategoryGeometry('fridge', geometry).missingRequired.includes('operation.doorOpenDepthMm'));
});

test('category audit distinguishes required fields from non-applicable fields', () => {
  const geometry = createCategoryGeometry('dishwasher', {
    ...shared,
    operation: { doorOpenDepthMm: 1200 }, service: { rearServicesMm: 80 },
    delivery: { widthMm: null, heightMm: null, depthMm: null },
  });
  const audit = auditCategoryGeometry('dishwasher', geometry);
  assert.deepEqual(audit.missingRequired, []);
  assert.ok(audit.nonApplicable.includes('operation.hingeSideSpaceMm'));
});

test('unknown is never coerced to zero and dimensions cannot fill clearance', () => {
  const geometry = createCategoryGeometry('fridge', {
    ...shared, installation: { ...shared.installation, rearMm: null },
    operation: {}, service: {}, delivery: {},
  });
  assert.equal(geometry.installation.rearMm, null);
  assert.equal(geometry.service.plumbingRearMm, null);
});

test('top-opening appliances require lid height instead of front door depth', () => {
  const geometry = createCategoryGeometry('washing_machine', {
    ...shared, formFactor: 'top_loader', operation: {}, service: { rearServicesMm: 80 }, delivery: {},
  });
  const audit = auditCategoryGeometry('washing_machine', geometry);
  assert.ok(audit.missingRequired.includes('operation.lidOpenHeightMm'));
  assert.ok(!audit.missingRequired.includes('operation.doorOpenDepthMm'));
});

test('WashTower geometry requires front-door operation and rear service space', () => {
  const geometry = createCategoryGeometry('washtower_combo', {
    ...shared,
    operation: { doorOpenDepthMm: null },
    service: { rearServicesMm: null },
    delivery: {},
  });
  const audit = auditCategoryGeometry('washtower_combo', geometry);
  assert.deepEqual(audit.missingRequired, [
    'operation.doorOpenDepthMm',
    'service.rearServicesMm',
  ]);
  assert.ok(audit.nonApplicable.includes('operation.lidOpenHeightMm'));
});
