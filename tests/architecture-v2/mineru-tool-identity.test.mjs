import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  attestMineruToolIdentity,
} from '../../src/domain/mineru-tool-identity.mjs';

const PIPELINE_REVISION = 'ed6b654c018d742e65a17671e379c5e6ecc87ec9';

test('MinerU tool identity can attest a vanilla binary from an existing local snapshot path', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fitappliance-mineru-identity-'));
  try {
    const snapshot = join(root, 'models--opendatalab--PDF-Extract-Kit-1.0', 'snapshots', PIPELINE_REVISION);
    const configPath = join(root, 'mineru.json');
    await mkdir(snapshot, { recursive: true });
    await writeFile(configPath, JSON.stringify({ 'models-dir': { pipeline: snapshot } }));

    assert.deepEqual(await attestMineruToolIdentity({
      stdout: 'mineru, version 3.4.4\n',
      backend: 'pipeline',
      configPath,
    }), {
      version: '3.4.4',
      modelRevision: PIPELINE_REVISION,
      modelRevisionSource: 'local_model_snapshot',
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('MinerU tool identity rejects missing local snapshots and marker/config disagreement', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fitappliance-mineru-identity-'));
  const configPath = join(root, 'mineru.json');
  try {
    await writeFile(configPath, JSON.stringify({
      'models-dir': {
        pipeline: join(root, 'snapshots', PIPELINE_REVISION),
      },
    }));
    await assert.rejects(() => attestMineruToolIdentity({
      stdout: 'mineru, version 3.4.4\n',
      backend: 'pipeline',
      configPath,
    }), /snapshot.*directory/i);

    const snapshot = join(root, 'snapshots', PIPELINE_REVISION);
    await mkdir(snapshot, { recursive: true });
    await assert.rejects(() => attestMineruToolIdentity({
      stdout: 'mineru, version 3.4.4\nfitappliance-model-revision 1111111111111111111111111111111111111111\n',
      backend: 'pipeline',
      configPath,
    }), /marker.*snapshot.*disagree/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('MinerU tool identity still requires an attested model when no config is provided', async () => {
  await assert.rejects(() => attestMineruToolIdentity({
    stdout: 'mineru, version 3.4.4\n',
    backend: 'pipeline',
  }), /model revision is not attested/i);
});
