'use strict';

const path = require('node:path');
const { readFile } = require('node:fs/promises');
const { parseArgs } = require('node:util');
const { parseSwingValue } = require('./add-door-swing.js');

function parseNonNegativeInt(value, label) {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }

  if (typeof value !== 'string') {
    throw new Error(`${label} must be a non-negative integer`);
  }

  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`${label} must be a non-negative integer`);
  }

  return Number.parseInt(normalized, 10);
}

function isPendingDoorSwing(product) {
  return product?.door_swing_mm === null || product?.door_swing_mm === undefined;
}

function findChassisCandidates(products, sourceProduct, { widthTolerance = 5 } = {}) {
  const tolerance = Number.isFinite(widthTolerance) ? Math.max(0, widthTolerance) : 5;
  const sourceWidth = Number(sourceProduct?.w);
  if (!Number.isFinite(sourceWidth)) {
    return [];
  }

  return (products ?? [])
    .filter((product) => {
      if (!product) return false;
      if (product.id === sourceProduct.id) return false;
      if (product.brand !== sourceProduct.brand) return false;
      if (product.cat !== sourceProduct.cat) return false;
      if (!Number.isFinite(product.w)) return false;
      if (!isPendingDoorSwing(product)) return false;
      return Math.abs(product.w - sourceWidth) <= tolerance;
    })
    .sort((left, right) => {
      if (left.w !== right.w) return left.w - right.w;
      if (left.h !== right.h) return left.h - right.h;
      return String(left.model ?? '').localeCompare(String(right.model ?? ''));
    });
}

function doorSwingText(value) {
  return value === null || value === undefined ? 'null' : String(value);
}

function buildAddSwingCommand(ids, value) {
  if (!Array.isArray(ids) || ids.length === 0) return '';
  if (!Number.isInteger(value) || value < 0) return '';
  return `node scripts/add-door-swing.js --ids ${ids.join(',')} --value ${value}`;
}

function printSafetyDisclaimer(logger, toStderr = false) {
  const lines = [
    '⚠️  Chassis matching is heuristic — width similarity ≠ identical door hinge spec.',
    '    For models with different door heights within the same width, verify independently.'
  ];
  if (toStderr && typeof logger?.error === 'function') {
    for (const line of lines) logger.error(line);
    return;
  }
  for (const line of lines) {
    if (typeof logger?.log === 'function') logger.log(line);
  }
}

async function suggestDoorSwing({
  id,
  brand,
  cat,
  width,
  value,
  tolerance = 5,
  format = 'table',
  dataDir = path.join(path.resolve(__dirname, '..'), 'public', 'data'),
  logger = console
} = {}) {
  const appliancesPath = path.join(dataDir, 'appliances.json');
  const appliancesDocument = JSON.parse(await readFile(appliancesPath, 'utf8'));
  const products = Array.isArray(appliancesDocument.products) ? appliancesDocument.products : [];
  const swingValue = value === undefined || value === null || String(value).trim() === ''
    ? null
    : parseSwingValue(value);
  const widthTolerance = parseNonNegativeInt(String(tolerance), 'tolerance');

  let sourceProduct;
  if (typeof id === 'string' && id.trim()) {
    sourceProduct = products.find((product) => product.id === id.trim());
    if (!sourceProduct) {
      throw new Error(`Product ID "${id}" not found in appliances.json`);
    }
  } else {
    if (!brand || !cat || width === undefined || width === null) {
      throw new Error('Provide --id, or provide --brand + --cat + --width');
    }

    sourceProduct = {
      id: '__manual-source__',
      brand: String(brand).trim(),
      cat: String(cat).trim(),
      w: parseNonNegativeInt(String(width), 'width'),
      model: '(manual source)',
      door_swing_mm: null
    };
  }

  if (format !== 'table' && format !== 'commands') {
    throw new Error('--format must be "table" or "commands"');
  }

  const candidates = findChassisCandidates(products, sourceProduct, { widthTolerance });
  const command = buildAddSwingCommand(candidates.map((candidate) => candidate.id), swingValue);

  if (format === 'commands') {
    if (command) {
      logger.log(command);
    }
    printSafetyDisclaimer(logger, true);
    return {
      sourceProduct,
      candidates,
      command,
      widthTolerance
    };
  }

  logger.log(
    `[suggest] Source: ${sourceProduct.brand} | ${sourceProduct.model} | ` +
      `w=${sourceProduct.w}mm | door_swing_mm: ${doorSwingText(sourceProduct.door_swing_mm)}` +
      (swingValue === null ? '' : ` → ${swingValue}`)
  );
  logger.log(
    `[suggest] Found ${candidates.length} chassis-match candidates ` +
      `(same brand, cat=${sourceProduct.cat}, w=${sourceProduct.w - widthTolerance}–${sourceProduct.w + widthTolerance}mm, door_swing=null):`
  );
  logger.log('');

  if (candidates.length > 0) {
    logger.log('  ID                    MODEL              W      H      Current  → Suggested');
    for (const candidate of candidates) {
      const idCol = String(candidate.id ?? '').padEnd(21, ' ');
      const modelCol = String(candidate.model ?? '').slice(0, 18).padEnd(18, ' ');
      const wCol = `${candidate.w}mm`.padEnd(6, ' ');
      const hCol = `${candidate.h}mm`.padEnd(6, ' ');
      const currentCol = doorSwingText(candidate.door_swing_mm).padEnd(7, ' ');
      const suggestedCol = swingValue === null ? '-' : String(swingValue);
      logger.log(`  ${idCol}  ${modelCol}  ${wCol} ${hCol} ${currentCol} →  ${suggestedCol}`);
    }
    logger.log('');
  }

  if (command) {
    logger.log('[suggest] To apply all, run:');
    logger.log(`  ${command}`);
    logger.log('');
  }
  logger.log(`[suggest] ⚠️  Width tolerance used: ±${widthTolerance}mm. Verify against manufacturer spec before applying.`);
  logger.log('[suggest]     Different-height models of the same width may have different door swing if the door is taller.');
  printSafetyDisclaimer(logger, false);

  return {
    sourceProduct,
    candidates,
    command,
    widthTolerance
  };
}

async function runCli(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      id: { type: 'string' },
      value: { type: 'string' },
      brand: { type: 'string' },
      cat: { type: 'string' },
      width: { type: 'string' },
      tolerance: { type: 'string', default: '5' },
      format: { type: 'string', default: 'table' },
      dataDir: { type: 'string' }
    }
  });

  await suggestDoorSwing({
    id: values.id,
    value: values.value,
    brand: values.brand,
    cat: values.cat,
    width: values.width,
    tolerance: values.tolerance,
    format: values.format,
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
  buildAddSwingCommand,
  findChassisCandidates,
  runCli,
  suggestDoorSwing
};
