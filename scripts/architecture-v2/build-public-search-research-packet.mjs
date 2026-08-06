import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { isOfficialBrandHostUrl } from '../../src/domain/evidence-source-verifier.mjs';
import { publicSearchSha256 } from '../../src/domain/public-search-lead.mjs';

const ACTIVE_RELEASE_ID = 'retail_lifecycle_release_6c42c754aeb1ff49097b32b4';
const TARGET_KEYS = new Set([
  'targetId', 'referenceId', 'category', 'brand', 'exactModel', 'lifecycleState',
  'activeReleaseId', 'activeReleaseSha256', 'approvedOfficialHostSuffixes',
]);
const SHA256 = /^[a-f0-9]{64}$/;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;

function text(value, label) {
  const normalized = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!normalized) throw new TypeError(`${label} required`);
  if (EMAIL.test(normalized)) throw new TypeError(`${label} cannot contain an email address`);
  if (/[*?]/.test(normalized)) throw new TypeError(`${label} cannot contain a wildcard`);
  if (/[\\/]/.test(normalized)) throw new TypeError(`${label} cannot contain a local path`);
  return normalized;
}

function normalizeHostSuffix(value, brand) {
  const suffix = String(value ?? '').trim().toLowerCase().replace(/\.$/, '');
  if (!suffix || suffix.includes('/') || suffix.includes('\\') || suffix.includes('@')
    || suffix.includes(':') || EMAIL.test(suffix)) {
    throw new TypeError('approved official host suffix invalid');
  }
  if (!isOfficialBrandHostUrl(`https://${suffix}/`, brand)) {
    throw new TypeError(`approved official host suffix is outside manufacturer policy: ${suffix}`);
  }
  return suffix;
}

function normalizeTarget(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('public search target must be an object');
  }
  for (const key of Object.keys(value)) {
    if (!TARGET_KEYS.has(key)) throw new TypeError(`public search target unknown key: ${key}`);
  }
  for (const key of TARGET_KEYS) {
    if (!Object.hasOwn(value, key)) throw new TypeError(`public search target missing ${key}`);
  }
  if (value.lifecycleState !== 'CURRENT_RETAIL') throw new TypeError('public search target must be CURRENT_RETAIL');
  if (value.activeReleaseId !== ACTIVE_RELEASE_ID) throw new TypeError('public search target active release ID mismatch');
  const activeReleaseSha256 = String(value.activeReleaseSha256 ?? '').trim().toLowerCase();
  if (!SHA256.test(activeReleaseSha256)) throw new TypeError('active release SHA-256 required');
  const brand = text(value.brand, 'brand');
  const exactModel = text(value.exactModel, 'exact model');
  if (!/^[A-Za-z0-9][A-Za-z0-9 ._&+()-]*$/.test(brand)
    || !/^[A-Za-z0-9][A-Za-z0-9 ._+()-]*$/.test(exactModel)) {
    throw new TypeError('brand and exact model contain unsupported search syntax');
  }
  if (!Array.isArray(value.approvedOfficialHostSuffixes)
    || value.approvedOfficialHostSuffixes.length === 0) {
    throw new TypeError('approved official host suffixes required');
  }
  const approvedOfficialHostSuffixes = [...new Set(value.approvedOfficialHostSuffixes
    .map((suffix) => normalizeHostSuffix(suffix, brand)))].sort();
  return {
    targetId: text(value.targetId, 'target ID'),
    referenceId: text(value.referenceId, 'reference ID'),
    category: text(value.category, 'category'),
    brand,
    exactModel,
    lifecycleState: 'CURRENT_RETAIL',
    activeReleaseId: ACTIVE_RELEASE_ID,
    activeReleaseSha256,
    approvedOfficialHostSuffixes,
  };
}

function query(target, templateId, queryText) {
  const semantic = {
    templateId,
    targetId: target.targetId,
    referenceId: target.referenceId,
    queryText,
    resultLimit: 5,
  };
  const querySha256 = publicSearchSha256(semantic);
  return {
    ...semantic,
    queryId: `public_search_query_${querySha256.slice(0, 24)}`,
    querySha256,
  };
}

export function buildPublicSearchResearchPacket(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('public search packet input must be an object');
  }
  for (const key of Object.keys(input)) {
    if (key !== 'targets') throw new TypeError(`public search packet input unknown key: ${key}`);
  }
  const { targets } = input;
  if (!Array.isArray(targets) || targets.length === 0 || targets.length > 25) {
    throw new TypeError('public search packet requires 1 to 25 targets');
  }
  const normalizedTargets = targets.map(normalizeTarget)
    .sort((left, right) => left.targetId.localeCompare(right.targetId));
  const targetIds = new Set(normalizedTargets.map((target) => target.targetId));
  if (targetIds.size !== normalizedTargets.length) throw new TypeError('duplicate public search target ID');
  const releaseHashes = new Set(normalizedTargets.map((target) => target.activeReleaseSha256));
  if (releaseHashes.size !== 1) throw new TypeError('public search targets must bind one active release SHA');

  const queries = normalizedTargets.flatMap((target) => [
    query(target, 'EXACT_MODEL_AUSTRALIA', `"${target.exactModel}" ${target.brand} Australia`),
    query(
      target,
      'OFFICIAL_DOMAIN',
      `"${target.exactModel}" ${target.brand} Australia ${target.approvedOfficialHostSuffixes
        .map((host) => `site:${host}`).join(' OR ')}`,
    ),
  ]);
  const semantic = {
    schemaVersion: 1,
    activeReleaseId: ACTIVE_RELEASE_ID,
    activeReleaseSha256: normalizedTargets[0].activeReleaseSha256,
    targets: normalizedTargets,
    queries,
  };
  const semanticPacketSha256 = publicSearchSha256(semantic);
  return {
    ...semantic,
    packetId: `public_search_packet_${semanticPacketSha256.slice(0, 24)}`,
    semanticPacketSha256,
  };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!['--input', '--output'].includes(flag) || !value) throw new TypeError('usage: --input <path> --output <path>');
    options[flag.slice(2)] = resolve(value);
  }
  if (!options.input || !options.output) throw new TypeError('explicit --input and --output required');
  return options;
}

export async function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const input = JSON.parse(await readFile(options.input, 'utf8'));
  const packet = buildPublicSearchResearchPacket(input);
  await mkdir(dirname(options.output), { recursive: true });
  const temporary = `${options.output}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(packet, null, 2)}\n`);
  await rename(temporary, options.output);
  return packet;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await runCli();
}
