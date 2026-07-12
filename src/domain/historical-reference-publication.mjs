import { createHash } from 'node:crypto';

export const HISTORICAL_REFERENCE_PUBLIC_FILES = Object.freeze({
  fridge: 'fridges.json',
  dishwasher: 'dishwashers.json',
  dryer: 'dryers.json',
  washing_machine: 'washing-machines.json',
});

const CATEGORIES = Object.freeze(Object.keys(HISTORICAL_REFERENCE_PUBLIC_FILES));
const PUBLIC_ROOT = '/data/replacement-reference';

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeDeep(child);
  }
  return value;
}

function requireString(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError(`${label} must be a non-empty string`);
  return text;
}

function publicAliases(record) {
  const seen = new Set();
  const aliases = [];
  for (const variant of record.rawIdentityVariants ?? []) {
    const alias = {
      brand: requireString(variant?.brand, 'alias brand'),
      model: requireString(variant?.model, 'alias model'),
    };
    const key = `${alias.brand}\0${alias.model}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (alias.brand === record.brand && alias.model === record.model) continue;
    aliases.push(alias);
  }
  return aliases.sort((left, right) => (
    left.brand.localeCompare(right.brand, 'en-AU', { sensitivity: 'base' })
    || left.model.localeCompare(right.model, 'en-AU', { sensitivity: 'base' })
  ));
}

function projectRecord(record) {
  if (!CATEGORIES.includes(record?.category)) throw new TypeError(`unsupported historical category: ${record?.category}`);
  const projected = {
    id: requireString(record.referenceId, 'referenceId'),
    brand: requireString(record.brand, 'brand'),
    model: requireString(record.model, 'model'),
    lifecycle: requireString(record.lifecycleState, 'lifecycleState'),
    evidence: requireString(record.evidenceState, 'evidenceState'),
    action: requireString(record.lookupAction, 'lookupAction'),
    registryMarket: requireString(record.registryMarketState ?? 'NO_REGISTRY', 'registryMarketState'),
  };
  const aliases = publicAliases(record);
  if (aliases.length > 0) projected.aliases = aliases;
  if (record.lookupAction === 'AUTO_FILL' || record.lookupAction === 'CONFIRM_REQUIRED') {
    const dimensions = record.dimensionsMm;
    if (!dimensions || !['width', 'height', 'depth'].every((axis) => Number.isInteger(dimensions[axis]) && dimensions[axis] > 0)) {
      throw new TypeError(`${record.lookupAction} requires complete public dimensions`);
    }
    projected.dimensionsMm = {
      width: dimensions.width,
      height: dimensions.height,
      depth: dimensions.depth,
    };
  }
  return projected;
}

function compareRecords(left, right) {
  return left.brand.localeCompare(right.brand, 'en-AU', { sensitivity: 'base' })
    || left.model.localeCompare(right.model, 'en-AU', { sensitivity: 'base' })
    || left.id.localeCompare(right.id);
}

function normalizeAttribution(attribution) {
  if (!attribution || typeof attribution !== 'object') throw new TypeError('public attribution is required');
  return Object.fromEntries([
    'sourceName', 'sourceUrl', 'licenceId', 'licenceName', 'licenceUrl', 'attribution',
  ].map((key) => [key, requireString(attribution[key], `attribution.${key}`)]));
}

export function serializeHistoricalReferenceDocument(document) {
  return `${JSON.stringify(document)}\n`;
}

export function buildHistoricalReferencePublication(reference, { attribution }) {
  if (!reference || !Array.isArray(reference.records)) {
    throw new TypeError('historical appliance reference must contain records');
  }
  if (Number.isNaN(Date.parse(reference.generatedAt))) {
    throw new TypeError('historical appliance reference generatedAt must be an ISO timestamp');
  }
  const generatedAt = new Date(reference.generatedAt).toISOString();
  const normalizedAttribution = normalizeAttribution(attribution);
  const documents = {};
  const manifestFiles = {};
  const metaFiles = {};

  for (const category of CATEGORIES) {
    const records = reference.records
      .filter((record) => record.category === category)
      .map(projectRecord)
      .sort(compareRecords);
    const document = {
      schemaVersion: 1,
      generatedAt,
      category,
      attribution: normalizedAttribution,
      records,
    };
    documents[category] = document;
    const bytes = serializeHistoricalReferenceDocument(document);
    const filename = HISTORICAL_REFERENCE_PUBLIC_FILES[category];
    const contentSha256 = createHash('sha256').update(bytes).digest('hex');
    manifestFiles[category] = {
      category,
      path: `public/data/replacement-reference/${filename}`,
      url: `${PUBLIC_ROOT}/${filename}`,
      records: records.length,
      byteLength: Buffer.byteLength(bytes),
      contentSha256,
    };
    metaFiles[category] = {
      url: `${PUBLIC_ROOT}/${filename}`,
      records: records.length,
      byteLength: Buffer.byteLength(bytes),
      contentSha256,
    };
  }

  const manifest = {
    schemaVersion: 1,
    generatedAt,
    sourceReferenceGeneratedAt: generatedAt,
    files: manifestFiles,
  };
  const meta = {
    schemaVersion: 1,
    generatedAt,
    attribution: normalizedAttribution,
    files: metaFiles,
  };
  return freezeDeep({ documents, manifest, meta });
}
