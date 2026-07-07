#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_OUTPUT_PATH = path.join('reports', 'geo', 'measurement-latest.json');
const DEFAULT_CITATION_LOG = path.join('docs', 'phase43-geo-experiment', 'geo-ai-citation-log.csv');

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return loadJson(filePath);
}

function normalizeRoute(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  let pathname = raw;
  try {
    pathname = new URL(raw).pathname;
  } catch {
    const queryIndex = pathname.indexOf('?');
    if (queryIndex !== -1) pathname = pathname.slice(0, queryIndex);
    const hashIndex = pathname.indexOf('#');
    if (hashIndex !== -1) pathname = pathname.slice(0, hashIndex);
  }

  const clean = `/${String(pathname).replace(/^\/+/, '').replace(/\/+$/, '')}`;
  return clean === '/' ? '/' : clean;
}

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

  for (let index = 0; index < String(csv ?? '').length; index += 1) {
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
  return {
    headers,
    rows: rows
      .filter((values) => values.some((value) => String(value).trim()))
      .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])))
  };
}

function parseCitationCsv(csv) {
  return parseCsvTable(csv).rows.map((row) => {
    const out = {};
    for (const [key, value] of Object.entries(row)) {
      out[key] = String(value ?? '').trim();
    }
    return out;
  });
}

function routeRowsFromManifest(manifest) {
  return [
    ...(manifest.treatment ?? []).map((row) => ({ ...row, group: 'treatment' })),
    ...(manifest.controls ?? []).map((row) => ({ ...row, group: 'control' }))
  ];
}

function buildQueriesByRoute(querySet) {
  const map = new Map();
  for (const query of querySet.queries ?? []) {
    for (const route of query.treatment_routes ?? []) {
      const normalized = normalizeRoute(route);
      if (!map.has(normalized)) map.set(normalized, []);
      map.get(normalized).push({
        id: query.id,
        query: query.query,
        intent: query.intent,
        engines: query.engines ?? []
      });
    }
    for (const route of query.control_routes ?? []) {
      const normalized = normalizeRoute(route);
      if (!map.has(normalized)) map.set(normalized, []);
      map.get(normalized).push({
        id: query.id,
        query: query.query,
        intent: query.intent,
        engines: query.engines ?? []
      });
    }
  }
  return map;
}

function sumGenAiByRoute(genAiReport) {
  const map = new Map();
  for (const row of genAiReport?.pages ?? []) {
    const route = normalizeRoute(row.page);
    if (!route) continue;
    map.set(route, (map.get(route) ?? 0) + Number(row.impressions ?? 0));
  }
  return map;
}

function emptyGscMetrics() {
  return {
    clicks: 0,
    impressions: 0,
    averagePosition: 0,
    rows: 0
  };
}

function sumGscByRoute(gscReport) {
  const map = new Map();
  for (const row of gscReport?.rows ?? []) {
    const route = normalizeRoute(row.page);
    if (!route) continue;
    if (!map.has(route)) {
      map.set(route, {
        clicks: 0,
        impressions: 0,
        weightedPosition: 0,
        rows: 0
      });
    }
    const bucket = map.get(route);
    const impressions = Number(row.impressions ?? 0);
    bucket.clicks += Number(row.clicks ?? 0);
    bucket.impressions += impressions;
    bucket.weightedPosition += Number(row.position ?? 0) * Math.max(1, impressions);
    bucket.rows += 1;
  }

  const out = new Map();
  for (const [route, row] of map.entries()) {
    out.set(route, {
      clicks: row.clicks,
      impressions: row.impressions,
      averagePosition: row.impressions > 0
        ? Number((row.weightedPosition / row.impressions).toFixed(2))
        : 0,
      rows: row.rows
    });
  }
  return out;
}

function isCorrectClaim(value) {
  return /^(?:correct|materially_correct|yes|true|1)$/i.test(String(value ?? '').trim());
}

function hasRequiredCitationFields(row) {
  return Boolean(row.date && row.engine && row.country && row.device && row.prompt);
}

function evaluateCitation(row, knownRoutes) {
  const expectedRoute = normalizeRoute(row.expected_route);
  const citedRoute = normalizeRoute(row.cited_url);
  const routeKnown = knownRoutes.has(citedRoute);
  const matchesExpected = Boolean(expectedRoute && citedRoute && expectedRoute === citedRoute);
  return {
    ...row,
    expected_route: expectedRoute,
    cited_route: citedRoute,
    useful: hasRequiredCitationFields(row) && matchesExpected && routeKnown && isCorrectClaim(row.claim_status)
  };
}

function summarizeManualCitations(citations, knownRoutes) {
  const byRoute = new Map();
  const evaluated = citations.map((row) => evaluateCitation(row, knownRoutes));
  for (const row of evaluated) {
    const route = normalizeRoute(row.expected_route);
    if (!route) continue;
    if (!byRoute.has(route)) {
      byRoute.set(route, {
        total: 0,
        useful: 0
      });
    }
    const bucket = byRoute.get(route);
    bucket.total += 1;
    if (row.useful) bucket.useful += 1;
  }
  return { evaluated, byRoute };
}

function addBucketValues(bucket, group, routeMetric) {
  const target = bucket[group];
  target.routeCount += 1;
  target.genAiImpressions += routeMetric.genAiImpressions;
  target.gscClicks += routeMetric.gsc.clicks;
  target.gscImpressions += routeMetric.gsc.impressions;
  target.usefulManualCitations += routeMetric.manualCitations.useful;
}

function emptyBucket(measurementBucket) {
  return {
    measurement_bucket: measurementBucket,
    treatment: {
      routeCount: 0,
      genAiImpressions: 0,
      gscClicks: 0,
      gscImpressions: 0,
      usefulManualCitations: 0
    },
    control: {
      routeCount: 0,
      genAiImpressions: 0,
      gscClicks: 0,
      gscImpressions: 0,
      usefulManualCitations: 0
    }
  };
}

function buildGeoMeasurementReport({
  manifest,
  querySet,
  genAiReport = null,
  gscReport = null,
  manualCitations = [],
  generatedAt = new Date().toISOString()
}) {
  const manifestRoutes = routeRowsFromManifest(manifest);
  const knownRoutes = new Set(manifestRoutes.map((row) => normalizeRoute(row.route)));
  const queriesByRoute = buildQueriesByRoute(querySet);
  const genAiByRoute = sumGenAiByRoute(genAiReport);
  const gscByRoute = sumGscByRoute(gscReport);
  const citationSummary = summarizeManualCitations(manualCitations, knownRoutes);
  const buckets = new Map();

  const routes = manifestRoutes.map((row) => {
    const route = normalizeRoute(row.route);
    const routeMetric = {
      route,
      group: row.group,
      template: row.template,
      measurement_bucket: row.measurement_bucket,
      primary_query: row.primary_query,
      querySet: queriesByRoute.get(route) ?? [],
      genAiImpressions: genAiByRoute.get(route) ?? 0,
      gsc: gscByRoute.get(route) ?? emptyGscMetrics(),
      manualCitations: citationSummary.byRoute.get(route) ?? { total: 0, useful: 0 }
    };

    if (!buckets.has(row.measurement_bucket)) {
      buckets.set(row.measurement_bucket, emptyBucket(row.measurement_bucket));
    }
    addBucketValues(buckets.get(row.measurement_bucket), row.group, routeMetric);
    return routeMetric;
  });

  const usefulManualCitationCount = citationSummary.evaluated.filter((row) => row.useful).length;
  const totalGenAiImpressions = routes.reduce((sum, row) => sum + row.genAiImpressions, 0);
  const totalGscImpressions = routes.reduce((sum, row) => sum + row.gsc.impressions, 0);
  const totalGscClicks = routes.reduce((sum, row) => sum + row.gsc.clicks, 0);

  return {
    schema_version: 1,
    method: 'phase43-geo-measurement',
    generatedAt,
    experiment: querySet.experiment ?? manifest.experiment ?? 'phase43-geo',
    querySet: {
      frozen_at: querySet.frozen_at ?? null,
      baseline: querySet.baseline ?? null,
      observation: querySet.observation ?? null,
      engines: querySet.engines ?? []
    },
    dataAvailability: {
      gscGenAiImport: {
        available: Boolean(genAiReport),
        pageRows: genAiReport?.summary?.pageRows ?? 0,
        totalImpressions: genAiReport?.summary?.totalImpressions ?? 0
      },
      gscSearchAnalytics: {
        available: Boolean(gscReport),
        rows: gscReport?.summary?.rowCount ?? 0,
        totalClicks: gscReport?.summary?.totalClicks ?? 0,
        totalImpressions: gscReport?.summary?.totalImpressions ?? 0
      },
      manualCitationLog: {
        available: manualCitations.length > 0,
        rows: manualCitations.length,
        usefulRows: usefulManualCitationCount
      }
    },
    summary: {
      queryCount: (querySet.queries ?? []).length,
      routeCount: routes.length,
      treatmentRouteCount: routes.filter((row) => row.group === 'treatment').length,
      controlRouteCount: routes.filter((row) => row.group === 'control').length,
      totalGenAiImpressions,
      totalGscClicks,
      totalGscImpressions,
      usefulManualCitationCount
    },
    buckets: [...buckets.values()].sort((left, right) => left.measurement_bucket.localeCompare(right.measurement_bucket)),
    routes: routes.sort((left, right) => left.route.localeCompare(right.route)),
    manualCitations: citationSummary.evaluated
  };
}

async function generateGeoMeasurementReport({
  repoRoot = path.resolve(__dirname, '..'),
  manifestPath = path.join(repoRoot, 'data', 'geo-treatment-pages.json'),
  querySetPath = path.join(repoRoot, 'data', 'geo-query-set.json'),
  genAiReportPath = path.join(repoRoot, 'reports', 'gsc-genai-import', 'latest.json'),
  gscReportPath = path.join(repoRoot, 'reports', 'gsc-latest.json'),
  citationLogPath = path.join(repoRoot, DEFAULT_CITATION_LOG),
  outputPath = path.join(repoRoot, DEFAULT_OUTPUT_PATH),
  write = true,
  generatedAt = new Date().toISOString(),
  logger = console
} = {}) {
  const manifest = loadJson(manifestPath);
  const querySet = loadJson(querySetPath);
  const genAiReport = loadJsonIfExists(genAiReportPath);
  const gscReport = loadJsonIfExists(gscReportPath);
  const citationText = fs.existsSync(citationLogPath) ? fs.readFileSync(citationLogPath, 'utf8') : '';
  const manualCitations = parseCitationCsv(citationText);
  const report = buildGeoMeasurementReport({
    manifest,
    querySet,
    genAiReport,
    gscReport,
    manualCitations,
    generatedAt
  });

  if (write) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    logger.log(`[geo-measurement] wrote ${path.relative(repoRoot, outputPath).replace(/\\/g, '/')}`);
  }

  logger.log(`[geo-measurement] routes=${report.summary.routeCount} genai=${report.summary.totalGenAiImpressions} gscClicks=${report.summary.totalGscClicks} usefulCitations=${report.summary.usefulManualCitationCount}`);
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
    console.log('Usage: node scripts/generate-geo-measurement-report.js [--no-write] [--output reports/geo/measurement-latest.json]');
    return 0;
  }

  const repoRoot = path.resolve(__dirname, '..');
  await generateGeoMeasurementReport({
    repoRoot,
    write: args.write,
    outputPath: args.outputPath ? path.resolve(repoRoot, args.outputPath) : path.join(repoRoot, DEFAULT_OUTPUT_PATH)
  });
  return 0;
}

if (require.main === module) {
  runCli().then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((error) => {
    console.error(`[geo-measurement] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  buildGeoMeasurementReport,
  generateGeoMeasurementReport,
  normalizeRoute,
  parseCitationCsv
};
