import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const {
  createScraperClient,
  getRetailerDecisionFromAudit,
  isAllowedByRobotsTxt,
} = require('../scripts/scrapers/common/http-client.js');

test('scraper robots: robots-parser allows category path and client fetches page', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (String(url).endsWith('/robots.txt')) {
      return new Response('User-agent: *\nAllow: /category/\nDisallow: /checkout\n', { status: 200 });
    }
    return new Response('<html>ok</html>', { status: 200 });
  };
  const client = createScraperClient({
    fetchImpl,
    rateLimitMs: 0,
    sleepFn: async () => {},
    legalDecision: 'GREEN',
  });

  const html = await client.fetchText('https://www.appliancesonline.com.au/category/fridges/');

  assert.equal(html, '<html>ok</html>');
  assert.deepEqual(calls, [
    'https://www.appliancesonline.com.au/robots.txt',
    'https://www.appliancesonline.com.au/category/fridges/',
  ]);
});

test('scraper robots: disallowed path aborts before fetching the page', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return new Response('User-agent: *\nDisallow: /category/\n', { status: 200 });
  };
  const client = createScraperClient({
    fetchImpl,
    rateLimitMs: 0,
    sleepFn: async () => {},
    legalDecision: 'GREEN',
  });

  await assert.rejects(
    () => client.fetchText('https://www.appliancesonline.com.au/category/fridges/'),
    /robots\.txt disallows/
  );
  assert.deepEqual(calls, ['https://www.appliancesonline.com.au/robots.txt']);
});

test('scraper robots: RED legal decision refuses to run', async () => {
  const auditText = fs.readFileSync(path.join(repoRoot, 'docs', 'scraper-legal-audit.md'), 'utf8');

  assert.equal(getRetailerDecisionFromAudit(auditText, 'Bing Lee'), 'RED');

  const client = createScraperClient({
    fetchImpl: async () => new Response('should not fetch', { status: 200 }),
    legalDecision: 'RED',
  });

  await assert.rejects(
    () => client.fetchText('https://www.binglee.com.au/collections/fridges'),
    /legal audit decision is RED/
  );
});

test('scraper robots: standalone robots check is explicit and deterministic', () => {
  const robotsTxt = 'User-agent: *\nAllow: /category/\nDisallow: /checkout\n';

  assert.equal(isAllowedByRobotsTxt(robotsTxt, 'https://example.com/category/fridges/', 'FitApplianceBot/1.0'), true);
  assert.equal(isAllowedByRobotsTxt(robotsTxt, 'https://example.com/checkout', 'FitApplianceBot/1.0'), false);
});

