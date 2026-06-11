import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const {
  validateAndFilterVideos,
  isWithinDays
} = require('../scripts/validate-videos.js');

test('phase 30 videos: all entries have validatedAt within 90 days', () => {
  const filePath = path.join(repoRoot, 'data', 'videos', 'brand-videos.json');
  const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const videos = Array.isArray(json.videos) ? json.videos : [];
  assert.ok(videos.length >= 3, 'expected at least 3 validated brand videos');

  for (const row of videos) {
    assert.ok(row.validatedAt, 'validatedAt is required for every video entry');
    assert.equal(isWithinDays(row.validatedAt, 90), true, `${row.youtubeUrl} is stale`);
    assert.ok(row.uploadDate, 'uploadDate is required for Google VideoObject schema');
    assert.equal(Number.isFinite(new Date(row.uploadDate).getTime()), true, `${row.youtubeUrl} has invalid uploadDate`);
    assert.equal(typeof row.oembed?.title, 'string');
    assert.equal(typeof row.oembed?.author_name, 'string');
    assert.equal(typeof row.oembed?.thumbnail_url, 'string');
  }
});

test('phase 30 videos: samsung brand page contains VideoObject schema and facade embed section', () => {
  const html = fs.readFileSync(path.join(repoRoot, 'pages', 'brands', 'samsung-fridge-clearance.html'), 'utf8');
  assert.match(html, /id="install-video"/);
  assert.match(html, /"@type":\s*"VideoObject"/);
  assert.match(html, /"uploadDate":\s*"[0-9]{4}-[0-9]{2}-[0-9]{2}/);
  assert.match(html, /class="video-facade"/);
  assert.match(html, /data-youtube-id="/);
});

test('phase 30 videos: invalid oEmbed responses are removed from output set', async () => {
  const input = [
    { brandSlug: 'samsung', youtubeUrl: 'https://www.youtube.com/watch?v=WuPr6D49akQ', uploadDate: '2020-09-10T01:07:11-07:00' },
    { brandSlug: 'samsung', youtubeUrl: 'https://www.youtube.com/watch?v=invalidid00', uploadDate: '2020-09-10T01:07:11-07:00' }
  ];

  const result = await validateAndFilterVideos({
    inputVideos: input,
    fetchImpl: async (url) => {
      if (String(url).includes('invalidid00')) {
        return { ok: false, status: 404, json: async () => ({}) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          title: 'How to install Samsung refrigerator',
          author_name: 'Samsung Global CPC',
          author_url: 'https://www.youtube.com/@samsung',
          thumbnail_url: 'https://i.ytimg.com/vi/WuPr6D49akQ/hqdefault.jpg',
          provider_name: 'YouTube'
        })
      };
    },
    now: new Date('2026-04-18T00:00:00.000Z')
  });

  assert.equal(result.valid.length, 1);
  assert.equal(result.invalid.length, 1);
  assert.match(result.invalid[0].reason, /oembed/i);
});
