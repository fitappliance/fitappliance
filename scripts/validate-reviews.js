#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { mkdir, readFile, writeFile } = require('node:fs/promises');

function buildYouTubeWatchUrl(youtubeId) {
  return `https://www.youtube.com/watch?v=${String(youtubeId ?? '').trim()}`;
}

function toDateStamp(now = new Date()) {
  return (now instanceof Date ? now : new Date(now)).toISOString().slice(0, 10);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOembedJson(youtubeId, {
  fetchImpl = globalThis.fetch,
  maxRetries = 3,
  retryDelayMs = 300
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('validate-reviews requires fetch or fetchImpl');
  }

  const youtubeUrl = buildYouTubeWatchUrl(youtubeId);
  const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(youtubeUrl)}&format=json`;
  let lastError = null;

  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    try {
      const response = await fetchImpl(endpoint, {
        method: 'GET',
        headers: { accept: 'application/json' }
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

function normalizeOembed(payload) {
  const title = String(payload?.title ?? '').trim();
  const author_name = String(payload?.author_name ?? '').trim();
  const author_url = String(payload?.author_url ?? '').trim();
  const thumbnail_url = String(payload?.thumbnail_url ?? '').trim();
  const provider_name = String(payload?.provider_name ?? '').trim();
  const html = String(payload?.html ?? '').trim();

  if (!title || !author_name || !author_url || !thumbnail_url || !provider_name || !html) {
    return null;
  }

  return {
    title,
    author_name,
    author_url,
    thumbnail_url,
    provider_name,
    html
  };
}

function creatorMatchesWhitelist(creator, oembed) {
  if (!creator || typeof creator !== 'object' || !oembed) return false;
  const displayName = String(creator.displayName ?? '').trim().toLowerCase();
  const channelId = String(creator.channelId ?? '').trim();
  const channelUrl = String(creator.channelUrl ?? '').trim().toLowerCase();
  const authorName = String(oembed.author_name ?? '').trim().toLowerCase();
  const authorUrl = String(oembed.author_url ?? '').trim().toLowerCase();

  if (displayName && authorName === displayName) return true;
  if (channelId && authorUrl.includes(channelId.toLowerCase())) return true;
  if (channelUrl && authorUrl === channelUrl) return true;
  return false;
}

async function validateAndFilterReviews({
  reviewEntries,
  whitelistDocument,
  fetchImpl = globalThis.fetch,
  now = new Date(),
  maxRetries = 3,
  retryDelayMs = 300
} = {}) {
  const creators = new Map((whitelistDocument?.creators ?? []).map((creator) => [creator.id, creator]));
  const valid = [];
  const invalid = [];

  for (const review of reviewEntries ?? []) {
    const modelSlug = String(review?.modelSlug ?? '').trim();
    const youtubeId = String(review?.youtubeId ?? '').trim();
    const creatorId = String(review?.creatorId ?? '').trim();
    const creator = creators.get(creatorId);

    if (!modelSlug || !youtubeId || !creatorId) {
      invalid.push({ ...review, reason: 'missing modelSlug, youtubeId, or creatorId' });
      continue;
    }
    if (!creator) {
      invalid.push({ ...review, reason: `creatorId "${creatorId}" is not in whitelist` });
      continue;
    }

    let oembedRaw;
    try {
      oembedRaw = await fetchOembedJson(youtubeId, {
        fetchImpl,
        maxRetries,
        retryDelayMs
      });
    } catch (error) {
      invalid.push({ ...review, reason: `oembed failed: ${error.message}` });
      continue;
    }

    const oembed = normalizeOembed(oembedRaw);
    if (!oembed) {
      invalid.push({ ...review, reason: 'oembed missing required fields or embed-disabled html' });
      continue;
    }

    if (!creatorMatchesWhitelist(creator, oembed)) {
      invalid.push({
        ...review,
        reason: `oembed author_name "${oembed.author_name}" does not match whitelist creator "${creator.displayName}"`
      });
      continue;
    }

    valid.push({
      ...review,
      validatedAt: toDateStamp(now),
      oembed
    });
  }

  return { valid, invalid };
}

function flattenReviewDocument(reviewDocument) {
  const models = reviewDocument?.models ?? {};
  const rows = [];
  for (const [modelSlug, entry] of Object.entries(models)) {
    const reviews = Array.isArray(entry?.reviews) ? entry.reviews : [];
    for (const review of reviews) {
      rows.push({
        modelSlug,
        ...review
      });
    }
  }
  return rows;
}

function mergeValidatedReviews(reviewDocument, { valid, invalid }, now = new Date()) {
  const validByKey = new Map(valid.map((row) => [`${row.modelSlug}:${row.youtubeId}`, row]));
  const invalidByKey = new Map(invalid.map((row) => [`${row.modelSlug}:${row.youtubeId}`, row]));
  const nextModels = {};

  for (const [modelSlug, entry] of Object.entries(reviewDocument?.models ?? {})) {
    const nextReviews = (Array.isArray(entry?.reviews) ? entry.reviews : []).map((review) => {
      const key = `${modelSlug}:${review.youtubeId}`;
      const validRow = validByKey.get(key);
      if (validRow) return validRow;
      if (invalidByKey.has(key)) {
        const { validatedAt, oembed, ...rest } = review;
        return {
          ...rest,
          validatedAt: null
        };
      }
      return review;
    });

    nextModels[modelSlug] = {
      modelSlug,
      reviews: nextReviews
    };
  }

  return {
    schema_version: reviewDocument?.schema_version ?? 1,
    last_updated: toDateStamp(now),
    models: nextModels
  };
}

async function runReviewValidation({
  repoRoot = path.resolve(__dirname, '..'),
  reviewsPath = path.join(repoRoot, 'data', 'videos', 'review-videos.json'),
  whitelistPath = path.join(repoRoot, 'data', 'videos', 'creator-whitelist.json'),
  reportPath = path.join(repoRoot, 'reports', 'review-validation.json'),
  fetchImpl = globalThis.fetch,
  now = new Date(),
  logger = console
} = {}) {
  const reviewDocument = JSON.parse(await readFile(reviewsPath, 'utf8'));
  const whitelistDocument = JSON.parse(await readFile(whitelistPath, 'utf8'));
  const reviewEntries = flattenReviewDocument(reviewDocument);
  const { valid, invalid } = await validateAndFilterReviews({
    reviewEntries,
    whitelistDocument,
    fetchImpl,
    now
  });

  const output = mergeValidatedReviews(reviewDocument, { valid, invalid }, now);
  await writeFile(reviewsPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  const report = {
    generatedAt: (now instanceof Date ? now : new Date(now)).toISOString(),
    checked: reviewEntries.length,
    validCount: valid.length,
    invalidCount: invalid.length,
    invalid
  };
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  logger.log(`[validate-reviews] checked=${report.checked} valid=${report.validCount} invalid=${report.invalidCount}`);
  return {
    outputPath: reviewsPath,
    reportPath,
    valid,
    invalid,
    exitCode: invalid.length > 0 ? 1 : 0
  };
}

if (require.main === module) {
  runReviewValidation()
    .then((result) => {
      if (result.exitCode !== 0) process.exitCode = result.exitCode;
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

module.exports = {
  buildYouTubeWatchUrl,
  creatorMatchesWhitelist,
  flattenReviewDocument,
  mergeValidatedReviews,
  runReviewValidation,
  validateAndFilterReviews
};
