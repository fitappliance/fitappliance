import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {
  buildEvidenceIndex,
  buildEvidenceIndexFromFile
} = await import(`file://${path.join(repoRoot, 'scripts', 'build-evidence-index.js')}`);

test('buildEvidenceIndex creates a deterministic slim map from approved evidence entries', () => {
  const manifest = {
    products: {
      'fridge-b': {
        evidence: [{
          status: 'approved',
          type: 'spec_sheet',
          source_url: 'https://example.com/b.pdf',
          verified_at: '2026-05-04T12:30:00+08:00'
        }]
      },
      'fridge-a': {
        evidence: [{
          status: 'candidate',
          source_url: 'https://example.com/ignore.pdf',
          verified_at: '2026-05-01'
        }, {
          status: 'approved',
          type: 'installation_manual',
          source_url: 'https://example.com/a.pdf',
          verified_at: '2026-05-03'
        }]
      }
    }
  };

  const index = buildEvidenceIndex(manifest);
  assert.deepEqual(Object.keys(index), ['fridge-a', 'fridge-b']);
  assert.deepEqual(index['fridge-a'], {
    verified: true,
    pdfUrl: 'https://example.com/a.pdf',
    extractedAt: '2026-05-03',
    source: 'installation_manual'
  });
  assert.deepEqual(index['fridge-b'], {
    verified: true,
    pdfUrl: 'https://example.com/b.pdf',
    extractedAt: '2026-05-04',
    source: 'spec_sheet'
  });
});

test('buildEvidenceIndex skips malformed approved evidence and warns without crashing', () => {
  const warnings = [];
  const index = buildEvidenceIndex({
    products: {
      'fridge-bad': {
        evidence: [{
          status: 'approved',
          source_url: 'javascript:alert(1)',
          verified_at: '2026-05-04'
        }]
      }
    }
  }, { warn: (message) => warnings.push(message) });

  assert.deepEqual(index, {});
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /fridge-bad/);
});

test('buildEvidenceIndexFromFile writes stable JSON output', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'fitappliance-evidence-index-'));
  const inputPath = path.join(dir, 'manual-evidence.json');
  const outputPath = path.join(dir, 'evidence-index.json');
  writeFileSync(inputPath, JSON.stringify({
    products: {
      'dryer-test': {
        evidence: [{
          status: 'approved',
          source_url: 'https://example.com/dryer.pdf',
          verified_at: '2026-05-02'
        }]
      }
    }
  }), 'utf8');

  const result = buildEvidenceIndexFromFile({ inputPath, outputPath });
  const written = JSON.parse(readFileSync(outputPath, 'utf8'));
  assert.deepEqual(written, result);
  assert.equal(written['dryer-test'].pdfUrl, 'https://example.com/dryer.pdf');
});
