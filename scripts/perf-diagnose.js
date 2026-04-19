#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { mkdir, readFile, writeFile } = require('node:fs/promises');

function normalizeRouteToFile(routePath = '') {
  const clean = String(routePath || '/').split('?')[0].split('#')[0] || '/';
  if (clean === '/' || clean === '') return 'index.html';
  const trimmed = clean.replace(/^\/+/, '');
  return path.join('pages', `${trimmed}.html`);
}

function hasImageWithoutDimensions(html = '') {
  const imgs = String(html).match(/<img\b[^>]*>/gi) || [];
  return imgs.some((tag) => !/\bwidth\s*=\s*['"][^'"]+['"]/i.test(tag) || !/\bheight\s*=\s*['"][^'"]+['"]/i.test(tag));
}

function hasHeavyInlineScript(html = '', threshold = 4000) {
  const scripts = String(html).matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of scripts) {
    if (String(match[1] ?? '').length > threshold) return true;
  }
  return false;
}

function hasBlockingScript(html = '') {
  const scripts = String(html).match(/<script\b[^>]*\bsrc=\"[^\"]+\"[^>]*>/gi) || [];
  return scripts.some((tag) => !/\bdefer\b/i.test(tag) && !/\basync\b/i.test(tag));
}

function diagnosePathMetrics({ pathSummary, html = '' }) {
  const issues = [];
  const metrics = pathSummary?.metrics ?? {};

  if (Number(metrics?.LCP?.p75 ?? 0) > 2500) {
    const missingFetchPriority = /<img\b/i.test(html) && !/fetchpriority\s*=\s*['"]high['"]/i.test(html);
    const missingPreload = !/<link\b[^>]*rel=['"]preload['"][^>]*as=['"]image['"]/i.test(html);
    const evidence = [];
    if (missingFetchPriority) evidence.push('hero image missing fetchpriority="high"');
    if (missingPreload) evidence.push('no image preload link detected');
    if (evidence.length === 0) evidence.push('p75 LCP exceeds threshold');

    issues.push({
      path: pathSummary.path,
      metric: 'LCP',
      p75: Number(metrics.LCP.p75),
      suggestion: 'Optimize above-the-fold image loading and prioritize the hero asset.',
      evidence: evidence.join('; ')
    });
  }

  if (Number(metrics?.CLS?.p75 ?? 0) > 0.1) {
    const evidence = hasImageWithoutDimensions(html)
      ? 'image tags missing width/height attributes'
      : 'layout instability detected in runtime metrics';

    issues.push({
      path: pathSummary.path,
      metric: 'CLS',
      p75: Number(metrics.CLS.p75),
      suggestion: 'Stabilize layout with fixed media dimensions and reserved dynamic slots.',
      evidence
    });
  }

  if (Number(metrics?.INP?.p75 ?? 0) > 200) {
    const evidence = [];
    if (hasHeavyInlineScript(html)) evidence.push('large inline script detected');
    if (hasBlockingScript(html)) evidence.push('blocking script without defer/async');
    if (evidence.length === 0) evidence.push('runtime interaction delay above threshold');

    issues.push({
      path: pathSummary.path,
      metric: 'INP',
      p75: Number(metrics.INP.p75),
      suggestion: 'Reduce main-thread blocking JavaScript and defer non-critical execution.',
      evidence: evidence.join('; ')
    });
  }

  return issues;
}

async function loadHtmlForRoute({ repoRoot, routePath }) {
  const fileRelativePath = normalizeRouteToFile(routePath);
  const filePath = path.join(repoRoot, fileRelativePath);
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') return '';
    throw error;
  }
}

async function runPerfDiagnose({
  repoRoot = path.resolve(__dirname, '..'),
  reportsDir = path.join(repoRoot, 'reports'),
  summaryPath = path.join(reportsDir, 'rum-summary-latest.json'),
  today = new Date(),
  logger = console
} = {}) {
  const isoDate = String(today instanceof Date ? today.toISOString() : today).slice(0, 10);
  const outputPath = path.join(reportsDir, `perf-issues-${isoDate.replace(/-/g, '')}.json`);
  const latestPath = path.join(reportsDir, 'perf-issues-latest.json');

  const summary = JSON.parse(await readFile(summaryPath, 'utf8'));
  const status = String(summary?.status ?? 'ok');
  const issues = [];

  if (status !== 'insufficient_samples') {
    for (const pathSummary of summary.paths ?? []) {
      const html = await loadHtmlForRoute({ repoRoot, routePath: pathSummary.path });
      issues.push(...diagnosePathMetrics({ pathSummary, html }));
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    date: isoDate,
    status,
    totals: {
      totalEvents: Number(summary?.totals?.totalEvents ?? 0),
      issueCount: issues.length
    },
    issues: issues.sort((left, right) => right.p75 - left.p75)
  };

  await mkdir(reportsDir, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(latestPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  logger.log(`[perf-diagnose] issues=${issues.length} status=${status}`);
  return report;
}

async function runCli() {
  try {
    await runPerfDiagnose();
  } catch (error) {
    console.error(`[perf-diagnose] ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runCli();
}

module.exports = {
  normalizeRouteToFile,
  diagnosePathMetrics,
  runPerfDiagnose
};
