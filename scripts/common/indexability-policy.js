'use strict';

const path = require('node:path');
const { existsSync, readFileSync } = require('node:fs');
const { readdir, readFile } = require('node:fs/promises');
const { SITE_ORIGIN } = require('./site-origin.js');

const DEFAULT_POLICY = {
  schema_version: 1,
  default_action: 'noindex',
  blocked_query_param_sets: [
    {
      route: '/',
      required_any: ['cat', 'w', 'h', 'd', 'door', 'brand', 'compare', 'vs'],
      action: 'blocked-query',
      reason: 'Fit checker query URLs are app states.'
    }
  ],
  rules: [
    { match: 'exact', route: '/', action: 'index' },
    { match: 'exact', route: '/affiliate-disclosure', action: 'index' },
    { match: 'exact', route: '/privacy', action: 'index' },
    { match: 'exact', route: '/privacy-policy', action: 'index' },
    { match: 'exact', route: '/terms', action: 'index' },
    { match: 'exact', route: '/contact', action: 'index' },
    { match: 'exact', route: '/partners', action: 'index' },
    { match: 'exact', route: '/about', action: 'index' },
    { match: 'exact', route: '/methodology', action: 'index' },
    { match: 'exact', route: '/about/editorial-standards', action: 'index' },
    { match: 'exact', route: '/products', action: 'index' },
    { match: 'exact', route: '/subscribe', action: 'index' },
    { match: 'exact', route: '/tools/fit-checker', action: 'index' },
    { match: 'exact', route: '/account', action: 'noindex' },
    { match: 'prefix', route: '/guides/', action: 'index' },
    { match: 'prefix', route: '/fit-check/', action: 'index' },
    { match: 'prefix', route: '/products/', action: 'index' },
    { match: 'prefix', route: '/brands/', action: 'threshold', min_models: 10, pass_action: 'index', fail_action: 'noindex' },
    { match: 'prefix', route: '/compare/', action: 'threshold', min_total_models: 20, min_each_models: 5, pass_action: 'index', fail_action: 'noindex' },
    { match: 'prefix', route: '/cavity/', action: 'noindex' },
    { match: 'prefix', route: '/doorway/', action: 'noindex' },
    { match: 'prefix', route: '/location/', action: 'noindex' }
  ]
};

function normalizeRoute(value) {
  if (!value) return '/';
  const url = value instanceof URL
    ? value
    : new URL(String(value).replace(/&amp;/g, '&'), SITE_ORIGIN);
  const route = url.pathname === '/' ? '/' : url.pathname.replace(/\/+$/, '');
  return route || '/';
}

function normalizeRuleRoute(value) {
  if (!value) return '/';
  const route = String(value).startsWith('/') ? String(value) : `/${value}`;
  if (route === '/') return route;
  return route.endsWith('/') ? route : route.replace(/\/+$/, '');
}

function loadIndexabilityPolicy(policyPath = path.resolve(__dirname, '..', '..', 'data', 'indexability-policy.json')) {
  if (!policyPath || !existsSync(policyPath)) {
    return DEFAULT_POLICY;
  }
  return JSON.parse(readFileSync(policyPath, 'utf8'));
}

function matchesRule(route, rule) {
  const ruleRoute = normalizeRuleRoute(rule.route);
  if (rule.match === 'exact') return route === ruleRoute;
  if (rule.match === 'prefix') return route.startsWith(ruleRoute);
  return false;
}

function numberFrom(attributes, names) {
  for (const name of names) {
    const value = Number(attributes?.[name]);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function classifyThresholdRule(route, attributes, rule) {
  if (route.startsWith('/brands/')) {
    const models = numberFrom(attributes, ['models', 'count', 'modelCount']);
    const minModels = Number(rule.min_models ?? 0);
    const passed = models >= minModels;
    return {
      action: passed ? rule.pass_action : rule.fail_action,
      route,
      reason: rule.reason,
      rule,
      metrics: { models, minModels }
    };
  }

  if (route.startsWith('/compare/')) {
    const modelsA = numberFrom(attributes, ['modelsA', 'leftModels']);
    const modelsB = numberFrom(attributes, ['modelsB', 'rightModels']);
    const total = modelsA + modelsB;
    const minTotalModels = Number(rule.min_total_models ?? 0);
    const minEachModels = Number(rule.min_each_models ?? 0);
    const passed = total >= minTotalModels && modelsA >= minEachModels && modelsB >= minEachModels;
    return {
      action: passed ? rule.pass_action : rule.fail_action,
      route,
      reason: rule.reason,
      rule,
      metrics: { modelsA, modelsB, total, minTotalModels, minEachModels }
    };
  }

  return {
    action: rule.fail_action ?? 'noindex',
    route,
    reason: rule.reason,
    rule
  };
}

function classifyRoute(routeValue, attributes = {}, policy = DEFAULT_POLICY) {
  const route = normalizeRoute(routeValue);
  const rules = Array.isArray(policy?.rules) ? policy.rules : DEFAULT_POLICY.rules;
  const rule = rules.find((candidate) => matchesRule(route, candidate));
  if (!rule) {
    return {
      action: policy?.default_action ?? DEFAULT_POLICY.default_action,
      route,
      reason: 'No indexability rule matched.'
    };
  }

  if (rule.action === 'threshold') {
    return classifyThresholdRule(route, attributes, rule);
  }

  return {
    action: rule.action,
    route,
    reason: rule.reason,
    rule
  };
}

function querySetMatches(url, row) {
  const route = normalizeRoute(url);
  if (normalizeRuleRoute(row.route) !== route) return false;
  const requiredAny = Array.isArray(row.required_any) ? row.required_any : [];
  if (requiredAny.length === 0) return url.search.length > 0;
  return requiredAny.some((param) => url.searchParams.has(param));
}

function classifyUrl(value, attributes = {}, policy = DEFAULT_POLICY) {
  const url = value instanceof URL
    ? value
    : new URL(String(value).replace(/&amp;/g, '&'), SITE_ORIGIN);
  const queryRule = (policy?.blocked_query_param_sets ?? DEFAULT_POLICY.blocked_query_param_sets)
    .find((row) => querySetMatches(url, row));
  if (queryRule) {
    return {
      action: queryRule.action ?? 'blocked-query',
      route: normalizeRoute(url),
      reason: queryRule.reason,
      rule: queryRule
    };
  }
  return classifyRoute(url.pathname, attributes, policy);
}

function isIndexableRoute(route, attributes = {}, policy = DEFAULT_POLICY) {
  return classifyRoute(route, attributes, policy).action === 'index';
}

function robotsMetaTagForRoute(route, attributes = {}, policy = DEFAULT_POLICY) {
  const decision = classifyRoute(route, attributes, policy);
  return decision.action === 'noindex'
    ? '  <meta name="robots" content="noindex, follow">'
    : '';
}

function extractSitemapLocs(xml) {
  return [...String(xml).matchAll(/<loc>(.*?)<\/loc>/g)]
    .map((match) => match[1].trim().replace(/&amp;/g, '&'));
}

function routeFromPageFile(repoRoot, filePath) {
  const pagesRoot = path.join(repoRoot, 'pages');
  const rel = path.relative(pagesRoot, filePath).replace(/\\/g, '/');
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  if (!rel.endsWith('.html')) return null;
  const withoutExt = rel.slice(0, -5);
  if (withoutExt === 'index') return '/';
  return `/${withoutExt}`;
}

async function walkHtmlFiles(rootDir) {
  const output = [];
  async function walk(currentDir) {
    let entries;
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch (error) {
      if (error && error.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.html')) {
        output.push(fullPath);
      }
    }
  }
  await walk(rootDir);
  return output.sort();
}

async function readJsonIfExists(filePath, fallback = []) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function loadRouteAttributes(repoRoot) {
  const rowsByRoute = new Map();
  const brandRows = await readJsonIfExists(path.join(repoRoot, 'pages', 'brands', 'index.json'));
  const compareRows = await readJsonIfExists(path.join(repoRoot, 'pages', 'compare', 'index.json'));

  for (const row of Array.isArray(brandRows) ? brandRows : []) {
    const route = normalizeRoute(row.url ?? `/brands/${row.slug}`);
    rowsByRoute.set(route, {
      models: Number(row.models ?? row.count ?? 0),
      cat: row.cat,
      brand: row.brand
    });
  }

  for (const row of Array.isArray(compareRows) ? compareRows : []) {
    const route = normalizeRoute(row.url ?? `/compare/${row.slug}`);
    rowsByRoute.set(route, {
      modelsA: Number(row.modelsA ?? 0),
      modelsB: Number(row.modelsB ?? 0),
      cat: row.cat,
      brandA: row.brandA,
      brandB: row.brandB
    });
  }

  return rowsByRoute;
}

function hasNoindexDirective(html) {
  return /<meta\b[^>]*name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(html)
    || /<meta\b[^>]*content=["'][^"']*noindex[^"']*["'][^>]*name=["']robots["']/i.test(html);
}

async function auditIndexabilityPolicy({
  repoRoot = path.resolve(__dirname, '..', '..'),
  sitemapPath = path.join(repoRoot, 'public', 'sitemap.xml'),
  policyPath = path.join(repoRoot, 'data', 'indexability-policy.json'),
  checkNoindexMeta = true,
  logger = console
} = {}) {
  const policy = loadIndexabilityPolicy(policyPath);
  const attributesByRoute = await loadRouteAttributes(repoRoot);
  const issues = {
    sitemapPolicyViolations: [],
    missingNoindexMeta: []
  };

  const xml = await readFile(sitemapPath, 'utf8');
  const locs = extractSitemapLocs(xml);
  for (const loc of locs) {
    const url = new URL(loc, SITE_ORIGIN);
    const route = normalizeRoute(url);
    const decision = classifyUrl(url, attributesByRoute.get(route) ?? {}, policy);
    if (decision.action !== 'index') {
      issues.sitemapPolicyViolations.push({
        loc,
        route,
        action: decision.action,
        reason: decision.reason
      });
    }
  }

  if (checkNoindexMeta) {
    const pageFiles = await walkHtmlFiles(path.join(repoRoot, 'pages'));
    for (const filePath of pageFiles) {
      const route = routeFromPageFile(repoRoot, filePath);
      if (!route) continue;
      const decision = classifyRoute(route, attributesByRoute.get(route) ?? {}, policy);
      if (decision.action !== 'noindex') continue;
      const html = await readFile(filePath, 'utf8');
      if (!hasNoindexDirective(html)) {
        issues.missingNoindexMeta.push({
          route,
          file: path.relative(repoRoot, filePath).replace(/\\/g, '/'),
          reason: decision.reason
        });
      }
    }
  }

  issues.sitemapPolicyViolations.sort((left, right) => left.route.localeCompare(right.route) || left.loc.localeCompare(right.loc));
  issues.missingNoindexMeta.sort((left, right) => left.route.localeCompare(right.route));

  const result = {
    ok: issues.sitemapPolicyViolations.length === 0 && issues.missingNoindexMeta.length === 0,
    summary: {
      sitemapUrls: locs.length,
      sitemapPolicyViolations: issues.sitemapPolicyViolations.length,
      missingNoindexMeta: issues.missingNoindexMeta.length
    },
    issues
  };

  logger.log(`[indexability-policy] ${result.ok ? 'PASS' : 'FAIL'} sitemap=${result.summary.sitemapUrls} sitemapViolations=${result.summary.sitemapPolicyViolations} missingNoindex=${result.summary.missingNoindexMeta}`);
  return result;
}

module.exports = {
  DEFAULT_POLICY,
  auditIndexabilityPolicy,
  classifyRoute,
  classifyUrl,
  extractSitemapLocs,
  isIndexableRoute,
  loadIndexabilityPolicy,
  normalizeRoute,
  robotsMetaTagForRoute
};
