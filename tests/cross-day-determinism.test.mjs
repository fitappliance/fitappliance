import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const repoRoot = process.cwd();

const { generateSitemap } = require('../scripts/generate-sitemap.js');
const { generateRss } = require('../scripts/generate-rss.js');
const { buildLinkGraph } = require('../scripts/build-link-graph.js');
const { validateSchema } = require('../scripts/validate-schema.js');

async function renderDateSensitiveOutputs(timestamp) {
  const previousTimestamp = process.env.FIT_BUILD_TIMESTAMP;
  process.env.FIT_BUILD_TIMESTAMP = timestamp;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fitappliance-cross-day-'));
  const outputs = {
    sitemap: path.join(tempDir, 'sitemap.xml'),
    rss: path.join(tempDir, 'rss.xml'),
    linkGraph: path.join(tempDir, 'link-graph.json'),
    schema: path.join(tempDir, 'schema-validation.json')
  };

  try {
    await generateSitemap({ repoRoot, outputPath: outputs.sitemap, logger: { log() {} } });
    await generateRss({ repoRoot, outputPath: outputs.rss, logger: { log() {} } });
    await buildLinkGraph({ repoRoot, outputPath: outputs.linkGraph, logger: { log() {} } });
    await validateSchema({ repoRoot, outputPath: outputs.schema, logger: { log() {} } });

    return {
      sitemap: await fs.readFile(outputs.sitemap, 'utf8'),
      rss: await fs.readFile(outputs.rss, 'utf8'),
      linkGraph: await fs.readFile(outputs.linkGraph, 'utf8'),
      schema: await fs.readFile(outputs.schema, 'utf8')
    };
  } finally {
    if (previousTimestamp === undefined) {
      delete process.env.FIT_BUILD_TIMESTAMP;
    } else {
      process.env.FIT_BUILD_TIMESTAMP = previousTimestamp;
    }
  }
}

test('phase 46 date drift: sampled generated outputs are stable across wallclock days', async () => {
  const dayOne = await renderDateSensitiveOutputs('2026-04-26T00:00:00.000Z');
  const dayTwo = await renderDateSensitiveOutputs('2026-04-27T00:00:00.000Z');

  assert.deepEqual(dayTwo, dayOne);
});
