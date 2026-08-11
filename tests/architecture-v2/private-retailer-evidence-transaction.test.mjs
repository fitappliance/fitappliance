import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { commitSanitizedDocuments } from '../../scripts/architecture-v2/prune-private-retailer-evidence.mjs';

function documentBytes(document) {
  return Buffer.from(`${JSON.stringify(document, null, 2)}\n`);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

test('private retailer migration resumes a journalled multi-file update after interruption', async (t) => {
  const root = await fs.mkdtemp(join(tmpdir(), 'fitappliance-private-transaction-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const journalPath = join(root, 'transaction.json');
  const targets = ['catalog.json', 'manual.json', 'ledger.json'].map((name) => join(root, name));
  await Promise.all(targets.map((path, index) => fs.writeFile(path, JSON.stringify({ old: index }))));
  const entries = targets.map((path, index) => [path, { sanitized: index }]);
  let renameCalls = 0;
  const interruptedFs = {
    ...fs,
    rename: async (...args) => {
      renameCalls += 1;
      if (renameCalls === 2) throw new Error('simulated interruption');
      return fs.rename(...args);
    },
  };

  await assert.rejects(
    commitSanitizedDocuments(entries, { fs: interruptedFs, journalPath }),
    /simulated interruption/,
  );
  for (const [index, path] of targets.entries()) {
    assert.deepEqual(JSON.parse(await fs.readFile(path)), { old: index });
  }
  await fs.access(journalPath);

  const interruptedJournal = JSON.parse(await fs.readFile(journalPath));
  await fs.rename(interruptedJournal.entries[0].tempPath, targets[0]);
  assert.deepEqual(JSON.parse(await fs.readFile(targets[0])), { sanitized: 0 });

  await commitSanitizedDocuments(entries, { fs, journalPath });
  for (const [index, path] of targets.entries()) {
    assert.deepEqual(JSON.parse(await fs.readFile(path)), { sanitized: index });
  }
  await assert.rejects(fs.access(journalPath), { code: 'ENOENT' });
});

test('private retailer migration rejects a pre-created temp symlink', async (t) => {
  const root = await fs.mkdtemp(join(tmpdir(), 'fitappliance-private-transaction-link-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const journalPath = join(root, 'transaction.json');
  const targetPath = join(root, 'catalog.json');
  const document = { sanitized: true };
  const bytes = documentBytes(document);
  const tempPath = `${targetPath}.private-retailer-${sha256(bytes)}.tmp`;
  const linkedPath = join(root, 'matching-bytes.json');
  await Promise.all([
    fs.writeFile(targetPath, JSON.stringify({ old: true })),
    fs.writeFile(linkedPath, bytes),
  ]);
  await fs.symlink(linkedPath, tempPath);

  await assert.rejects(
    commitSanitizedDocuments([[targetPath, document]], { fs, journalPath }),
    /regular non-symlink/i,
  );
  assert.deepEqual(JSON.parse(await fs.readFile(targetPath)), { old: true });
  assert.equal((await fs.lstat(targetPath)).isSymbolicLink(), false);
});

test('private retailer migration safely skips unchanged documents', async (t) => {
  const root = await fs.mkdtemp(join(tmpdir(), 'fitappliance-private-transaction-noop-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const journalPath = join(root, 'transaction.json');
  const unchangedPath = join(root, 'unchanged.json');
  const changedPath = join(root, 'changed.json');
  const unchanged = { unchanged: true };
  await Promise.all([
    fs.writeFile(unchangedPath, documentBytes(unchanged)),
    fs.writeFile(changedPath, JSON.stringify({ old: true })),
  ]);

  await commitSanitizedDocuments([
    [unchangedPath, unchanged],
    [changedPath, { changed: true }],
  ], { fs, journalPath });

  assert.deepEqual(JSON.parse(await fs.readFile(unchangedPath)), unchanged);
  assert.deepEqual(JSON.parse(await fs.readFile(changedPath)), { changed: true });
  await assert.rejects(fs.access(journalPath), { code: 'ENOENT' });
});
