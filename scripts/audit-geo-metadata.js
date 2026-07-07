#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_OUTPUT_PATH = path.join('reports', 'geo', 'metadata-audit-latest.json');
const DOMAIN_ENTITY_RE = /\b(?:cavity|clearance|width|height|depth|doorway|ventilation|mm|fridge|dishwasher|washing machine|dryer|appliance|fit)\b/i;
const UNSUPPORTED_CLAIM_RE = /\b(?:85%\s+of\s+users|guaranteed|guarantee|perfect\s+installation|certified\s+fit|trim\s+cabinetry|cut\s+cabinetry|remove\s+skirting|zero-click\s+defen[sc]e)\b/i;

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function routeToHtmlPath(route, repoRoot = path.resolve(__dirname, '..')) {
  const cleanRoute = String(route ?? '').replace(/^\/+/, '').replace(/\/+$/, '');
  if (!cleanRoute) return path.join(repoRoot, 'index.html');
  return path.join(repoRoot, 'pages', `${cleanRoute}.html`);
}

function getAttribute(tag, name) {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const match = String(tag ?? '').match(pattern);
  return match ? (match[1] ?? match[2] ?? match[3] ?? '') : '';
}

function decodeBasicEntities(value) {
  return String(value ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function collapseWhitespace(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function collectJsonLdBlocks(html) {
  return [...String(html ?? '').matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1].trim());
}

function collectSchemaNodes(value) {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap((row) => collectSchemaNodes(row));

  const nodes = [value];
  if (Array.isArray(value['@graph'])) nodes.push(...value['@graph'].flatMap((row) => collectSchemaNodes(row)));
  return nodes;
}

function getNodeTypes(node) {
  const type = node?.['@type'];
  return (Array.isArray(type) ? type : type ? [type] : []).map((row) => String(row));
}

function getSchemaTypes(value) {
  return collectSchemaNodes(value).flatMap((node) => getNodeTypes(node));
}

function stripHtmlForVisibleText(html) {
  const bodyMatch = String(html ?? '').match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  const body = bodyMatch ? bodyMatch[1] : html;
  return collapseWhitespace(decodeBasicEntities(String(body)
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')));
}

function extractHtmlMetadata(html) {
  const titleMatch = String(html ?? '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const metaTags = [...String(html ?? '').matchAll(/<meta\b[^>]*>/gi)].map((match) => match[0]);
  const descriptionTag = metaTags.find((tag) => getAttribute(tag, 'name').toLowerCase() === 'description');
  const linkTags = [...String(html ?? '').matchAll(/<link\b[^>]*>/gi)].map((match) => match[0]);
  const canonicalTag = linkTags.find((tag) => getAttribute(tag, 'rel').toLowerCase() === 'canonical');
  const parsedJsonLd = [];
  const invalidJsonLd = [];

  for (const block of collectJsonLdBlocks(html)) {
    try {
      parsedJsonLd.push(JSON.parse(block));
    } catch (error) {
      invalidJsonLd.push({ error: error.message, raw: block.slice(0, 200) });
    }
  }

  const jsonLdTypes = [...new Set(parsedJsonLd.flatMap((block) => getSchemaTypes(block)))].sort((left, right) => left.localeCompare(right));

  return {
    title: collapseWhitespace(decodeBasicEntities(titleMatch ? titleMatch[1] : '')),
    description: collapseWhitespace(decodeBasicEntities(descriptionTag ? getAttribute(descriptionTag, 'content') : '')),
    canonical: collapseWhitespace(decodeBasicEntities(canonicalTag ? getAttribute(canonicalTag, 'href') : '')),
    visibleText: stripHtmlForVisibleText(html),
    jsonLdBlocks: parsedJsonLd,
    jsonLdTypes,
    invalidJsonLd
  };
}

function issueSeverity(group) {
  return group === 'treatment' ? 'blocker' : 'warning';
}

function makeIssue({ target, code, message }) {
  return {
    route: target.route,
    file: target.file,
    group: target.group,
    severity: issueSeverity(target.group),
    code,
    message
  };
}

function addTarget(targets, seen, target) {
  if (seen.has(target.route)) return;
  seen.add(target.route);
  targets.push(target);
}

function collectAuditTargets({
  repoRoot = path.resolve(__dirname, '..'),
  manifestPath = path.join(repoRoot, 'data', 'geo-treatment-pages.json')
} = {}) {
  const manifest = loadJson(manifestPath);
  const targets = [];
  const seen = new Set();

  for (const route of ['/', '/tools/fit-checker']) {
    const filePath = routeToHtmlPath(route, repoRoot);
    if (fs.existsSync(filePath)) {
      addTarget(targets, seen, {
        route,
        file: path.relative(repoRoot, filePath).replace(/\\/g, '/'),
        group: 'core',
        template: route === '/' ? 'home' : 'tool',
        measurement_bucket: 'core'
      });
    }
  }

  for (const row of manifest.treatment ?? []) {
    const filePath = routeToHtmlPath(row.route, repoRoot);
    addTarget(targets, seen, {
      route: row.route,
      file: path.relative(repoRoot, filePath).replace(/\\/g, '/'),
      group: 'treatment',
      template: row.template,
      measurement_bucket: row.measurement_bucket
    });
  }

  for (const row of manifest.controls ?? []) {
    const filePath = routeToHtmlPath(row.route, repoRoot);
    addTarget(targets, seen, {
      route: row.route,
      file: path.relative(repoRoot, filePath).replace(/\\/g, '/'),
      group: 'control',
      template: row.template,
      measurement_bucket: row.measurement_bucket
    });
  }

  return targets;
}

function validateJsonLd({ metadata, target }) {
  const issues = [];

  for (const invalid of metadata.invalidJsonLd) {
    issues.push(makeIssue({
      target,
      code: 'invalid_json_ld',
      message: `Invalid JSON-LD: ${invalid.error}`
    }));
  }

  for (const block of metadata.jsonLdBlocks) {
    for (const node of collectSchemaNodes(block)) {
      const types = getNodeTypes(node);
      if (target.route.startsWith('/fit-check/') && types.includes('Product')) {
        issues.push(makeIssue({
          target,
          code: 'fit_check_product_json_ld',
          message: 'Fit-check pages must not include Product JSON-LD.'
        }));
      }
      if (types.includes('Article')) {
        if (!String(node.headline ?? '').trim()) {
          issues.push(makeIssue({
            target,
            code: 'article_missing_headline',
            message: 'Article JSON-LD must include a headline.'
          }));
        }
        if (!String(node.description ?? '').trim()) {
          issues.push(makeIssue({
            target,
            code: 'article_missing_description',
            message: 'Article JSON-LD must include a description.'
          }));
        }
      }
      if (types.includes('FAQPage') && (!Array.isArray(node.mainEntity) || node.mainEntity.length === 0)) {
        issues.push(makeIssue({
          target,
          code: 'faq_missing_main_entity',
          message: 'FAQPage JSON-LD must include at least one mainEntity question.'
        }));
      }
    }
  }

  return issues;
}

function auditTarget({ target, repoRoot }) {
  const filePath = routeToHtmlPath(target.route, repoRoot);
  if (!fs.existsSync(filePath)) {
    return {
      target: {
        ...target,
        exists: false,
        title: '',
        descriptionLength: 0,
        jsonLdTypes: []
      },
      issues: [makeIssue({
        target,
        code: 'route_html_missing',
        message: 'Target HTML file is missing.'
      })]
    };
  }

  const html = fs.readFileSync(filePath, 'utf8');
  const metadata = extractHtmlMetadata(html);
  const issues = [];

  if (!metadata.description) {
    issues.push(makeIssue({
      target,
      code: 'description_missing',
      message: 'Meta description is missing.'
    }));
  } else {
    if (!DOMAIN_ENTITY_RE.test(metadata.description)) {
      issues.push(makeIssue({
        target,
        code: 'description_missing_domain_entity',
        message: 'Meta description lacks a FitAppliance domain entity such as cavity, clearance, dimensions, or appliance category.'
      }));
    }
    if (UNSUPPORTED_CLAIM_RE.test(metadata.description)) {
      issues.push(makeIssue({
        target,
        code: 'description_unsupported_claim',
        message: 'Meta description contains an unsupported guarantee, fake statistic, or installation hack.'
      }));
    }
  }

  issues.push(...validateJsonLd({ metadata, target }));

  return {
    target: {
      ...target,
      exists: true,
      title: metadata.title,
      descriptionLength: metadata.description.length,
      jsonLdTypes: metadata.jsonLdTypes
    },
    issues
  };
}

async function auditGeoMetadata({
  repoRoot = path.resolve(__dirname, '..'),
  manifestPath = path.join(repoRoot, 'data', 'geo-treatment-pages.json'),
  outputPath = path.join(repoRoot, DEFAULT_OUTPUT_PATH),
  write = true,
  strictTreatment = false,
  generatedAt = new Date().toISOString(),
  logger = console
} = {}) {
  const targets = collectAuditTargets({ repoRoot, manifestPath });
  const auditedTargets = [];
  const issues = [];

  for (const target of targets) {
    const result = auditTarget({ target, repoRoot });
    auditedTargets.push(result.target);
    issues.push(...result.issues);
  }

  const report = {
    schema_version: 1,
    method: 'geo-metadata-audit',
    scope: 'phase43-cohort-and-core',
    generatedAt,
    strictTreatment,
    summary: {
      targetsChecked: auditedTargets.length,
      treatmentTargets: auditedTargets.filter((target) => target.group === 'treatment').length,
      controlTargets: auditedTargets.filter((target) => target.group === 'control').length,
      coreTargets: auditedTargets.filter((target) => target.group === 'core').length,
      blockerCount: issues.filter((issue) => issue.severity === 'blocker').length,
      warningCount: issues.filter((issue) => issue.severity === 'warning').length
    },
    issues,
    targets: auditedTargets
  };

  if (write) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    logger.log(`[geo-metadata] wrote ${path.relative(repoRoot, outputPath).replace(/\\/g, '/')}`);
  }

  logger.log(`[geo-metadata] targets=${report.summary.targetsChecked} blockers=${report.summary.blockerCount} warnings=${report.summary.warningCount}`);
  return report;
}

function parseArgs(argv) {
  const args = {
    write: true,
    strictTreatment: false,
    outputPath: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--no-write') {
      args.write = false;
    } else if (arg === '--strict-treatment') {
      args.strictTreatment = true;
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
    console.log('Usage: node scripts/audit-geo-metadata.js [--no-write] [--strict-treatment] [--output reports/geo/metadata-audit-latest.json]');
    return 0;
  }

  const repoRoot = path.resolve(__dirname, '..');
  const report = await auditGeoMetadata({
    repoRoot,
    write: args.write,
    strictTreatment: args.strictTreatment,
    outputPath: args.outputPath ? path.resolve(repoRoot, args.outputPath) : path.join(repoRoot, DEFAULT_OUTPUT_PATH)
  });

  return args.strictTreatment && report.summary.blockerCount > 0 ? 1 : 0;
}

if (require.main === module) {
  runCli().then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((error) => {
    console.error(`[geo-metadata] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  auditGeoMetadata,
  collectAuditTargets,
  collectJsonLdBlocks,
  extractHtmlMetadata,
  getSchemaTypes,
  routeToHtmlPath
};
