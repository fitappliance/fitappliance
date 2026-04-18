#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const HOST = 'fitappliance.com.au';
const KEY_FILE = path.join(__dirname, '..', '.indexnow-key');
const SITEMAP = path.join(__dirname, '..', 'public', 'sitemap.xml');

function parseSitemapUrls(xmlText) {
  return [...xmlText.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
}

function pingIndexNow() {
  if (!fs.existsSync(KEY_FILE)) {
    console.error('[indexnow] Missing .indexnow-key');
    process.exit(1);
  }
  if (!fs.existsSync(SITEMAP)) {
    console.error('[indexnow] Missing public/sitemap.xml');
    process.exit(1);
  }

  const key = fs.readFileSync(KEY_FILE, 'utf8').trim();
  const sitemap = fs.readFileSync(SITEMAP, 'utf8');
  const urls = parseSitemapUrls(sitemap);

  if (!key || !/^[a-f0-9]{32}$/u.test(key)) {
    console.error('[indexnow] Invalid key format in .indexnow-key');
    process.exit(1);
  }
  if (urls.length === 0) {
    console.error('[indexnow] No URLs found in sitemap');
    process.exit(1);
  }

  const payload = JSON.stringify({
    host: HOST,
    key,
    keyLocation: `https://${HOST}/${key}.txt`,
    urlList: urls
  });

  const req = https.request({
    hostname: 'api.indexnow.org',
    path: '/IndexNow',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(payload)
    }
  }, (res) => {
    console.log(`[indexnow] HTTP ${res.statusCode} for ${urls.length} URLs`);
    res.on('data', (chunk) => process.stdout.write(chunk));
    process.exitCode = (res.statusCode === 200 || res.statusCode === 202) ? 0 : 1;
  });

  req.on('error', (error) => {
    console.error('[indexnow] Request failed:', error.message);
    process.exit(1);
  });

  req.write(payload);
  req.end();
}

if (require.main === module) {
  pingIndexNow();
}

module.exports = {
  parseSitemapUrls
};
