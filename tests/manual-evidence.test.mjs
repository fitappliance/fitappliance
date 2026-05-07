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
  assert.equal(manifest.storage.root_env, 'EVIDENCE_ROOT_DIR');
  assert.doesNotMatch(JSON.stringify(manifest), /\/Volumes\//);
  assert.match(manifest.storage.path_rule, /relative/i);
  assert.equal(typeof manifest.products, 'object');
  assert.ok(Object.keys(manifest.products).length >= 1);

  const hrtf206 = manifest.products['fridge-arf3335'];
  assert.equal(hrtf206.brand, 'Hisense');
  assert.equal(hrtf206.model, 'HRTF206');
  assert.equal(hrtf206.evidence[0].type, 'spec_sheet');
  assert.equal(hrtf206.evidence[0].status, 'approved');
  assert.equal(hrtf206.evidence[0].local_path, 'hisense/hrtf206-ff22c779.pdf');
  assert.equal(path.isAbsolute(hrtf206.evidence[0].local_path), false);
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
        root_env: 'EVIDENCE_ROOT_DIR',
        path_rule: 'local_path is relative to EVIDENCE_ROOT_DIR',
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

  assert.ok(issues.some((issue) => issue.includes('storage.path_rule')));
  assert.ok(issues.some((issue) => issue.includes('unsupported evidence type')));
  assert.ok(issues.some((issue) => issue.includes('source_url')));
});

test('manual evidence: evidence root comes from env or .env.local instead of a hardcoded volume', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fitappliance-evidence-env-'));
  fs.writeFileSync(path.join(tmp, '.env.local'), 'EVIDENCE_ROOT_DIR="/tmp/from-dotenv"\n');

  assert.equal(
    manualEvidence.getEvidenceRoot({}),
    '',
  );
  assert.equal(
    manualEvidence.getEvidenceRoot({ EVIDENCE_ROOT_DIR: '/tmp/fa-evidence' }),
    '/tmp/fa-evidence',
  );
  assert.equal(
    manualEvidence.getEvidenceRoot({}, { repoRoot: tmp }),
    '/tmp/from-dotenv',
  );
});

test('manual evidence: candidate insert is immutable and builds stable PDF storage paths', () => {
  const manifest = {
    schema_version: 1,
    storage: {
      root_env: 'EVIDENCE_ROOT_DIR',
      path_rule: 'local_path is relative to EVIDENCE_ROOT_DIR',
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
    /^hisense\/hrcd640tbw-[a-f0-9]{8}\.pdf$/,
  );
  assert.equal(next.products['fridge-hisense-hrcd640tbw'].evidence[0].status, 'candidate');
});

test('manual evidence: init-root and check-root CLI work on a temp directory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fitappliance-evidence-'));

  execFileSync(process.execPath, [scriptPath, 'init-root', '--root', root], {
    cwd: repoRoot,
    stdio: 'pipe',
  });

  assert.ok(fs.statSync(root).isDirectory(), 'evidence root should be created');

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
  assert.match(docs, /EVIDENCE_ROOT_DIR/);
  assert.match(docs, /relative local_path/i);
  assert.match(docs, /manufacturer installation PDF/i);
  assert.match(docs, /Do not commit PDF/i);
});
