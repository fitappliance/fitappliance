import {
  auditCategoryGeometry,
  createCategoryGeometry,
  requiredCategoryPlacementEnvelope,
} from './category-geometry.mjs';
import { verifyVerificationReceipt } from './evidence-source-verifier.mjs';
import { claimV2GeometryValue } from './dimension-evidence-claim.mjs';

const GEOMETRY_FIELDS = Object.freeze([
  'closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm',
  'installation.leftMm', 'installation.rightMm', 'installation.topMm', 'installation.rearMm', 'installation.frontMm',
  'operation.doorOpenDepthMm', 'operation.hingeSideSpaceMm', 'operation.lidOpenHeightMm',
  'service.plumbingRearMm', 'service.rearServicesMm', 'service.rearVentilationMm',
  'delivery.widthMm', 'delivery.heightMm', 'delivery.depthMm',
]);

const CLOSED_FIELDS = Object.freeze([
  'closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm',
]);
const PLACEMENT_FIELDS = Object.freeze([
  'installation.leftMm', 'installation.rightMm', 'installation.topMm', 'installation.rearMm',
]);

function setPath(target, path, value) {
  const keys = path.split('.');
  let cursor = target;
  for (const key of keys.slice(0, -1)) cursor = cursor[key];
  cursor[keys.at(-1)] = structuredClone(value);
}

function getPath(target, path) {
  return path.split('.').reduce((value, key) => value?.[key], target);
}

function emptyGeometry(category, formFactor) {
  return {
    category,
    formFactor: formFactor ?? null,
    closedEnvelope: { widthMm: null, heightMm: null, depthMm: null },
    installation: { leftMm: null, rightMm: null, topMm: null, rearMm: null, frontMm: null },
    operation: { doorOpenDepthMm: null, hingeSideSpaceMm: null, lidOpenHeightMm: null },
    service: { plumbingRearMm: null, rearServicesMm: null, rearVentilationMm: null },
    delivery: { widthMm: null, heightMm: null, depthMm: null },
  };
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeDeep(child);
  }
  return value;
}

export function projectEvidenceGeometry(input, options = {}) {
  const verifyReceipt = options.verifyReceipt ?? verifyVerificationReceipt;
  const identity = { brand: input.brand, model: input.model, category: input.category };
  const sources = Array.isArray(input.sources) ? input.sources : [];
  if (new Set(sources.map((source) => source.contentSha256)).size !== sources.length) {
    throw new TypeError('duplicate evidence source hash');
  }
  const superseded = new Set(sources.flatMap((source) => source.supersedesContentSha256 ?? []));
  const active = sources
    .filter((source) => !superseded.has(source.contentSha256))
    .sort((left, right) => left.contentSha256.localeCompare(right.contentSha256));
  const values = new Map();
  const claimValues = new Map();
  const evidence = {};
  for (const source of active) {
    verifyReceipt(source, identity, { asOf: source?.verificationReceipt?.verifiedAt });
    for (const claim of source.claims ?? []) {
      if (!GEOMETRY_FIELDS.includes(claim.field)) continue;
      if (claimValues.has(claim.field) && !sameValue(claimValues.get(claim.field), claim.value)) {
        throw new Error(`conflicting active evidence for ${claim.field}`);
      }
      claimValues.set(claim.field, structuredClone(claim.value));
      const geometryValue = claim?.value?.kind
        ? claimV2GeometryValue(claim)
        : claim.value;
      if (geometryValue !== null) values.set(claim.field, structuredClone(geometryValue));
      const fieldEvidence = {
        sourceUrl: source.sourceUrl,
        contentSha256: source.contentSha256,
        receiptBindingSha256: source.verificationReceipt.bindingSha256,
        page: claim.page ?? null,
        fragmentSha256: claim.fragmentSha256 ?? null,
      };
      if (!evidence[claim.field]) evidence[claim.field] = fieldEvidence;
      else {
        evidence[claim.field].corroborating ??= [];
        evidence[claim.field].corroborating.push(fieldEvidence);
      }
    }
  }
  const raw = emptyGeometry(input.category, input.formFactor);
  for (const [field, value] of values) setPath(raw, field, value);
  const geometry = createCategoryGeometry(input.category, raw);
  const hasDimensions = CLOSED_FIELDS.every((field) => getPath(geometry, field) !== null);
  const categoryAudit = auditCategoryGeometry(input.category, geometry);
  const missingPlacement = PLACEMENT_FIELDS.filter((field) => getPath(geometry, field) === null);
  const missingForVerifiedFit = [...new Set([
    ...(!hasDimensions ? CLOSED_FIELDS.filter((field) => getPath(geometry, field) === null) : []),
    ...missingPlacement,
    ...categoryAudit.missingRequired,
  ])].sort();
  const hasVerifiedFitFields = hasDimensions
    && missingPlacement.length === 0
    && categoryAudit.missingRequired.length === 0;
  const requiredInstallationEnvelope = requiredCategoryPlacementEnvelope(input.category, geometry);
  const successfulFitOutcome = requiredInstallationEnvelope === null
    ? 'INSUFFICIENT_DATA'
    : categoryAudit.missingRequired.length > 0
      ? 'CONDITIONAL_FIT'
      : hasVerifiedFitFields
        ? 'VERIFIED_FIT'
        : 'LIKELY_FIT_ESTIMATED';
  return freezeDeep({
    geometry,
    fieldEvidence: evidence,
    evidenceLevel: hasVerifiedFitFields ? 'verified' : hasDimensions ? 'dimensions' : 'none',
    requiredInstallationEnvelope,
    missingForVerifiedFit,
    verifiedFitEligible: hasVerifiedFitFields,
    successfulFitOutcome,
    activeSourceHashes: active.map((source) => source.contentSha256).sort(),
  });
}
