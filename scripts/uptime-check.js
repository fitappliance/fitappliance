#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { mkdir, readFile, writeFile } = require('node:fs/promises');

function formatDateUtc(dateValue = new Date()) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

function parseSitemapUrls(xml) {
  const source = String(xml ?? '');
  const matches = source.matchAll(/<loc>(.*?)<\/loc>/g);
  return [...matches].map((match) => match[1].trim()).filter(Boolean);
}

function takeSorted(urls, count) {
  return [...urls].sort((left, right) => left.localeCompare(right)).slice(0, count);
}

function chooseSentinelUrls(urls, { targetCount = 30 } = {}) {
  const unique = [...new Set((urls ?? []).filter(Boolean))];
  const groups = {
    root: unique.filter((url) => url === 'https://fitappliance.com.au/'),
    guides: unique.filter((url) => url.includes('/guides/')),
    cavity: unique.filter((url) => url.includes('/cavity/')),
    doorway: unique.filter((url) => url.includes('/doorway/')),
    brands: unique.filter((url) => url.includes('/brands/')),
    compare: unique.filter((url) => url.includes('/compare/')),
    location: unique.filter((url) => url.includes('/location/'))
  };

  const selected = [];
  const add = (pool) => {
    for (const url of pool) {
      if (!selected.includes(url)) selected.push(url);
    }
  };

  add(takeSorted(groups.root, 1));
  add(takeSorted(groups.guides, 5));
  add(takeSorted(groups.cavity, 5));
  add(takeSorted(groups.doorway, 5));
  add(takeSorted(groups.brands, 5));
  add(takeSorted(groups.compare, 5));
  add(takeSorted(groups.location, 4));

  if (selected.length < targetCount) {
    for (const url of unique.sort((left, right) => left.localeCompare(right))) {
      if (!selected.includes(url)) {
        selected.push(url);
      }
      if (selected.length >= targetCount) break;
    }
  }

  return selected.slice(0, targetCount);
}

async function headRequestWithTimeout(fetchImpl, url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow'
    });
    return { ok: response.status === 200, status: Number(response.status) || 0 };
  } catch {
    return { ok: false, status: 0 };
  } finally {
    clearTimeout(timeout);
  }
}

async function runPool(items, worker, concurrency) {
  const results = [];
  let index = 0;

  const runners = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await worker(items[current], current);
    }
  });

  await Promise.all(runners);
  return results;
}

async function runUptimeCheck({
  repoRoot = path.resolve(__dirname, '..'),
  sitemapPath = path.join(repoRoot, 'public', 'sitemap.xml'),
  reportPath = path.join(repoRoot, 'reports', `uptime-${formatDateUtc()}.json`),
  fetchImpl = globalThis.fetch,
  concurrency = 5,
  timeoutMs = 10_000,
  now = new Date(),
  logger = console
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('runUptimeCheck requires fetchImpl or global fetch');
  }

  const xml = await readFile(sitemapPath, 'utf8');
  const urls = chooseSentinelUrls(parseSitemapUrls(xml));
  const checks = await runPool(
    urls,
    async (url) => {
      const result = await headRequestWithTimeout(fetchImpl, url, timeoutMs);
      return { url, status: result.status, ok: result.ok };
    },
    concurrency
  );
  const failures = checks.filter((entry) => !entry.ok);
  const report = {
    generatedAt: (now instanceof Date ? now : new Date(now)).toISOString(),
    checked: checks,
    failures
  };

  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  logger.log(`[uptime-check] checked=${checks.length} failures=${failures.length} report=${reportPath}`);
  return {
    checked: checks,
    failures,
    reportPath,
    exitCode: failures.length > 0 ? 1 : 0
  };
}

if (require.main === module) {
  runUptimeCheck()
    .then((result) => {
      if (result.exitCode !== 0) process.exitCode = result.exitCode;
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

module.exports = {
  chooseSentinelUrls,
  formatDateUtc,
  parseSitemapUrls,
  runUptimeCheck
};
