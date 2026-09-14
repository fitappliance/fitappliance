export const CANONICAL_EVIDENCE_JSON_VERSION = 'fit-evidence-json-v3-1';

export class CanonicalEvidenceJsonError extends TypeError {
  constructor(message) {
    super(message);
    this.name = 'CanonicalEvidenceJsonError';
    this.code = 'INVALID_EVIDENCE_JSON';
  }
}

function invalid(path, reason) {
  throw new CanonicalEvidenceJsonError(`invalid JSON at ${path}: ${reason}`);
}

function dataProperty(value, key, path) {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor) invalid(path, 'sparse array entry');
  if (!Object.hasOwn(descriptor, 'value')) invalid(path, 'accessor properties are not supported');
  if (!descriptor.enumerable) invalid(path, 'non-enumerable entries are not supported');
  return descriptor.value;
}

function arrayIndex(key) {
  if (!/^(?:0|[1-9]\d*)$/.test(key)) return false;
  const numeric = Number(key);
  return Number.isInteger(numeric) && numeric >= 0 && numeric < 4_294_967_295 && String(numeric) === key;
}

function canonicalArray(value, path, active) {
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key === 'symbol') invalid(path, 'symbol keys are not supported');
    if (key === 'length') continue;
    if (!arrayIndex(key)) invalid(path, 'non-index array properties are not supported');
    dataProperty(value, key, `${path}[${key}]`);
  }

  const values = [];
  for (let index = 0; index < value.length; index += 1) {
    values.push(canonicalValue(dataProperty(value, String(index), `${path}[${index}]`), `${path}[${index}]`, active));
  }
  return `[${values.join(',')}]`;
}

function canonicalObject(value, path, active) {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    invalid(path, 'non-plain objects are not supported');
  }

  const keys = [];
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key === 'symbol') invalid(path, 'symbol keys are not supported');
    dataProperty(value, key, `${path}.${key}`);
    keys.push(key);
  }
  keys.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));

  return `{${keys.map((key) => (
    `${JSON.stringify(key)}:${canonicalValue(dataProperty(value, key, `${path}.${key}`), `${path}.${key}`, active)}`
  )).join(',')}}`;
}

function canonicalValue(value, path, active) {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) invalid(path, 'non-finite numbers are not supported');
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') invalid(path, `${typeof value} is not supported`);
  if (active.has(value)) invalid(path, 'cyclic objects are not supported');

  active.add(value);
  try {
    return Array.isArray(value)
      ? canonicalArray(value, path, active)
      : canonicalObject(value, path, active);
  } finally {
    active.delete(value);
  }
}

/**
 * Produces deterministic UTF-8 JSON text for V3 identity payloads.
 * It deliberately does not hash, import Node APIs, or use object getters.
 */
export function canonicalEvidenceJson(value) {
  return canonicalValue(value, '$', new WeakSet());
}
