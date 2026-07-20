import { createHash } from 'node:crypto';

import { canonicalJsonSha256 } from './historical-evidence-recovery-contract.mjs';

export const HISTORICAL_EVIDENCE_SYSTEM_CONTRACT_SCHEMA_VERSION = 1;

const RELEASE_STATES = new Set(['RELEASED', 'PENDING_NEXT', 'QUARANTINED']);
const DIGEST_KINDS = new Set(['semantic', 'content', 'producer']);

function requiredText(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new TypeError(`${label} required`);
  return normalized;
}

function requiredSha256(value, label) {
  const normalized = requiredText(value, label).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) throw new TypeError(`${label} must be SHA-256`);
  return normalized;
}

function requiredTimestamp(value, label) {
  const date = new Date(requiredText(value, label));
  if (Number.isNaN(date.valueOf())) throw new TypeError(`${label} invalid`);
  return date.toISOString();
}

function requiredPositiveInteger(value, label) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < 1) {
    throw new TypeError(`${label} must be a positive integer`);
  }
  return normalized;
}

function sortedUniqueText(values, label) {
  if (!Array.isArray(values)) throw new TypeError(`${label} must be an array`);
  const normalized = values.map((value) => requiredText(value, label));
  if (new Set(normalized).size !== normalized.length) throw new Error(`${label} contains duplicates`);
  return normalized.sort((left, right) => left.localeCompare(right));
}

function rawContentSha256(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value ?? ''), 'utf8');
  return createHash('sha256').update(bytes).digest('hex');
}

function normalizeFileInputs(values, label) {
  if (!Array.isArray(values) || values.length === 0) throw new TypeError(`${label} required`);
  const paths = new Set();
  return values.map((entry) => {
    const path = requiredText(entry?.path, `${label} path`);
    if (paths.has(path)) throw new Error(`duplicate ${label} path: ${path}`);
    paths.add(path);
    if (!Object.hasOwn(entry ?? {}, 'content')) throw new TypeError(`${label} content required: ${path}`);
    return {
      path,
      contentSha256: rawContentSha256(entry.content),
    };
  }).sort((left, right) => left.path.localeCompare(right.path));
}

function topologicalOrder(stageIds, dependenciesByStage) {
  const visiting = new Set();
  const visited = new Set();
  const order = [];

  function visit(stageId, trail) {
    if (visiting.has(stageId)) {
      throw new Error(`cyclic release dependency: ${[...trail, stageId].join(' -> ')}`);
    }
    if (visited.has(stageId)) return;
    visiting.add(stageId);
    for (const dependency of dependenciesByStage.get(stageId) ?? []) {
      visit(dependency, [...trail, stageId]);
    }
    visiting.delete(stageId);
    visited.add(stageId);
    order.push(stageId);
  }

  for (const stageId of [...stageIds].sort((left, right) => left.localeCompare(right))) {
    visit(stageId, []);
  }
  return order;
}

function digestForStage(stage, kind) {
  if (kind === 'semantic') return stage.semanticSha256;
  if (kind === 'content') return stage.contentSha256;
  if (kind === 'producer') return stage.producerSha256;
  throw new TypeError(`unsupported digest kind: ${kind}`);
}

function normalizeEpochs(values) {
  if (!Array.isArray(values) || values.length === 0) throw new TypeError('system contract epochs required');
  const ids = new Set();
  return values.map((value) => {
    const id = requiredText(value?.id, 'epoch ID');
    if (ids.has(id)) throw new Error(`duplicate epoch ID: ${id}`);
    ids.add(id);
    const owner = requiredText(value?.owner, `epoch owner for ${id}`);
    const inputs = normalizeFileInputs(value?.inputs, `epoch input for ${id}`);
    return {
      id,
      owner,
      inputs,
      semanticSha256: canonicalJsonSha256({ id, owner, inputs }),
    };
  }).sort((left, right) => left.id.localeCompare(right.id));
}

function normalizeStageInputs(values) {
  if (!Array.isArray(values) || values.length === 0) throw new TypeError('system contract stages required');
  const stageIds = new Set();
  const artifactOwners = new Map();
  const artifactPaths = new Map();
  const prepared = [];

  for (const value of values) {
    const id = requiredText(value?.id, 'stage ID');
    if (stageIds.has(id)) throw new Error(`duplicate stage ID: ${id}`);
    stageIds.add(id);
    const artifactKey = requiredText(value?.artifactKey, `artifact key for ${id}`);
    const artifactPath = requiredText(value?.artifactPath, `artifact path for ${id}`);
    if (artifactOwners.has(artifactKey)) {
      throw new Error(`duplicate artifact owner for ${artifactKey}: ${artifactOwners.get(artifactKey)} and ${id}`);
    }
    if (artifactPaths.has(artifactPath)) {
      throw new Error(`duplicate artifact owner for ${artifactPath}: ${artifactPaths.get(artifactPath)} and ${id}`);
    }
    artifactOwners.set(artifactKey, id);
    artifactPaths.set(artifactPath, id);
    if (value?.payload == null || typeof value.payload !== 'object' || Array.isArray(value.payload)) {
      throw new TypeError(`artifact payload required for ${id}`);
    }
    if (value?.semanticPayload == null || typeof value.semanticPayload !== 'object'
      || Array.isArray(value.semanticPayload)) {
      throw new TypeError(`semantic payload required for ${id}`);
    }
    const semanticSha256 = canonicalJsonSha256(value.semanticPayload);
    const declaredSemanticSha256 = value.declaredSemanticSha256 == null
      ? null
      : requiredSha256(value.declaredSemanticSha256, `declared semantic hash for ${id}`);
    if (declaredSemanticSha256 != null && declaredSemanticSha256 !== semanticSha256) {
      throw new Error(`declared semantic SHA-256 mismatch for ${id}`);
    }
    const producerInputs = normalizeFileInputs(value.producerInputs, `producer input for ${id}`);
    const producerSha256 = canonicalJsonSha256(producerInputs);
    const releaseState = requiredText(value.releaseState, `release state for ${id}`);
    if (!RELEASE_STATES.has(releaseState)) throw new TypeError(`release state invalid for ${id}: ${releaseState}`);
    prepared.push({
      id,
      artifactKey,
      artifactPath,
      owner: requiredText(value.owner, `owner for ${id}`),
      producerInputs,
      producerSha256,
      consumers: sortedUniqueText(value.consumers, `consumers for ${id}`),
      schemaVersion: requiredPositiveInteger(value.schemaVersion, `schema version for ${id}`),
      generatedAt: value.payload.generatedAt == null
        ? null
        : requiredTimestamp(value.payload.generatedAt, `artifact timestamp for ${id}`),
      contentSha256: canonicalJsonSha256(value.payload),
      semanticSha256,
      declaredSemanticSha256,
      sourceBindingsInput: value.sourceBindings,
      releaseDependencies: sortedUniqueText(value.releaseDependencies ?? [], `release dependencies for ${id}`),
      releaseEpoch: requiredPositiveInteger(value.releaseEpoch, `release epoch for ${id}`),
      releaseState,
      lifecycleVisibility: sortedUniqueText(value.lifecycleVisibility, `lifecycle visibility for ${id}`),
      nextTransitions: sortedUniqueText(value.nextTransitions, `next transitions for ${id}`),
    });
  }
  return { prepared, stageIds };
}

function resolveStages(values) {
  const { prepared, stageIds } = normalizeStageInputs(values);
  const byId = new Map(prepared.map((stage) => [stage.id, stage]));
  const dependenciesByStage = new Map();

  for (const stage of prepared) {
    for (const consumer of stage.consumers) {
      if (!stageIds.has(consumer)) throw new Error(`unknown consumer ${consumer} declared by ${stage.id}`);
    }
    for (const transition of stage.nextTransitions) {
      if (!stageIds.has(transition)) throw new Error(`unknown next transition ${transition} declared by ${stage.id}`);
    }
    if (!Array.isArray(stage.sourceBindingsInput)) {
      throw new TypeError(`source bindings required for ${stage.id}`);
    }
    const sourceIds = new Set();
    const sourceBindings = stage.sourceBindingsInput.map((binding) => {
      const sourceStageId = requiredText(binding?.sourceStageId, `source stage for ${stage.id}`);
      if (sourceIds.has(sourceStageId)) throw new Error(`duplicate source binding ${sourceStageId} for ${stage.id}`);
      sourceIds.add(sourceStageId);
      const source = byId.get(sourceStageId);
      if (!source) throw new Error(`unknown source stage ${sourceStageId} for ${stage.id}`);
      const digestKind = requiredText(binding?.digestKind, `source digest kind for ${stage.id}`);
      if (!DIGEST_KINDS.has(digestKind)) throw new TypeError(`source digest kind invalid for ${stage.id}`);
      if (binding?.declaredSha256 == null || String(binding.declaredSha256).trim() === '') {
        throw new TypeError(`source hash required for ${stage.id} from ${sourceStageId}`);
      }
      const declaredSha256 = requiredSha256(binding.declaredSha256, `source hash for ${stage.id}`);
      const resolvedSha256 = digestForStage(source, digestKind);
      if (declaredSha256 !== resolvedSha256) {
        throw new Error(`mixed epoch source binding for ${stage.id} from ${sourceStageId}`);
      }
      if (stage.releaseState === 'RELEASED' && stage.releaseEpoch !== source.releaseEpoch) {
        const subject = stage.artifactKey.toLowerCase().includes('queue') ? 'queue' : 'stage';
        throw new Error(
          `released ${subject} epoch ${stage.releaseEpoch} cannot exceed source projection epoch ${source.releaseEpoch}: ${stage.id}`,
        );
      }
      if (stage.releaseState === 'PENDING_NEXT' && stage.releaseEpoch < source.releaseEpoch) {
        throw new Error(`pending stage ${stage.id} cannot precede source epoch ${source.releaseEpoch}`);
      }
      return { sourceStageId, digestKind, declaredSha256, resolvedSha256 };
    }).sort((left, right) => left.sourceStageId.localeCompare(right.sourceStageId)
      || left.digestKind.localeCompare(right.digestKind));

    const dependencies = new Set([...stage.releaseDependencies, ...sourceBindings.map((binding) => binding.sourceStageId)]);
    for (const dependency of dependencies) {
      if (!stageIds.has(dependency)) throw new Error(`unknown release dependency ${dependency} for ${stage.id}`);
    }
    dependenciesByStage.set(stage.id, [...dependencies].sort((left, right) => left.localeCompare(right)));
    stage.sourceBindings = sourceBindings;
  }

  const releaseOrder = topologicalOrder(stageIds, dependenciesByStage);
  const position = new Map(releaseOrder.map((stageId, index) => [stageId, index]));
  for (const stage of prepared) {
    for (const consumer of stage.consumers) {
      if (!(dependenciesByStage.get(consumer) ?? []).includes(stage.id)) {
        throw new Error(`consumer ${consumer} does not bind producer ${stage.id}`);
      }
    }
  }

  const stages = prepared.map((stage) => ({
    id: stage.id,
    artifactKey: stage.artifactKey,
    artifactPath: stage.artifactPath,
    owner: stage.owner,
    producerInputs: stage.producerInputs,
    producerSha256: stage.producerSha256,
    consumers: stage.consumers,
    schemaVersion: stage.schemaVersion,
    generatedAt: stage.generatedAt,
    contentSha256: stage.contentSha256,
    semanticSha256: stage.semanticSha256,
    declaredSemanticSha256: stage.declaredSemanticSha256,
    sourceBindings: stage.sourceBindings,
    releaseDependencies: dependenciesByStage.get(stage.id),
    releaseEpoch: stage.releaseEpoch,
    releaseState: stage.releaseState,
    lifecycleVisibility: stage.lifecycleVisibility,
    nextTransitions: stage.nextTransitions,
  })).sort((left, right) => position.get(left.id) - position.get(right.id));

  return {
    stages,
    releaseGraph: {
      order: releaseOrder,
      edges: stages.flatMap((stage) => stage.releaseDependencies.map((dependency) => ({
        from: dependency,
        to: stage.id,
      }))),
    },
  };
}

function contractSemantic(value) {
  const { contractId, semanticContractSha256, ...semantic } = value;
  return semantic;
}

export function buildHistoricalEvidenceSystemContract(input) {
  const generatedAt = requiredTimestamp(input?.generatedAt, 'system contract timestamp');
  const releaseId = requiredText(input?.releaseId, 'system contract release ID');
  const producerInputs = normalizeFileInputs(input?.producerInputs, 'system contract producer input');
  const { stages, releaseGraph } = resolveStages(input?.stages);
  const epochs = normalizeEpochs(input?.epochs);
  const baseline = structuredClone(input?.baseline ?? {});
  const controllerDecision = structuredClone(input?.controllerDecision ?? {});
  const semantic = {
    schemaVersion: HISTORICAL_EVIDENCE_SYSTEM_CONTRACT_SCHEMA_VERSION,
    generatedAt,
    releaseId,
    producerInputs,
    producerSha256: canonicalJsonSha256(producerInputs),
    epochs,
    stages,
    releaseGraph,
    baseline,
    controllerDecision,
  };
  const semanticContractSha256 = canonicalJsonSha256(semantic);
  return {
    ...semantic,
    contractId: `historical_evidence_system_${semanticContractSha256.slice(0, 24)}`,
    semanticContractSha256,
  };
}

export function validateHistoricalEvidenceSystemContract(value) {
  if (value?.schemaVersion !== HISTORICAL_EVIDENCE_SYSTEM_CONTRACT_SCHEMA_VERSION) {
    throw new TypeError(`historical evidence system contract schema v${HISTORICAL_EVIDENCE_SYSTEM_CONTRACT_SCHEMA_VERSION} required`);
  }
  const expected = canonicalJsonSha256(contractSemantic(value));
  if (requiredSha256(value.semanticContractSha256, 'semantic contract SHA-256') !== expected) {
    throw new Error('semantic contract SHA-256 mismatch');
  }
  if (value.contractId !== `historical_evidence_system_${expected.slice(0, 24)}`) {
    throw new Error('historical evidence system contract ID mismatch');
  }
  requiredTimestamp(value.generatedAt, 'system contract timestamp');
  requiredText(value.releaseId, 'system contract release ID');
  if (!Array.isArray(value.producerInputs) || value.producerInputs.length === 0) {
    throw new TypeError('system contract producer inputs required');
  }
  const contractProducerPaths = new Set();
  for (const input of value.producerInputs) {
    const path = requiredText(input?.path, 'system contract producer path');
    if (contractProducerPaths.has(path)) throw new Error(`duplicate system contract producer path: ${path}`);
    contractProducerPaths.add(path);
    requiredSha256(input.contentSha256, `system contract producer input hash for ${path}`);
  }
  if (requiredSha256(value.producerSha256, 'system contract producer SHA-256')
    !== canonicalJsonSha256(value.producerInputs)) {
    throw new Error('system contract producer SHA-256 mismatch');
  }
  if (!Array.isArray(value.stages) || !Array.isArray(value.epochs)
    || !Array.isArray(value.releaseGraph?.order) || !Array.isArray(value.releaseGraph?.edges)) {
    throw new TypeError('historical evidence system contract collections required');
  }
  const stageIds = new Set();
  const artifactKeys = new Set();
  const artifactPaths = new Set();
  const stagesById = new Map();
  for (const stage of value.stages) {
    const stageId = requiredText(stage?.id, 'contract stage ID');
    if (stageIds.has(stageId)) throw new Error(`duplicate contract stage ID: ${stageId}`);
    stageIds.add(stageId);
    stagesById.set(stageId, stage);
    const artifactKey = requiredText(stage.artifactKey, `contract artifact key for ${stageId}`);
    const artifactPath = requiredText(stage.artifactPath, `contract artifact path for ${stageId}`);
    if (artifactKeys.has(artifactKey) || artifactPaths.has(artifactPath)) {
      throw new Error(`duplicate contract artifact ownership: ${artifactKey}`);
    }
    artifactKeys.add(artifactKey);
    artifactPaths.add(artifactPath);
    requiredText(stage.owner, `contract owner for ${stageId}`);
    requiredPositiveInteger(stage.schemaVersion, `contract schema version for ${stageId}`);
    requiredSha256(stage.contentSha256, `contract content hash for ${stageId}`);
    requiredSha256(stage.semanticSha256, `contract semantic hash for ${stageId}`);
    if (stage.declaredSemanticSha256 != null
      && requiredSha256(stage.declaredSemanticSha256, `contract declared semantic hash for ${stageId}`)
        !== stage.semanticSha256) {
      throw new Error(`contract declared semantic hash mismatch for ${stageId}`);
    }
    const producerInputs = stage.producerInputs;
    if (!Array.isArray(producerInputs) || producerInputs.length === 0) {
      throw new TypeError(`contract producer inputs required for ${stageId}`);
    }
    const producerPaths = new Set();
    for (const input of producerInputs) {
      const path = requiredText(input?.path, `contract producer path for ${stageId}`);
      if (producerPaths.has(path)) throw new Error(`duplicate contract producer path for ${stageId}: ${path}`);
      producerPaths.add(path);
      requiredSha256(input.contentSha256, `contract producer input hash for ${stageId}`);
    }
    if (requiredSha256(stage.producerSha256, `contract producer hash for ${stageId}`)
      !== canonicalJsonSha256(producerInputs)) {
      throw new Error(`contract producer hash mismatch for ${stageId}`);
    }
    const releaseState = requiredText(stage.releaseState, `contract release state for ${stageId}`);
    if (!RELEASE_STATES.has(releaseState)) throw new TypeError(`contract release state invalid for ${stageId}`);
    requiredPositiveInteger(stage.releaseEpoch, `contract release epoch for ${stageId}`);
    sortedUniqueText(stage.consumers, `contract consumers for ${stageId}`);
    sortedUniqueText(stage.nextTransitions, `contract transitions for ${stageId}`);
    if (!Array.isArray(stage.lifecycleVisibility) || stage.lifecycleVisibility.length === 0) {
      throw new TypeError(`contract lifecycle visibility required for ${stageId}`);
    }
    sortedUniqueText(stage.lifecycleVisibility, `contract lifecycle visibility for ${stageId}`);
  }
  const dependencies = new Map(value.stages.map((stage) => [
    stage.id,
    sortedUniqueText(stage.releaseDependencies ?? [], `contract release dependencies for ${stage.id}`),
  ]));
  for (const [stageId, sourceIds] of dependencies) {
    for (const sourceId of sourceIds) {
      if (!stageIds.has(sourceId)) throw new Error(`unknown contract dependency ${sourceId} for ${stageId}`);
    }
  }
  for (const stage of value.stages) {
    if (!Array.isArray(stage.sourceBindings)) throw new TypeError(`contract source bindings required for ${stage.id}`);
    const boundSources = new Set();
    for (const binding of stage.sourceBindings) {
      const sourceStageId = requiredText(binding?.sourceStageId, `contract source stage for ${stage.id}`);
      if (boundSources.has(sourceStageId)) throw new Error(`duplicate contract source binding for ${stage.id}: ${sourceStageId}`);
      boundSources.add(sourceStageId);
      const source = stagesById.get(sourceStageId);
      if (!source) throw new Error(`unknown contract source stage ${sourceStageId} for ${stage.id}`);
      const digestKind = requiredText(binding.digestKind, `contract source digest kind for ${stage.id}`);
      if (!DIGEST_KINDS.has(digestKind)) throw new TypeError(`contract source digest kind invalid for ${stage.id}`);
      const declaredSha256 = requiredSha256(binding.declaredSha256, `contract declared source hash for ${stage.id}`);
      const resolvedSha256 = requiredSha256(binding.resolvedSha256, `contract resolved source hash for ${stage.id}`);
      if (declaredSha256 !== resolvedSha256 || resolvedSha256 !== digestForStage(source, digestKind)) {
        throw new Error(`contract source binding mismatch for ${stage.id} from ${sourceStageId}`);
      }
      if (!dependencies.get(stage.id).includes(sourceStageId)) {
        throw new Error(`contract source missing from release dependencies for ${stage.id}: ${sourceStageId}`);
      }
      if (stage.releaseState === 'RELEASED' && stage.releaseEpoch !== source.releaseEpoch) {
        throw new Error(`contract released stage epoch mismatch for ${stage.id}`);
      }
      if (stage.releaseState === 'PENDING_NEXT' && stage.releaseEpoch < source.releaseEpoch) {
        throw new Error(`contract pending stage precedes source for ${stage.id}`);
      }
    }
    const consumers = sortedUniqueText(stage.consumers, `contract consumers for ${stage.id}`);
    const transitions = sortedUniqueText(stage.nextTransitions, `contract transitions for ${stage.id}`);
    if (canonicalJsonSha256(consumers) !== canonicalJsonSha256(transitions)) {
      throw new Error(`contract transition and consumer mismatch for ${stage.id}`);
    }
    for (const consumerId of consumers) {
      if (!stageIds.has(consumerId)) throw new Error(`unknown contract consumer ${consumerId} for ${stage.id}`);
      if (!(dependencies.get(consumerId) ?? []).includes(stage.id)) {
        throw new Error(`contract consumer ${consumerId} does not depend on ${stage.id}`);
      }
    }
  }
  const order = topologicalOrder(stageIds, dependencies);
  if (canonicalJsonSha256(order) !== canonicalJsonSha256(value.releaseGraph.order)) {
    throw new Error('release graph order mismatch');
  }
  const expectedEdges = order.flatMap((stageId) => (
    (dependencies.get(stageId) ?? []).map((dependency) => ({ from: dependency, to: stageId }))
  ));
  if (canonicalJsonSha256(expectedEdges) !== canonicalJsonSha256(value.releaseGraph.edges)) {
    throw new Error('release graph edge mismatch');
  }
  const epochIds = new Set();
  for (const epoch of value.epochs) {
    const epochId = requiredText(epoch?.id, 'contract epoch ID');
    if (epochIds.has(epochId)) throw new Error(`duplicate contract epoch ID: ${epochId}`);
    epochIds.add(epochId);
    const owner = requiredText(epoch.owner, `contract epoch owner for ${epochId}`);
    if (!Array.isArray(epoch.inputs) || epoch.inputs.length === 0) {
      throw new TypeError(`contract epoch inputs required for ${epochId}`);
    }
    const paths = new Set();
    for (const input of epoch.inputs) {
      const path = requiredText(input?.path, `contract epoch input path for ${epochId}`);
      if (paths.has(path)) throw new Error(`duplicate contract epoch input for ${epochId}: ${path}`);
      paths.add(path);
      requiredSha256(input.contentSha256, `contract epoch input hash for ${epochId}`);
    }
    if (requiredSha256(epoch.semanticSha256, `contract epoch semantic hash for ${epochId}`)
      !== canonicalJsonSha256({ id: epochId, owner, inputs: epoch.inputs })) {
      throw new Error(`contract epoch semantic hash mismatch for ${epochId}`);
    }
  }
  return value;
}
