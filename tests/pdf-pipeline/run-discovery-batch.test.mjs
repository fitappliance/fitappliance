import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);

const {
  loadDiscoveryTargets,
} = require('../../scripts/pdf-pipeline/run-discovery-batch.js');

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

test('discovery batch loads unapproved discovery candidates from any supported retailer', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fitappliance-discovery-batch-'));
  const manifestPath = path.join(tmp, 'manual-evidence.json');
  writeJson(manifestPath, {
    schema_version: 1,
    products: {
      'ao-1': {
        category: 'fridge',
        brand: 'LG',
        model: 'GF-A',
        source_url: 'https://example.com/a.pdf',
        status: 'candidate',
        discovery: { retailer_key: 'appliancesonline' },
        product: { id: 'ao-1', cat: 'fridge', brand: 'LG', model: 'GF-A' }
      },
      'ao-2': {
        category: 'fridge',
        brand: 'LG',
        model: 'GF-B',
        source_url: 'https://example.com/b.pdf',
        has_pdf_evidence: true,
        discovery: { retailer_key: 'appliancesonline' },
        product: { id: 'ao-2', cat: 'fridge', brand: 'LG', model: 'GF-B' }
      },
      'manual-1': {
        category: 'fridge',
        brand: 'LG',
        model: 'GF-C',
        source_url: 'https://example.com/c.pdf',
        product: { id: 'manual-1', cat: 'fridge', brand: 'LG', model: 'GF-C' }
      },
      'manual-catalog-1': {
        category: 'fridge',
        brand: 'Samsung',
        model: 'SRF7300BSS',
        source_url: 'https://example.com/srf7300bss.pdf',
        status: 'candidate',
        manual_catalog_entry: true,
        product: { id: 'manual-catalog-1', cat: 'fridge', brand: 'Samsung', model: 'SRF7300BSS' }
      },
      'jb-1': {
        category: 'fridge',
        brand: 'Bosch',
        model: 'KFD96AXEAA',
        source_url: 'https://example.com/bosch.pdf',
        status: 'candidate',
        discovery: { retailer_key: 'jb-hi-fi' },
        product: { id: 'jb-1', cat: 'fridge', brand: 'Bosch', model: 'KFD96AXEAA' }
      },
      'fp-needs-source': {
        category: 'fridge',
        brand: 'Fisher & Paykel',
        model: 'RF500QNB1',
        status: 'needs_source',
        discovery: { retailer_key: 'the-good-guys' },
        product: { id: 'fp-needs-source', cat: 'fridge', brand: 'Fisher & Paykel', model: 'RF500QNB1' }
      },
      'lg-needs-source': {
        category: 'fridge',
        brand: 'LG',
        model: 'GF-A',
        status: 'needs_source',
        discovery: { retailer_key: 'the-good-guys' },
        product: { id: 'lg-needs-source', cat: 'fridge', brand: 'LG', model: 'GF-A' }
      }
    }
  });

  const targets = loadDiscoveryTargets({ manualEvidencePath: manifestPath });

  assert.deepEqual(targets.map((target) => target.id), [
    'ao-1',
    'manual-catalog-1',
    'jb-1',
    'fp-needs-source'
  ]);
});
