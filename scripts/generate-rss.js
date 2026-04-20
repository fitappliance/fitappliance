#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { mkdir, readFile, writeFile } = require('node:fs/promises');
const { getBuildDateObject } = require('./utils/build-timestamp.js');
const { SITE_ORIGIN } = require('./common/site-origin.js');

const CATEGORY_LABEL = {
  fridge: 'Fridge',
  washing_machine: 'Washing Machine',
  dishwasher: 'Dishwasher',
  dryer: 'Dryer'
};

function escXml(value) {
  return String(value ?? '').replace(/[<>&'"]/g, (char) => {
    const map = {
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
      "'": '&apos;',
      '"': '&quot;'
    };
    return map[char] ?? char;
  });
}

async function readJson(filePath, fallback = []) {
  try {
    const text = await readFile(filePath, 'utf8');
    return JSON.parse(text);
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallback;
    throw error;
  }
}

function buildRssItemXml(item) {
  return [
    '    <item>',
    `      <title>${escXml(item.title)}</title>`,
    `      <link>${escXml(item.link)}</link>`,
    `      <guid>${escXml(item.link)}</guid>`,
    `      <pubDate>${escXml(item.pubDate)}</pubDate>`,
    `      <description>${escXml(item.description)}</description>`,
    '    </item>'
  ].join('\n');
}

function buildItemRows({
  baseUrl,
  brands,
  comparisons,
  cavity,
  guides,
  doorway,
  locations,
  pubDate
}) {
  const rows = [];
  const guideRows = (guides ?? []).map((row, index) => ({
    score: 100000 - index,
    title: row.title ?? `Guide: ${row.slug}`,
    link: `${baseUrl}${row.url ?? `/guides/${row.slug}`}`,
    pubDate,
    description: row.description ?? 'FitAppliance topic hub guide.'
  }));
  const locationRows = (locations ?? []).map((row, index) => ({
    score: 90000 - index,
    title: `${row.categoryLabel ?? row.category} Cavity & Doorway Guide — ${row.city ?? row.citySlug}`,
    link: `${baseUrl}${row.url ?? `/location/${row.citySlug}/${row.category}`}`,
    pubDate,
    description: `${row.categoryLabel ?? row.category} fitting resources for ${row.city ?? row.citySlug}, ${row.stateCode ?? 'AU'}.`
  }));

  for (const row of brands) {
    const cat = CATEGORY_LABEL[row.cat] ?? String(row.cat ?? 'Appliance');
    rows.push({
      score: Number(row.models ?? 0),
      title: `${row.brand} ${cat} Clearance Guide (AU)`,
      link: `${baseUrl}${row.url ?? `/brands/${row.slug}`}`,
      pubDate,
      description: `${row.models} ${row.brand} ${cat.toLowerCase()} models with ventilation clearance guidance for Australian homes.`
    });
  }

  for (const row of comparisons) {
    const cat = CATEGORY_LABEL[row.cat] ?? String(row.cat ?? 'Appliance');
    rows.push({
      score: Number(row.modelsA ?? 0) + Number(row.modelsB ?? 0),
      title: `${row.brandA} vs ${row.brandB} ${cat} Clearance Comparison`,
      link: `${baseUrl}${row.url ?? `/compare/${row.slug}`}`,
      pubDate,
      description: `Side-by-side ${cat.toLowerCase()} clearance comparison between ${row.brandA} and ${row.brandB}.`
    });
  }

  for (const row of cavity) {
    rows.push({
      score: Number(row.results ?? 0),
      title: `${row.width}mm Fridge Cavity Fit Guide`,
      link: `${baseUrl}${row.url ?? `/cavity/${row.slug}`}`,
      pubDate,
      description: `${row.results} fridge models that fit a ${row.width}mm cavity after brand clearance rules.`
    });
  }

  for (const row of doorway) {
    rows.push({
      score: Number(row.results ?? 0),
      title: `${row.doorway}mm Fridge Doorway Fit Guide`,
      link: `${baseUrl}${row.url ?? `/doorway/${row.slug}`}`,
      pubDate,
      description: `${row.results} fridge models that can pass a ${row.doorway}mm doorway with handling margin.`
    });
  }

  const ranked = rows
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
    .slice(0, Math.max(0, 50 - guideRows.length - locationRows.length));

  return [...guideRows, ...locationRows, ...ranked].slice(0, 50);
}

async function generateRss({
  repoRoot = path.resolve(__dirname, '..'),
  outputPath = path.join(repoRoot, 'public', 'rss.xml'),
  baseUrl = SITE_ORIGIN,
  logger = console,
  today = getBuildDateObject()
} = {}) {
  const brands = await readJson(path.join(repoRoot, 'pages', 'brands', 'index.json'), []);
  const comparisons = await readJson(path.join(repoRoot, 'pages', 'compare', 'index.json'), []);
  const cavity = await readJson(path.join(repoRoot, 'pages', 'cavity', 'index.json'), []);
  const doorway = await readJson(path.join(repoRoot, 'pages', 'doorway', 'index.json'), []);
  const guides = await readJson(path.join(repoRoot, 'pages', 'guides', 'index.json'), []);
  const locations = await readJson(path.join(repoRoot, 'pages', 'location', 'index.json'), []);
  const pubDate = today.toUTCString();
  const items = buildItemRows({ baseUrl, brands, comparisons, cavity, guides, doorway, locations, pubDate });
  const lastBuildDate = today.toUTCString();

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    '  <channel>',
    '    <title>FitAppliance AU — Clearance Updates</title>',
    `    <link>${escXml(baseUrl)}</link>`,
    '    <description>Latest FitAppliance updates for Australian appliance fit, clearance, and comparison guides.</description>',
    '    <language>en-au</language>',
    `    <lastBuildDate>${escXml(lastBuildDate)}</lastBuildDate>`,
    ...items.map((item) => buildRssItemXml(item)),
    '  </channel>',
    '</rss>',
    ''
  ].join('\n');

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, xml, 'utf8');
  logger.log(`Generated RSS feed with ${items.length} items at ${outputPath}`);
  return { itemCount: items.length, outputPath };
}

if (require.main === module) {
  generateRss().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  buildItemRows,
  generateRss
};
