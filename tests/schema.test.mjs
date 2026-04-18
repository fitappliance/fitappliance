import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const METHODOLOGY_PATH = path.join(ROOT, 'pages', 'methodology.html');
const EDITORIAL_PATH = path.join(ROOT, 'pages', 'about', 'editorial-standards.html');

function walkHtmlFiles(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const output = [];
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      output.push(...walkHtmlFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      output.push(fullPath);
    }
  }
  return output;
}

function collectSchemaBlocks(html) {
  const blocks = [];
  const matches = html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of matches) {
    blocks.push(match[1].trim());
  }
  return blocks;
}

function hasDisallowedRatingFields(value) {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((row) => hasDisallowedRatingFields(row));
  if (Object.prototype.hasOwnProperty.call(value, 'aggregateRating')) return true;
  if (Object.prototype.hasOwnProperty.call(value, 'reviewCount')) return true;
  return Object.values(value).some((row) => hasDisallowedRatingFields(row));
}

test('phase 22: methodology and editorial standards pages exist', () => {
  assert.ok(fs.existsSync(METHODOLOGY_PATH), 'pages/methodology.html should exist');
  assert.ok(fs.existsSync(EDITORIAL_PATH), 'pages/about/editorial-standards.html should exist');
});

test('phase 22: every html page includes footer links to methodology and editorial standards', () => {
  const htmlFiles = [path.join(ROOT, 'index.html'), ...walkHtmlFiles(path.join(ROOT, 'pages'))];
  for (const filePath of htmlFiles) {
    const html = fs.readFileSync(filePath, 'utf8');
    assert.match(html, /href="\/methodology"/, `${path.relative(ROOT, filePath)} missing /methodology footer link`);
    assert.match(
      html,
      /href="\/about\/editorial-standards"/,
      `${path.relative(ROOT, filePath)} missing /about/editorial-standards footer link`
    );
  }
});

test('phase 22: all html pages expose article:modified_time metadata', () => {
  const htmlFiles = [path.join(ROOT, 'index.html'), ...walkHtmlFiles(path.join(ROOT, 'pages'))];
  for (const filePath of htmlFiles) {
    const html = fs.readFileSync(filePath, 'utf8');
    assert.match(
      html,
      /<meta name="article:modified_time" content="[^"]+">/,
      `${path.relative(ROOT, filePath)} missing article:modified_time`
    );
  }
});

test('phase 22: all JSON-LD blocks parse and contain no fake aggregate rating fields', () => {
  const htmlFiles = [path.join(ROOT, 'index.html'), ...walkHtmlFiles(path.join(ROOT, 'pages'))];
  for (const filePath of htmlFiles) {
    const html = fs.readFileSync(filePath, 'utf8');
    const blocks = collectSchemaBlocks(html);
    for (const block of blocks) {
      const parsed = JSON.parse(block);
      assert.equal(
        hasDisallowedRatingFields(parsed),
        false,
        `${path.relative(ROOT, filePath)} contains aggregateRating/reviewCount without source data`
      );
    }
  }
});

test('phase 22: schema validation report exists and has zero errors', () => {
  const reportPath = path.join(ROOT, 'reports', 'schema-validation.json');
  assert.ok(fs.existsSync(reportPath), 'reports/schema-validation.json should exist');
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  assert.equal(Number(report.errors ?? 0), 0, 'schema report should show 0 errors');
});
