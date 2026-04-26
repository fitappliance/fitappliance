import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

function walkHtmlFiles(relativeDir) {
  const root = path.join(repoRoot, relativeDir);
  const out = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkHtmlFiles(path.relative(repoRoot, full)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.html')) {
      out.push(path.relative(repoRoot, full).replace(/\\/g, '/'));
    }
  }
  return out;
}

function extractSameOriginAssetRefs(html) {
  const refs = [];
  const tagPattern = /<(link|script)\b[^>]*(?:href|src)=["']([^"']+)["'][^>]*>/gi;
  for (const match of html.matchAll(tagPattern)) {
    const rawRef = match[2].trim();
    if (!rawRef.startsWith('/') || rawRef.startsWith('//') || rawRef.startsWith('/#')) continue;
    refs.push(rawRef.split('#')[0].split('?')[0]);
  }
  return refs;
}

function matchRewrite(assetPath, rewrite) {
  const source = String(rewrite.source ?? '');
  if (source === assetPath) {
    return String(rewrite.destination ?? '');
  }

  if (source.includes(':path*')) {
    const prefix = source.slice(0, source.indexOf(':path*'));
    if (!assetPath.startsWith(prefix)) return null;
    const rest = assetPath.slice(prefix.length);
    return String(rewrite.destination ?? '').replace(':path*', rest);
  }

  return null;
}

function resolveAssetPath(assetPath, rewrites) {
  for (const rewrite of rewrites) {
    const destination = matchRewrite(assetPath, rewrite);
    if (!destination) continue;
    return {
      assetPath,
      resolvedPath: destination.replace(/^\//, ''),
      via: rewrite.source
    };
  }

  return {
    assetPath,
    resolvedPath: assetPath.replace(/^\//, ''),
    via: 'filesystem'
  };
}

test('static asset routing: every same-origin link/script reference resolves through vercel rewrites or repo files', () => {
  const config = readJson('vercel.json');
  const rewrites = Array.isArray(config.rewrites) ? config.rewrites : [];
  const htmlFiles = ['index.html', ...walkHtmlFiles('pages')];
  const failures = [];

  for (const htmlFile of htmlFiles) {
    const html = fs.readFileSync(path.join(repoRoot, htmlFile), 'utf8');
    for (const assetPath of extractSameOriginAssetRefs(html)) {
      const resolved = resolveAssetPath(assetPath, rewrites);
      const absolute = path.join(repoRoot, resolved.resolvedPath);
      if (fs.existsSync(absolute)) continue;
      failures.push(`${htmlFile} references ${assetPath}; ${resolved.via} resolves to missing ${resolved.resolvedPath}`);
    }
  }

  assert.deepEqual(failures, []);
});
