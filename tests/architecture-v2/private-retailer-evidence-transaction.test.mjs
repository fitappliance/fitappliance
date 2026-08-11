import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { commitSanitizedDocuments } from '../../scripts/architecture-v2/prune-private-retailer-evidence.mjs';

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
  assert.equal(JSON.parse(await fs.readFile(targets[0])).sanitized, 0);
  assert.equal(JSON.parse(await fs.readFile(targets[1])).old, 1);
  await fs.access(journalPath);

  await commitSanitizedDocuments(entries, { fs, journalPath });
  for (const [index, path] of targets.entries()) {
    assert.deepEqual(JSON.parse(await fs.readFile(path)), { sanitized: index });
  }
  await assert.rejects(fs.access(journalPath), { code: 'ENOENT' });
});
