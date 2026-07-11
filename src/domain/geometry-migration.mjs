import { createCategoryGeometry } from './category-geometry.mjs';

const CLEARANCE_FIELDS = Object.freeze({
  'installation.leftMm': 'leftMm', 'installation.rightMm': 'rightMm',
  'installation.topMm': 'topMm', 'installation.rearMm': 'rearMm', 'installation.frontMm': 'frontMm',
});

function approvedFacts(records) {
  const facts = new Map();
  for (const record of records ?? []) {
    if (record?.status !== 'approved' || !CLEARANCE_FIELDS[record.field]) continue;
    if (record.unit !== 'mm' || typeof record.value !== 'number' || !Number.isFinite(record.value) || record.value < 0) {
      throw new TypeError(`invalid approved evidence for ${record.field}`);
    }
    const prior = facts.get(record.field);
    if (prior !== undefined && prior !== record.value) throw new TypeError(`conflicting approved evidence for ${record.field}`);
    facts.set(record.field, record.value);
  }
  return facts;
}

export function migrateGeometry({ legacyProduct, fieldEvidence = [], estimates = {}, formFactor = null }) {
  if (!legacyProduct || typeof legacyProduct !== 'object') throw new TypeError('legacy product required');
  const facts = approvedFacts(fieldEvidence);
  const installation = Object.fromEntries(Object.values(CLEARANCE_FIELDS).map((key) => [key, null]));
  for (const [field, value] of facts) installation[CLEARANCE_FIELDS[field]] = value;
  const geometry = createCategoryGeometry(legacyProduct.cat, {
    formFactor,
    closedEnvelope: { widthMm: legacyProduct.w, heightMm: legacyProduct.h, depthMm: legacyProduct.d },
    installation, operation: {}, service: {}, delivery: {},
  });
  return Object.freeze({
    geometry,
    estimates: Object.freeze({ ...estimates }),
    provenance: Object.freeze({ closedEnvelope: 'legacy_unverified', installation: facts.size ? 'approved_field_evidence' : 'unknown' }),
  });
}

export function auditImpossibleGeometry(geometry) {
  const issues = [];
  const checks = [
    ['closedEnvelope.widthMm', geometry.closedEnvelope.widthMm, 100, 3000],
    ['closedEnvelope.heightMm', geometry.closedEnvelope.heightMm?.maximumMm, 100, 3000],
    ['closedEnvelope.depthMm', geometry.closedEnvelope.depthMm, 100, 3000],
    ...Object.entries(geometry.installation).map(([key, value]) => [`installation.${key}`, value, 0, 2000]),
  ];
  for (const [field, value, minimum, maximum] of checks) {
    if (value !== null && (value < minimum || value > maximum)) issues.push(`${field}_out_of_range`);
  }
  return Object.freeze(issues);
}
