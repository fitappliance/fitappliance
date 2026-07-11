import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildLegacySourceDocuments } from '../../src/domain/source-document-seed.mjs';

test('legacy source-document seed is deterministic and preserves every registered document identity', async () => {
  const [manual, canonical, current] = await Promise.all([
    readFile('data/manual-evidence.json', 'utf8').then(JSON.parse),
    readFile('data/architecture-v2/generated/canonical-registry.json', 'utf8').then(JSON.parse),
    readFile('data/architecture-v2/generated/source-documents.json', 'utf8').then(JSON.parse),
  ]);
  const documents = buildLegacySourceDocuments({ manual, canonical });
  assert.equal(documents.length, 2005);
  assert.deepEqual(
    documents.map((document) => document.id),
    current.documents.map((document) => document.id),
  );
  assert.ok(documents.every((document) => document.state === 'quarantined'));
});
