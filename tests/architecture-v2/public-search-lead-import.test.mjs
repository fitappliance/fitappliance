import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { buildPublicSearchResearchPacket } from '../../scripts/architecture-v2/build-public-search-research-packet.mjs';
import {
  checkpointPublicSearchResponse,
  importPublicSearchLeadsFromCheckpoint,
  publicSearchCheckpointPaths,
  runCli as runImportCli,
  verifyPublicSearchResponseCheckpoint,
} from '../../scripts/architecture-v2/import-public-search-leads.mjs';

const RELEASE_ID = 'retail_lifecycle_release_6c42c754aeb1ff49097b32b4';

function packet() {
  return buildPublicSearchResearchPacket({ targets: [{
    targetId: 'target-samsung', referenceId: 'ref-samsung', category: 'fridge',
    brand: 'Samsung', exactModel: 'SRF5300SD', lifecycleState: 'CURRENT_RETAIL',
    activeReleaseId: RELEASE_ID, activeReleaseSha256: 'a'.repeat(64),
    approvedOfficialHostSuffixes: ['samsung.com'],
  }] });
}

test('checkpoint paths require an explicit storage root', () => {
  assert.throws(() => publicSearchCheckpointPaths({
    storageRoot: '', runId: 'run-missing-root', queryId: 'query-missing-root',
  }), /storage root required/i);
});

test('checkpoint stores exact response bytes and atomically binds a verified query pointer', async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), 'public-search-checkpoint-'));
  const researchPacket = packet();
  const query = researchPacket.queries[0];
  const raw = Buffer.from('{\n  "results": [{"rank": 1, "title": "Samsung", "url": "https://www.samsung.com/au/SRF5300SD", "snippet": "Official"}]\n}\n');

  const saved = await checkpointPublicSearchResponse({
    storageRoot, runId: 'run-001', packet: researchPacket, query,
    rawResponseBytes: raw, capturedAt: '2026-08-05T10:00:00.000Z',
  });
  const paths = publicSearchCheckpointPaths({
    storageRoot, runId: 'run-001', queryId: query.queryId,
    responseObjectSha256: saved.pointer.responseObjectSha256,
  });
  assert.deepEqual(await readFile(paths.objectPath), raw);
  const verified = await verifyPublicSearchResponseCheckpoint({
    storageRoot, runId: 'run-001', packet: researchPacket, query,
  });
  assert.deepEqual(verified.rawResponseBytes, raw);

  const resumed = await checkpointPublicSearchResponse({
    storageRoot, runId: 'run-001', packet: researchPacket, query,
    rawResponseBytes: raw, capturedAt: '2026-08-05T10:01:00.000Z',
  });
  assert.equal(resumed.status, 'RESUMED_VERIFIED');
  assert.deepEqual(resumed.pointer, saved.pointer);
});

test('checkpoint binds invalid response bytes before typed import rejection', async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), 'public-search-invalid-'));
  const researchPacket = packet();
  const query = researchPacket.queries[0];
  const raw = Buffer.from('provider transport failed\n<not-json>\n');

  await checkpointPublicSearchResponse({
    storageRoot, runId: 'run-invalid', packet: researchPacket, query,
    rawResponseBytes: raw, capturedAt: '2026-08-05T10:00:00.000Z',
  });
  const verified = await verifyPublicSearchResponseCheckpoint({
    storageRoot, runId: 'run-invalid', packet: researchPacket, query,
  });
  assert.deepEqual(verified.rawResponseBytes, raw);
  await assert.rejects(
    importPublicSearchLeadsFromCheckpoint({
      storageRoot, runId: 'run-invalid', packet: researchPacket, query,
    }),
    (error) => error.code === 'RESPONSE_ENVELOPE_UNSUPPORTED',
  );
});

test('CLI response dash checkpoints exact stdin bytes before importing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'public-search-stdin-'));
  const storageRoot = join(root, 'storage');
  const packetPath = join(root, 'packet.json');
  const outputPath = join(root, 'leads.json');
  const researchPacket = packet();
  const query = researchPacket.queries[0];
  const raw = Buffer.from('{\n "results" : [ { "rank":1, "title":"Samsung", "url":"https://www.samsung.com/au/SRF5300SD", "snippet":"stdin" } ]\n}\n');
  await writeFile(packetPath, JSON.stringify(researchPacket));

  await runImportCli([
    '--packet', packetPath,
    '--query-id', query.queryId,
    '--response', '-',
    '--storage-root', storageRoot,
    '--run-id', 'run-stdin',
    '--captured-at', '2026-08-05T10:00:00.000Z',
    '--output', outputPath,
  ], {
    stdin: Readable.from([raw.subarray(0, 17), raw.subarray(17)]),
  });

  const verified = await verifyPublicSearchResponseCheckpoint({
    storageRoot, runId: 'run-stdin', packet: researchPacket, query,
  });
  assert.deepEqual(verified.rawResponseBytes, raw);
});

test('missing pointer and tampered object fail closed before lead import', async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), 'public-search-tamper-'));
  const researchPacket = packet();
  const query = researchPacket.queries[0];
  await assert.rejects(
    verifyPublicSearchResponseCheckpoint({ storageRoot, runId: 'run-002', packet: researchPacket, query }),
    (error) => error.code === 'QUERY_POINTER_MISSING',
  );

  const saved = await checkpointPublicSearchResponse({
    storageRoot, runId: 'run-002', packet: researchPacket, query,
    rawResponseBytes: Buffer.from('{"results":[]}'), capturedAt: '2026-08-05T10:00:00.000Z',
  });
  const paths = publicSearchCheckpointPaths({
    storageRoot, runId: 'run-002', queryId: query.queryId,
    responseObjectSha256: saved.pointer.responseObjectSha256,
  });
  await writeFile(paths.objectPath, Buffer.from('{"results":{}}'));
  await assert.rejects(
    importPublicSearchLeadsFromCheckpoint({ storageRoot, runId: 'run-002', packet: researchPacket, query }),
    (error) => error.code === 'RESPONSE_OBJECT_HASH_MISMATCH',
  );
});

test('verified import preserves untrusted rows and rejects duplicate ranks without authority', async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), 'public-search-import-'));
  const researchPacket = packet();
  const query = researchPacket.queries[0];
  const raw = Buffer.from(JSON.stringify({ results: [
    { rank: 1, title: 'Official', url: 'https://www.samsung.com/au/SRF5300SD', snippet: 'One' },
    { rank: 1, title: 'Duplicate', url: 'https://retailer.example/SRF5300SD', snippet: 'Two' },
  ] }));
  await checkpointPublicSearchResponse({
    storageRoot, runId: 'run-003', packet: researchPacket, query,
    rawResponseBytes: raw, capturedAt: '2026-08-05T10:00:00.000Z',
  });
  const imported = await importPublicSearchLeadsFromCheckpoint({
    storageRoot, runId: 'run-003', packet: researchPacket, query,
  });

  assert.equal(imported.leads.length, 2);
  assert.ok(imported.leads.every((lead) => !Object.hasOwn(lead, 'authority')));
  assert.ok(imported.leads.every((lead) => lead.state.reasonCode === 'DUPLICATE_RESULT_RANK'));
});

test('verified import decodes the exact AnySearch CLI markdown envelope as untrusted leads', async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), 'public-search-markdown-'));
  const researchPacket = packet();
  const query = researchPacket.queries[0];
  const raw = Buffer.from([
    '## Search Results (2 results, 1796ms)',
    '',
    '### 1. Samsung SRF5300SD refrigerator',
    '- **URL**: https://www.samsung.com/au/refrigerators/srf5300sd',
    '- Official product page snippet',
    '',
    '### 2. Retailer listing',
    '- **URL**: https://retailer.example/srf5300sd',
    '- Retailer copy remains non-authoritative',
    '',
  ].join('\n'));
  await checkpointPublicSearchResponse({
    storageRoot, runId: 'run-markdown', packet: researchPacket, query,
    rawResponseBytes: raw, capturedAt: '2026-08-05T10:00:00.000Z',
  });

  const imported = await importPublicSearchLeadsFromCheckpoint({
    storageRoot, runId: 'run-markdown', packet: researchPacket, query,
  });

  assert.deepEqual(imported.leads.map((lead) => ({
    rank: lead.result.rank,
    title: lead.result.title,
    url: lead.result.url,
    snippet: lead.result.snippet,
    status: lead.state.status,
  })), [
    {
      rank: 1,
      title: 'Samsung SRF5300SD refrigerator',
      url: 'https://www.samsung.com/au/refrigerators/srf5300sd',
      snippet: 'Official product page snippet',
      status: 'UNVALIDATED',
    },
    {
      rank: 2,
      title: 'Retailer listing',
      url: 'https://retailer.example/srf5300sd',
      snippet: 'Retailer copy remains non-authoritative',
      status: 'UNVALIDATED',
    },
  ]);
  assert.ok(imported.leads.every((lead) => !Object.hasOwn(lead, 'authority')));
});

test('AnySearch markdown rejects structural corruption and preserves incomplete rows as rejected', async (t) => {
  const structuralCases = [
    ['malformed header', [
      '## Search Results',
      '',
      '### 1. Title',
      '- **URL**: https://www.samsung.com/au/SRF5300SD',
      '- snippet',
    ], 'RESPONSE_ENVELOPE_UNSUPPORTED'],
    ['non-contiguous rank', [
      '## Search Results (2 results, 1ms)',
      '',
      '### 1. One',
      '- **URL**: https://example.com/one',
      '- one',
      '',
      '### 3. Three',
      '- **URL**: https://example.com/three',
      '- three',
    ], 'RESPONSE_MARKDOWN_RANK_INVALID'],
    ['duplicate rank', [
      '## Search Results (2 results, 1ms)',
      '',
      '### 1. One',
      '- **URL**: https://example.com/one',
      '- one',
      '',
      '### 1. Again',
      '- **URL**: https://example.com/again',
      '- again',
    ], 'RESPONSE_MARKDOWN_RANK_INVALID'],
    ['count mismatch', [
      '## Search Results (2 results, 1ms)',
      '',
      '### 1. One',
      '- **URL**: https://example.com/one',
      '- one',
    ], 'RESPONSE_MARKDOWN_COUNT_MISMATCH'],
    ['unexpected trailing structure', [
      '## Search Results (1 results, 1ms)',
      '',
      '### 1. One',
      '- **URL**: https://example.com/one',
      '- one',
      '- unexpected extra row content',
    ], 'RESPONSE_MARKDOWN_STRUCTURE_INVALID'],
  ];

  for (const [name, lines, expectedCode] of structuralCases) {
    await t.test(name, async () => {
      const storageRoot = await mkdtemp(join(tmpdir(), 'public-search-markdown-invalid-'));
      const researchPacket = packet();
      const query = researchPacket.queries[0];
      await checkpointPublicSearchResponse({
        storageRoot, runId: `run-${name.replaceAll(' ', '-')}`, packet: researchPacket, query,
        rawResponseBytes: Buffer.from(`${lines.join('\n')}\n`),
        capturedAt: '2026-08-05T10:00:00.000Z',
      });
      await assert.rejects(
        importPublicSearchLeadsFromCheckpoint({
          storageRoot, runId: `run-${name.replaceAll(' ', '-')}`, packet: researchPacket, query,
        }),
        (error) => error.code === expectedCode,
      );
    });
  }

  const incompleteRows = [
    ['title', '### 1.', '- **URL**: https://example.com/one', '- one', '[missing title]'],
    ['URL', '### 1. One', '- **URL**:', '- one', '[missing URL]'],
    ['snippet', '### 1. One', '- **URL**: https://example.com/one', null, '[missing snippet]'],
  ];
  for (const [field, heading, url, snippet, placeholder] of incompleteRows) {
    await t.test(`missing ${field} becomes a rejected preserved row`, async () => {
      const storageRoot = await mkdtemp(join(tmpdir(), 'public-search-markdown-missing-'));
      const researchPacket = packet();
      const query = researchPacket.queries[0];
      const lines = [
        '## Search Results (1 results, 1ms)',
        '',
        heading,
        url,
      ];
      if (snippet !== null) lines.push(snippet);
      lines.push('');
      await checkpointPublicSearchResponse({
        storageRoot, runId: `run-missing-${field.toLowerCase()}`, packet: researchPacket, query,
        rawResponseBytes: Buffer.from(lines.join('\n')),
        capturedAt: '2026-08-05T10:00:00.000Z',
      });
      const imported = await importPublicSearchLeadsFromCheckpoint({
        storageRoot, runId: `run-missing-${field.toLowerCase()}`, packet: researchPacket, query,
      });
      assert.equal(imported.leads.length, 1);
      assert.equal(imported.leads[0].result[field.toLowerCase()], placeholder);
      assert.equal(imported.leads[0].state.reasonCode, 'MALFORMED_RESULT');
    });
  }
});

test('provider result overflow is preserved but every row remains rejected', async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), 'public-search-overflow-'));
  const researchPacket = packet();
  const query = researchPacket.queries[0];
  const results = Array.from({ length: 6 }, (_, index) => ({
    rank: index + 1,
    title: `Result ${index + 1}`,
    url: `https://www.samsung.com/au/SRF5300SD?result=${index + 1}`,
    snippet: 'Untrusted result',
  }));
  await checkpointPublicSearchResponse({
    storageRoot, runId: 'run-004', packet: researchPacket, query,
    rawResponseBytes: Buffer.from(JSON.stringify({ results })),
    capturedAt: '2026-08-05T10:00:00.000Z',
  });
  const imported = await importPublicSearchLeadsFromCheckpoint({
    storageRoot, runId: 'run-004', packet: researchPacket, query,
  });
  assert.equal(imported.leads.length, 6);
  assert.ok(imported.leads.every((lead) => lead.state.reasonCode === 'RESULT_SET_LIMIT_EXCEEDED'));
});
