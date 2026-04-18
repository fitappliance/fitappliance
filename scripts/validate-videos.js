#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { mkdir, readFile, writeFile } = require('node:fs/promises');

const OFFICIAL_AUTHOR_RULES = {
  samsung: /samsung/i,
  lg: /\blg\b/i,
  bosch: /bosch/i
};

function extractYouTubeId(url) {
  if (typeof url !== 'string') return '';
  const directMatch = url.match(/[?&]v=([A-Za-z0-9_-]{11})/);
  if (directMatch) return directMatch[1];
  const shortMatch = url.match(/youtu\.be\/([A-Za-z0-9_-]{11})/);
  return shortMatch ? shortMatch[1] : '';
}

function toDateStamp(now = new Date()) {
  return (now instanceof Date ? now : new Date(now)).toISOString().slice(0, 10);
}

function isWithinDays(dateString, maxDays, now = new Date()) {
  if (typeof dateString !== 'string') return false;
  const then = new Date(dateString);
  if (!Number.isFinite(then.getTime())) return false;
  const diff = (now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= maxDays;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOembedJson(youtubeUrl, {
  fetchImpl = globalThis.fetch,
  maxRetries = 3,
  retryDelayMs = 300
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('validate-videos requires fetch or fetchImpl');
  }

  const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(youtubeUrl)}&format=json`;
  let lastError = null;

  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    try {
      const response = await fetchImpl(endpoint, {
        method: 'GET',
        headers: {
          'accept': 'application/json'
        }
      });

      if (!response.ok) {
        lastError = new Error(`oEmbed HTTP ${response.status}`);
      } else {
        const payload = await response.json();
        if (!payload || typeof payload !== 'object') {
          lastError = new Error('oEmbed payload was not a JSON object');
        } else {
          return payload;
        }
      }
    } catch (error) {
      lastError = error;
    }

    if (attempt < maxRetries - 1) {
      await delay(retryDelayMs * (attempt + 1));
    }
  }

  throw lastError ?? new Error('oEmbed request failed');
}

function normalizeOembedFields(payload) {
  const title = String(payload.title ?? '').trim();
  const author_name = String(payload.author_name ?? '').trim();
  const author_url = String(payload.author_url ?? '').trim();
  const thumbnail_url = String(payload.thumbnail_url ?? '').trim();
  const provider_name = String(payload.provider_name ?? '').trim();

  if (!title || !author_name || !thumbnail_url || !provider_name) {
    return null;
  }

  return { title, author_name, author_url, thumbnail_url, provider_name };
}

async function validateAndFilterVideos({
  inputVideos,
  fetchImpl = globalThis.fetch,
  now = new Date(),
  maxRetries = 3,
  retryDelayMs = 300
} = {}) {
  const valid = [];
  const invalid = [];

  for (const row of inputVideos ?? []) {
    const brandSlug = String(row?.brandSlug ?? '').trim().toLowerCase();
    const youtubeUrl = String(row?.youtubeUrl ?? '').trim();

    if (!brandSlug || !youtubeUrl) {
      invalid.push({ ...row, reason: 'missing brandSlug or youtubeUrl' });
      continue;
    }

    const videoId = extractYouTubeId(youtubeUrl);
    if (!videoId) {
      invalid.push({ ...row, reason: 'invalid youtube URL format' });
      continue;
    }

    let oembedRaw;
    try {
      oembedRaw = await fetchOembedJson(youtubeUrl, {
        fetchImpl,
        maxRetries,
        retryDelayMs
      });
    } catch (error) {
      invalid.push({ ...row, reason: `oembed failed: ${error.message}` });
      continue;
    }

    const oembed = normalizeOembedFields(oembedRaw);
    if (!oembed) {
      invalid.push({ ...row, reason: 'oembed missing required fields' });
      continue;
    }

    const authorRule = OFFICIAL_AUTHOR_RULES[brandSlug];
    if (authorRule && !authorRule.test(oembed.author_name)) {
      invalid.push({
        ...row,
        reason: `oembed author "${oembed.author_name}" does not match official rule for ${brandSlug}`
      });
      continue;
    }

    valid.push({
      brandSlug,
      youtubeUrl,
      validatedAt: toDateStamp(now),
      oembed
    });
  }

  return { valid, invalid };
}

async function runVideoValidation({
  repoRoot = path.resolve(__dirname, '..'),
  videoPath = path.join(repoRoot, 'data', 'videos', 'brand-videos.json'),
  reportPath = path.join(repoRoot, 'reports', 'video-validation.json'),
  fetchImpl = globalThis.fetch,
  now = new Date(),
  logger = console
} = {}) {
  const source = JSON.parse(await readFile(videoPath, 'utf8'));
  const inputVideos = Array.isArray(source.videos) ? source.videos : [];
  const { valid, invalid } = await validateAndFilterVideos({
    inputVideos,
    fetchImpl,
    now
  });

  const output = {
    schema_version: 1,
    last_updated: toDateStamp(now),
    videos: valid
  };
  await writeFile(videoPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  const report = {
    generatedAt: (now instanceof Date ? now : new Date(now)).toISOString(),
    checked: inputVideos.length,
    validCount: valid.length,
    invalidCount: invalid.length,
    invalid
  };
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  logger.log(`[validate-videos] checked=${report.checked} valid=${report.validCount} invalid=${report.invalidCount}`);
  return {
    outputPath: videoPath,
    reportPath,
    valid,
    invalid,
    exitCode: invalid.length > 0 ? 1 : 0
  };
}

if (require.main === module) {
  runVideoValidation()
    .then((result) => {
      if (result.exitCode !== 0) process.exitCode = result.exitCode;
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

module.exports = {
  extractYouTubeId,
  isWithinDays,
  runVideoValidation,
  validateAndFilterVideos
};
