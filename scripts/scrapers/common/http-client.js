'use strict';

const robotsParser = require('robots-parser');

const DEFAULT_USER_AGENT = 'FitApplianceBot/1.0 (+https://www.fitappliance.com.au/about)';
const RETRYABLE_STATUSES = new Set([429, 503]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeRetailerName(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getRetailerDecisionFromAudit(auditText, retailerName) {
  const retailerKey = normalizeRetailerName(retailerName);
  if (!retailerKey) return 'UNKNOWN';

  for (const line of String(auditText ?? '').split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line
      .split('|')
      .map((cell) => cell.trim())
      .filter(Boolean);
    if (cells.length < 4) continue;
    if (normalizeRetailerName(cells[0]) !== retailerKey) continue;

    const decisionText = cells.slice(1).join(' ');
    if (/\bRED\b/i.test(decisionText)) return 'RED';
    if (/\bGREEN\b/i.test(decisionText)) return 'GREEN';
    if (/\bYELLOW\b/i.test(decisionText)) return 'YELLOW';
    return 'UNKNOWN';
  }

  return 'UNKNOWN';
}

function assertLegalDecision(decision, url) {
  const normalized = String(decision ?? 'UNKNOWN').toUpperCase();
  if (normalized === 'RED') {
    throw new Error(`Scraper refused: legal audit decision is RED for ${url}`);
  }
}

function robotsUrlFor(url) {
  const parsed = new URL(url);
  return `${parsed.origin}/robots.txt`;
}

function isAllowedByRobotsTxt(robotsTxt, url, userAgent = DEFAULT_USER_AGENT) {
  const parser = robotsParser(robotsUrlFor(url), String(robotsTxt ?? ''));
  return parser.isAllowed(url, userAgent) !== false;
}

function createAbortSignal(timeoutMs) {
  if (!timeoutMs || timeoutMs <= 0 || typeof AbortController === 'undefined') {
    return { signal: undefined, cancel: () => {} };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timer),
  };
}

function createScraperClient({
  userAgent = DEFAULT_USER_AGENT,
  rateLimitMs = 3000,
  timeoutMs = 15000,
  fetchImpl = globalThis.fetch,
  sleepFn = sleep,
  logger = console,
  legalDecision = 'YELLOW',
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('createScraperClient requires a fetch implementation');
  }

  const robotsCache = new Map();
  let lastRequestAt = 0;

  async function waitForRateLimit() {
    if (!rateLimitMs) return;
    const now = Date.now();
    const waitMs = Math.max(0, lastRequestAt + rateLimitMs - now);
    if (waitMs > 0) await sleepFn(waitMs);
    lastRequestAt = Date.now();
  }

  async function fetchWithTimeout(url) {
    await waitForRateLimit();
    const { signal, cancel } = createAbortSignal(timeoutMs);
    try {
      return await fetchImpl(url, {
        headers: { 'user-agent': userAgent },
        signal,
      });
    } finally {
      cancel();
    }
  }

  async function getRobotsTxt(url) {
    const robotsUrl = robotsUrlFor(url);
    if (robotsCache.has(robotsUrl)) return robotsCache.get(robotsUrl);

    const response = await fetchWithTimeout(robotsUrl);
    if (response.status === 404) {
      robotsCache.set(robotsUrl, '');
      return '';
    }
    if (!response.ok) {
      throw new Error(`Unable to read robots.txt (${response.status}) for ${robotsUrl}`);
    }

    const text = await response.text();
    robotsCache.set(robotsUrl, text);
    return text;
  }

  async function assertRobotsAllowed(url) {
    const robotsTxt = await getRobotsTxt(url);
    if (!isAllowedByRobotsTxt(robotsTxt, url, userAgent)) {
      throw new Error(`robots.txt disallows ${url} for ${userAgent}`);
    }
  }

  async function fetchPage(url, attempt = 0) {
    const response = await fetchWithTimeout(url);
    const text = await response.text();
    const bytes = Buffer.byteLength(text, 'utf8');
    logger?.log?.(`[scraper] ${response.status} ${bytes}b ${url}`);

    if (RETRYABLE_STATUSES.has(response.status) && attempt < 2) {
      await sleepFn(rateLimitMs * (attempt + 2));
      return fetchPage(url, attempt + 1);
    }

    if (!response.ok) {
      throw new Error(`Scraper request failed (${response.status}) for ${url}`);
    }

    return text;
  }

  async function fetchText(url) {
    assertLegalDecision(legalDecision, url);
    await assertRobotsAllowed(url);
    return fetchPage(url);
  }

  return {
    assertRobotsAllowed,
    fetchText,
  };
}

module.exports = {
  DEFAULT_USER_AGENT,
  createScraperClient,
  getRetailerDecisionFromAudit,
  isAllowedByRobotsTxt,
};

