const { z } = require('zod');

const CATEGORY_MAP = {
  fridge: 'FRIDGE',
  refrigerator: 'FRIDGE',
  dishwasher: 'DISHWASHER',
  oven: 'OVEN',
  washing_machine: 'WASHING_MACHINE',
  'washing-machine': 'WASHING_MACHINE',
  washer: 'WASHING_MACHINE',
  dryer: 'DRYER'
};

const CONFIDENCE_SCORE_MAP = {
  high: 0.9,
  medium: 0.65,
  low: 0.35
};

function roundFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(value)
    : value;
}

const positiveMm = z.preprocess(roundFiniteNumber, z.number().int().positive());
const nullablePositiveMm = z.preprocess(roundFiniteNumber, z.number().int().positive().nullable());
const nonNegativeMm = z.preprocess(roundFiniteNumber, z.number().int().min(0));

const ApplianceDimensionSchema = z.object({
  brand: z.string().trim().min(1),
  sku: z.string().trim().min(1),
  category: z.enum(['FRIDGE', 'DISHWASHER', 'OVEN', 'WASHING_MACHINE', 'DRYER']),
  dimensions: z.object({
    height_mm: positiveMm,
    width_mm: positiveMm,
    depth_mm: positiveMm,
    door_open_90_depth_mm: nullablePositiveMm
  }).strict(),
  clearance_requirements: z.object({
    top_mm: nonNegativeMm.default(0),
    left_mm: nonNegativeMm.default(0),
    right_mm: nonNegativeMm.default(0),
    rear_mm: nonNegativeMm.default(0)
  }).strict(),
  flags: z.object({
    requires_plumbing: z.boolean(),
    ventilation_required: z.boolean(),
    reversible_door: z.boolean().nullable()
  }).strict(),
  metadata: z.object({
    source_pdf_url: z.string().url(),
    extraction_date: z.string().datetime(),
    confidence_score: z.number().min(0).max(1),
    verified_alias: z.string().trim().min(1).optional()
  }).strict()
}).strict();

function normalizeCategory(category) {
  const key = String(category || '').trim().toLowerCase();
  return CATEGORY_MAP[key] || category;
}

function firstNonBlank(...values) {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return undefined;
}

function normalizeApplianceDimensionCandidate(candidate = {}, opts = {}) {
  const target = opts.target || {};
  const product = target.product || {};
  const category = normalizeCategory(firstNonBlank(
    candidate.category,
    target.category,
    target.cat,
    product.cat
  ));
  const modelOrSku = firstNonBlank(
    candidate.sku,
    candidate.model,
    target.sku,
    target.model,
    product.model,
    product.sku
  );
  const sideClearance = candidate.clearance_mm?.side ?? 0;
  const confidenceScore = typeof candidate.metadata?.confidence_score === 'number'
    ? candidate.metadata.confidence_score
    : CONFIDENCE_SCORE_MAP[String(candidate.confidence || '').toLowerCase()] ?? 0;

  return {
    brand: firstNonBlank(candidate.brand, target.brand, product.brand),
    sku: modelOrSku,
    category,
    dimensions: {
      height_mm: candidate.dimensions?.height_mm ?? candidate.dimensions_mm?.height,
      width_mm: candidate.dimensions?.width_mm ?? candidate.dimensions_mm?.width,
      depth_mm: candidate.dimensions?.depth_mm ?? candidate.dimensions_mm?.depth,
      door_open_90_depth_mm: candidate.dimensions?.door_open_90_depth_mm ?? candidate.door_swing_mm ?? null
    },
    clearance_requirements: {
      top_mm: candidate.clearance_requirements?.top_mm ?? candidate.clearance_mm?.top ?? 0,
      left_mm: candidate.clearance_requirements?.left_mm ?? candidate.clearance_mm?.left ?? sideClearance,
      right_mm: candidate.clearance_requirements?.right_mm ?? candidate.clearance_mm?.right ?? sideClearance,
      rear_mm: candidate.clearance_requirements?.rear_mm ?? candidate.clearance_mm?.rear ?? 0
    },
    flags: {
      requires_plumbing: candidate.flags?.requires_plumbing ?? false,
      ventilation_required: candidate.flags?.ventilation_required ?? true,
      reversible_door: candidate.flags?.reversible_door ?? null
    },
    metadata: {
      source_pdf_url: candidate.metadata?.source_pdf_url ?? candidate.source_pdf_url,
      extraction_date: candidate.metadata?.extraction_date ?? candidate.extraction_date,
      confidence_score: confidenceScore,
      verified_alias: candidate.metadata?.verified_alias ?? candidate.verified_alias
    }
  };
}

function formatZodIssue(issue) {
  const path = issue.path.join('.');
  return path ? `${path}: ${issue.message}` : issue.message;
}

function validateApplianceDimension(candidate, opts = {}) {
  const manualReviewThreshold = opts.manualReviewThreshold ?? 0.8;
  const normalized = normalizeApplianceDimensionCandidate(candidate, opts);
  const result = ApplianceDimensionSchema.safeParse(normalized);

  if (!result.success) {
    return {
      valid: false,
      errors: result.error.issues.map(formatZodIssue),
      requiresManualReview: true,
      data: null
    };
  }

  return {
    valid: true,
    errors: [],
    requiresManualReview: result.data.metadata.confidence_score < manualReviewThreshold,
    data: result.data
  };
}

exports.ApplianceDimensionSchema = ApplianceDimensionSchema;
exports.normalizeApplianceDimensionCandidate = normalizeApplianceDimensionCandidate;
exports.validateApplianceDimension = validateApplianceDimension;
