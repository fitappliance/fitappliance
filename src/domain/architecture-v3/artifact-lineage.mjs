import { createHash } from 'node:crypto';

import {
  CANONICAL_EVIDENCE_JSON_VERSION,
  canonicalEvidenceJson,
} from '../../shared/canonical-evidence-json.mjs';

export const ARTIFACT_RECORD_SCHEMA_VERSION = 1;
export const FRAGMENT_SCHEMA_VERSION = 1;
export const FRAGMENT_IDENTITY_DOMAIN = 'fitappliance.fragment.v1';

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const MEDIA_TYPE_PATTERN = /^[a-z][a-z0-9!#$&^_.+-]*\/[a-z0-9!#$&^_.+-]+$/u;
const LOCATOR_KINDS = new Set([
  'pdf_bbox',
  'json_pointer',
  'html_selector',
  'csv_cell',
  'text_span',
]);
const ROTATIONS = new Set([0, 90, 180, 270]);

export class ArtifactLineageValidationError extends TypeError {
  constructor(message) {
    super(message);
    this.name = 'ArtifactLineageValidationError';
    this.code = 'INVALID_ARTIFACT_LINEAGE';
  }
}

function invalid(message) {
  throw new ArtifactLineageValidationError(message);
}

function strictJsonClone(value, label) {
  try {
    return JSON.parse(canonicalEvidenceJson(value));
  } catch (error) {
    invalid(`${label} must be strict JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function exactObject(value, label, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalid(`${label} must be an object`);
  }
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) invalid(`${label} has unknown key: ${key}`);
  }
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) invalid(`${label} is missing key: ${key}`);
  }
  return value;
}

function stableText(value, label) {
  if (typeof value !== 'string' || value.trim() === '') invalid(`${label} must be a non-empty string`);
  if (value !== value.trim()) invalid(`${label} must not have leading or trailing whitespace`);
  return value;
}

function sha256(value, label) {
  const digest = stableText(value, label);
  if (!SHA256_PATTERN.test(digest)) invalid(`${label} must be a lowercase SHA-256 digest`);
  return digest;
}

function mediaType(value, label) {
  const type = stableText(value, label);
  if (!MEDIA_TYPE_PATTERN.test(type)) invalid(`${label} must be a lowercase media type without parameters`);
  return type;
}

function finiteNumber(value, label, { minimum = -Infinity, maximum = Infinity } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    invalid(`${label} must be a finite number`);
  }
  if (value < minimum || value > maximum) {
    invalid(`${label} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

function nonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    invalid(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    invalid(`${label} must be a positive safe integer`);
  }
  return value;
}

function normalizedBox(value, label) {
  if (!Array.isArray(value) || value.length !== 4) {
    invalid(`${label} must be a four-value array`);
  }
  const [x0, y0, x1, y1] = value.map((coordinate, index) => finiteNumber(
    coordinate,
    `${label}[${index}]`,
    { minimum: 0, maximum: 1000 },
  ));
  if (x0 >= x1 || y0 >= y1) {
    invalid(`${label} must retain ordered non-zero-area [x0,y0,x1,y1] coordinates`);
  }
  return [x0, y0, x1, y1];
}

function rawCoordinates(value, label) {
  exactObject(value, label, ['coordinateSpace', 'values']);
  const coordinateSpace = stableText(value.coordinateSpace, `${label} coordinateSpace`);
  if (!Array.isArray(value.values) || value.values.length !== 4) {
    invalid(`${label} values must be a four-value array`);
  }
  return {
    coordinateSpace,
    values: value.values.map((coordinate, index) => finiteNumber(coordinate, `${label} values[${index}]`)),
  };
}

function renderedPixels(value, label) {
  exactObject(value, label, ['width', 'height']);
  return {
    width: positiveInteger(value.width, `${label} width`),
    height: positiveInteger(value.height, `${label} height`),
  };
}

function normalizedTransform(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalid(`${label} must be an object`);
  }
  if (value.kind === 'full_page') {
    exactObject(value, label, ['kind']);
    return { kind: 'full_page' };
  }
  if (value.kind === 'crop_from_full_page') {
    exactObject(value, label, [
      'kind',
      'fullPageArtifactSha256',
      'normalizedCropBox',
    ]);
    return {
      kind: 'crop_from_full_page',
      fullPageArtifactSha256: sha256(value.fullPageArtifactSha256, `${label} fullPageArtifactSha256`),
      normalizedCropBox: normalizedBox(value.normalizedCropBox, `${label} normalizedCropBox`),
    };
  }
  invalid(`${label} kind must be full_page or crop_from_full_page`);
}

function jsonPointer(value, label) {
  if (typeof value !== 'string') invalid(`${label} must be a string`);
  if (value !== '' && !value.startsWith('/')) invalid(`${label} must be an RFC6901 JSON Pointer`);
  if (/~(?:[^01]|$)/u.test(value)) invalid(`${label} has an invalid RFC6901 escape`);
  return value;
}

function normalizeArtifactLocator(value, label = 'locator') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalid(`${label} must be an object`);
  }
  if (!LOCATOR_KINDS.has(value.kind)) invalid(`${label} kind is unsupported`);

  if (value.kind === 'pdf_bbox') {
    exactObject(value, label, [
      'kind',
      'pageNumber',
      'normalizedTopLeftBox',
      'renderedPageArtifactSha256',
      'renderedPixels',
      'rotationDegreesClockwise',
      'transform',
      'rawCoordinates',
    ]);
    const rotationDegreesClockwise = value.rotationDegreesClockwise;
    if (!ROTATIONS.has(rotationDegreesClockwise)) {
      invalid(`${label} rotationDegreesClockwise must be 0, 90, 180, or 270`);
    }
    return {
      kind: 'pdf_bbox',
      pageNumber: positiveInteger(value.pageNumber, `${label} pageNumber`),
      normalizedTopLeftBox: normalizedBox(value.normalizedTopLeftBox, `${label} normalizedTopLeftBox`),
      renderedPageArtifactSha256: sha256(value.renderedPageArtifactSha256, `${label} renderedPageArtifactSha256`),
      renderedPixels: renderedPixels(value.renderedPixels, `${label} renderedPixels`),
      rotationDegreesClockwise,
      transform: normalizedTransform(value.transform, `${label} transform`),
      rawCoordinates: rawCoordinates(value.rawCoordinates, `${label} rawCoordinates`),
    };
  }

  if (value.kind === 'json_pointer') {
    exactObject(value, label, ['kind', 'pointer']);
    return { kind: 'json_pointer', pointer: jsonPointer(value.pointer, `${label} pointer`) };
  }

  if (value.kind === 'html_selector') {
    exactObject(value, label, ['kind', 'selectorLanguage', 'selector']);
    if (value.selectorLanguage !== 'css') invalid(`${label} selectorLanguage must be css`);
    return {
      kind: 'html_selector',
      selectorLanguage: 'css',
      selector: stableText(value.selector, `${label} selector`),
    };
  }

  if (value.kind === 'csv_cell') {
    exactObject(value, label, ['kind', 'rowIndex', 'columnIndex']);
    return {
      kind: 'csv_cell',
      rowIndex: nonNegativeInteger(value.rowIndex, `${label} rowIndex`),
      columnIndex: nonNegativeInteger(value.columnIndex, `${label} columnIndex`),
    };
  }

  exactObject(value, label, ['kind', 'startUtf16CodeUnit', 'endUtf16CodeUnit']);
  const startUtf16CodeUnit = nonNegativeInteger(value.startUtf16CodeUnit, `${label} startUtf16CodeUnit`);
  const endUtf16CodeUnit = nonNegativeInteger(value.endUtf16CodeUnit, `${label} endUtf16CodeUnit`);
  if (startUtf16CodeUnit >= endUtf16CodeUnit) {
    invalid(`${label} must have a non-empty end-exclusive UTF-16 span`);
  }
  return {
    kind: 'text_span',
    startUtf16CodeUnit,
    endUtf16CodeUnit,
  };
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const item of Object.values(value)) deepFreeze(item);
  return value;
}

function normalizedArtifactInput(input) {
  const value = strictJsonClone(input, 'artifact record input');
  exactObject(value, 'artifact record input', [
    'sha256',
    'parentSha256',
    'mediaType',
    'toolRevision',
    'optionsSha256',
  ]);

  const artifactSha256 = sha256(value.sha256, 'artifact record sha256');
  const normalizedMediaType = mediaType(value.mediaType, 'artifact record mediaType');
  if (value.parentSha256 === null) {
    if (value.toolRevision !== null) invalid('root artifact toolRevision must be null');
    if (value.optionsSha256 !== null) invalid('root artifact optionsSha256 must be null');
    return {
      sha256: artifactSha256,
      parentSha256: null,
      mediaType: normalizedMediaType,
      toolRevision: null,
      optionsSha256: null,
    };
  }

  return {
    sha256: artifactSha256,
    parentSha256: sha256(value.parentSha256, 'derived artifact parentSha256'),
    mediaType: normalizedMediaType,
    toolRevision: stableText(value.toolRevision, 'derived artifact toolRevision'),
    optionsSha256: sha256(value.optionsSha256, 'derived artifact optionsSha256'),
  };
}

export function createArtifactRecord(input) {
  const record = normalizedArtifactInput(input);
  return deepFreeze({
    schemaVersion: ARTIFACT_RECORD_SCHEMA_VERSION,
    ...record,
  });
}

function fragmentIdentityPayload({ content, parentArtifactSha256, locator }) {
  return {
    fragmentIdentityDomain: FRAGMENT_IDENTITY_DOMAIN,
    schemaVersion: FRAGMENT_SCHEMA_VERSION,
    canonicalizationVersion: CANONICAL_EVIDENCE_JSON_VERSION,
    content,
    parentArtifactSha256,
    locator,
  };
}

function canonicalSha256(value) {
  return createHash('sha256').update(canonicalEvidenceJson(value), 'utf8').digest('hex');
}

function normalizedFragmentInput(input) {
  const value = strictJsonClone(input, 'fragment input');
  exactObject(value, 'fragment input', [
    'fragmentSha256',
    'content',
    'parentArtifactSha256',
    'locator',
  ]);
  const parentArtifactSha256 = sha256(value.parentArtifactSha256, 'fragment parentArtifactSha256');
  const locator = normalizeArtifactLocator(value.locator, 'fragment locator');
  const fragmentSha256 = sha256(value.fragmentSha256, 'fragment fragmentSha256');
  const expectedFragmentSha256 = canonicalSha256(fragmentIdentityPayload({
    content: value.content,
    parentArtifactSha256,
    locator,
  }));
  if (fragmentSha256 !== expectedFragmentSha256) {
    invalid('fragment fragmentSha256 does not match its complete canonical identity payload');
  }
  return {
    fragmentSha256,
    content: value.content,
    parentArtifactSha256,
    locator,
  };
}

export function createFragment(input) {
  const fragment = normalizedFragmentInput(input);
  return deepFreeze({
    schemaVersion: FRAGMENT_SCHEMA_VERSION,
    canonicalizationVersion: CANONICAL_EVIDENCE_JSON_VERSION,
    ...fragment,
  });
}
