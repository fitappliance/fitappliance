import { createGeometry } from './geometry.mjs';

const CONTRACTS = Object.freeze({
  fridge: {
    required: [],
    optional: ['operation.hingeSideSpaceMm', 'service.plumbingRearMm', 'delivery.widthMm', 'delivery.heightMm', 'delivery.depthMm'],
    nonApplicable: [],
  },
  dishwasher: {
    required: ['operation.doorOpenDepthMm', 'service.rearServicesMm'],
    optional: ['delivery.widthMm', 'delivery.heightMm', 'delivery.depthMm'],
    nonApplicable: ['operation.hingeSideSpaceMm', 'service.plumbingRearMm'],
  },
  washing_machine: {
    required: ['service.rearServicesMm'],
    optional: ['operation.doorOpenDepthMm', 'operation.lidOpenHeightMm', 'delivery.widthMm', 'delivery.heightMm', 'delivery.depthMm'],
    nonApplicable: ['operation.hingeSideSpaceMm', 'service.plumbingRearMm'],
  },
  dryer: {
    required: ['operation.doorOpenDepthMm', 'service.rearVentilationMm'],
    optional: ['delivery.widthMm', 'delivery.heightMm', 'delivery.depthMm'],
    nonApplicable: ['operation.hingeSideSpaceMm', 'service.plumbingRearMm'],
  },
});

const FORM_FACTOR_REQUIRED = Object.freeze({
  'fridge:upright': ['operation.doorOpenDepthMm'],
  'fridge:chest': ['operation.lidOpenHeightMm'],
  'washing_machine:front_loader': ['operation.doorOpenDepthMm'],
  'washing_machine:top_loader': ['operation.lidOpenHeightMm'],
});

function value(value, label) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new TypeError(`${label} must be a non-negative number or null`);
  return value;
}
function freezeDeep(input) { if (input && typeof input === 'object' && !Object.isFrozen(input)) { Object.freeze(input); for (const item of Object.values(input)) freezeDeep(item); } return input; }
function get(object, path) { return path.split('.').reduce((value, key) => value?.[key], object); }

export function createCategoryGeometry(category, input) {
  if (!CONTRACTS[category]) throw new TypeError(`unsupported geometry category ${category}`);
  const shared = createGeometry(input);
  const operation = input.operation ?? {};
  const service = input.service ?? {};
  const delivery = input.delivery ?? {};
  return freezeDeep({
    ...shared,
    category,
    formFactor: input.formFactor ?? null,
    operation: {
      doorOpenDepthMm: value(operation.doorOpenDepthMm, 'operation.doorOpenDepthMm'),
      hingeSideSpaceMm: value(operation.hingeSideSpaceMm, 'operation.hingeSideSpaceMm'),
      lidOpenHeightMm: value(operation.lidOpenHeightMm, 'operation.lidOpenHeightMm'),
    },
    service: {
      plumbingRearMm: value(service.plumbingRearMm, 'service.plumbingRearMm'),
      rearServicesMm: value(service.rearServicesMm, 'service.rearServicesMm'),
      rearVentilationMm: value(service.rearVentilationMm, 'service.rearVentilationMm'),
    },
    delivery: {
      widthMm: value(delivery.widthMm, 'delivery.widthMm'),
      heightMm: value(delivery.heightMm, 'delivery.heightMm'),
      depthMm: value(delivery.depthMm, 'delivery.depthMm'),
    },
  });
}

export function auditCategoryGeometry(category, geometry) {
  const contract = CONTRACTS[category];
  if (!contract) throw new TypeError(`unsupported geometry category ${category}`);
  const required = [...contract.required, ...(FORM_FACTOR_REQUIRED[`${category}:${geometry.formFactor}`] ?? [])];
  return freezeDeep({
    missingRequired: required.filter((path) => get(geometry, path) === null || get(geometry, path) === undefined),
    unknownOptional: contract.optional.filter((path) => get(geometry, path) === null || get(geometry, path) === undefined),
    nonApplicable: [...contract.nonApplicable],
  });
}

export const CATEGORY_GEOMETRY_CONTRACTS = CONTRACTS;
