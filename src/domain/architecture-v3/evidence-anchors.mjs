import {
  CANONICAL_EVIDENCE_JSON_VERSION,
  canonicalEvidenceJson,
} from '../../shared/canonical-evidence-json.mjs';
import {
  ARTIFACT_RECORD_SCHEMA_VERSION,
  FRAGMENT_SCHEMA_VERSION,
  createArtifactRecord,
  createFragment,
} from './artifact-lineage.mjs';

export const EVIDENCE_ANCHOR_PROOF_SCHEMA_VERSION = 1;

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const ANCHOR_ROLES = new Set([
  'subject',
  'value',
  'axis',
  'unit',
  'legend',
  'condition',
  'configuration',
  'reference_datum',
]);
const RELATION_KINDS = new Set([
  'same_table_row',
  'diagram_legend',
  'explicit_continuation',
  'exact_model_scope',
  'condition_applies',
]);

export class EvidenceAnchorValidationError extends TypeError {
  constructor(message) {
    super(message);
    this.name = 'EvidenceAnchorValidationError';
    this.code = 'INVALID_EVIDENCE_ANCHORS';
  }
}

function invalid(message) {
  throw new EvidenceAnchorValidationError(message);
}

function stableCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
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

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const item of Object.values(value)) deepFreeze(item);
  return value;
}

function withLineageValidation(label, operation) {
  try {
    return operation();
  } catch (error) {
    invalid(`${label} is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function normalizedArtifactRecord(value, label) {
  exactObject(value, label, [
    'schemaVersion',
    'sha256',
    'parentSha256',
    'mediaType',
    'toolRevision',
    'optionsSha256',
  ]);
  if (value.schemaVersion !== ARTIFACT_RECORD_SCHEMA_VERSION) {
    invalid(`${label} schemaVersion is unsupported`);
  }
  const record = withLineageValidation(label, () => createArtifactRecord({
    sha256: value.sha256,
    parentSha256: value.parentSha256,
    mediaType: value.mediaType,
    toolRevision: value.toolRevision,
    optionsSha256: value.optionsSha256,
  }));
  if (canonicalEvidenceJson(value) !== canonicalEvidenceJson(record)) {
    invalid(`${label} does not replay its normalized artifact payload`);
  }
  return record;
}

function normalizedFragment(value, label) {
  exactObject(value, label, [
    'schemaVersion',
    'canonicalizationVersion',
    'fragmentSha256',
    'content',
    'parentArtifactSha256',
    'locator',
  ]);
  if (value.schemaVersion !== FRAGMENT_SCHEMA_VERSION) {
    invalid(`${label} schemaVersion is unsupported`);
  }
  if (value.canonicalizationVersion !== CANONICAL_EVIDENCE_JSON_VERSION) {
    invalid(`${label} canonicalizationVersion is unsupported`);
  }
  const fragment = withLineageValidation(label, () => createFragment({
    fragmentSha256: value.fragmentSha256,
    content: value.content,
    parentArtifactSha256: value.parentArtifactSha256,
    locator: value.locator,
  }));
  if (canonicalEvidenceJson(value) !== canonicalEvidenceJson(fragment)) {
    invalid(`${label} does not replay its normalized fragment payload`);
  }
  return fragment;
}

function indexRecords(records) {
  if (!Array.isArray(records)) invalid('artifactRecords must be an array');
  const recordBySha256 = new Map();
  for (const [index, rawRecord] of records.entries()) {
    const record = normalizedArtifactRecord(rawRecord, `artifactRecords[${index}]`);
    if (recordBySha256.has(record.sha256)) {
      invalid(`artifactRecords has a duplicate sha256: ${record.sha256}`);
    }
    recordBySha256.set(record.sha256, record);
  }
  return recordBySha256;
}

function rootsForRecords(recordBySha256) {
  const rootBySha256 = new Map();
  const active = new Set();

  function resolveRoot(artifactSha256) {
    const cached = rootBySha256.get(artifactSha256);
    if (cached) return cached;
    const record = recordBySha256.get(artifactSha256);
    if (!record) invalid(`artifact parent does not resolve: ${artifactSha256}`);
    if (active.has(artifactSha256)) invalid(`artifact ancestry has a cycle at ${artifactSha256}`);
    active.add(artifactSha256);
    try {
      const root = record.parentSha256 === null
        ? record.sha256
        : resolveRoot(record.parentSha256);
      rootBySha256.set(artifactSha256, root);
      return root;
    } finally {
      active.delete(artifactSha256);
    }
  }

  for (const artifactSha256 of recordBySha256.keys()) resolveRoot(artifactSha256);
  return rootBySha256;
}

function assertArtifactAtSourceRoot(artifactSha256, sourceArtifactSha256, recordBySha256, rootBySha256, label) {
  if (!recordBySha256.has(artifactSha256)) invalid(`${label} does not resolve`);
  if (rootBySha256.get(artifactSha256) !== sourceArtifactSha256) {
    invalid(`${label} is not under the declared source root`);
  }
}

function isStrictAncestor(ancestorSha256, descendantSha256, recordBySha256) {
  if (ancestorSha256 === descendantSha256) return false;
  let current = recordBySha256.get(descendantSha256);
  while (current?.parentSha256 !== null && current) {
    if (current.parentSha256 === ancestorSha256) return true;
    current = recordBySha256.get(current.parentSha256);
  }
  return false;
}

function indexFragments(fragments, sourceArtifactSha256, recordBySha256, rootBySha256) {
  if (!Array.isArray(fragments)) invalid('fragments must be an array');
  const fragmentBySha256 = new Map();
  for (const [index, rawFragment] of fragments.entries()) {
    const fragment = normalizedFragment(rawFragment, `fragments[${index}]`);
    if (fragmentBySha256.has(fragment.fragmentSha256)) {
      invalid(`fragments has a duplicate fragmentSha256: ${fragment.fragmentSha256}`);
    }
    assertArtifactAtSourceRoot(
      fragment.parentArtifactSha256,
      sourceArtifactSha256,
      recordBySha256,
      rootBySha256,
      `fragments[${index}] parentArtifactSha256`,
    );
    if (fragment.locator.kind === 'pdf_bbox') {
      assertArtifactAtSourceRoot(
        fragment.locator.renderedPageArtifactSha256,
        sourceArtifactSha256,
        recordBySha256,
        rootBySha256,
        `fragments[${index}] renderedPageArtifactSha256`,
      );
      if (fragment.locator.transform.kind === 'crop_from_full_page') {
        const fullPageArtifactSha256 = fragment.locator.transform.fullPageArtifactSha256;
        assertArtifactAtSourceRoot(
          fullPageArtifactSha256,
          sourceArtifactSha256,
          recordBySha256,
          rootBySha256,
          `fragments[${index}] transform fullPageArtifactSha256`,
        );
        if (!isStrictAncestor(
          fullPageArtifactSha256,
          fragment.locator.renderedPageArtifactSha256,
          recordBySha256,
        )) {
          invalid(`fragments[${index}] crop fullPageArtifactSha256 must be a distinct actual ancestor of the rendered crop artifact`);
        }
      }
    }
    fragmentBySha256.set(fragment.fragmentSha256, fragment);
  }
  return fragmentBySha256;
}

function normalizedAnchors(anchors, fragmentBySha256) {
  if (!Array.isArray(anchors)) invalid('anchors must be an array');
  if (anchors.length === 0) invalid('anchors must contain at least one anchor');
  const anchorById = new Map();
  for (const [index, value] of anchors.entries()) {
    exactObject(value, `anchors[${index}]`, ['anchorId', 'role', 'fragmentSha256']);
    const anchorId = stableText(value.anchorId, `anchors[${index}] anchorId`);
    if (!ANCHOR_ROLES.has(value.role)) invalid(`anchors[${index}] role is unsupported`);
    const fragmentSha256 = sha256(value.fragmentSha256, `anchors[${index}] fragmentSha256`);
    if (!fragmentBySha256.has(fragmentSha256)) {
      invalid(`anchors[${index}] fragmentSha256 does not resolve`);
    }
    if (anchorById.has(anchorId)) invalid(`anchors has a duplicate anchorId: ${anchorId}`);
    anchorById.set(anchorId, { anchorId, role: value.role, fragmentSha256 });
  }
  return anchorById;
}

function witnessFragmentFor({ relation, witnessAnchorId, anchorById, fragmentBySha256 }) {
  const witnessAnchor = anchorById.get(witnessAnchorId);
  if (!witnessAnchor) invalid(`relation witness anchor does not resolve: ${witnessAnchorId}`);
  const fromAnchor = anchorById.get(relation.fromAnchorId);
  const toAnchor = anchorById.get(relation.toAnchorId);
  if (witnessAnchorId === relation.fromAnchorId || witnessAnchorId === relation.toAnchorId) {
    invalid('relation witness anchor must be distinct from its endpoints');
  }
  if (witnessAnchor.fragmentSha256 === fromAnchor.fragmentSha256
    || witnessAnchor.fragmentSha256 === toAnchor.fragmentSha256) {
    invalid('relation witness fragment must be distinct from its endpoint fragments');
  }
  const content = fragmentBySha256.get(witnessAnchor.fragmentSha256).content;
  exactObject(content, `relation witness ${witnessAnchorId} content`, [
    'kind',
    'relationKind',
    'fromFragmentSha256',
    'toFragmentSha256',
  ]);
  if (content.kind !== 'relation_witness') {
    invalid(`relation witness ${witnessAnchorId} content kind must be relation_witness`);
  }
  if (content.relationKind !== relation.kind) {
    invalid(`relation witness ${witnessAnchorId} relation kind does not match`);
  }
  if (content.fromFragmentSha256 !== fromAnchor.fragmentSha256
    || content.toFragmentSha256 !== toAnchor.fragmentSha256) {
    invalid(`relation witness ${witnessAnchorId} does not bind the exact ordered endpoint fragments`);
  }
  return witnessAnchor.fragmentSha256;
}

function normalizedRelations(relations, anchorById, fragmentBySha256) {
  if (!Array.isArray(relations)) invalid('relations must be an array');
  const relationKeys = new Set();
  const normalized = [];
  for (const [index, value] of relations.entries()) {
    exactObject(value, `relations[${index}]`, ['kind', 'fromAnchorId', 'toAnchorId', 'witnessAnchorIds']);
    if (!RELATION_KINDS.has(value.kind)) invalid(`relations[${index}] kind is unsupported`);
    const fromAnchorId = stableText(value.fromAnchorId, `relations[${index}] fromAnchorId`);
    const toAnchorId = stableText(value.toAnchorId, `relations[${index}] toAnchorId`);
    if (!anchorById.has(fromAnchorId) || !anchorById.has(toAnchorId)) {
      invalid(`relations[${index}] endpoint anchor does not resolve`);
    }
    if (fromAnchorId === toAnchorId) invalid(`relations[${index}] endpoints must be distinct`);
    if (!Array.isArray(value.witnessAnchorIds) || value.witnessAnchorIds.length === 0) {
      invalid(`relations[${index}] witnessAnchorIds must be a non-empty array`);
    }
    const relation = { kind: value.kind, fromAnchorId, toAnchorId };
    const relationKey = canonicalEvidenceJson(relation);
    if (relationKeys.has(relationKey)) {
      invalid(`relations has a duplicate kind/from/to tuple: ${relationKey}`);
    }
    relationKeys.add(relationKey);
    const seenWitnesses = new Set();
    const witnessAnchorIds = [];
    for (const [witnessIndex, rawWitnessAnchorId] of value.witnessAnchorIds.entries()) {
      const witnessAnchorId = stableText(
        rawWitnessAnchorId,
        `relations[${index}] witnessAnchorIds[${witnessIndex}]`,
      );
      if (seenWitnesses.has(witnessAnchorId)) {
        invalid(`relations[${index}] witnessAnchorIds has a duplicate: ${witnessAnchorId}`);
      }
      seenWitnesses.add(witnessAnchorId);
      witnessFragmentFor({
        relation,
        witnessAnchorId,
        anchorById,
        fragmentBySha256,
      });
      witnessAnchorIds.push(witnessAnchorId);
    }
    normalized.push({
      ...relation,
      witnessAnchorIds: witnessAnchorIds.sort(stableCompare),
    });
  }
  return normalized.sort((left, right) => stableCompare(
    canonicalEvidenceJson([left.kind, left.fromAnchorId, left.toAnchorId]),
    canonicalEvidenceJson([right.kind, right.fromAnchorId, right.toAnchorId]),
  ));
}

function assertWitnessedConnectivity(anchorById, relations) {
  const fragmentParent = new Map();

  function find(fragmentSha256) {
    const parent = fragmentParent.get(fragmentSha256);
    if (parent === fragmentSha256) return parent;
    const root = find(parent);
    fragmentParent.set(fragmentSha256, root);
    return root;
  }

  function union(left, right) {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) fragmentParent.set(rightRoot, leftRoot);
  }

  for (const anchor of anchorById.values()) {
    if (!fragmentParent.has(anchor.fragmentSha256)) {
      fragmentParent.set(anchor.fragmentSha256, anchor.fragmentSha256);
    }
  }
  for (const relation of relations) {
    const fragmentSha256s = [
      anchorById.get(relation.fromAnchorId).fragmentSha256,
      anchorById.get(relation.toAnchorId).fragmentSha256,
      ...relation.witnessAnchorIds.map((anchorId) => anchorById.get(anchorId).fragmentSha256),
    ];
    for (const fragmentSha256 of fragmentSha256s.slice(1)) {
      union(fragmentSha256s[0], fragmentSha256);
    }
  }
  const roots = new Set([...fragmentParent.keys()].map((fragmentSha256) => find(fragmentSha256)));
  if (roots.size > 1) invalid('multiple distinct anchor fragments require witnessed connectivity');
}

function referencedArtifactClosure({ sourceArtifactSha256, anchorById, fragmentBySha256, recordBySha256 }) {
  const artifactSha256s = new Set([sourceArtifactSha256]);
  const fragmentSha256s = new Set([...anchorById.values()].map((anchor) => anchor.fragmentSha256));

  function includeArtifactAndAncestors(artifactSha256) {
    let current = recordBySha256.get(artifactSha256);
    while (current) {
      artifactSha256s.add(current.sha256);
      current = current.parentSha256 === null ? null : recordBySha256.get(current.parentSha256);
    }
  }

  for (const fragmentSha256 of fragmentSha256s) {
    const fragment = fragmentBySha256.get(fragmentSha256);
    includeArtifactAndAncestors(fragment.parentArtifactSha256);
    if (fragment.locator.kind === 'pdf_bbox') {
      includeArtifactAndAncestors(fragment.locator.renderedPageArtifactSha256);
      if (fragment.locator.transform.kind === 'crop_from_full_page') {
        includeArtifactAndAncestors(fragment.locator.transform.fullPageArtifactSha256);
      }
    }
  }
  return {
    artifactRecords: [...artifactSha256s]
      .sort(stableCompare)
      .map((artifactSha256) => recordBySha256.get(artifactSha256)),
    fragments: [...fragmentSha256s]
      .sort(stableCompare)
      .map((fragmentSha256) => fragmentBySha256.get(fragmentSha256)),
  };
}

export function validateEvidenceAnchors(input) {
  const value = strictJsonClone(input, 'evidence anchor input');
  exactObject(value, 'evidence anchor input', [
    'sourceArtifactSha256',
    'anchors',
    'relations',
    'artifactRecords',
    'fragments',
  ]);
  const sourceArtifactSha256 = sha256(value.sourceArtifactSha256, 'sourceArtifactSha256');
  const recordBySha256 = indexRecords(value.artifactRecords);
  const rootBySha256 = rootsForRecords(recordBySha256);
  const sourceRecord = recordBySha256.get(sourceArtifactSha256);
  if (!sourceRecord) invalid('sourceArtifactSha256 does not resolve');
  if (sourceRecord.parentSha256 !== null) invalid('sourceArtifactSha256 must identify a root artifact');
  for (const [artifactSha256, rootSha256] of rootBySha256.entries()) {
    if (rootSha256 !== sourceArtifactSha256) {
      invalid(`artifactRecords has an unrelated source root at ${artifactSha256}`);
    }
  }
  const fragmentBySha256 = indexFragments(
    value.fragments,
    sourceArtifactSha256,
    recordBySha256,
    rootBySha256,
  );
  const anchorById = normalizedAnchors(value.anchors, fragmentBySha256);
  const relations = normalizedRelations(value.relations, anchorById, fragmentBySha256);
  assertWitnessedConnectivity(anchorById, relations);
  const closure = referencedArtifactClosure({
    sourceArtifactSha256,
    anchorById,
    fragmentBySha256,
    recordBySha256,
  });

  return deepFreeze({
    schemaVersion: EVIDENCE_ANCHOR_PROOF_SCHEMA_VERSION,
    canonicalizationVersion: CANONICAL_EVIDENCE_JSON_VERSION,
    sourceArtifactSha256,
    artifactRecords: closure.artifactRecords,
    fragments: closure.fragments,
    anchors: [...anchorById.values()].sort((left, right) => stableCompare(left.anchorId, right.anchorId)),
    relations,
  });
}
