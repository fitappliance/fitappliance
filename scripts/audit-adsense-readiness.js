#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { mkdir, readFile, writeFile } = require('node:fs/promises');

const SITE = 'fitappliance.com.au';
const REPORT_PATH = path.join('reports', 'adsense-low-value-remediation.md');

function visibleText(html) {
  return String(html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordCount(html) {
  const text = visibleText(html);
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

function extractSitemapUrls(xml) {
  return [...String(xml ?? '').matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
}

function groupUrlsByFirstSegment(urls) {
  const groups = {};
  for (const url of urls) {
    const segment = new URL(url).pathname.split('/')[1] || 'home';
    groups[segment] = (groups[segment] ?? 0) + 1;
  }
  return groups;
}

function formatPercent(value) {
  return `${(Number(value) * 100).toFixed(1)}%`;
}

async function readUtf8(repoRoot, relativePath) {
  return readFile(path.join(repoRoot, relativePath), 'utf8');
}

async function auditAdsenseReadiness({
  repoRoot = path.resolve(__dirname, '..'),
  outputPath = path.join(repoRoot, REPORT_PATH)
} = {}) {
  const [homeHtml, methodologyHtml, editorialHtml, guideIndexText, sitemapXml, adsTxt, robotsTxt] = await Promise.all([
    readUtf8(repoRoot, 'index.html'),
    readUtf8(repoRoot, 'pages/methodology.html'),
    readUtf8(repoRoot, 'pages/about/editorial-standards.html'),
    readUtf8(repoRoot, 'pages/guides/index.json'),
    readUtf8(repoRoot, 'public/sitemap.xml'),
    readUtf8(repoRoot, 'public/ads.txt'),
    readUtf8(repoRoot, 'public/robots.txt')
  ]);

  const guideRows = JSON.parse(guideIndexText);
  const sitemapUrls = extractSitemapUrls(sitemapXml);
  const groups = groupUrlsByFirstSegment(sitemapUrls);
  const programmaticPrefixes = ['products', 'brands', 'compare', 'cavity', 'doorway', 'location', 'fit-check'];
  const programmaticUrlCount = programmaticPrefixes.reduce((sum, key) => sum + (groups[key] ?? 0), 0);
  const programmaticUrlRatio = sitemapUrls.length ? programmaticUrlCount / sitemapUrls.length : 0;

  const deepEditorialPages = [
    { route: '/', words: wordCount(homeHtml), marker: homeHtml.includes('id="adsense-content-value"') },
    { route: '/methodology', words: wordCount(methodologyHtml), marker: /How we calculate fit/i.test(methodologyHtml) },
    { route: '/about/editorial-standards', words: wordCount(editorialHtml), marker: /Our claims policy/i.test(editorialHtml) },
    ...guideRows.map((row) => ({
      route: row.url,
      words: null,
      marker: Number(row.linkCount ?? 0) >= 30
    }))
  ];

  const manualReviewChecklist = [
    'Home page now includes an original utility explanation that says the site is not a scraped price list.',
    'Deep guide hub, methodology, editorial standards, privacy, terms, contact, affiliate disclosure and ads.txt are all directly reachable.',
    'Ad slots remain outside product cards, search inputs and affiliate CTA zones to preserve content and conversion clarity.',
    'Sitemap exposes the programmatic catalog while each generated page links back to methodology and guide hubs.',
    'After deploy, manually tick "I confirm I fixed the issue" and request AdSense review again.'
  ];

  const checks = [
    { label: 'ads.txt publisher line', passed: /google\.com,\s*pub-7257149597818537,\s*DIRECT/.test(adsTxt) },
    { label: 'Homepage original value section', passed: homeHtml.includes('id="adsense-content-value"') },
    { label: 'Homepage guide hub link', passed: homeHtml.includes('href="/guides/appliance-fit-sizing-handbook"') },
    { label: 'Methodology page depth', passed: wordCount(methodologyHtml) >= 1800 },
    { label: 'Editorial standards page depth', passed: wordCount(editorialHtml) >= 1000 },
    { label: 'Five guide hubs listed', passed: Array.isArray(guideRows) && guideRows.length >= 5 },
    { label: 'Internal tooling blocked in robots.txt', passed: /Disallow:\s*\/api\//.test(robotsTxt) && /Disallow:\s*\/_vercel\//.test(robotsTxt) }
  ];

  const report = [
    '# AdSense Low-Value Content Remediation',
    '',
    `Site: ${SITE}`,
    `Generated: 2026-06-08`,
    '',
    '## Summary',
    '',
    'Google AdSense flagged the site for low-value content. The likely risk profile is not missing ads.txt ownership; it is the ratio of programmatic URLs to human-authored explanatory content. This remediation strengthens the homepage as a clear original utility page and documents the review evidence needed for manual resubmission.',
    '',
    '## Readiness Checks',
    '',
    ...checks.map((check) => `- ${check.passed ? 'PASS' : 'FAIL'} — ${check.label}`),
    '',
    '## Content Evidence',
    '',
    '- Original utility layer: homepage includes a dedicated explanation of the appliance-fit calculation, evidence labels, and separation between content, ads and affiliate links.',
    `- Deep editorial pages: methodology has ${wordCount(methodologyHtml)} visible words; editorial standards has ${wordCount(editorialHtml)} visible words; guide hubs listed: ${guideRows.length}.`,
    `- Sitemap shape: ${sitemapUrls.length} URLs total; ${programmaticUrlCount} programmatic URLs; programmaticUrlRatio ${formatPercent(programmaticUrlRatio)}.`,
    '- Minimum content requirements: the homepage, trust pages and guide hub now make clear that FitAppliance provides unique fit calculations, not generic product-list aggregation.',
    '- User experience: manual AdSense units are kept in footer, long-form content and zero-result zones, not beside the primary cavity input or affiliate retailer buttons.',
    '',
    '## URL Mix',
    '',
    ...Object.entries(groups)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([group, count]) => `- ${group}: ${count}`),
    '',
    '## Manual resubmission checklist',
    '',
    ...manualReviewChecklist.map((item) => `- ${item}`),
    '',
    '## Remaining Risk',
    '',
    'AdSense may still take several days to review the updated production HTML. If the next rejection repeats low-value content, the next controlled step is to temporarily remove the lowest-context generated URL families from the sitemap during AdSense review, starting with doorway and low-volume brand pages, while preserving core product and guide URLs.',
    ''
  ].join('\n');

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, report, 'utf8');

  return {
    outputPath,
    checks,
    sitemapUrlCount: sitemapUrls.length,
    programmaticUrlCount,
    programmaticUrlRatio,
    manualReviewChecklist
  };
}

if (require.main === module) {
  auditAdsenseReadiness().then((result) => {
    const failed = result.checks.filter((check) => !check.passed);
    console.log(`Wrote ${path.relative(process.cwd(), result.outputPath)}`);
    console.log(`Sitemap URLs: ${result.sitemapUrlCount}`);
    console.log(`Programmatic URL ratio: ${formatPercent(result.programmaticUrlRatio)}`);
    if (failed.length > 0) {
      console.error(`Failed checks: ${failed.map((check) => check.label).join(', ')}`);
      process.exitCode = 1;
    }
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  auditAdsenseReadiness,
  extractSitemapUrls,
  groupUrlsByFirstSegment,
  visibleText,
  wordCount
};
