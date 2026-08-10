import { createHash } from 'node:crypto';

import { validatePersistedSiteProfileV4 } from './site-profile-v4.mjs';

export const FIT_V4_SYNTHETIC_SCENARIO_SET_SCHEMA_VERSION = 1;
export const FIT_V4_SYNTHETIC_SCENARIO_SET_TYPE = 'FIT_V4_SYNTHETIC_SCENARIO_SET';

const HASH = /^[a-f0-9]{64}$/;
const MEMBER_ID = /^fit_v4_scenario_member_[a-f0-9]{24}$/;
const SET_ID = /^fit_v4_scenario_set_[a-f0-9]{24}$/;

export class FitV4ScenarioBindingError extends Error {
  constructor(code) {
    super(code);
    this.name = 'FitV4ScenarioBindingError';
    this.code = code;
  }
}

function canonical(value, label = 'value') {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${label} contains a non-finite number`);
    return value;
  }
  if (Array.isArray(value)) return value.map((item, index) => canonical(item, `${label}[${index}]`));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key], `${label}.${key}`)]));
  }
  throw new TypeError(`${label} is not canonical JSON`);
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

function semanticHash(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
    throw new TypeError(`${label} key set invalid`);
  }
}

function requiredText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} required`);
  return value;
}

function validateMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('scenario metadata required');
  const metadata = canonical(value, 'scenario metadata');
  const frozenAt = new Date(requiredText(metadata.frozenAt, 'scenario metadata frozenAt'));
  if (Number.isNaN(frozenAt.valueOf()) || frozenAt.toISOString() !== metadata.frozenAt) {
    throw new TypeError('scenario metadata frozenAt invalid');
  }
  return metadata;
}

function validateConfigurationScope(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length === 0) {
    throw new TypeError('scenario configuration scope required');
  }
  return canonical(value, 'scenario configuration scope');
}

function rejectUnsupportedSource(profile) {
  if (profile?.sourceKind === 'consented_offline') {
    throw new FitV4ScenarioBindingError('CONSENTED_OFFLINE_NOT_SUPPORTED');
  }
  if (profile?.sourceKind === 'real_site') {
    throw new FitV4ScenarioBindingError('LIVE_EPHEMERAL_REQUIRED');
  }
}

function validatedMemberEnvelope(value) {
  exactKeys(value, ['scenarioMemberId', 'scenarioMemberSha256', 'siteProfile'], 'synthetic scenario member');
  rejectUnsupportedSource(value.siteProfile);
  if (value.siteProfile?.sourceKind !== 'synthetic') {
    throw new TypeError('synthetic scenario member source kind invalid');
  }
  const siteProfile = canonical(value.siteProfile, 'synthetic scenario member profile');
  const scenarioMemberSha256 = semanticHash(siteProfile);
  const scenarioMemberId = `fit_v4_scenario_member_${scenarioMemberSha256.slice(0, 24)}`;
  if (!HASH.test(String(value.scenarioMemberSha256)) || !MEMBER_ID.test(String(value.scenarioMemberId))
    || value.scenarioMemberSha256 !== scenarioMemberSha256 || value.scenarioMemberId !== scenarioMemberId) {
    throw new TypeError('synthetic scenario member hash or ID drift');
  }
  return canonical({ scenarioMemberId, scenarioMemberSha256, siteProfile });
}

function validatedMember(value, siteOptions) {
  const envelope = validatedMemberEnvelope(value);
  const siteProfile = validatePersistedSiteProfileV4(envelope.siteProfile, siteOptions);
  if (semanticHash(siteProfile) !== envelope.scenarioMemberSha256) {
    throw new TypeError('synthetic scenario member profile validation drift');
  }
  return envelope;
}

function setSemantic(value, members) {
  return canonical({
    schemaVersion: FIT_V4_SYNTHETIC_SCENARIO_SET_SCHEMA_VERSION,
    artifactType: FIT_V4_SYNTHETIC_SCENARIO_SET_TYPE,
    purpose: requiredText(value.purpose, 'scenario purpose'),
    category: requiredText(value.category, 'scenario category'),
    configurationScope: validateConfigurationScope(value.configurationScope),
    metadata: validateMetadata(value.metadata),
    members,
  });
}

export function validateFitV4SyntheticScenarioSetEnvelope(value) {
  exactKeys(value, [
    'schemaVersion', 'artifactType', 'scenarioSetId', 'scenarioSetSha256', 'purpose',
    'category', 'configurationScope', 'metadata', 'members',
  ], 'synthetic scenario set');
  if (value.schemaVersion !== FIT_V4_SYNTHETIC_SCENARIO_SET_SCHEMA_VERSION
    || value.artifactType !== FIT_V4_SYNTHETIC_SCENARIO_SET_TYPE
    || !SET_ID.test(String(value.scenarioSetId)) || !HASH.test(String(value.scenarioSetSha256))) {
    throw new TypeError('synthetic scenario set schema invalid');
  }
  if (!Array.isArray(value.members) || value.members.length === 0) {
    throw new TypeError('synthetic scenario set requires one or more members');
  }
  const members = value.members.map(validatedMemberEnvelope);
  const memberIds = members.map((member) => member.scenarioMemberId);
  const memberHashes = members.map((member) => member.scenarioMemberSha256);
  if (new Set(memberIds).size !== memberIds.length || new Set(memberHashes).size !== memberHashes.length) {
    throw new TypeError('synthetic scenario set duplicate member ID or hash');
  }
  const sortedIds = [...memberIds].sort();
  if (JSON.stringify(memberIds) !== JSON.stringify(sortedIds)) throw new TypeError('synthetic scenario member order invalid');
  const semantic = setSemantic(value, members);
  const scenarioSetSha256 = semanticHash(semantic);
  const scenarioSetId = `fit_v4_scenario_set_${scenarioSetSha256.slice(0, 24)}`;
  if (value.scenarioSetSha256 !== scenarioSetSha256 || value.scenarioSetId !== scenarioSetId) {
    throw new TypeError('synthetic scenario set hash or ID drift');
  }
  if (JSON.stringify(canonical(value)) !== JSON.stringify(canonical({
    ...semantic, scenarioSetId, scenarioSetSha256,
  }))) throw new TypeError('synthetic scenario set canonical form invalid');
  return freezeDeep(value);
}

export function validateFitV4SyntheticScenarioSet(value, siteOptions = {}) {
  const envelope = validateFitV4SyntheticScenarioSetEnvelope(value);
  for (const member of envelope.members) validatedMember(member, siteOptions);
  return envelope;
}

export function buildFitV4SyntheticScenarioSet(input, siteOptions = {}) {
  exactKeys(input, ['purpose', 'category', 'configurationScope', 'metadata', 'members'], 'synthetic scenario set input');
  if (!Array.isArray(input.members) || input.members.length === 0) {
    throw new TypeError('synthetic scenario set requires one or more members');
  }
  const members = input.members.map((profile) => {
    rejectUnsupportedSource(profile);
    const siteProfile = validatePersistedSiteProfileV4(profile, siteOptions);
    const scenarioMemberSha256 = semanticHash(siteProfile);
    return canonical({
      scenarioMemberId: `fit_v4_scenario_member_${scenarioMemberSha256.slice(0, 24)}`,
      scenarioMemberSha256,
      siteProfile,
    });
  }).sort((left, right) => left.scenarioMemberId.localeCompare(right.scenarioMemberId));
  const semantic = setSemantic(input, members);
  const scenarioSetSha256 = semanticHash(semantic);
  const manifest = canonical({
    ...semantic,
    scenarioSetId: `fit_v4_scenario_set_${scenarioSetSha256.slice(0, 24)}`,
    scenarioSetSha256,
  });
  return validateFitV4SyntheticScenarioSet(manifest, siteOptions);
}

export function selectFitV4SyntheticScenario(manifest, scenarioMemberId, siteOptions = {}) {
  const accepted = validateFitV4SyntheticScenarioSet(manifest, siteOptions);
  if (!MEMBER_ID.test(String(scenarioMemberId))) throw new TypeError('synthetic scenario member ID invalid');
  const member = accepted.members.find((candidate) => candidate.scenarioMemberId === scenarioMemberId);
  if (!member) throw new TypeError('synthetic scenario member not found in set');
  return freezeDeep(canonical({
    scenarioBinding: {
      scenarioBindingKind: 'PERSISTED_SYNTHETIC',
      scenarioSetId: accepted.scenarioSetId,
      scenarioSetSha256: accepted.scenarioSetSha256,
      scenarioMemberId: member.scenarioMemberId,
      scenarioMemberSha256: member.scenarioMemberSha256,
    },
    siteProfile: member.siteProfile,
  }));
}
