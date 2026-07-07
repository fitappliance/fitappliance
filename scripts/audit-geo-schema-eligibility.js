#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_OUTPUT_PATH = path.join('reports', 'geo', 'schema-eligibility-latest.json');
const APPROVED_TOOL_SCHEMA_ROUTES = new Set(['/', '/tools/fit-checker']);
const TOOL_SCHEMA_TYPES = new Set(['SoftwareApplication', 'WebApplication']);
const REQUIRED_TOOL_FIELDS = [
  ['name', 'tool_schema_missing_name'],
  ['applicationCategory', 'tool_schema_missing_application_category'],
  ['operatingSystem', 'tool_schema_missing_operating_system'],
  ['url', 'tool_schema_missing_url'],
  ['description', 'tool_schema_missing_description']
];

function routeToHtmlPath(route, repoRoot = path.resolve(__dirname, '..')) {
  const cleanRoute = String(route ?? '').replace(/^\/+/, '').replace(/\/+$/, '');
  if (!cleanRoute) return path.join(repoRoot, 'index.html');
  return path.join(repoRoot, 'pages', `${cleanRoute}.html`);
}

function normalizeRouteFromFile(filePath, repoRoot) {
  const relative = path.relative(repoRoot, filePath).replace(/\\/g, '/');
  if (relative === 'index.html') return '/';
  if (relative.startsWith('pages/') && relative.endsWith('.html')) {
    return `/${relative.slice('pages/'.length, -'.html'.length)}`;
  }
  return `/${relative.replace(/\.html$/, '')}`;
}

function collapseWhitespace(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function stripHtmlForVisibleText(html) {
  const bodyMatch = String(html ?? '').match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  const body = bodyMatch ? bodyMatch[1] : html;
  return collapseWhitespace(String(body)
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' '));
}

function collectNodes(value) {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap((row) => collectNodes(row));

  const nodes = [value];
  if (Array.isArray(value['@graph'])) nodes.push(...value['@graph'].flatMap((row) => collectNodes(row)));
  return nodes;
}

function getNodeTypes(node) {
  const type = node?.['@type'];
  return (Array.isArray(type) ? type : type ? [type] : []).map((row) => String(row));
}

function extractJsonLd(html) {
  const blocks = [];
  const matches = String(html ?? '').matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);

  for (const match of matches) {
    try {
      const parsed = JSON.parse(match[1].trim());
      for (const node of collectNodes(parsed)) {
        blocks.push({
          node,
          types: getNodeTypes(node)
        });
      }
    } catch (error) {
      blocks.push({
        node: null,
        types: [],
        error: error.message
      });
    }
  }

  return blocks;
}

async function walkHtmlFiles(dirPath) {
  const files = [];
  if (!fs.existsSync(dirPath)) return files;

  const stack = [dirPath];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(fullPath);
      if (entry.isFile() && entry.name.endsWith('.html')) files.push(fullPath);
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

async function defaultAuditRoutes(repoRoot) {
  const routes = ['/', '/tools/fit-checker'];
  for (const dir of ['fit-check', 'compare', 'compare-vs']) {
    const files = await walkHtmlFiles(path.join(repoRoot, 'pages', dir));
    routes.push(...files.map((filePath) => normalizeRouteFromFile(filePath, repoRoot)));
  }
  return [...new Set(routes)];
}

function issue(route, file, code, message) {
  return {
    route,
    file,
    severity: 'blocker',
    code,
    message
  };
}

function containsVisibleSupport(visibleText, value) {
  const text = String(visibleText ?? '').toLowerCase();
  const raw = String(value ?? '').toLowerCase().replace(/[^\w\s]/g, ' ');
  const tokens = raw.split(/\s+/).filter((token) => token.length >= 4);
  if (tokens.length === 0) return false;
  return tokens.some((token) => text.includes(token));
}

function validateToolSchema({ route, file, node, visibleText }) {
  const issues = [];

  if (!APPROVED_TOOL_SCHEMA_ROUTES.has(route)) {
    issues.push(issue(
      route,
      file,
      'tool_schema_unapproved_route',
      'SoftwareApplication/WebApplication schema is allowed only on / and /tools/fit-checker.'
    ));
  }

  for (const [field, code] of REQUIRED_TOOL_FIELDS) {
    if (!String(node?.[field] ?? '').trim()) {
      issues.push(issue(route, file, code, `Tool schema must include ${field}.`));
    }
  }

  if (!node?.offers || typeof node.offers !== 'object') {
    issues.push(issue(route, file, 'tool_schema_missing_offer', 'Tool schema must include a free Offer object.'));
  } else {
    if (String(node.offers.price ?? '').trim() !== '0') {
      issues.push(issue(route, file, 'tool_schema_offer_not_free', 'Tool schema Offer price must be 0.'));
    }
    if (String(node.offers.priceCurrency ?? '').trim() !== 'AUD') {
      issues.push(issue(route, file, 'tool_schema_offer_currency_not_aud', 'Tool schema Offer priceCurrency must be AUD.'));
    }
  }

  if (String(node?.url ?? '').trim()) {
    try {
      const schemaRoute = new URL(node.url).pathname.replace(/\/+$/, '') || '/';
      if (schemaRoute !== route) {
        issues.push(issue(route, file, 'tool_schema_url_route_mismatch', 'Tool schema URL must match the page route.'));
      }
    } catch {
      issues.push(issue(route, file, 'tool_schema_invalid_url', 'Tool schema URL must be absolute and valid.'));
    }
  }

  if (String(node?.description ?? '').trim() && !containsVisibleSupport(visibleText, node.description)) {
    issues.push(issue(
      route,
      file,
      'tool_schema_description_not_visible',
      'Tool schema description must be supported by visible page text.'
    ));
  }

  return issues;
}

function auditPage({ route, repoRoot }) {
  const filePath = routeToHtmlPath(route, repoRoot);
  const file = path.relative(repoRoot, filePath).replace(/\\/g, '/');
  if (!fs.existsSync(filePath)) {
    return {
      page: { route, file, exists: false, toolSchemaTypes: [], jsonLdTypes: [] },
      issues: []
    };
  }

  const html = fs.readFileSync(filePath, 'utf8');
  const visibleText = stripHtmlForVisibleText(html);
  const blocks = extractJsonLd(html);
  const issues = [];
  const jsonLdTypes = [...new Set(blocks.flatMap((block) => block.types))].sort((left, right) => left.localeCompare(right));
  const toolBlocks = blocks.filter((block) => block.types.some((type) => TOOL_SCHEMA_TYPES.has(type)));

  for (const block of blocks) {
    if (block.error) {
      issues.push(issue(route, file, 'invalid_json_ld', `Invalid JSON-LD: ${block.error}`));
    }
  }

  for (const block of toolBlocks) {
    issues.push(...validateToolSchema({ route, file, node: block.node, visibleText }));
  }

  if (APPROVED_TOOL_SCHEMA_ROUTES.has(route) && toolBlocks.length === 0) {
    issues.push(issue(route, file, 'tool_schema_missing_on_core_route', 'Approved tool route must expose SoftwareApplication or WebApplication JSON-LD.'));
  }

  return {
    page: {
      route,
      file,
      exists: true,
      toolSchemaTypes: [...new Set(toolBlocks.flatMap((block) => block.types).filter((type) => TOOL_SCHEMA_TYPES.has(type)))],
      jsonLdTypes
    },
    issues
  };
}

async function auditGeoSchemaEligibility({
  repoRoot = path.resolve(__dirname, '..'),
  includeRoutes = null,
  outputPath = path.join(repoRoot, DEFAULT_OUTPUT_PATH),
  write = true,
  generatedAt = new Date().toISOString(),
  logger = console
} = {}) {
  const routes = includeRoutes ? [...new Set(includeRoutes)] : await defaultAuditRoutes(repoRoot);
  const pages = [];
  const issues = [];

  for (const route of routes) {
    const result = auditPage({ route, repoRoot });
    pages.push(result.page);
    issues.push(...result.issues);
  }

  const report = {
    schema_version: 1,
    method: 'geo-schema-eligibility-audit',
    scope: 'core-tool-schema-and-generated-comparison-routes',
    generatedAt,
    summary: {
      pagesChecked: pages.length,
      toolSchemaPages: pages.filter((page) => page.toolSchemaTypes.length > 0).length,
      blockerCount: issues.length
    },
    issues,
    pages
  };

  if (write) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    logger.log(`[geo-schema-eligibility] wrote ${path.relative(repoRoot, outputPath).replace(/\\/g, '/')}`);
  }

  logger.log(`[geo-schema-eligibility] pages=${report.summary.pagesChecked} toolPages=${report.summary.toolSchemaPages} blockers=${report.summary.blockerCount}`);
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
    console.log('Usage: node scripts/audit-geo-schema-eligibility.js [--no-write] [--output reports/geo/schema-eligibility-latest.json]');
    return 0;
  }

  const repoRoot = path.resolve(__dirname, '..');
  const report = await auditGeoSchemaEligibility({
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
    console.error(`[geo-schema-eligibility] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  auditGeoSchemaEligibility,
  extractJsonLd,
  routeToHtmlPath
};
