import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import {
  chmodSync, existsSync, fsyncSync, linkSync, lstatSync, mkdtempSync, readFileSync, readdirSync,
  realpathSync, unlinkSync, writeFileSync, writeSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { canonicalOwnerJson, ownerSemanticId } from '../src/domain/owner-attestation-request-contract.mjs';
import {
  OfflineOwnerSignerError,
  signOwnerAttestation,
} from '../scripts/deployment/sign-owner-attestation.mjs';
import {
  buildOfflineSignerContract,
  validateOfflineSignerContract,
} from '../src/domain/offline-owner-signer-contract.mjs';
import {
  readPrivateStableFile,
  writeAtomicPrivateNoClobber,
} from '../scripts/deployment/offline-owner-secure-io.mjs';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function fixture() {
  const root = mkdtempSync(path.join(realpathSync(os.tmpdir()), 'fit-offline-signer-'));
  chmodSync(root, 0o700);
  const keys = generateKeyPairSync('ed25519');
  const publicPem = keys.publicKey.export({ type: 'spki', format: 'pem' });
  const privatePem = keys.privateKey.export({ type: 'pkcs8', format: 'pem' });
  const files = {
    privateKey: path.join(root, 'owner-private.pem'),
    output: path.join(root, 'attestation.json'),
  };
  writeFileSync(files.privateKey, privatePem, { mode: 0o600 });
  const payload = {
    schemaVersion: 3, environment: 'PRODUCTION', action: 'PUBLIC_STATIC_DISTRIBUTION',
    dependencyId: 'FIRST_PARTY', ownerId: 'FITAPPLIANCE_OWNER', inventoryId: sha256('a'),
    scopeHash: sha256('b'), sourceObjectHash: sha256('c'), candidateId: sha256('d'),
    candidateSha256: sha256('e'), authoritySetId: sha256('f'), authoritySetSha256: sha256('g'),
    ownerRootId: 'FITAPPLIANCE_OWNER_ROOT_2026_01',
    ownerPublicKeyFingerprintSha256: sha256(keys.publicKey.export({ type: 'spki', format: 'der' })),
    ownerTrustAnchorSha256: sha256('i'), toolchainContractSha256: sha256('j'),
    candidateGeneratorSha256: sha256('k'), routeConfigSha256: sha256('l'),
    publicEvidenceManifestSha256: sha256('m'), withdrawalGenesisSha256: sha256('n'),
    offlineSignerContractId: sha256('o'), offlineSignerContractSha256: sha256('p'),
    issuedAt: '2026-08-11T08:00:00.000Z', expiresAt: '2026-08-11T09:00:00.000Z',
  };
  const requestPayload = {
    schemaVersion: 3, state: 'UNSIGNED', algorithm: 'Ed25519', encoding: 'base64',
    candidateId: payload.candidateId, candidateSha256: payload.candidateSha256,
    ownerRootId: payload.ownerRootId,
    ownerPublicKeyFingerprintSha256: payload.ownerPublicKeyFingerprintSha256,
    ownerTrustAnchorSha256: payload.ownerTrustAnchorSha256, ownerTrustRootSha256: sha256('q'),
    authoritySetId: payload.authoritySetId, authoritySetSha256: payload.authoritySetSha256,
    offlineSignerContractId: payload.offlineSignerContractId,
    offlineSignerContractSha256: payload.offlineSignerContractSha256, payload,
  };
  const request = { ...requestPayload, requestId: ownerSemanticId('fitappliance.owner-attestation-request', 3, requestPayload) };
  return { root, keys, publicPem, privatePem, files, request };
}

function trustedBindings(f) {
  return {
    ownerRootId: f.request.ownerRootId,
    ownerPublicKeyFingerprintSha256: f.request.ownerPublicKeyFingerprintSha256,
    ownerTrustAnchorSha256: f.request.ownerTrustAnchorSha256,
    ownerTrustRootSha256: f.request.ownerTrustRootSha256,
  };
}

test('all public checks finish before the private-key reader and signer are called', () => {
  const f = fixture();
  let reads = 0;
  let signs = 0;
  assert.throws(() => signOwnerAttestation({
    requestBytes: Buffer.from(canonicalOwnerJson(f.request)),
    expectedRequestId: f.request.requestId,
    expectedCandidateId: '0'.repeat(64),
    confirmation: 'SIGN_EXACT_OWNER_ATTESTATION',
    now: () => new Date('2026-08-11T08:30:00.000Z'),
    outputPath: f.files.output,
    publicKeyPem: f.publicPem,
    privateKeyPath: f.files.privateKey,
    signerContract: { id: f.request.offlineSignerContractId, sha256: f.request.offlineSignerContractSha256 },
    trustedBindings: trustedBindings(f),
    readPrivateKey: () => { reads += 1; return Buffer.from(f.privatePem); },
    signBytes: () => { signs += 1; return Buffer.alloc(64); },
  }), (error) => error instanceof OfflineOwnerSignerError && error.code === 'CANDIDATE_CONFIRMATION_MISMATCH');
  assert.equal(reads, 0);
  assert.equal(signs, 0);
});

test('actual trust bindings reject a substituted request before private-key access', () => {
  const f = fixture();
  let reads = 0;
  let signs = 0;
  assert.throws(() => signOwnerAttestation({
    requestBytes: Buffer.from(canonicalOwnerJson(f.request)),
    expectedRequestId: f.request.requestId,
    expectedCandidateId: f.request.candidateId,
    confirmation: 'SIGN_EXACT_OWNER_ATTESTATION',
    now: () => new Date('2026-08-11T08:30:00.000Z'),
    outputPath: f.files.output,
    publicKeyPem: f.publicPem,
    privateKeyPath: f.files.privateKey,
    signerContract: { id: f.request.offlineSignerContractId, sha256: f.request.offlineSignerContractSha256 },
    trustedBindings: {
      ownerRootId: f.request.ownerRootId,
      ownerPublicKeyFingerprintSha256: f.request.ownerPublicKeyFingerprintSha256,
      ownerTrustAnchorSha256: '0'.repeat(64),
      ownerTrustRootSha256: f.request.ownerTrustRootSha256,
    },
    readPrivateKey: () => { reads += 1; return Buffer.from(f.privatePem); },
    signBytes: () => { signs += 1; return Buffer.alloc(64); },
  }), (error) => error.code === 'TRUST_BINDING_MISMATCH');
  assert.equal(reads, 0);
  assert.equal(signs, 0);
});

test('ephemeral Ed25519 signing emits only payload and signature and no-clobbers output', () => {
  const f = fixture();
  let clockCalls = 0;
  const result = signOwnerAttestation({
    requestBytes: Buffer.from(canonicalOwnerJson(f.request)),
    expectedRequestId: f.request.requestId,
    expectedCandidateId: f.request.candidateId,
    confirmation: 'SIGN_EXACT_OWNER_ATTESTATION',
    now: () => { clockCalls += 1; return new Date('2026-08-11T08:30:00.000Z'); },
    outputPath: f.files.output,
    publicKeyPem: f.publicPem,
    privateKeyPath: f.files.privateKey,
    signerContract: { id: f.request.offlineSignerContractId, sha256: f.request.offlineSignerContractSha256 },
    trustedBindings: trustedBindings(f),
  });
  const envelope = JSON.parse(readFileSync(f.files.output, 'utf8'));
  assert.deepEqual(Object.keys(envelope).sort(), ['payload', 'signature']);
  assert.deepEqual(envelope.payload, f.request.payload);
  assert.match(envelope.signature, /^[A-Za-z0-9+/]+={0,2}$/);
  assert.equal(result.status, 'SIGNED');
  assert.ok(clockCalls >= 3);
  assert.throws(() => signOwnerAttestation({
    requestBytes: Buffer.from(canonicalOwnerJson(f.request)), expectedRequestId: f.request.requestId,
    expectedCandidateId: f.request.candidateId, confirmation: 'SIGN_EXACT_OWNER_ATTESTATION',
    now: () => new Date('2026-08-11T08:30:00.000Z'), outputPath: f.files.output,
    publicKeyPem: f.publicPem, privateKeyPath: f.files.privateKey,
    signerContract: { id: f.request.offlineSignerContractId, sha256: f.request.offlineSignerContractSha256 },
    trustedBindings: trustedBindings(f),
  }), (error) => error.code === 'OUTPUT_EXISTS');
});

test('existing output fails before private-key read or signing', () => {
  const f = fixture();
  writeFileSync(f.files.output, 'existing', { mode: 0o600 });
  let reads = 0;
  let signs = 0;
  assert.throws(() => signOwnerAttestation({
    requestBytes: Buffer.from(canonicalOwnerJson(f.request)),
    expectedRequestId: f.request.requestId,
    expectedCandidateId: f.request.candidateId,
    confirmation: 'SIGN_EXACT_OWNER_ATTESTATION',
    now: () => new Date('2026-08-11T08:30:00.000Z'),
    outputPath: f.files.output,
    publicKeyPem: f.publicPem,
    privateKeyPath: f.files.privateKey,
    signerContract: { id: f.request.offlineSignerContractId, sha256: f.request.offlineSignerContractSha256 },
    trustedBindings: trustedBindings(f),
    readPrivateKey: () => { reads += 1; return Buffer.from(f.privatePem); },
    signBytes: () => { signs += 1; return Buffer.alloc(64); },
  }), (error) => error.code === 'OUTPUT_EXISTS');
  assert.equal(reads, 0);
  assert.equal(signs, 0);
});

test('rejects encrypted and non-Ed25519 private keys and zeroes caller buffers', () => {
  const f = fixture();
  const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' });
  const encrypted = f.keys.privateKey.export({
    type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase: 'fixture-only',
  });
  for (const material of [rsa, encrypted]) {
    const secret = Buffer.from(material);
    assert.throws(() => signOwnerAttestation({
      requestBytes: Buffer.from(canonicalOwnerJson(f.request)),
      expectedRequestId: f.request.requestId,
      expectedCandidateId: f.request.candidateId,
      confirmation: 'SIGN_EXACT_OWNER_ATTESTATION',
      now: () => new Date('2026-08-11T08:30:00.000Z'),
      outputPath: f.files.output,
      publicKeyPem: f.publicPem,
      privateKeyPath: f.files.privateKey,
      signerContract: { id: f.request.offlineSignerContractId, sha256: f.request.offlineSignerContractSha256 },
      trustedBindings: trustedBindings(f),
      readPrivateKey: () => secret,
    }), (error) => error.code === 'OWNER_PRIVATE_KEY_INVALID');
    assert.ok(secret.every((byte) => byte === 0));
    assert.equal(existsSync(f.files.output), false);
  }

  const secret = Buffer.from(f.privatePem);
  assert.throws(() => signOwnerAttestation({
    requestBytes: Buffer.from(canonicalOwnerJson(f.request)),
    expectedRequestId: f.request.requestId,
    expectedCandidateId: f.request.candidateId,
    confirmation: 'SIGN_EXACT_OWNER_ATTESTATION',
    now: () => new Date('2026-08-11T08:30:00.000Z'),
    outputPath: f.files.output,
    publicKeyPem: f.publicPem,
    privateKeyPath: f.files.privateKey,
    signerContract: { id: f.request.offlineSignerContractId, sha256: f.request.offlineSignerContractSha256 },
    trustedBindings: trustedBindings(f),
    readPrivateKey: () => secret,
    signBytes: () => { throw new Error('injected-sign'); },
  }), (error) => error.code === 'OWNER_SIGNATURE_FAILED');
  assert.ok(secret.every((byte) => byte === 0));
  assert.equal(existsSync(f.files.output), false);
});

test('production signer import closure contains no online generator, subprocess, network or dynamic import', () => {
  const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);
  const pending = ['scripts/deployment/sign-owner-attestation.mjs'];
  const seen = new Set();
  while (pending.length) {
    const relativePath = pending.pop();
    if (seen.has(relativePath)) continue;
    seen.add(relativePath);
    const source = readFileSync(path.join(repoRoot, relativePath), 'utf8');
    assert.doesNotMatch(source, /prepare-owner-attestation-request|prepare-static-rights-signing-candidate|reviewed-static-deployment/);
    assert.doesNotMatch(source, /child_process|node:(?:http|https|net|tls|dns)|\bimport\s*\(/);
    for (const match of source.matchAll(/(?:import|export)\s+(?:[^'";]+?\s+from\s+)?['"](\.[^'"]+)['"]/g)) {
      const resolved = path.relative(repoRoot, path.resolve(path.dirname(path.join(repoRoot, relativePath)), match[1]));
      pending.push(resolved);
    }
  }
  assert.deepEqual([...seen].sort(), [
    'scripts/deployment/offline-owner-secure-io.mjs',
    'scripts/deployment/sign-owner-attestation.mjs',
    'src/domain/offline-owner-signer-contract.mjs',
    'src/domain/owner-attestation-request-contract.mjs',
  ]);
});

test('offline signer contract binds exact runtime, trust anchor and signer dependency bytes', () => {
  const files = [
    { path: 'src/domain/owner-attestation-request-contract.mjs', sha256: sha256('contract') },
    { path: 'src/domain/offline-owner-signer-contract.mjs', sha256: sha256('signer-contract') },
    { path: 'scripts/deployment/offline-owner-secure-io.mjs', sha256: sha256('io') },
    { path: 'scripts/deployment/sign-owner-attestation.mjs', sha256: sha256('signer') },
  ];
  const contract = buildOfflineSignerContract({
    nodeVersion: '22.23.1',
    trustAnchor: { path: 'deployment/static-owner-trust-anchor.json', sha256: sha256('anchor') },
    boundFiles: files,
  });
  assert.deepEqual(validateOfflineSignerContract(Buffer.from(canonicalOwnerJson(contract)), {
    nodeVersion: '22.23.1', trustAnchorBytes: Buffer.from('anchor'), fileBytes: new Map(files.map((row) => [row.path, Buffer.from({
      'src/domain/owner-attestation-request-contract.mjs': 'contract',
      'src/domain/offline-owner-signer-contract.mjs': 'signer-contract',
      'scripts/deployment/offline-owner-secure-io.mjs': 'io',
      'scripts/deployment/sign-owner-attestation.mjs': 'signer',
    }[row.path])])),
  }), contract);
  assert.throws(() => validateOfflineSignerContract(Buffer.from(canonicalOwnerJson(contract)), {
    nodeVersion: '22.23.2', trustAnchorBytes: Buffer.from('anchor'), fileBytes: new Map(),
  }), (error) => error.code === 'SIGNER_RUNTIME_DRIFT');
});

test('production wrapper combines sandbox-exec, Node permissions and core-dump denial', () => {
  const wrapper = readFileSync(new URL('../scripts/deployment/run-offline-owner-signer.sh', import.meta.url), 'utf8');
  assert.match(wrapper, /ulimit -c 0/);
  assert.match(wrapper, /\/usr\/bin\/sandbox-exec/);
  assert.match(wrapper, /deny network\*/);
  assert.match(wrapper, /--permission/);
  assert.match(wrapper, /--allow-fs-read=/);
  assert.match(wrapper, /--allow-fs-write=/);
  assert.doesNotMatch(wrapper, /--allow-child-process/);
  assert.doesNotMatch(wrapper, /"--allow-fs-read=\$\{repo_root\}"/);
  assert.doesNotMatch(wrapper, /offline-boundary\.invalid/);
  assert.match(wrapper, /--disable-sigusr1/);
  assert.match(wrapper, /unset NODE_OPTIONS NODE_PATH/);
  for (const relativePath of [
    'src/domain/owner-attestation-request-contract.mjs',
    'src/domain/offline-owner-signer-contract.mjs',
    'scripts/deployment/offline-owner-secure-io.mjs',
    'scripts/deployment/sign-owner-attestation.mjs',
  ]) {
    assert.match(wrapper, new RegExp(`--allow-fs-read=\\$\\{repo_root\\}/${relativePath.replaceAll('/', '\\/')}`));
  }
});

test('host boundary actually denies a reachable local network endpoint and child processes', async () => {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  const probe = `const socket=require('node:net').connect(${port},'127.0.0.1');socket.on('connect',()=>process.exit(0));socket.on('error',(error)=>process.exit(['EPERM','EACCES'].includes(error.code)?23:24));setTimeout(()=>process.exit(25),2000);`;
  const reachable = spawnSync(process.execPath, ['-e', probe], { encoding: 'utf8', timeout: 5_000 });
  assert.equal(reachable.status, 0, reachable.stderr);
  const network = spawnSync('/usr/bin/sandbox-exec', [
    '-p', '(version 1)(allow default)(deny network*)',
    process.execPath,
    '-e', probe,
  ], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(network.status, 23, network.stderr);
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));

  const child = spawnSync(process.execPath, [
    '--permission',
    '-e', 'import("node:child_process").then(({spawnSync}) => { try { spawnSync("/usr/bin/true"); process.exit(0); } catch (error) { process.exit(error?.code === "ERR_ACCESS_DENIED" ? 23 : 24); } })',
  ], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(child.status, 23, child.stderr);
});

test('atomic private writer completes partial writes and leaves no temporary inode', () => {
  const root = mkdtempSync(path.join(realpathSync(os.tmpdir()), 'fit-offline-io-'));
  chmodSync(root, 0o700);
  const output = path.join(root, 'receipt.json');
  let writes = 0;
  writeAtomicPrivateNoClobber(output, Buffer.from('complete-bytes'), {
    io: {
      writeSync: (fd, bytes, offset, length) => {
        writes += 1;
        return writeSync(fd, bytes, offset, Math.min(length, 2));
      },
    },
  });
  assert.ok(writes > 1);
  assert.equal(readFileSync(output, 'utf8'), 'complete-bytes');
  assert.deepEqual(readdirSync(root), ['receipt.json']);
});

test('private-key reader rejects broad modes and multiple hard links', () => {
  const root = mkdtempSync(path.join(realpathSync(os.tmpdir()), 'fit-offline-private-'));
  chmodSync(root, 0o700);
  const privatePath = path.join(root, 'private.pem');
  writeFileSync(privatePath, 'fixture', { mode: 0o644 });
  assert.throws(() => readPrivateStableFile(privatePath), (error) => error.code === 'PRIVATE_KEY_FILE_INVALID');
  chmodSync(privatePath, 0o600);
  const hardLink = path.join(root, 'private-copy.pem');
  linkSync(privatePath, hardLink);
  assert.throws(() => readPrivateStableFile(privatePath), (error) => error.code === 'PRIVATE_KEY_FILE_INVALID');
});

test('private-key reader rejects a non-private immediate parent', () => {
  const root = mkdtempSync(path.join(realpathSync(os.tmpdir()), 'fit-offline-private-parent-'));
  chmodSync(root, 0o755);
  const privatePath = path.join(root, 'private.pem');
  writeFileSync(privatePath, 'fixture', { mode: 0o600 });
  assert.throws(() => readPrivateStableFile(privatePath), (error) => error.code === 'PRIVATE_KEY_PARENT_INVALID');
});

test('atomic private writer fails closed on write, file-fsync and link failures', () => {
  for (const [name, io] of [
    ['write', { writeSync: () => { throw new Error('injected-write'); } }],
    ['file-fsync', { fsyncSync: () => { throw new Error('injected-fsync'); } }],
    ['link', { linkSync: () => { throw new Error('injected-link'); } }],
  ]) {
    const root = mkdtempSync(path.join(realpathSync(os.tmpdir()), `fit-offline-${name}-`));
    chmodSync(root, 0o700);
    const output = path.join(root, 'receipt.json');
    assert.throws(() => writeAtomicPrivateNoClobber(output, Buffer.from('bytes'), { io }));
    assert.equal(existsSync(output), false);
    assert.deepEqual(readdirSync(root), []);
  }
});

test('atomic private writer never clobbers a concurrent winner', () => {
  const root = mkdtempSync(path.join(realpathSync(os.tmpdir()), 'fit-offline-race-'));
  chmodSync(root, 0o700);
  const output = path.join(root, 'receipt.json');
  assert.throws(() => writeAtomicPrivateNoClobber(output, Buffer.from('signed'), {
    io: {
      linkSync: (temporary, finalPath) => {
        writeFileSync(finalPath, 'concurrent-winner', { mode: 0o600 });
        return linkSync(temporary, finalPath);
      },
    },
  }), (error) => error.code === 'OUTPUT_EXISTS');
  assert.equal(readFileSync(output, 'utf8'), 'concurrent-winner');
  assert.deepEqual(readdirSync(root), ['receipt.json']);
});

test('a parent-fsync failure preserves the complete linked output for recovery', () => {
  const root = mkdtempSync(path.join(realpathSync(os.tmpdir()), 'fit-offline-fsync-'));
  chmodSync(root, 0o700);
  const output = path.join(root, 'receipt.json');
  let calls = 0;
  assert.throws(() => writeAtomicPrivateNoClobber(output, Buffer.from('recoverable'), {
    io: {
      fsyncSync: (fd) => {
        calls += 1;
        if (calls === 2) throw new Error('injected-parent-fsync');
        return fsyncSync(fd);
      },
      unlinkSync,
    },
  }), /injected-parent-fsync/);
  assert.equal(readFileSync(output, 'utf8'), 'recoverable');
  assert.deepEqual(readdirSync(root), ['receipt.json']);
});

test('cleanup failure is retried without removing the committed output', () => {
  const root = mkdtempSync(path.join(realpathSync(os.tmpdir()), 'fit-offline-cleanup-'));
  chmodSync(root, 0o700);
  const output = path.join(root, 'receipt.json');
  let calls = 0;
  assert.throws(() => writeAtomicPrivateNoClobber(output, Buffer.from('recoverable'), {
    io: {
      unlinkSync: (target) => {
        calls += 1;
        if (calls === 1) throw new Error('injected-cleanup');
        return unlinkSync(target);
      },
    },
  }), /injected-cleanup/);
  assert.equal(readFileSync(output, 'utf8'), 'recoverable');
  assert.deepEqual(readdirSync(root), ['receipt.json']);
});

test('parent identity drift before link leaves no output or temporary inode', () => {
  const root = mkdtempSync(path.join(realpathSync(os.tmpdir()), 'fit-offline-parent-'));
  chmodSync(root, 0o700);
  const output = path.join(root, 'receipt.json');
  assert.throws(() => writeAtomicPrivateNoClobber(output, Buffer.from('bytes'), {
    io: {
      lstatSync: (target) => {
        const stat = lstatSync(target);
        return target === root
          ? Object.assign(Object.create(Object.getPrototypeOf(stat)), stat, { ino: stat.ino + 1 })
          : stat;
      },
    },
  }), (error) => error.code === 'OUTPUT_PARENT_CHANGED');
  assert.equal(existsSync(output), false);
  assert.deepEqual(readdirSync(root), []);
});

test('temporary inode replacement before commit is rejected without deleting attacker bytes', () => {
  const root = mkdtempSync(path.join(realpathSync(os.tmpdir()), 'fit-offline-temp-swap-'));
  chmodSync(root, 0o700);
  const output = path.join(root, 'receipt.json');
  let attackerPath;
  assert.throws(() => writeAtomicPrivateNoClobber(output, Buffer.from('trusted'), {
    beforeCommit: () => {
      attackerPath = path.join(root, readdirSync(root)[0]);
      unlinkSync(attackerPath);
      writeFileSync(attackerPath, 'attacker', { mode: 0o600 });
    },
  }), (error) => error.code === 'OUTPUT_TEMP_CHANGED');
  assert.equal(existsSync(output), false);
  assert.equal(readFileSync(attackerPath, 'utf8'), 'attacker');
});
