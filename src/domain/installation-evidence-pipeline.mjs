import { createHash } from 'node:crypto';
import { load } from 'cheerio';

import { canonicalJsonSha256 } from './historical-evidence-recovery-contract.mjs';
import {
  auditInstallationKnowledge,
  createInstallationKnowledge,
  createModelRequirement,
  INSTALLATION_KNOWLEDGE_FIELDS,
} from './installation-knowledge-v3.mjs';
import { isOfficialBrandArtifactUrl } from './evidence-source-verifier.mjs';
import { classifyGeometryPublication } from './geometry-publication.mjs';

export const INSTALLATION_FIELD_RECEIPT_SCHEMA_VERSION = 1;
export const INSTALLATION_EVIDENCE_BUNDLE_SCHEMA_VERSION = 1;
export const INSTALLATION_EVIDENCE_REPLAY_AUDIT_SCHEMA_VERSION = 1;

const HASH_RE = /^[a-f0-9]{64}$/;
const MODEL_TOKEN_RE = /[A-Z0-9][A-Z0-9._/-]*/g;

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) freezeDeep(item);
  }
  return value;
}

function requiredText(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${label} is required`);
  return value.trim();
}

function requiredHash(value, label) {
  const normalized = requiredText(value, label).toLowerCase();
  if (!HASH_RE.test(normalized)) throw new TypeError(`${label} must be SHA-256`);
  return normalized;
}

function normalizedDate(value, label) {
  const date = new Date(requiredText(value, label));
  if (Number.isNaN(date.getTime())) throw new TypeError(`${label} is invalid`);
  return date.toISOString();
}

function normalizedWhitespace(value) {
  return requiredText(value, 'evidence quote').replace(/\s+/g, ' ');
}

function modelKey(value) {
  return String(value ?? '').normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function hasExactModelToken(value, model) {
  const tokens = String(value ?? '').normalize('NFKC').toUpperCase().match(MODEL_TOKEN_RE) ?? [];
  return tokens.some((token) => modelKey(token) === modelKey(model));
}

function supportsFormFactor(value, category, formFactor) {
  const text = String(value ?? '');
  const patterns = {
    fridge: {
      upright: /\b(?:upright|refrigerator|fridge|french\s+door|quad\s+door|side[- ]by[- ]side|top\s+mount|bottom\s+mount)\b/i,
      chest: /\bchest(?:\s+freezer)?\b/i,
    },
    dishwasher: {
      built_in: /\b(?:built[- ]?in|built[- ]?under|under[- ]?bench)\b/i,
      freestanding: /\bfree[- ]?standing\b/i,
      integrated: /\bintegrated\b/i,
      drawer: /\b(?:dishdrawer|dish\s*drawer|drawer\s+dishwasher)\b/i,
    },
    washing_machine: {
      front_loader: /\bfront[- ]load(?:er|ing)?\b/i,
      top_loader: /\btop[- ]load(?:er|ing)?\b/i,
      washer_dryer_combo: /\b(?:washer[- ]dryer|washing\s+machine\s+and\s+dryer)\b/i,
    },
    dryer: { front_loader: /\b(?:dryer|tumble\s+dryer|front[- ]load(?:er|ing)?)\b/i },
  };
  return patterns[category]?.[formFactor]?.test(text) ?? false;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizedBbox(value, label = 'evidence locator bbox') {
  if (!Array.isArray(value) || value.length !== 4
    || value.some((item) => !Number.isFinite(item) || item < 0)) {
    throw new TypeError(`${label} must contain four non-negative numbers`);
  }
  const result = value.map(Number);
  if (result[0] > result[2] || result[1] > result[3]) throw new TypeError(`${label} coordinates are invalid`);
  return result;
}

function normalizedLocator(value, { identity = false } = {}) {
  if (!value || typeof value !== 'object') throw new TypeError('evidence locator is required');
  const page = Number(value.page);
  const itemIndex = Number(value.itemIndex);
  if (!Number.isInteger(page) || page < 1) throw new TypeError('evidence locator page must be one-based');
  if (!Number.isInteger(itemIndex) || itemIndex < 0) throw new TypeError('evidence locator itemIndex is invalid');
  const itemType = requiredText(value.itemType, 'evidence locator itemType');
  const locator = { page, itemIndex, itemType, bbox: normalizedBbox(value.bbox) };
  if (identity) {
    locator.quote = normalizedWhitespace(value.quote);
    locator.fragmentSha256 = sha256(locator.quote);
  }
  return locator;
}

function normalizedMineru(value, pdfSha256) {
  if (!value || typeof value !== 'object') throw new TypeError('MinerU evidence metadata is required');
  if (value.format !== 'content_list_v2' || value.parserName !== 'MinerU') {
    throw new TypeError('MinerU content_list_v2 parser is required');
  }
  const parserVersion = requiredText(value.parserVersion, 'MinerU parser version');
  if (!/^\d+\.\d+\.\d+$/.test(parserVersion)) throw new TypeError('MinerU parser version must be semantic version');
  const modelRevision = requiredText(value.modelRevision, 'MinerU model revision');
  if (!/^[a-f0-9]{40}$/.test(modelRevision)) throw new TypeError('MinerU model revision must be a 40-character hash');
  const contentSha256 = requiredHash(value.contentSha256, 'MinerU content SHA-256');
  const expectedPath = `evidence/derived/mineru-json/sha256/${contentSha256.slice(0, 2)}/${contentSha256.slice(2, 4)}/${contentSha256}.json`;
  if (value.objectPath !== expectedPath) throw new TypeError('MinerU object path does not match content SHA-256');
  return {
    format: 'content_list_v2',
    contentSha256,
    objectPath: expectedPath,
    parserName: 'MinerU',
    parserVersion,
    modelRevision,
    sourcePdfSha256: pdfSha256,
  };
}

function valueSignature(value) {
  return canonicalJsonSha256(value);
}

function claimVisibleInText(value, applicability, quote) {
  if (applicability === 'not_applicable') {
    return /\b(?:not applicable|not required|no requirement|does not require)\b/i.test(quote);
  }
  if (typeof value === 'number') {
    const escaped = String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^0-9.])${escaped}(?=$|[^0-9.])`).test(quote);
  } else if (value && typeof value === 'object' && Number.isFinite(value.minimumMm) && Number.isFinite(value.maximumMm)) {
    return [value.minimumMm, value.maximumMm].every((endpoint) => quote.includes(String(endpoint)));
  } else if (typeof value === 'boolean') {
    const explicit = value
      ? /\b(?:yes|required|must|provided|included|supply|connection)\b/i
      : /\b(?:no|not required|does not require|without)\b/i;
    return explicit.test(quote);
  }
  return false;
}

function assertClaimVisibleInQuote(value, applicability, quote) {
  if (!claimVisibleInText(value, applicability, quote)) {
    throw new TypeError('receipt value or applicability is not present in the evidence quote');
  }
}

function escapedNumber(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function semanticPattern(field, value, applicability) {
  const number = typeof value === 'number' ? escapedNumber(value) : '\\d+(?:\\.\\d+)?';
  const range = value && typeof value === 'object'
    ? `${escapedNumber(value.minimumMm)}\\s*(?:-|–|—|to)\\s*${escapedNumber(value.maximumMm)}`
    : '\\d+(?:\\.\\d+)?\\s*(?:-|–|—|to)\\s*\\d+(?:\\.\\d+)?';
  const directAxis = (axis) => new RegExp(`\\b${axis}\\s+${value && typeof value === 'object' ? range : number}\\s*mm\\b`, 'i');
  const clearanceAxis = (axis) => new RegExp(
    `(?:\\b(?:clearance|space)\\b.{0,60}\\b${axis}\\b|\\b${axis}\\b.{0,60}\\b(?:clearance|space)\\b).{0,40}\\b${number}\\s*mm\\b`,
    'i',
  );
  const labelPatterns = {
    'closedEnvelope.widthMm': /\bwidth\b/i,
    'closedEnvelope.heightMm': /\bheight\b/i,
    'closedEnvelope.depthMm': /\bdepth\b/i,
    'installationClearance.leftMm': /(?:\b(?:clearance|space)\b.{0,60}\b(?:left|each\s+side)\b|\b(?:left(?:-side)?|each\s+side)\b.{0,60}\b(?:clearance|space)\b)/i,
    'installationClearance.rightMm': /(?:\b(?:clearance|space)\b.{0,60}\b(?:right|each\s+side)\b|\b(?:right(?:-side)?|each\s+side)\b.{0,60}\b(?:clearance|space)\b)/i,
    'installationClearance.topMm': /(?:\b(?:clearance|space)\b.{0,60}\b(?:top|above)\b|\b(?:top|above)\b.{0,60}\b(?:clearance|space)\b)/i,
    'installationClearance.rearMm': /(?:\b(?:clearance|space)\b.{0,60}\b(?:rear|back)\b|\b(?:rear|back)\b.{0,60}\b(?:clearance|space)\b)/i,
    'installationClearance.frontMm': /(?:\b(?:clearance|space)\b.{0,60}\bfront\b|\bfront\b.{0,60}\b(?:clearance|space)\b)/i,
    'operationEnvelope.doorOpenDepthMm': /\b(?:door[- ]open|door\s+opened|open\s+door)\b/i,
    'operationEnvelope.hingeSideSpaceMm': /\bhinge[- ]side\b/i,
    'operationEnvelope.lidOpenHeightMm': /\b(?:lid[- ]open|lid\s+opened|open\s+lid)\b/i,
    'ventilation.leftMm': /\bventilation\b.{0,80}\bleft\b|\bleft\b.{0,80}\bventilation\b/i,
    'ventilation.rightMm': /\bventilation\b.{0,80}\bright\b|\bright\b.{0,80}\bventilation\b/i,
    'ventilation.topMm': /\bventilation\b.{0,80}\b(?:top|above)\b|\b(?:top|above)\b.{0,80}\bventilation\b/i,
    'ventilation.rearMm': /\bventilation\b.{0,80}\b(?:rear|back)\b|\b(?:rear|back)\b.{0,80}\bventilation\b/i,
    'ventilation.openAreaMm2': /\b(?:ventilation|air)[- ]?(?:opening|open\s+area)\b/i,
    'ventilation.minimumRoomVolumeM3': /\b(?:minimum\s+)?room\s+volume\b/i,
    'waterConnection.required': /\bwater\s+(?:connection|supply|inlet)\b/i,
    'waterConnection.hoseReachMm': /\b(?:water|inlet)\b.{0,80}\bhose\b/i,
    'waterConnection.minimumPressureKpa': /\bwater\s+pressure\b/i,
    'waterConnection.maximumPressureKpa': /\bwater\s+pressure\b/i,
    'powerConnection.required': /\b(?:power\s+supply|supply\s+voltage|rated\s+current|amperage)\b/i,
    'powerConnection.leadReachMm': /\b(?:power|electrical)\b.{0,80}\b(?:lead|cord|cable)\b/i,
    'powerConnection.voltageV': /\b(?:supply\s+)?voltage\b/i,
    'powerConnection.minimumVoltageV': /\b(?:supply\s+)?voltage\b/i,
    'powerConnection.maximumVoltageV': /\b(?:supply\s+)?voltage\b/i,
    'powerConnection.currentA': /\b(?:rated\s+current|amperage)\b/i,
    'drainConnection.required': /\b(?:drain|drainage)\s+(?:connection|outlet|hose)\b/i,
    'drainConnection.hoseReachMm': /\bdrain\b.{0,80}\bhose\b/i,
    'drainConnection.minimumHeightMm': /\bdrain\b.{0,100}\bheight\b/i,
    'drainConnection.maximumHeightMm': /\bdrain\b.{0,100}\bheight\b/i,
    'drainConnection.highLoopRequired': /\bhigh[- ]loop\b/i,
    'deliveryEnvelope.widthMm': /\b(?:packaged|package|carton|shipping)\b.{0,100}\bwidth\b/i,
    'deliveryEnvelope.heightMm': /\b(?:packaged|package|carton|shipping)\b.{0,100}\bheight\b/i,
    'deliveryEnvelope.depthMm': /\b(?:packaged|package|carton|shipping)\b.{0,100}\bdepth\b/i,
    'deliveryEnvelope.weightKg': /\b(?:packaged|package|carton|shipping)\b.{0,100}\bweight\b/i,
    'professionalInstallation.required': /\bprofessional\s+installation\b/i,
  };
  if (applicability === 'not_applicable') return labelPatterns[field] ?? null;
  const patterns = {
    'closedEnvelope.widthMm': directAxis('width'),
    'closedEnvelope.heightMm': directAxis('height'),
    'closedEnvelope.depthMm': directAxis('depth'),
    'installationClearance.leftMm': clearanceAxis('(?:left|each\\s+side)'),
    'installationClearance.rightMm': clearanceAxis('(?:right|each\\s+side)'),
    'installationClearance.topMm': clearanceAxis('(?:top|above)'),
    'installationClearance.rearMm': clearanceAxis('(?:rear|back)'),
    'installationClearance.frontMm': clearanceAxis('front'),
    'operationEnvelope.doorOpenDepthMm': /\b(?:door[- ]open|door\s+opened|open\s+door)[^<>]{0,100}\bdepth\b|\bdepth\b[^<>]{0,100}\b(?:door[- ]open|door\s+opened|open\s+door)\b/i,
    'operationEnvelope.hingeSideSpaceMm': /\bhinge[- ]side\b[^<>]{0,100}\b(?:space|clearance)\b|\b(?:space|clearance)\b[^<>]{0,100}\bhinge[- ]side\b/i,
    'operationEnvelope.lidOpenHeightMm': /\b(?:lid[- ]open|lid\s+opened|open\s+lid)\b[^<>]{0,100}\bheight\b|\bheight\b[^<>]{0,100}\b(?:lid[- ]open|lid\s+opened|open\s+lid)\b/i,
    'ventilation.leftMm': /\bventilation\b[^<>]{0,100}\bleft\b/i,
    'ventilation.rightMm': /\bventilation\b[^<>]{0,100}\bright\b/i,
    'ventilation.topMm': /\bventilation\b[^<>]{0,100}\b(?:top|above)\b/i,
    'ventilation.rearMm': /\bventilation\b[^<>]{0,100}\b(?:rear|back)\b/i,
    'ventilation.openAreaMm2': /\b(?:ventilation|air)[- ]?(?:opening|open\s+area)\b/i,
    'ventilation.minimumRoomVolumeM3': /\b(?:minimum\s+)?room\s+volume\b/i,
    'waterConnection.required': /\bwater\s+(?:connection|supply|inlet)\b/i,
    'waterConnection.hoseReachMm': /\b(?:water|inlet)[^<>]{0,80}\bhose\b[^<>]{0,80}\b(?:length|reach)\b|\b(?:length|reach)\b[^<>]{0,80}\b(?:water|inlet)[^<>]{0,80}\bhose\b/i,
    'waterConnection.minimumPressureKpa': /\bwater\s+pressure\b[^<>]{0,80}\d+(?:\.\d+)?\s*kPa\s*(?:-|–|—|to)\s*\d+(?:\.\d+)?\s*kPa?\b/i,
    'waterConnection.maximumPressureKpa': /\bwater\s+pressure\b[^<>]{0,80}\d+(?:\.\d+)?\s*kPa\s*(?:-|–|—|to)\s*\d+(?:\.\d+)?\s*kPa?\b/i,
    'powerConnection.required': /\b(?:power\s+supply|supply\s+voltage|rated\s+current|amperage)\b/i,
    'powerConnection.leadReachMm': /\b(?:power|electrical)[^<>]{0,80}\b(?:lead|cord|cable)\b[^<>]{0,80}\b(?:length|reach)\b|\b(?:length|reach)\b[^<>]{0,80}\b(?:power|electrical)[^<>]{0,80}\b(?:lead|cord|cable)\b/i,
    'powerConnection.voltageV': /\b(?:supply\s+)?voltage\b/i,
    'powerConnection.minimumVoltageV': /\b(?:supply\s+)?voltage\b[^<>]{0,80}\d+(?:\.\d+)?\s*(?:-|–|—|to)\s*\d+(?:\.\d+)?\s*V\b/i,
    'powerConnection.maximumVoltageV': /\b(?:supply\s+)?voltage\b[^<>]{0,80}\d+(?:\.\d+)?\s*(?:-|–|—|to)\s*\d+(?:\.\d+)?\s*V\b/i,
    'powerConnection.currentA': /\b(?:rated\s+current|amperage)\b[^<>]{0,80}\d+(?:\.\d+)?\s*A\b/i,
    'drainConnection.required': /\b(?:drain|drainage)\s+(?:connection|outlet|hose)\b/i,
    'drainConnection.hoseReachMm': /\bdrain[^<>]{0,80}\bhose\b[^<>]{0,80}\b(?:length|reach)\b|\b(?:length|reach)\b[^<>]{0,80}\bdrain[^<>]{0,80}\bhose\b/i,
    'drainConnection.minimumHeightMm': /\bdrain[^<>]{0,100}\bheight\b/i,
    'drainConnection.maximumHeightMm': /\bdrain[^<>]{0,100}\bheight\b/i,
    'drainConnection.highLoopRequired': /\bhigh[- ]loop\b/i,
    'deliveryEnvelope.widthMm': /\b(?:packaged|package|carton|shipping)[^<>]{0,100}\bwidth\b/i,
    'deliveryEnvelope.heightMm': /\b(?:packaged|package|carton|shipping)[^<>]{0,100}\bheight\b/i,
    'deliveryEnvelope.depthMm': /\b(?:packaged|package|carton|shipping)[^<>]{0,100}\bdepth\b/i,
    'deliveryEnvelope.weightKg': /\b(?:packaged|package|carton|shipping)[^<>]{0,100}\bweight\b/i,
    'professionalInstallation.required': /\bprofessional\s+installation\b/i,
  };
  return patterns[field] ?? null;
}

function semanticSegments(quote) {
  if (!/<(?:table|tr|td|th)\b/i.test(quote)) return [quote];
  const $ = load(quote, null, false);
  const rows = [];
  $('tr').each((_, row) => {
    const cells = $(row).find('th,td').map((__, cell) => (
      $(cell).text().replace(/\s+/g, ' ').trim()
    )).get();
    if (cells.some(Boolean)) rows.push(cells);
  });
  const segments = rows.map((row) => row.join(' '));
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const headers = rows[rowIndex - 1];
    const values = rows[rowIndex];
    if (headers.length !== values.length || headers.length < 2) continue;
    for (let column = 0; column < headers.length; column += 1) {
      if (/[A-Za-z]/.test(headers[column]) && /\d/.test(values[column])) {
        segments.push(`${headers[column]} ${values[column]}`);
      }
    }
  }
  return [...new Set(segments.map((segment) => segment.replace(/\s+/g, ' ').trim()).filter(Boolean))];
}

function assertClaimSemantic(field, value, quote, applicability) {
  const pattern = semanticPattern(field, value, applicability);
  if (!pattern || !semanticSegments(quote).some((segment) => (
    pattern.test(segment) && claimVisibleInText(value, applicability, segment)
  ))) {
    throw new TypeError(`${field} evidence quote lacks a same-segment semantic label and claim`);
  }
}

function semanticPayload(receipt) {
  const { receiptId: _receiptId, semanticReceiptSha256: _semanticReceiptSha256, ...payload } = receipt;
  return payload;
}

function claimSignature(receipt) {
  return canonicalJsonSha256({
    canonicalProductId: receipt.canonicalProductId,
    field: receipt.field,
    applicability: receipt.applicability,
    value: receipt.value,
    unit: receipt.unit,
  });
}

function evidenceForRequirement(receipt) {
  return {
    sourceUrl: receipt.evidence.sourceUrl,
    artifactSha256: receipt.evidence.pdfSha256,
    receiptBindingSha256: receipt.semanticReceiptSha256,
    fragmentSha256: receipt.evidence.fragmentSha256,
    locator: { ...receipt.evidence.locator, bbox: [...receipt.evidence.locator.bbox] },
    quote: receipt.evidence.quote,
    applicableModels: [...receipt.evidence.applicableModels],
    identityOutcome: receipt.evidence.identityOutcome,
    sourceStatus: receipt.evidence.sourceStatus,
    observedAt: receipt.evidence.observedAt,
  };
}

export function createInstallationFieldReceipt(input) {
  if (!input || typeof input !== 'object') throw new TypeError('installation field receipt input is required');
  const canonicalProductId = requiredText(input.canonicalProductId, 'canonical product ID');
  const category = requiredText(input.category, 'category');
  const brand = requiredText(input.brand, 'brand');
  const model = requiredText(input.model, 'model');
  const formFactor = input.formFactor == null ? null : requiredText(input.formFactor, 'form factor');
  const field = requiredText(input.field, 'installation evidence field');
  if (!Object.hasOwn(INSTALLATION_KNOWLEDGE_FIELDS, field)) throw new TypeError(`unsupported installation evidence field: ${field}`);
  const applicability = input.applicability ?? 'required';
  if (applicability === 'unknown') throw new TypeError('unknown installation evidence cannot create a receipt');
  if (!['required', 'optional', 'not_applicable'].includes(applicability)) throw new TypeError('receipt applicability is invalid');
  const value = applicability === 'not_applicable' ? null : input.value;
  const unit = applicability === 'not_applicable' ? null : (input.unit ?? null);
  const sourceUrl = new URL(requiredText(input.sourceUrl, 'source URL')).toString();
  if (input.sourceStatus !== 'current') throw new TypeError('installation receipt source must be current');
  if (!isOfficialBrandArtifactUrl(sourceUrl, brand, {
    model,
    category,
    artifactUrl: sourceUrl,
    discoveryProvenance: input.discoveryProvenance,
  })) throw new TypeError(`source URL is not an official artifact for ${brand}`);
  const pdfSha256 = requiredHash(input.pdfSha256, 'PDF SHA-256');
  const mineru = normalizedMineru(input.mineru, pdfSha256);
  const locator = normalizedLocator(input.locator);
  const quote = normalizedWhitespace(input.quote);
  assertClaimVisibleInQuote(value, applicability, quote);
  assertClaimSemantic(field, value, quote, applicability);
  if (input.identityOutcome !== 'exact') throw new TypeError('installation receipt requires exact model identity');
  if (!Array.isArray(input.applicableModels) || input.applicableModels.length !== 1
    || modelKey(input.applicableModels[0]) !== modelKey(model)) {
    throw new TypeError('installation receipt must apply only to the exact target model');
  }
  if (!Array.isArray(input.identityLocators) || input.identityLocators.length < 1) {
    throw new TypeError('at least one replayable exact-model identity locator is required');
  }
  const identityLocators = input.identityLocators.map((identityLocator) => normalizedLocator(identityLocator, { identity: true }));
  if (!identityLocators.some((identityLocator) => hasExactModelToken(identityLocator.quote, model))) {
    throw new TypeError('identity evidence does not contain the exact model token');
  }
  const formFactorLocator = formFactor === null
    ? null
    : identityLocators.find((identityLocator) => supportsFormFactor(identityLocator.quote, category, formFactor));
  if (formFactor !== null && !formFactorLocator) {
    throw new TypeError(`identity evidence does not support exact ${category} form factor ${formFactor}`);
  }
  const observedAt = normalizedDate(input.observedAt, 'receipt observedAt');
  const evidence = {
    authorityMode: 'official',
    sourceUrl,
    sourceStatus: 'current',
    observedAt,
    pdfSha256,
    mineru,
    locator,
    quote,
    fragmentSha256: sha256(quote),
    identityOutcome: 'exact',
    applicableModels: [model],
    identityLocators,
    formFactorLocator,
  };
  const draft = {
    schemaVersion: INSTALLATION_FIELD_RECEIPT_SCHEMA_VERSION,
    canonicalProductId,
    category,
    brand,
    model,
    formFactor,
    field,
    applicability,
    value,
    unit,
    evidence,
  };
  const semanticReceiptSha256 = canonicalJsonSha256(draft);
  const receipt = {
    ...draft,
    receiptId: `inst_receipt_${semanticReceiptSha256.slice(0, 24)}`,
    semanticReceiptSha256,
  };
  createModelRequirement({
    field,
    value,
    unit,
    applicability,
    evidence: evidenceForRequirement(receipt),
    targetModel: model,
  });
  return freezeDeep(receipt);
}

export function validateInstallationFieldReceipt(value) {
  if (!value || value.schemaVersion !== INSTALLATION_FIELD_RECEIPT_SCHEMA_VERSION) {
    throw new TypeError(`installation field receipt schemaVersion ${INSTALLATION_FIELD_RECEIPT_SCHEMA_VERSION} required`);
  }
  const rebuilt = createInstallationFieldReceipt({
    canonicalProductId: value.canonicalProductId,
    category: value.category,
    brand: value.brand,
    model: value.model,
    formFactor: value.formFactor,
    field: value.field,
    applicability: value.applicability,
    value: value.value,
    unit: value.unit,
    sourceUrl: value.evidence?.sourceUrl,
    sourceStatus: value.evidence?.sourceStatus,
    observedAt: value.evidence?.observedAt,
    pdfSha256: value.evidence?.pdfSha256,
    mineru: value.evidence?.mineru,
    locator: value.evidence?.locator,
    quote: value.evidence?.quote,
    identityOutcome: value.evidence?.identityOutcome,
    applicableModels: value.evidence?.applicableModels,
    identityLocators: value.evidence?.identityLocators,
  });
  if (value.receiptId !== rebuilt.receiptId || value.semanticReceiptSha256 !== rebuilt.semanticReceiptSha256
    || canonicalJsonSha256(semanticPayload(value)) !== rebuilt.semanticReceiptSha256) {
    throw new TypeError('installation field receipt binding is invalid');
  }
  return rebuilt;
}

export function receiptToModelRequirement(receipt) {
  const accepted = validateInstallationFieldReceipt(receipt);
  return createModelRequirement({
    field: accepted.field,
    value: accepted.value,
    unit: accepted.unit,
    applicability: accepted.applicability,
    evidence: evidenceForRequirement(accepted),
    targetModel: accepted.model,
  });
}

export function receiptToFormFactorEvidence(receipt) {
  const accepted = validateInstallationFieldReceipt(receipt);
  const locator = accepted.evidence.formFactorLocator;
  if (!accepted.formFactor || !locator) throw new TypeError('receipt has no exact form-factor evidence');
  return freezeDeep({
    sourceUrl: accepted.evidence.sourceUrl,
    artifactSha256: accepted.evidence.pdfSha256,
    receiptBindingSha256: accepted.semanticReceiptSha256,
    fragmentSha256: locator.fragmentSha256,
    locator: {
      page: locator.page,
      itemIndex: locator.itemIndex,
      itemType: locator.itemType,
      bbox: [...locator.bbox],
    },
    quote: locator.quote,
    applicableModels: [...accepted.evidence.applicableModels],
    identityOutcome: 'exact',
    sourceStatus: accepted.evidence.sourceStatus,
    observedAt: accepted.evidence.observedAt,
  });
}

export function createInstallationEvidenceBundle({ generatedAt, receipts }) {
  const normalizedGeneratedAt = normalizedDate(generatedAt, 'bundle generatedAt');
  if (!Array.isArray(receipts)) throw new TypeError('installation evidence receipts must be an array');
  const byId = new Map();
  for (const receipt of receipts) {
    const accepted = validateInstallationFieldReceipt(receipt);
    const prior = byId.get(accepted.receiptId);
    if (prior && prior.semanticReceiptSha256 !== accepted.semanticReceiptSha256) {
      throw new TypeError(`duplicate installation receipt ID conflict: ${accepted.receiptId}`);
    }
    byId.set(accepted.receiptId, accepted);
  }
  const acceptedReceipts = [...byId.values()].sort((left, right) => left.receiptId.localeCompare(right.receiptId));
  const groups = new Map();
  for (const receipt of acceptedReceipts) {
    const key = `${receipt.canonicalProductId}\0${receipt.field}`;
    const signatures = groups.get(key) ?? new Set();
    signatures.add(claimSignature(receipt));
    groups.set(key, signatures);
  }
  const payload = {
    schemaVersion: INSTALLATION_EVIDENCE_BUNDLE_SCHEMA_VERSION,
    receipts: acceptedReceipts,
  };
  return freezeDeep({
    ...payload,
    generatedAt: normalizedGeneratedAt,
    bundleSha256: canonicalJsonSha256(payload),
    summary: {
      receipts: acceptedReceipts.length,
      products: new Set(acceptedReceipts.map((receipt) => receipt.canonicalProductId)).size,
      fields: groups.size,
      conflictingFields: [...groups.values()].filter((signatures) => signatures.size > 1).length,
    },
  });
}

export function validateInstallationEvidenceBundle(bundle) {
  if (!bundle || bundle.schemaVersion !== INSTALLATION_EVIDENCE_BUNDLE_SCHEMA_VERSION) {
    throw new TypeError(`installation evidence bundle schemaVersion ${INSTALLATION_EVIDENCE_BUNDLE_SCHEMA_VERSION} required`);
  }
  const rebuilt = createInstallationEvidenceBundle({ generatedAt: bundle.generatedAt, receipts: bundle.receipts });
  if (rebuilt.bundleSha256 !== bundle.bundleSha256
    || canonicalJsonSha256(bundle.summary) !== canonicalJsonSha256(rebuilt.summary)) {
    throw new TypeError('installation evidence bundle binding or summary is invalid');
  }
  return rebuilt;
}

export function mergeInstallationEvidenceBundle(bundle, receipts, options = {}) {
  const current = validateInstallationEvidenceBundle(bundle);
  if (!Array.isArray(receipts)) throw new TypeError('installation evidence merge receipts must be an array');
  return createInstallationEvidenceBundle({
    generatedAt: options.generatedAt ?? current.generatedAt,
    receipts: [...current.receipts, ...receipts],
  });
}

export function assertInstallationBundleReplacementAllowed({
  replace = false,
  expectedCurrentBundleSha256,
  currentBundle,
} = {}) {
  if (!replace) return freezeDeep({ status: 'MERGE_REQUIRED' });
  if (!expectedCurrentBundleSha256) {
    throw new TypeError('expected current bundle SHA is required for destructive replacement');
  }
  const expected = requiredHash(expectedCurrentBundleSha256, 'expected current bundle SHA');
  if (!currentBundle) throw new Error('current installation evidence bundle is required for replacement');
  const current = validateInstallationEvidenceBundle(currentBundle);
  if (expected !== current.bundleSha256) {
    throw new Error('installation evidence bundle changed; expected hash does not match current bundle');
  }
  return freezeDeep({ status: 'REPLACEMENT_ALLOWED', currentBundleSha256: current.bundleSha256 });
}

export function resolveInstallationEvidenceBundle(bundle) {
  const current = validateInstallationEvidenceBundle(bundle);
  const groups = new Map();
  for (const receipt of current.receipts) {
    const key = `${receipt.canonicalProductId}\0${receipt.field}`;
    const rows = groups.get(key) ?? [];
    rows.push(receipt);
    groups.set(key, rows);
  }
  const accepted = [];
  const conflicts = [];
  for (const [key, rows] of [...groups].sort(([left], [right]) => left.localeCompare(right))) {
    const byClaim = new Map();
    for (const row of rows) {
      const signature = claimSignature(row);
      const claims = byClaim.get(signature) ?? [];
      claims.push(row);
      byClaim.set(signature, claims);
    }
    if (byClaim.size > 1) {
      conflicts.push(freezeDeep({
        key,
        canonicalProductId: rows[0].canonicalProductId,
        field: rows[0].field,
        receiptIds: rows.map((row) => row.receiptId).sort(),
        claimSignatures: [...byClaim.keys()].sort(),
      }));
      continue;
    }
    accepted.push([...rows].sort((left, right) => left.receiptId.localeCompare(right.receiptId))[0]);
  }
  return freezeDeep({ accepted, conflicts });
}

function contentText(value, key = '') {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map((entry) => contentText(entry)).filter(Boolean).join(' ');
  if (typeof value !== 'object') return '';
  if (value.type === 'text' && typeof value.content === 'string') return value.content;
  return Object.entries(value)
    .filter(([childKey]) => ![
      'type', 'bbox', 'path', 'language', 'image_source', 'table_type', 'table_nest_level',
    ].includes(childKey))
    .map(([childKey, entry]) => contentText(entry, childKey))
    .filter(Boolean)
    .join(key === 'table_body' ? '' : ' ');
}

export function extractMineruItemText(item) {
  if (!item || typeof item !== 'object') throw new TypeError('MinerU item is required');
  return contentText(item.content).replace(/\s+/g, ' ').trim();
}

function evidenceItemAt(pages, rawLocator, label) {
  const locator = normalizedLocator(rawLocator);
  const page = pages[locator.page - 1];
  if (!Array.isArray(page)) throw new Error(`${label} page is absent from MinerU object`);
  const item = page[locator.itemIndex];
  if (!item || item.type !== locator.itemType) throw new Error(`${label} item type or index is invalid`);
  if (JSON.stringify(normalizedBbox(item.bbox, `${label} bbox`)) !== JSON.stringify(locator.bbox)) {
    throw new Error(`${label} bbox does not match MinerU object`);
  }
  return { ...locator, quote: normalizedWhitespace(extractMineruItemText(item)) };
}

export async function buildInstallationCanaryReceiptBundle({ pilot, recipes, mineruIndex, readObject }) {
  if (pilot?.frozen !== true || !Array.isArray(pilot.products)) throw new TypeError('frozen installation pilot is required');
  if (recipes?.schemaVersion !== 1 || !Array.isArray(recipes.products)) throw new TypeError('installation canary recipe schemaVersion 1 required');
  if (!Array.isArray(mineruIndex?.entries)) throw new TypeError('MinerU index entries are required');
  if (typeof readObject !== 'function') throw new TypeError('MinerU object reader is required');
  const pilotById = new Map(pilot.products.map((product) => [product.canonicalProductId, product]));
  const indexByPdf = new Map(mineruIndex.entries.map((entry) => [entry.sourcePdfSha256, entry]));
  const receipts = [];
  for (const recipe of recipes.products) {
    const product = pilotById.get(recipe.canonicalProductId);
    if (!product || product.category !== recipe.category || product.brand !== recipe.brand || product.model !== recipe.model) {
      throw new Error(`canary recipe does not match frozen pilot identity: ${recipe.canonicalProductId}`);
    }
    if (!Array.isArray(recipe.fields) || recipe.fields.length < 1) throw new TypeError('canary recipe fields are required');
    if (!Array.isArray(recipe.identityLocators) || recipe.identityLocators.length < 1) {
      throw new TypeError('canary recipe identity locators are required');
    }
    const indexEntry = indexByPdf.get(recipe.pdfSha256);
    if (!indexEntry) throw new Error(`canary PDF is absent from MinerU index: ${recipe.pdfSha256}`);
    const objectPath = indexEntry.derivedArtifact?.objectPath;
    const jsonBytes = await readObject(objectPath);
    let pages;
    try {
      pages = JSON.parse(jsonBytes);
    } catch {
      throw new Error(`canary MinerU object is invalid JSON: ${objectPath}`);
    }
    if (!Array.isArray(pages)) throw new Error(`canary MinerU object is not content_list_v2: ${objectPath}`);
    const identityLocators = recipe.identityLocators.map((locator) => evidenceItemAt(pages, locator, 'canary identity'));
    for (const field of recipe.fields) {
      const located = evidenceItemAt(pages, field.locator, `canary field ${field.field}`);
      const receipt = createInstallationFieldReceipt({
        canonicalProductId: recipe.canonicalProductId,
        category: recipe.category,
        brand: recipe.brand,
        model: recipe.model,
        formFactor: recipe.formFactor ?? null,
        field: field.field,
        applicability: field.applicability,
        value: field.value,
        unit: field.unit,
        sourceUrl: recipe.sourceUrl,
        sourceStatus: 'current',
        observedAt: recipe.observedAt,
        pdfSha256: recipe.pdfSha256,
        mineru: indexEntry.derivedArtifact,
        locator: field.locator,
        quote: located.quote,
        identityOutcome: 'exact',
        applicableModels: [recipe.model],
        identityLocators,
      });
      replayInstallationFieldReceipt(receipt, { jsonBytes, indexEntry });
      receipts.push(receipt);
    }
  }
  return createInstallationEvidenceBundle({ generatedAt: recipes.generatedAt, receipts });
}

function replayLocator(pages, locator, expectedQuote, expectedFragmentSha256, label) {
  const page = pages[locator.page - 1];
  if (!Array.isArray(page)) throw new Error(`${label} page drift`);
  const item = page[locator.itemIndex];
  if (!item || item.type !== locator.itemType) throw new Error(`${label} item type or index drift`);
  if (JSON.stringify(normalizedBbox(item.bbox, `${label} bbox`)) !== JSON.stringify(locator.bbox)) {
    throw new Error(`${label} bbox drift`);
  }
  const quote = normalizedWhitespace(extractMineruItemText(item));
  if (quote !== expectedQuote || sha256(quote) !== expectedFragmentSha256) throw new Error(`${label} text or fragment drift`);
  return quote;
}

export function replayInstallationFieldReceipt(receipt, context) {
  const accepted = validateInstallationFieldReceipt(receipt);
  const bytes = Buffer.isBuffer(context?.jsonBytes) ? context.jsonBytes : Buffer.from(context?.jsonBytes ?? '');
  if (sha256(bytes) !== accepted.evidence.mineru.contentSha256) throw new Error('MinerU object content hash drift');
  const index = context?.indexEntry;
  const derived = index?.derivedArtifact;
  if (index?.status !== 'indexed') throw new Error('MinerU index entry is not indexed');
  if (index.sourcePdfSha256 !== accepted.evidence.pdfSha256
    || derived?.sourcePdfSha256 !== accepted.evidence.pdfSha256) throw new Error('source PDF hash drift');
  if (derived?.format !== 'content_list_v2' || derived?.parserName !== 'MinerU') throw new Error('MinerU index format drift');
  if (derived.contentSha256 !== accepted.evidence.mineru.contentSha256
    || derived.objectPath !== accepted.evidence.mineru.objectPath) throw new Error('MinerU index object binding drift');
  if (index.parserVersion !== accepted.evidence.mineru.parserVersion
    || derived.parserVersion !== accepted.evidence.mineru.parserVersion) throw new Error('MinerU parser version drift');
  if (index.modelRevision !== accepted.evidence.mineru.modelRevision
    || derived.modelRevision !== accepted.evidence.mineru.modelRevision) throw new Error('MinerU model revision drift');
  let pages;
  try {
    pages = JSON.parse(bytes);
  } catch {
    throw new Error('MinerU content_list_v2 JSON is invalid');
  }
  if (!Array.isArray(pages) || derived.pageCount !== pages.length) throw new Error('MinerU page count drift');
  replayLocator(
    pages,
    accepted.evidence.locator,
    accepted.evidence.quote,
    accepted.evidence.fragmentSha256,
    'field evidence',
  );
  let exactIdentity = false;
  for (const locator of accepted.evidence.identityLocators) {
    const quote = replayLocator(pages, locator, locator.quote, locator.fragmentSha256, 'identity evidence');
    exactIdentity ||= hasExactModelToken(quote, accepted.model);
  }
  if (!exactIdentity) throw new Error('exact model identity replay failed');
  return freezeDeep({
    receiptId: accepted.receiptId,
    canonicalProductId: accepted.canonicalProductId,
    field: accepted.field,
    status: 'PASS',
    pdfSha256: accepted.evidence.pdfSha256,
    mineruContentSha256: accepted.evidence.mineru.contentSha256,
  });
}

export function auditInstallationEvidenceBundle(bundle, options = {}) {
  const current = validateInstallationEvidenceBundle(bundle);
  const auditedAt = normalizedDate(options.auditedAt, 'installation evidence audit time');
  if (typeof options.readEvidence !== 'function') throw new TypeError('installation evidence reader is required');
  const results = current.receipts.map((receipt) => {
    try {
      return replayInstallationFieldReceipt(receipt, options.readEvidence(receipt));
    } catch (error) {
      return freezeDeep({
        receiptId: receipt.receiptId,
        canonicalProductId: receipt.canonicalProductId,
        field: receipt.field,
        status: 'FAIL',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
  const passed = results.filter((result) => result.status === 'PASS').length;
  return freezeDeep({
    schemaVersion: INSTALLATION_EVIDENCE_REPLAY_AUDIT_SCHEMA_VERSION,
    auditedAt,
    bundleSha256: current.bundleSha256,
    results,
    summary: { receipts: results.length, passed, failed: results.length - passed },
  });
}

export function validateInstallationEvidenceReplayAudit(bundle, audit) {
  const current = validateInstallationEvidenceBundle(bundle);
  if (!audit || audit.schemaVersion !== INSTALLATION_EVIDENCE_REPLAY_AUDIT_SCHEMA_VERSION) {
    throw new TypeError(`installation replay audit schemaVersion ${INSTALLATION_EVIDENCE_REPLAY_AUDIT_SCHEMA_VERSION} required`);
  }
  normalizedDate(audit.auditedAt, 'installation replay auditedAt');
  if (audit.bundleSha256 !== current.bundleSha256) throw new Error('installation replay audit is stale for the current bundle');
  if (!Array.isArray(audit.results)) throw new TypeError('installation replay audit results are required');
  const receiptById = new Map(current.receipts.map((receipt) => [receipt.receiptId, receipt]));
  const resultIds = new Set();
  for (const result of audit.results) {
    const receipt = receiptById.get(result?.receiptId);
    if (!receipt || resultIds.has(result.receiptId)) throw new Error('installation replay audit receipt result set is invalid');
    resultIds.add(result.receiptId);
    if (result.status !== 'PASS') throw new Error(`installation replay failed for ${result.receiptId}`);
    if (result.canonicalProductId !== receipt.canonicalProductId || result.field !== receipt.field
      || result.pdfSha256 !== receipt.evidence.pdfSha256
      || result.mineruContentSha256 !== receipt.evidence.mineru.contentSha256) {
      throw new Error(`installation replay binding mismatch for ${result.receiptId}`);
    }
  }
  if (resultIds.size !== receiptById.size) throw new Error('installation replay audit does not cover every receipt');
  const expectedSummary = { receipts: receiptById.size, passed: receiptById.size, failed: 0 };
  if (canonicalJsonSha256(audit.summary) !== canonicalJsonSha256(expectedSummary)) {
    throw new Error('installation replay audit summary is invalid');
  }
  return freezeDeep({
    status: 'CURRENT_PASS',
    bundleSha256: current.bundleSha256,
    auditedAt: new Date(audit.auditedAt).toISOString(),
    receipts: receiptById.size,
  });
}

function candidateRank(candidate) {
  if (candidate.identityOutcome === 'exact' && candidate.mineru?.format === 'content_list_v2') return 0;
  if (candidate.identityOutcome === 'exact') return 1;
  return 2;
}

function candidateState({ conflict, hasReceipts, replayCurrent, audit, sources }) {
  if (conflict) return 'FIELD_CONFLICT';
  if (hasReceipts && !replayCurrent) return 'REPLAY_REQUIRED';
  if (hasReceipts && audit.eligibleForVerifiedFit) return 'FIT_EVIDENCE_COMPLETE';
  if (hasReceipts) return 'RECEIPT_PARTIAL';
  const best = sources[0];
  if (!best) return 'SOURCE_DISCOVERY_REQUIRED';
  if (best.identityOutcome !== 'exact') return 'IDENTITY_BLOCKED';
  if (!best.mineru || best.mineru.format !== 'content_list_v2') return 'MINERU_REQUIRED';
  return 'GRAMMAR_REQUIRED';
}

function parserLane(state) {
  return ({
    RECEIPT_PARTIAL: 'SOURCE_REQUIRED',
    REPLAY_REQUIRED: 'REPLAY_READY',
    GRAMMAR_REQUIRED: 'GRAMMAR_REQUIRED',
    MINERU_REQUIRED: 'MINERU_REQUIRED',
    IDENTITY_BLOCKED: 'IDENTITY_BLOCKED',
    SOURCE_DISCOVERY_REQUIRED: 'SOURCE_REQUIRED',
    FIELD_CONFLICT: 'IDENTITY_BLOCKED',
  })[state] ?? null;
}

function pipelinePriority(state) {
  return ({
    RECEIPT_PARTIAL: 0,
    REPLAY_REQUIRED: 1,
    GRAMMAR_REQUIRED: 2,
    MINERU_REQUIRED: 3,
    SOURCE_DISCOVERY_REQUIRED: 4,
    IDENTITY_BLOCKED: 5,
    FIELD_CONFLICT: 6,
  })[state] ?? 99;
}

export function buildInstallationEvidenceControlPlane({
  generatedAt,
  pilot,
  sourceCandidates = [],
  receiptBundle,
  replayAudit,
  batchSize = 5,
  documentFamiliesByPdfSha256 = {},
}) {
  const normalizedGeneratedAt = normalizedDate(generatedAt, 'installation control generatedAt');
  if (pilot?.frozen !== true || !Array.isArray(pilot.products)) throw new TypeError('frozen installation pilot is required');
  if (!Array.isArray(sourceCandidates)) throw new TypeError('installation source candidates must be an array');
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 25) throw new TypeError('installation batch size must be 1..25');
  if (!documentFamiliesByPdfSha256 || typeof documentFamiliesByPdfSha256 !== 'object'
    || Array.isArray(documentFamiliesByPdfSha256)) {
    throw new TypeError('installation document-family index must be an object');
  }
  const documentFamilyForPdf = (pdfSha256) => {
    const values = documentFamiliesByPdfSha256[pdfSha256] ?? [];
    if (!Array.isArray(values)) throw new TypeError(`document-family index entry must be an array: ${pdfSha256}`);
    const familyIds = [...new Set(values.map((value) => requiredText(value, 'document family ID')))].sort();
    if (familyIds.some((familyId) => !/^document_family_[a-f0-9]+$/.test(familyId))) {
      throw new TypeError(`document-family index contains an invalid family ID: ${pdfSha256}`);
    }
    if (familyIds.length > 1) throw new Error(`PDF belongs to multiple document families: ${pdfSha256}`);
    return familyIds[0] ?? null;
  };
  const bundle = validateInstallationEvidenceBundle(receiptBundle);
  let replayCurrent = false;
  try {
    validateInstallationEvidenceReplayAudit(bundle, replayAudit);
    replayCurrent = true;
  } catch {
    replayCurrent = false;
  }
  const resolution = resolveInstallationEvidenceBundle(bundle);
  const pilotById = new Map(pilot.products.map((product) => [product.canonicalProductId, product]));
  const acceptedByProduct = new Map();
  for (const receipt of resolution.accepted) {
    const rows = acceptedByProduct.get(receipt.canonicalProductId) ?? [];
    rows.push(receipt);
    acceptedByProduct.set(receipt.canonicalProductId, rows);
  }
  const conflictsByProduct = new Map();
  for (const conflict of resolution.conflicts) {
    const rows = conflictsByProduct.get(conflict.canonicalProductId) ?? [];
    rows.push(conflict);
    conflictsByProduct.set(conflict.canonicalProductId, rows);
  }
  const sourcesByProduct = new Map();
  for (const source of sourceCandidates) {
    const id = requiredText(source?.canonicalProductId, 'installation source canonical product ID');
    const product = pilotById.get(id);
    if (!product) {
      throw new Error(`installation source candidate is outside frozen pilot: ${id}`);
    }
    const sourceUrl = new URL(requiredText(source.sourceUrl, 'installation source URL')).toString();
    if (!isOfficialBrandArtifactUrl(sourceUrl, product.brand, {
      model: product.model,
      category: product.category,
      artifactUrl: sourceUrl,
      discoveryProvenance: source.discoveryProvenance,
    })) throw new Error(`installation source candidate is not official for ${product.brand}`);
    const normalized = {
      canonicalProductId: id,
      sourceUrl,
      pdfSha256: requiredHash(source.pdfSha256, 'installation source PDF SHA-256'),
      identityOutcome: requiredText(source.identityOutcome, 'installation source identity outcome'),
      mineru: source.mineru == null ? null : {
        format: source.mineru.format,
        contentSha256: requiredHash(source.mineru.contentSha256, 'installation source MinerU SHA-256'),
      },
    };
    normalized.documentFamilyId = documentFamilyForPdf(normalized.pdfSha256);
    const rows = sourcesByProduct.get(id) ?? [];
    rows.push(normalized);
    sourcesByProduct.set(id, rows);
  }
  const candidates = [];
  for (const product of [...pilot.products].sort((left, right) => left.canonicalProductId.localeCompare(right.canonicalProductId))) {
    const receipts = acceptedByProduct.get(product.canonicalProductId) ?? [];
    const conflicts = conflictsByProduct.get(product.canonicalProductId) ?? [];
    for (const receipt of receipts) {
      if (receipt.category !== product.category || receipt.brand !== product.brand || receipt.model !== product.model) {
        throw new Error(`installation receipt identity conflicts with frozen pilot: ${receipt.receiptId}`);
      }
    }
    const requirements = replayCurrent && conflicts.length === 0
      ? Object.fromEntries(receipts.map((receipt) => [receipt.field, receiptToModelRequirement(receipt)]))
      : {};
    const receiptFormFactors = [...new Set(receipts.map((receipt) => receipt.formFactor).filter(Boolean))];
    if (receiptFormFactors.length > 1) throw new Error(`installation receipt form-factor conflict: ${product.canonicalProductId}`);
    const formFactor = replayCurrent ? (receiptFormFactors[0] ?? product.formFactor ?? null) : (product.formFactor ?? null);
    const formFactorReceipt = receipts.find((receipt) => receipt.formFactor && receipt.evidence.formFactorLocator);
    const formFactorEvidence = replayCurrent && formFactorReceipt && receiptFormFactors.length === 1
      ? receiptToFormFactorEvidence(formFactorReceipt)
      : null;
    const knowledge = createInstallationKnowledge({
      canonicalProductId: product.canonicalProductId,
      category: product.category,
      brand: product.brand,
      model: product.model,
      formFactor,
      formFactorEvidence,
      requirements,
    });
    const audit = auditInstallationKnowledge(knowledge);
    const sources = [...(sourcesByProduct.get(product.canonicalProductId) ?? [])]
      .sort((left, right) => candidateRank(left) - candidateRank(right) || left.sourceUrl.localeCompare(right.sourceUrl));
    const familyInputs = receipts.length > 0
      ? receipts.map((receipt) => documentFamilyForPdf(receipt.evidence.pdfSha256))
      : sources
        .filter((source) => candidateRank(source) === candidateRank(sources[0]))
        .map((source) => source.documentFamilyId);
    const documentFamilyIds = [...new Set(familyInputs.filter(Boolean))].sort();
    const documentFamilyId = documentFamilyIds.length === 1 ? documentFamilyIds[0] : null;
    const state = candidateState({
      conflict: conflicts.length > 0,
      hasReceipts: receipts.length > 0,
      replayCurrent,
      audit,
      sources,
    });
    candidates.push(freezeDeep({
      canonicalProductId: product.canonicalProductId,
      legacyRuntimeId: product.legacyRuntimeId,
      category: product.category,
      brand: product.brand,
      model: product.model,
      formFactor,
      pilotFormFactor: product.formFactor ?? null,
      formFactorSource: formFactorEvidence ? 'exact_installation_receipt' : (product.formFactor ? 'catalog_inference' : 'unknown'),
      formFactorDivergence: Boolean(formFactorEvidence && product.formFactor && product.formFactor !== formFactor),
      documentFamilyId,
      documentFamilyStatus: documentFamilyIds.length === 1
        ? 'RESOLVED'
        : (documentFamilyIds.length > 1 ? 'AMBIGUOUS' : 'UNRESOLVED'),
      state,
      acceptedFields: replayCurrent && conflicts.length === 0 ? receipts.map((receipt) => receipt.field).sort() : [],
      missingFields: audit.missingRequired,
      evidenceViolations: audit.evidenceViolations,
      conflictFields: conflicts.map((conflict) => conflict.field).sort(),
      sourceCandidates: sources,
    }));
  }
  if (new Set(candidates.map((candidate) => candidate.canonicalProductId)).size !== pilot.products.length) {
    throw new Error('installation control plane does not project every pilot model exactly once');
  }
  const parserGaps = candidates
    .filter((candidate) => candidate.state !== 'FIT_EVIDENCE_COMPLETE')
    .map((candidate) => freezeDeep({
      canonicalProductId: candidate.canonicalProductId,
      category: candidate.category,
      brand: candidate.brand,
      model: candidate.model,
      formFactor: candidate.formFactor,
      documentFamilyId: candidate.documentFamilyId,
      lane: parserLane(candidate.state),
      missingFields: candidate.missingFields,
      conflictFields: candidate.conflictFields,
    }));
  const familyGroups = new Map();
  for (const candidate of candidates.filter((row) => row.state !== 'FIT_EVIDENCE_COMPLETE')) {
    const key = candidate.documentFamilyId
      ? `document_family:${candidate.documentFamilyId}`
      : `unresolved_target:${candidate.canonicalProductId}`;
    const rows = familyGroups.get(key) ?? [];
    rows.push(candidate);
    familyGroups.set(key, rows);
  }
  const batches = [...familyGroups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([familyKey, rows]) => {
    rows.sort((left, right) => pipelinePriority(left.state) - pipelinePriority(right.state)
      || left.canonicalProductId.localeCompare(right.canonicalProductId));
    const canary = rows[0];
    const gatePassed = Boolean(canary.documentFamilyId && canary.state === 'RECEIPT_PARTIAL');
    const targets = rows.slice(0, gatePassed ? batchSize : 1).map((row) => ({
      canonicalProductId: row.canonicalProductId,
      model: row.model,
      state: row.state,
      lane: parserLane(row.state),
    }));
    return freezeDeep({
      batchId: `installation_batch_${canonicalJsonSha256({ familyKey, targets }).slice(0, 20)}`,
      familyKey,
      documentFamilyId: canary.documentFamilyId,
      gateStatus: !canary.documentFamilyId
        ? 'DOCUMENT_FAMILY_REQUIRED'
        : (gatePassed ? 'CANARY_PARTIAL_PASS' : 'CANARY_REQUIRED'),
      canary: { canonicalProductId: canary.canonicalProductId, model: canary.model, state: canary.state },
      targets,
    });
  });
  const count = (state) => candidates.filter((candidate) => candidate.state === state).length;
  return freezeDeep({
    schemaVersion: 1,
    generatedAt: normalizedGeneratedAt,
    pilotFrozen: true,
    receiptBundleSha256: bundle.bundleSha256,
    replayAuditStatus: replayCurrent ? 'CURRENT_PASS' : 'STALE_OR_MISSING',
    candidates,
    parserGaps,
    batches,
    summary: {
      pilotProducts: candidates.length,
      fitEvidenceComplete: count('FIT_EVIDENCE_COMPLETE'),
      receiptPartial: count('RECEIPT_PARTIAL'),
      replayRequired: count('REPLAY_REQUIRED'),
      grammarRequired: count('GRAMMAR_REQUIRED'),
      mineruRequired: count('MINERU_REQUIRED'),
      sourceDiscoveryRequired: count('SOURCE_DISCOVERY_REQUIRED'),
      identityBlocked: count('IDENTITY_BLOCKED'),
      fieldConflict: count('FIELD_CONFLICT'),
      batches: batches.length,
    },
  });
}

export function auditInstallationFitPublication({
  projection,
  receiptBundle,
  replayAudit,
  replayAuditSha256,
  controlPlane,
}) {
  if (!projection || !Array.isArray(projection.products)) throw new TypeError('public projection products are required');
  const bundle = validateInstallationEvidenceBundle(receiptBundle);
  validateInstallationEvidenceReplayAudit(bundle, replayAudit);
  const auditSha256 = requiredHash(replayAuditSha256, 'installation replay audit SHA-256');
  if (!controlPlane || controlPlane.schemaVersion !== 1 || !Array.isArray(controlPlane.candidates)) {
    throw new TypeError('installation evidence control plane is required');
  }
  if (controlPlane.receiptBundleSha256 !== bundle.bundleSha256
    || controlPlane.replayAuditStatus !== 'CURRENT_PASS') {
    throw new Error('installation evidence control plane is stale');
  }
  const controlByProduct = new Map(controlPlane.candidates.map((candidate) => [candidate.canonicalProductId, candidate]));
  if (controlByProduct.size !== controlPlane.candidates.length) throw new Error('installation control plane has duplicate products');
  const resolution = resolveInstallationEvidenceBundle(bundle);
  const receiptsByProduct = new Map();
  for (const receipt of resolution.accepted) {
    const rows = receiptsByProduct.get(receipt.canonicalProductId) ?? [];
    rows.push(receipt);
    receiptsByProduct.set(receipt.canonicalProductId, rows);
  }
  const conflicts = new Set(resolution.conflicts.map((conflict) => conflict.canonicalProductId));
  const violations = [];
  let verifiedDeclarations = 0;
  let receiptBoundVerified = 0;
  for (const product of projection.products) {
    const marker = product?.fit_v3_provenance;
    const declaresVerified = marker?.outcome === 'VERIFIED_FIT'
      || product?.evidence?.trust_level === 'verified_fit'
      || product?.evidence?.clearance_verified === true
      || classifyGeometryPublication(product) === 'verified';
    if (!declaresVerified) continue;
    verifiedDeclarations += 1;
    const reasons = [];
    const canonicalProductId = product.canonicalProductId;
    const control = controlByProduct.get(canonicalProductId);
    const receipts = receiptsByProduct.get(canonicalProductId) ?? [];
    if (conflicts.has(canonicalProductId)) reasons.push('installation_field_conflict');
    if (!control || control.state !== 'FIT_EVIDENCE_COMPLETE') reasons.push('installation_evidence_incomplete');
    if (receipts.length === 0) reasons.push('installation_receipts_missing');
    if (receipts.some((receipt) => receipt.category !== product.cat
      || receipt.brand !== product.brand || receipt.model !== product.model)) {
      reasons.push('installation_receipt_identity_mismatch');
    }
    if (receipts.length > 0 && !conflicts.has(canonicalProductId)) {
      try {
        const formFactors = [...new Set(receipts.map((receipt) => receipt.formFactor).filter(Boolean))];
        if (formFactors.length !== 1) throw new Error('form factor receipts are incomplete or conflicting');
        const formFactorReceipt = receipts.find((receipt) => receipt.formFactor && receipt.evidence.formFactorLocator);
        if (!formFactorReceipt) throw new Error('exact form factor evidence is missing');
        const knowledge = createInstallationKnowledge({
          canonicalProductId,
          category: product.cat,
          brand: product.brand,
          model: product.model,
          formFactor: formFactors[0],
          formFactorEvidence: receiptToFormFactorEvidence(formFactorReceipt),
          requirements: Object.fromEntries(receipts.map((receipt) => [receipt.field, receiptToModelRequirement(receipt)])),
        });
        if (!auditInstallationKnowledge(knowledge).eligibleForVerifiedFit) reasons.push('installation_evidence_incomplete');
      } catch {
        reasons.push('installation_evidence_invalid');
      }
    }
    if (!marker || marker.schemaVersion !== 1 || marker.outcome !== 'VERIFIED_FIT') {
      reasons.push('installation_publication_provenance_missing');
    } else {
      if (marker.installationReceiptBundleSha256 !== bundle.bundleSha256) reasons.push('installation_bundle_binding_mismatch');
      if (marker.installationReplayAuditSha256 !== auditSha256) reasons.push('installation_replay_binding_mismatch');
      const expectedIds = receipts.map((receipt) => receipt.receiptId).sort();
      const actualIds = Array.isArray(marker.hardConditionReceiptIds)
        ? [...new Set(marker.hardConditionReceiptIds)].sort()
        : [];
      if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) reasons.push('installation_hard_condition_receipts_incomplete');
    }
    const uniqueReasons = [...new Set(reasons)].sort();
    if (uniqueReasons.length === 0) receiptBoundVerified += 1;
    else violations.push({
      id: product.id,
      canonicalProductId: canonicalProductId ?? null,
      reasons: uniqueReasons,
    });
  }
  violations.sort((left, right) => String(left.id).localeCompare(String(right.id)));
  return freezeDeep({
    schemaVersion: 1,
    replayAuditSha256: auditSha256,
    receiptBundleSha256: bundle.bundleSha256,
    summary: {
      products: projection.products.length,
      verifiedDeclarations,
      receiptBoundVerified,
      violations: violations.length,
    },
    violations,
  });
}
