import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = '/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2';
const aggregateModuleUrl = pathToFileURL(path.join(repoRoot, 'scripts', 'aggregate-rum.js')).href;
const diagnoseModuleUrl = pathToFileURL(path.join(repoRoot, 'scripts', 'perf-diagnose.js')).href;
const openPrModuleUrl = pathToFileURL(path.join(repoRoot, 'scripts', 'open-perf-pr.js')).href;

test('phase 35 perf: nearest-rank p75 returns the 3rd value from four sorted samples', async () => {
  const { nearestRankPercentile } = await import(aggregateModuleUrl);
  const value = nearestRankPercentile([100, 200, 300, 400], 75);
  assert.equal(value, 300);
});

test('phase 35 perf: aggregateRumEvents computes p50/p75/p95 metrics correctly', async () => {
  const { aggregateRumEvents } = await import(aggregateModuleUrl);
  const summary = aggregateRumEvents([
    { metric: 'LCP', value: 1000, path: '/cavity/600mm-fridge', ts: 1 },
    { metric: 'LCP', value: 2000, path: '/cavity/600mm-fridge', ts: 2 },
    { metric: 'LCP', value: 3000, path: '/cavity/600mm-fridge', ts: 3 },
    { metric: 'LCP', value: 4000, path: '/cavity/600mm-fridge', ts: 4 }
  ]);

  const lcp = summary.paths[0].metrics.LCP;
  assert.equal(lcp.p50, 2000);
  assert.equal(lcp.p75, 3000);
  assert.equal(lcp.p95, 4000);
});

test('phase 35 perf: diagnosePathMetrics emits LCP issue when p75 exceeds 2500', async () => {
  const { diagnosePathMetrics } = await import(diagnoseModuleUrl);

  const issues = diagnosePathMetrics({
    pathSummary: {
      path: '/cavity/600mm-fridge',
      metrics: {
        LCP: { p75: 4000, count: 140 },
        CLS: { p75: 0.02, count: 140 },
        INP: { p75: 120, count: 140 }
      }
    },
    html: '<html><head></head><body><img src="/og-images/a.png" width="1200" height="630"></body></html>'
  });

  assert.equal(issues.length > 0, true);
  assert.equal(issues.some((issue) => issue.metric === 'LCP' && issue.p75 === 4000), true);
});

test('phase 35 perf: buildPerfPrPlan skips PR creation when sample size is below 100', async () => {
  const { buildPerfPrPlan } = await import(openPrModuleUrl);

  const plan = buildPerfPrPlan({
    rumSummary: {
      totals: {
        totalEvents: 99
      }
    },
    issues: [{ path: '/cavity/600mm-fridge', metric: 'LCP', p75: 4200, suggestion: 'x', evidence: 'y' }]
  });

  assert.equal(plan.shouldOpenPr, false);
  assert.equal(plan.reason, 'insufficient_samples');
});
