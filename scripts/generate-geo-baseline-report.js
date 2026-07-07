#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_OUTPUT_PATH = path.join('reports', 'geo', 'baseline-latest.json');

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return loadJson(filePath);
}

function routeToHtmlPath(route, repoRoot = path.resolve(__dirname, '..')) {
  const cleanRoute = String(route ?? '').replace(/^\/+/, '').replace(/\/+$/, '');
  if (!cleanRoute) return path.join(repoRoot, 'index.html');
  return path.join(repoRoot, 'pages', `${cleanRoute}.html`);
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function routeSet(rows = []) {
  return new Set(rows.map((row) => row.route).filter(Boolean));
}

function collectQueryRoutes(querySet) {
  const treatmentRoutes = [];
  const controlRoutes = [];

  for (const query of querySet.queries ?? []) {
    treatmentRoutes.push(...(query.treatment_routes ?? []));
    controlRoutes.push(...(query.control_routes ?? []));
  }

  return {
    treatmentRoutes: uniqueSorted(treatmentRoutes),
    controlRoutes: uniqueSorted(controlRoutes),
    allRoutes: uniqueSorted([...treatmentRoutes, ...controlRoutes])
  };
}

function missingRouteRecords(routes, repoRoot) {
  return routes
    .map((route) => ({
      route,
      file: path.relative(repoRoot, routeToHtmlPath(route, repoRoot)).replace(/\\/g, '/'),
      exists: fs.existsSync(routeToHtmlPath(route, repoRoot))
    }))
    .filter((row) => !row.exists);
}

function diffRoutes(expectedRoutes, coveredRoutes) {
  const covered = new Set(coveredRoutes);
  return uniqueSorted([...expectedRoutes].filter((route) => !covered.has(route)));
}

function foreignRoutes(coveredRoutes, expectedRoutes) {
  const expected = new Set(expectedRoutes);
  return uniqueSorted(coveredRoutes.filter((route) => !expected.has(route)));
}

function summarizeSchemaValidation(report) {
  if (!report) return null;
  return {
    method: report.method ?? null,
    pagesChecked: report.pagesChecked ?? null,
    jsonLdBlocks: report.jsonLdBlocks ?? null,
    errors: report.errors ?? null
  };
}

function summarizeReport(report) {
  if (!report) return null;
  return {
    method: report.method ?? null,
    generatedAt: report.generatedAt ?? report.runAt ?? null,
    summary: report.summary ?? null
  };
}

function buildSourceReports(repoRoot) {
  return {
    schemaValidation: summarizeSchemaValidation(loadJsonIfExists(path.join(repoRoot, 'reports', 'schema-validation.json'))),
    dimensionAxis: summarizeReport(loadJsonIfExists(path.join(repoRoot, 'reports', 'dimension-axis', 'latest.json'))),
    gscGenerativeAiImport: summarizeReport(loadJsonIfExists(path.join(repoRoot, 'reports', 'gsc-genai-import', 'latest.json')))
  };
}

async function generateGeoBaselineReport({
  repoRoot = path.resolve(__dirname, '..'),
  querySetPath = path.join(repoRoot, 'data', 'geo-query-set.json'),
  manifestPath = path.join(repoRoot, 'data', 'geo-treatment-pages.json'),
  outputPath = path.join(repoRoot, DEFAULT_OUTPUT_PATH),
  write = true,
  generatedAt = new Date().toISOString(),
  logger = console
} = {}) {
  const querySet = loadJson(querySetPath);
  const manifest = loadJson(manifestPath);
  const expectedTreatmentRoutes = routeSet(manifest.treatment);
  const expectedControlRoutes = routeSet(manifest.controls);
  const queryRoutes = collectQueryRoutes(querySet);
  const missingRoutes = missingRouteRecords(queryRoutes.allRoutes, repoRoot);
  const uncoveredTreatmentRoutes = diffRoutes(expectedTreatmentRoutes, queryRoutes.treatmentRoutes);
  const uncoveredControlRoutes = diffRoutes(expectedControlRoutes, queryRoutes.controlRoutes);
  const foreignTreatmentRoutes = foreignRoutes(queryRoutes.treatmentRoutes, expectedTreatmentRoutes);
  const foreignControlRoutes = foreignRoutes(queryRoutes.controlRoutes, expectedControlRoutes);
  const blockers = [
    ...missingRoutes.map((row) => ({
      code: 'route_html_missing',
      route: row.route,
      file: row.file
    })),
    ...uncoveredTreatmentRoutes.map((route) => ({
      code: 'manifest_treatment_route_uncovered',
      route
    })),
    ...uncoveredControlRoutes.map((route) => ({
      code: 'manifest_control_route_uncovered',
      route
    })),
    ...foreignTreatmentRoutes.map((route) => ({
      code: 'query_treatment_route_not_in_manifest',
      route
    })),
    ...foreignControlRoutes.map((route) => ({
      code: 'query_control_route_not_in_manifest',
      route
    }))
  ];

  const report = {
    schema_version: 1,
    method: 'phase43-geo-baseline',
    generatedAt,
    querySet: {
      experiment: querySet.experiment,
      frozen_at: querySet.frozen_at,
      baseline: querySet.baseline,
      observation: querySet.observation,
      engines: querySet.engines,
      capture_requirements: querySet.capture_requirements
    },
    summary: {
      queryCount: (querySet.queries ?? []).length,
      treatmentRouteCount: expectedTreatmentRoutes.size,
      controlRouteCount: expectedControlRoutes.size,
      coveredTreatmentRouteCount: queryRoutes.treatmentRoutes.length,
      coveredControlRouteCount: queryRoutes.controlRoutes.length,
      missingRouteCount: missingRoutes.length,
      blockerCount: blockers.length
    },
    coverage: {
      treatmentRoutes: queryRoutes.treatmentRoutes,
      controlRoutes: queryRoutes.controlRoutes,
      missingRoutes,
      uncoveredTreatmentRoutes,
      uncoveredControlRoutes,
      foreignTreatmentRoutes,
      foreignControlRoutes
    },
    sourceReports: buildSourceReports(repoRoot),
    blockers
  };

  if (write) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    logger.log(`[geo-baseline] wrote ${path.relative(repoRoot, outputPath).replace(/\\/g, '/')}`);
  }

  logger.log(`[geo-baseline] queries=${report.summary.queryCount} treatment=${report.summary.coveredTreatmentRouteCount}/${report.summary.treatmentRouteCount} controls=${report.summary.coveredControlRouteCount}/${report.summary.controlRouteCount} blockers=${report.summary.blockerCount}`);
  return report;
}

function parseArgs(argv) {
  const args = {
    write: true,
    outputPath: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--no-write') {
      args.write = false;
    } else if (arg === '--output') {
      args.outputPath = argv[index + 1];
      index += 1;
    } else if (arg.startsWith('--output=')) {
      args.outputPath = arg.split('=').slice(1).join('=');
    } else if (arg === '--help') {
      args.help = true;
    }
  }

  return args;
}

async function runCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log('Usage: node scripts/generate-geo-baseline-report.js [--no-write] [--output reports/geo/baseline-latest.json]');
    return 0;
  }

  const repoRoot = path.resolve(__dirname, '..');
  const report = await generateGeoBaselineReport({
    repoRoot,
    write: args.write,
    outputPath: args.outputPath ? path.resolve(repoRoot, args.outputPath) : path.join(repoRoot, DEFAULT_OUTPUT_PATH)
  });

  return report.summary.blockerCount > 0 ? 1 : 0;
}

if (require.main === module) {
  runCli().then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((error) => {
    console.error(`[geo-baseline] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  collectQueryRoutes,
  generateGeoBaselineReport,
  loadJson,
  routeToHtmlPath
};
