#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { mkdir, readFile, readdir, writeFile } = require('node:fs/promises');
const { existsSync } = require('node:fs');

const DEFAULT_INPUT_DIR = path.join(process.cwd(), 'reports', 'gsc-genai-exports');
const DEFAULT_OUTPUT_PATH = path.join(process.cwd(), 'reports', 'gsc-genai-import', 'latest.json');
const PRIMARY_HEADERS = Object.freeze(['Page', 'Country', 'Device', 'Date']);

function parseCsvTable(csv) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  const pushCell = () => {
    row.push(cell);
    cell = '';
  };
  const pushRow = () => {
    if (row.length > 0 || cell.length > 0) {
      pushCell();
      rows.push(row);
    }
    row = [];
  };

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ',' && !inQuotes) {
      pushCell();
      continue;
    }
    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      pushRow();
      continue;
    }
    cell += char;
  }
  if (row.length > 0 || cell.length > 0) pushRow();
  if (rows.length === 0) return { headers: [], rows: [] };

  const headers = rows.shift().map((header) => header.trim());
  const objects = rows
    .filter((values) => values.some((value) => value.trim() !== ''))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
  return { headers, rows: objects };
}

function parseCsvRows(csv) {
  return parseCsvTable(csv).rows;
}

function parseImpressions(value) {
  const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function classifyExport(headers, fileName) {
  const primary = PRIMARY_HEADERS.find((header) => headers.includes(header));
  if (!primary || !headers.includes('Impressions')) {
    throw new Error(`Unsupported GSC Generative AI CSV header in ${fileName}: ${headers.join(', ')}`);
  }
  return primary;
}

function emptyReport() {
  return {
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
  };
}

function appendRows(report, kind, rows) {
  if (kind === 'Page') {
    report.pages.push(...rows.map((row) => ({
      page: String(row.Page ?? '').trim(),
      impressions: parseImpressions(row.Impressions)
    })).filter((row) => row.page));
  }
  if (kind === 'Country') {
    report.countries.push(...rows.map((row) => ({
      country: String(row.Country ?? '').trim(),
      impressions: parseImpressions(row.Impressions)
    })).filter((row) => row.country));
  }
  if (kind === 'Device') {
    report.devices.push(...rows.map((row) => ({
      device: String(row.Device ?? '').trim(),
      impressions: parseImpressions(row.Impressions)
    })).filter((row) => row.device));
  }
  if (kind === 'Date') {
    report.dates.push(...rows.map((row) => ({
      date: String(row.Date ?? '').trim(),
      impressions: parseImpressions(row.Impressions)
    })).filter((row) => row.date));
  }
}

function finalizeReport(report) {
  return {
    ...report,
    summary: {
      totalImpressions: report.pages.reduce((sum, row) => sum + row.impressions, 0),
      pageRows: report.pages.length,
      countryRows: report.countries.length,
      deviceRows: report.devices.length,
      dateRows: report.dates.length
    }
  };
}

async function importGscGenerativeAiExports({ inputDir = DEFAULT_INPUT_DIR } = {}) {
  const report = emptyReport();
  if (!existsSync(inputDir)) return report;

  const files = (await readdir(inputDir))
    .filter((file) => file.toLowerCase().endsWith('.csv'))
    .sort();

  for (const file of files) {
    const csv = await readFile(path.join(inputDir, file), 'utf8');
    const table = parseCsvTable(csv);
    if (table.headers.length === 0) continue;
    appendRows(report, classifyExport(table.headers, file), table.rows);
  }

  return finalizeReport(report);
}

function parseArgs(argv) {
  const args = {
    inputDir: DEFAULT_INPUT_DIR,
    outputPath: DEFAULT_OUTPUT_PATH
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--input-dir') {
      args.inputDir = path.resolve(argv[index + 1]);
      index += 1;
    } else if (arg === '--output') {
      args.outputPath = path.resolve(argv[index + 1]);
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log('Usage: node scripts/import-gsc-generative-ai-export.js --input-dir reports/gsc-genai-exports --output reports/gsc-genai-import/latest.json');
    return;
  }

  const report = await importGscGenerativeAiExports({ inputDir: args.inputDir });
  await mkdir(path.dirname(args.outputPath), { recursive: true });
  await writeFile(args.outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`[gsc-genai-import] pages=${report.summary.pageRows} impressions=${report.summary.totalImpressions} output=${args.outputPath}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  importGscGenerativeAiExports,
  parseArgs,
  parseCsvRows
};
