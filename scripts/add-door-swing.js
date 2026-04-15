'use strict';

const path = require('node:path');
const { mkdir, readFile } = require('node:fs/promises');
const { parseArgs } = require('node:util');
const { writeJsonAtomically } = require('./utils/file-utils.js');

const SOURCE_FILENAME = 'manual-research.json';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function emitLog(logger, level, message) {
  if (typeof logger?.[level] === 'function') {
    logger[level](message);
    return;
  }
  if (typeof logger?.log === 'function') {
    logger.log(message);
  }
}

function parseIds(id, ids) {
  const collected = [];

  if (typeof id === 'string' && id.trim()) {
    collected.push(id.trim());
  }

  if (typeof ids === 'string' && ids.trim()) {
    for (const part of ids.split(',')) {
      const next = part.trim();
      if (next) {
        collected.push(next);
      }
    }
  }

  const seen = new Set();
  const unique = [];
  for (const productId of collected) {
    if (seen.has(productId)) continue;
    seen.add(productId);
    unique.push(productId);
  }

  return unique;
}

function parseSwingValue(rawValue) {
  if (typeof rawValue === 'number') {
    if (!Number.isInteger(rawValue)) {
      throw new Error('door_swing_mm must be an integer');
    }
    if (rawValue < 0) {
      throw new Error('door_swing_mm cannot be negative');
    }
    return rawValue;
  }

  if (typeof rawValue !== 'string') {
    throw new Error('door_swing_mm value is required');
  }

  const value = rawValue.trim();
  if (!value) {
    throw new Error('door_swing_mm value is required');
  }
  if (/^-\d+$/.test(value)) {
    throw new Error('door_swing_mm cannot be negative');
  }
  if (!/^\d+$/.test(value)) {
    throw new Error('door_swing_mm must be a non-negative integer');
  }

  return Number.parseInt(value, 10);
}

function upsertEntries(document, newEntries, today = todayIso()) {
  const baseDocument = document && typeof document === 'object' ? document : {};
  const baseProducts = Array.isArray(baseDocument.products) ? baseDocument.products : [];
  const nextProducts = baseProducts.map((product) => ({ ...product }));
  const indexById = new Map(nextProducts.map((product, index) => [product.id, index]));

  for (const entry of newEntries) {
    const existingIndex = indexById.get(entry.id);
    if (existingIndex === undefined) {
      indexById.set(entry.id, nextProducts.length);
      nextProducts.push({
        id: entry.id,
        door_swing_mm: entry.door_swing_mm
      });
      continue;
    }

    nextProducts[existingIndex] = {
      ...nextProducts[existingIndex],
      id: entry.id,
      door_swing_mm: entry.door_swing_mm
    };
  }

  return {
    ...baseDocument,
    schema_version: 2,
    last_updated: today,
    products: nextProducts
  };
}

function formatDoorSwing(value) {
  return value === null || value === undefined ? 'null' : String(value);
}

async function addDoorSwing({
  ids,
  value,
  preview = false,
  write = !preview,
  dataDir = path.join(path.resolve(__dirname, '..'), 'public', 'data'),
  today = todayIso(),
  logger = console
} = {}) {
  const normalizedIds = Array.isArray(ids)
    ? ids.map((id) => String(id ?? '').trim()).filter(Boolean)
    : parseIds(undefined, ids);

  if (normalizedIds.length === 0) {
    throw new Error('At least one product ID is required (--id or --ids).');
  }

  const valueProvided = value !== undefined && value !== null && String(value).trim() !== '';
  if (!valueProvided && !preview) {
    throw new Error('--value is required unless --preview is used.');
  }

  const swingValue = valueProvided ? parseSwingValue(value) : null;
  const appliancesPath = path.join(dataDir, 'appliances.json');
  const sourcePath = path.join(dataDir, 'sources', SOURCE_FILENAME);
  const appliancesDocument = JSON.parse(await readFile(appliancesPath, 'utf8'));
  const products = Array.isArray(appliancesDocument.products) ? appliancesDocument.products : [];
  const productsById = new Map(products.map((product) => [product.id, product]));

  const entries = [];
  const skippedMissing = [];

  if (preview) {
    emitLog(logger, 'log', '[add-door-swing] PREVIEW — no file will be written');
  }

  for (const id of normalizedIds) {
    const product = productsById.get(id);
    if (!product) {
      skippedMissing.push(id);
      emitLog(logger, 'warn', `[warn] ID "${id}" not found in appliances.json — skipping`);
      continue;
    }

    if (product.door_swing_mm !== null && product.door_swing_mm !== undefined) {
      emitLog(
        logger,
        'warn',
        `[warn] ID "${id}" already has door_swing_mm=${product.door_swing_mm} in live data. ` +
          'Writing to manual-research.json will override on next sync.'
      );
    }

    if (preview) {
      const arrow = swingValue === null ? '' : ` → would set: ${swingValue}`;
      emitLog(
        logger,
        'log',
        `  ${id}  ${product.brand} | ${product.model} | w=${product.w}mm | ` +
          `current door_swing_mm: ${formatDoorSwing(product.door_swing_mm)}${arrow}`
      );
    }

    if (swingValue !== null) {
      entries.push({
        id,
        door_swing_mm: swingValue
      });
    }
  }

  if (preview || !write) {
    return {
      written: 0,
      entries,
      skippedMissing,
      sourcePath,
      preview: true
    };
  }

  if (entries.length === 0) {
    emitLog(logger, 'log', '[add-door-swing] No valid entries to write.');
    return {
      written: 0,
      entries,
      skippedMissing,
      sourcePath,
      preview: false
    };
  }

  let existingDocument = null;
  try {
    existingDocument = JSON.parse(await readFile(sourcePath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  const nextDocument = upsertEntries(existingDocument, entries, today);
  await mkdir(path.dirname(sourcePath), { recursive: true });
  await writeJsonAtomically(sourcePath, nextDocument);

  for (const entry of entries) {
    emitLog(
      logger,
      'log',
      `[add-door-swing] ${entry.id}: door_swing_mm = ${entry.door_swing_mm}  ✓ written`
    );
  }
  emitLog(
    logger,
    'log',
    `[add-door-swing] Wrote ${entries.length} entries to public/data/sources/${SOURCE_FILENAME}`
  );
  emitLog(logger, 'log', '[add-door-swing] Run `npm run sync -- --skip-cf` to apply to appliances.json');

  return {
    written: entries.length,
    entries,
    skippedMissing,
    sourcePath,
    preview: false,
    document: nextDocument
  };
}

async function runCli(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      id: { type: 'string' },
      ids: { type: 'string' },
      value: { type: 'string' },
      preview: { type: 'boolean', default: false },
      dataDir: { type: 'string' }
    }
  });

  const ids = parseIds(values.id, values.ids);
  await addDoorSwing({
    ids,
    value: values.value,
    preview: values.preview,
    write: !values.preview,
    dataDir: values.dataDir,
    logger: console
  });
}

if (require.main === module) {
  runCli().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  addDoorSwing,
  parseIds,
  parseSwingValue,
  runCli,
  upsertEntries
};
