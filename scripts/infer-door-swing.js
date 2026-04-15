'use strict';

const path = require('node:path');
const { readFile } = require('node:fs/promises');
const { writeJsonAtomically } = require('./utils/file-utils.js');

const FRIDGE_ZERO_SWING_CONFIGURATIONS = new Set([
  'Chest',
  'Side by Side',
  'French Door'
]);
const FRIDGE_ZERO_SWING_TYPE_CODES = new Set(['7']);
const FRIDGE_WIDE_UPRIGHT_THRESHOLD_MM = 880;
const FRIDGE_BOTTOM_MOUNT_CODE = '5B';

const INFERENCE_RULES = {
  washing_machine: {
    condition: (product) =>
      product?.top_loader === false ||
      product?.top_loader === null ||
      product?.top_loader === undefined,
    value: 0,
    reason: 'front-loading — door opens outward, no lateral arc'
  },
  dryer: {
    condition: () => true,
    value: 0,
    reason: 'front-loading dryer — no lateral arc'
  },
  dishwasher: {
    condition: () => true,
    value: 0,
    reason: 'front-panel down-opening — no lateral arc'
  },
  fridge: {
    condition: (product) => {
      const config = product?.features?.[0];
      const type = product?.features?.[1];
      const width = product?.w;

      if (type === '1') {
        return false;
      }

      if (typeof config === 'string' && FRIDGE_ZERO_SWING_CONFIGURATIONS.has(config)) {
        return true;
      }

      if (config === 'Upright' && typeof type === 'string' && FRIDGE_ZERO_SWING_TYPE_CODES.has(type)) {
        return true;
      }

      if (config === 'Upright' && typeof width === 'number' && width >= FRIDGE_WIDE_UPRIGHT_THRESHOLD_MM) {
        return true;
      }

      if (config === 'Upright' && type === FRIDGE_BOTTOM_MOUNT_CODE) {
        return true;
      }

      return false;
    },
    value: 0,
    reason: 'fridge configuration (Chest/SBS/FD/type-7-freezer/wide-upright/bottom-mount) — no lateral door arc'
  }
};

function hasDoorSwingValue(value) {
  return value !== null && value !== undefined;
}

function inferFromDocument(document) {
  let updatedCount = 0;
  let skippedCount = 0;
  let unchangedCount = 0;

  const products = Array.isArray(document?.products) ? document.products : [];
  const nextProducts = products.map((product) => {
    const rule = INFERENCE_RULES[product?.cat];
    if (!rule) {
      unchangedCount += 1;
      return product;
    }

    if (hasDoorSwingValue(product?.door_swing_mm)) {
      skippedCount += 1;
      return product;
    }

    if (!rule.condition(product)) {
      unchangedCount += 1;
      return product;
    }

    updatedCount += 1;
    return {
      ...product,
      door_swing_mm: rule.value,
      inferred_door_swing: true
    };
  });

  return {
    updatedCount,
    skippedCount,
    unchangedCount,
    document: {
      ...document,
      products: nextProducts
    }
  };
}

async function inferDoorSwing({
  dataDir = path.join(path.resolve(__dirname, '..'), 'public', 'data'),
  write = true,
  logger = console,
  document
} = {}) {
  const appliancesPath = path.join(dataDir, 'appliances.json');
  const baseDocument = document ?? JSON.parse(await readFile(appliancesPath, 'utf8'));
  const result = inferFromDocument(baseDocument);

  if (write) {
    await writeJsonAtomically(appliancesPath, result.document);
  }

  if (typeof logger?.log === 'function') {
    logger.log(
      `[infer-door-swing] updated=${result.updatedCount}, skipped=${result.skippedCount}, unchanged=${result.unchangedCount}`
    );
  }

  return result;
}

if (require.main === module) {
  inferDoorSwing().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  FRIDGE_ZERO_SWING_CONFIGURATIONS,
  FRIDGE_ZERO_SWING_TYPE_CODES,
  FRIDGE_WIDE_UPRIGHT_THRESHOLD_MM,
  FRIDGE_BOTTOM_MOUNT_CODE,
  inferDoorSwing,
  inferFromDocument,
  INFERENCE_RULES
};
