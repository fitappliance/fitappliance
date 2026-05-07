import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const repoRoot = process.cwd();
const manifestPath = path.join(repoRoot, 'data', 'manual-evidence.json');
const scriptPath = path.join(repoRoot, 'scripts', 'manual-evidence.js');
const packagePath = path.join(repoRoot, 'package.json');
const docsPath = path.join(repoRoot, 'docs', 'manual-evidence-pipeline.md');
const manualEvidence = require(scriptPath);

test('manual evidence: manifest declares external storage metadata and seeded PDF evidence', () => {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  assert.equal(manifest.schema_version, 1);
  assert.equal(manifest.storage.root_env, 'FITAPPLIANCE_EVIDENCE_ROOT');
  assert.equal(manifest.storage.default_root, '/Volumes/绿联扩展1T/FitAppliance/manual-evidence');
  assert.deepEqual(manifest.storage.required_dirs, ['pdf', 'extracted', 'approved', 'rejected']);
  assert.equal(typeof manifest.products, 'object');
  assert.ok(Object.keys(manifest.products).length >= 1);

  const hrtf206 = manifest.products['fridge-arf3335'];
  assert.equal(hrtf206.brand, 'Hisense');
  assert.equal(hrtf206.model, 'HRTF206');
  assert.equal(hrtf206.evidence[0].type, 'spec_sheet');
  assert.equal(hrtf206.evidence[0].status, 'approved');
  assert.equal(hrtf206.evidence[0].extracted.dimensions.width_mm, 550);
  assert.equal(hrtf206.evidence[0].extracted.dimensions.height_mm, 1456);
  assert.equal(hrtf206.evidence[0].extracted.dimensions.depth_mm, 562);
  assert.equal(hrtf206.evidence[0].extracted.clearance_requirements.left_mm, 50);
});

test('manual evidence: validateManualEvidenceDocument reports schema problems without throwing', () => {
  assert.deepEqual(
    manualEvidence.validateManualEvidenceDocument({
      schema_version: 1,
      storage: {
        root_env: 'FITAPPLIANCE_EVIDENCE_ROOT',
        default_root: '/tmp/evidence',
        required_dirs: ['pdf', 'extracted', 'approved', 'rejected'],
      },
      products: {},
    }),
    [],
  );

  const issues = manualEvidence.validateManualEvidenceDocument({
    schema_version: 1,
    storage: {},
    products: {
      'fridge-demo': {
        evidence: [{ type: 'bad', status: 'candidate', source_url: 'not a url' }],
      },
    },
  });

  assert.ok(issues.some((issue) => issue.includes('storage.default_root')));
  assert.ok(issues.some((issue) => issue.includes('unsupported evidence type')));
  assert.ok(issues.some((issue) => issue.includes('source_url')));
});

test('manual evidence: evidence root prefers env and defaults to the Ugreen 1T volume', () => {
  assert.equal(
    manualEvidence.getEvidenceRoot({}),
    '/Volumes/绿联扩展1T/FitAppliance/manual-evidence',
  );
  assert.equal(
    manualEvidence.getEvidenceRoot({ FITAPPLIANCE_EVIDENCE_ROOT: '/tmp/fa-evidence' }),
    '/tmp/fa-evidence',
  );
});

test('manual evidence: candidate insert is immutable and builds stable PDF storage paths', () => {
  const manifest = {
    schema_version: 1,
    storage: {
      root_env: 'FITAPPLIANCE_EVIDENCE_ROOT',
      default_root: '/tmp/evidence',
      required_dirs: ['pdf', 'extracted', 'approved', 'rejected'],
    },
    products: {},
  };

  const next = manualEvidence.addEvidenceCandidate(manifest, {
    slug: 'fridge-hisense-hrcd640tbw',
    category: 'fridge',
    brand: 'Hisense',
    model: 'HRCD640TBW',
    type: 'manufacturer_manual',
    sourceUrl: 'https://example.com/manuals/HRCD640TBW.pdf',
    verifiedAt: '2026-05-07',
  });

  assert.equal(Object.keys(manifest.products).length, 0, 'input manifest must not be mutated');
  assert.equal(next.products['fridge-hisense-hrcd640tbw'].brand, 'Hisense');
  assert.equal(next.products['fridge-hisense-hrcd640tbw'].model, 'HRCD640TBW');
  assert.equal(next.products['fridge-hisense-hrcd640tbw'].evidence.length, 1);
  assert.match(
    next.products['fridge-hisense-hrcd640tbw'].evidence[0].local_path,
    /^pdf\/fridge\/hisense\/hrcd640tbw-[a-f0-9]{8}\.pdf$/,
  );
  assert.equal(next.products['fridge-hisense-hrcd640tbw'].evidence[0].status, 'candidate');
});

test('manual evidence: init-root and check-root CLI work on a temp directory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fitappliance-evidence-'));

  execFileSync(process.execPath, [scriptPath, 'init-root', '--root', root], {
    cwd: repoRoot,
    stdio: 'pipe',
  });

  for (const dir of ['pdf', 'extracted', 'approved', 'rejected']) {
    assert.ok(fs.statSync(path.join(root, dir)).isDirectory(), `${dir} should be created`);
  }

  const output = execFileSync(process.execPath, [scriptPath, 'check-root', '--root', root], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  assert.match(output, /manual evidence root ok/);
});

test('manual evidence: package script and operator docs describe the pipeline', () => {
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const docs = fs.readFileSync(docsPath, 'utf8');

  assert.equal(pkg.scripts['manual-evidence'], 'node scripts/manual-evidence.js');
  assert.match(docs, /FITAPPLIANCE_EVIDENCE_ROOT/);
  assert.match(docs, /\/Volumes\/绿联扩展1T\/FitAppliance\/manual-evidence/);
  assert.match(docs, /manufacturer installation PDF/i);
  assert.match(docs, /Do not commit PDF/i);
});
