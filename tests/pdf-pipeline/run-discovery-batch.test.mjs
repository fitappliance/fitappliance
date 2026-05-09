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

test('discovery batch loads only unapproved Appliances Online discovery candidates', () => {
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
      }
    }
  });

  const targets = loadDiscoveryTargets({ manualEvidencePath: manifestPath });

  assert.equal(targets.length, 1);
  assert.equal(targets[0].id, 'ao-1');
  assert.equal(targets[0].sku, 'GF-A');
});
