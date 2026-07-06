import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const repoRoot = process.cwd();
const scriptPath = path.join(repoRoot, 'scripts', 'import-gsc-generative-ai-export.js');
const packageJson = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

const {
  importGscGenerativeAiExports,
  parseCsvRows
} = require(scriptPath);

function createTempDir() {
  return mkdtempSync(path.join(tmpdir(), 'fitappliance-gsc-genai-'));
}

test('phase 43 GEO importer parses quoted CSV rows without adding a dependency', () => {
  const rows = parseCsvRows('Page,Impressions\n"/guides/fridge-clearance-requirements",12\n"/fit-check/a,b",3\n');

  assert.deepEqual(rows, [
    { Page: '/guides/fridge-clearance-requirements', Impressions: '12' },
    { Page: '/fit-check/a,b', Impressions: '3' }
  ]);
});

test('phase 43 GEO importer returns an empty report for a missing or empty export directory', async () => {
  const tmp = createTempDir();
  try {
    const report = await importGscGenerativeAiExports({ inputDir: path.join(tmp, 'missing') });

    assert.deepEqual(report, {
      schema_version: 1,
      source: 'gsc-generative-ai-export',
      summary: {
        totalImpressions: 0,
        pageRows: 0,
        countryRows: 0,
        deviceRows: 0,
        dateRows: 0
      },
      pages: [],
      countries: [],
      devices: [],
      dates: []
    });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('phase 43 GEO importer reads Page/Country/Device/Date exports and totals page impressions', async () => {
  const tmp = createTempDir();
  try {
    writeFileSync(path.join(tmp, 'Page.csv'), 'Page,Impressions\n/guides/fridge-clearance-requirements,12\n/fit-check/fisher-and-paykel-dw60uzt4b2-in-640mm-cavity,3\n');
    writeFileSync(path.join(tmp, 'Country.csv'), 'Country,Impressions\nAustralia,10\nUnited States,5\n');
    writeFileSync(path.join(tmp, 'Device.csv'), 'Device,Impressions\nDESKTOP,8\nMOBILE,7\n');
    writeFileSync(path.join(tmp, 'Date.csv'), 'Date,Impressions\n2026-07-06,15\n');

    const report = await importGscGenerativeAiExports({ inputDir: tmp });

    assert.equal(report.summary.totalImpressions, 15);
    assert.equal(report.summary.pageRows, 2);
    assert.equal(report.summary.countryRows, 2);
    assert.equal(report.summary.deviceRows, 2);
    assert.equal(report.summary.dateRows, 1);
    assert.deepEqual(report.pages[0], {
      page: '/guides/fridge-clearance-requirements',
      impressions: 12
    });
    assert.deepEqual(report.countries[0], {
      country: 'Australia',
      impressions: 10
    });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('phase 43 GEO importer rejects unsupported CSV headers', async () => {
  const tmp = createTempDir();
  try {
    writeFileSync(path.join(tmp, 'bad.csv'), 'Query,Clicks\nfridge fit,4\n');

    await assert.rejects(
      () => importGscGenerativeAiExports({ inputDir: tmp }),
      /unsupported GSC Generative AI CSV header/i
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('phase 43 GEO importer CLI writes JSON output and package script is wired', () => {
  const tmp = createTempDir();
  try {
    const inputDir = path.join(tmp, 'input');
    const outputPath = path.join(tmp, 'out', 'latest.json');
    mkdirSync(inputDir, { recursive: true });
    writeFileSync(path.join(inputDir, 'Page.csv'), 'Page,Impressions\n/guides/dishwasher-cavity-sizing,2\n');

    execFileSync(process.execPath, [scriptPath, '--input-dir', inputDir, '--output', outputPath], {
      cwd: repoRoot,
      stdio: 'pipe'
    });

    const written = JSON.parse(readFileSync(outputPath, 'utf8'));
    assert.equal(written.summary.totalImpressions, 2);
    assert.equal(packageJson.scripts['gsc-genai-import'], 'node scripts/import-gsc-generative-ai-export.js');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
