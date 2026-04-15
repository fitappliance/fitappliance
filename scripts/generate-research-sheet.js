'use strict';

const path = require('node:path');
const { mkdir, readFile, writeFile } = require('node:fs/promises');

function isPendingDoorSwing(product) {
  return product?.door_swing_mm === null || product?.door_swing_mm === undefined;
}

function medianWidth(widths) {
  if (!Array.isArray(widths) || widths.length === 0) return 0;
  const sorted = [...widths].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }
  return Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function normalizePriorityBrands(priorityBrands) {
  return (priorityBrands ?? []).map((brand) => String(brand ?? '').toUpperCase());
}

function buildResearchGroups(products, {
  priorityBrands = ['WESTINGHOUSE', 'LG', 'HISENSE', 'FISHER & PAYKEL', 'CHIQ'],
  widthTolerance = 5,
  targetCat = 'fridge'
} = {}) {
  const tolerance = Number.isFinite(widthTolerance) ? Math.max(0, widthTolerance) : 5;
  const normalizedPriority = normalizePriorityBrands(priorityBrands);
  const priorityIndex = new Map(normalizedPriority.map((brand, index) => [brand, index]));

  const candidates = (products ?? []).filter((product) => (
    product?.cat === targetCat &&
    isPendingDoorSwing(product) &&
    Number.isFinite(product?.w)
  ));

  const byBrand = new Map();
  for (const product of candidates) {
    const key = String(product.brand ?? '');
    if (!byBrand.has(key)) {
      byBrand.set(key, []);
    }
    byBrand.get(key).push(product);
  }

  const groups = [];

  for (const [brand, brandProducts] of byBrand.entries()) {
    const sortedProducts = [...brandProducts].sort((left, right) => {
      if (left.w !== right.w) return left.w - right.w;
      if (left.h !== right.h) return left.h - right.h;
      return String(left.model ?? '').localeCompare(String(right.model ?? ''));
    });

    const consumed = new Set();
    for (const seed of sortedProducts) {
      if (consumed.has(seed.id)) continue;

      const cluster = [];
      for (const candidate of sortedProducts) {
        if (consumed.has(candidate.id)) continue;
        if (Math.abs(candidate.w - seed.w) <= tolerance) {
          consumed.add(candidate.id);
          cluster.push(candidate);
        }
      }

      if (cluster.length === 0) continue;

      const widths = cluster.map((product) => product.w);
      const minWidth = Math.min(...widths);
      const maxWidth = Math.max(...widths);
      const representativeWidth = medianWidth(widths);
      const ids = cluster.map((product) => product.id);
      const anchorId = ids[0];

      groups.push({
        rank: 0,
        brand,
        cat: targetCat,
        width: representativeWidth,
        widthRange: [minWidth, maxWidth],
        modelCount: ids.length,
        ids,
        sampleModel: cluster[0]?.model ?? '',
        suggestCommand: `node scripts/suggest-door-swing.js --id ${anchorId} --value 20`
      });
    }
  }

  groups.sort((left, right) => {
    const leftPriority = priorityIndex.get(String(left.brand).toUpperCase());
    const rightPriority = priorityIndex.get(String(right.brand).toUpperCase());
    const leftTier = leftPriority === undefined ? Number.MAX_SAFE_INTEGER : leftPriority;
    const rightTier = rightPriority === undefined ? Number.MAX_SAFE_INTEGER : rightPriority;

    if (leftTier !== rightTier) return leftTier - rightTier;
    if (left.modelCount !== right.modelCount) return right.modelCount - left.modelCount;
    if (left.brand !== right.brand) return left.brand.localeCompare(right.brand);
    return left.width - right.width;
  });

  return groups.map((group, index) => ({
    ...group,
    rank: index + 1
  }));
}

function buildMarkdown({
  groups,
  generated,
  targetCat,
  pendingTotal,
  priorityBrands
}) {
  const lines = [];
  const normalizedPriority = normalizePriorityBrands(priorityBrands);
  const groupedByBrand = new Map();

  for (const group of groups) {
    if (!groupedByBrand.has(group.brand)) {
      groupedByBrand.set(group.brand, []);
    }
    groupedByBrand.get(group.brand).push(group);
  }

  lines.push('# Door Swing Research Sheet');
  lines.push(`Generated: ${generated} | Target: ${targetCat} | Pending: ${pendingTotal} models`);
  lines.push('');
  lines.push('## How to use');
  lines.push('1. Look up one model from each group in its manufacturer spec sheet.');
  lines.push('2. Run: `node scripts/add-door-swing.js --ids [IDs] --value [mm]`');
  lines.push('3. Cross off the group when done.');
  lines.push('');
  lines.push('---');
  lines.push('');

  const orderedBrands = Array.from(groupedByBrand.keys()).sort((left, right) => {
    const leftIndex = normalizedPriority.indexOf(left.toUpperCase());
    const rightIndex = normalizedPriority.indexOf(right.toUpperCase());
    const leftTier = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
    const rightTier = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;

    if (leftTier !== rightTier) return leftTier - rightTier;
    return left.localeCompare(right);
  });

  for (const brand of orderedBrands) {
    const brandGroups = groupedByBrand.get(brand) ?? [];
    const totalModels = brandGroups.reduce((sum, group) => sum + group.modelCount, 0);
    const priorityIndex = normalizedPriority.indexOf(brand.toUpperCase());
    const headingPrefix = priorityIndex === -1 ? 'Secondary' : `Priority ${priorityIndex + 1}`;

    lines.push(`## ${headingPrefix} — ${brand} (${totalModels} models, ${brandGroups.length} chassis groups)`);
    lines.push('');

    const initial = String(brand).replace(/[^A-Za-z0-9]/g, '').charAt(0).toUpperCase() || 'G';
    for (let index = 0; index < brandGroups.length; index += 1) {
      const group = brandGroups[index];
      const groupLabel = `${initial}${index + 1}`;

      lines.push(`### Group ${groupLabel} — ${group.width}mm wide (${group.modelCount} models)`);
      lines.push(`**Suggest command:** \`${group.suggestCommand}\``);
      lines.push(`**Model IDs:** ${group.ids.join(', ')}`);
      lines.push(`**Sample model:** ${brand} ${group.sampleModel}`);
      lines.push('');
      lines.push('- [ ] Research done — door_swing_mm = ___');
      lines.push('- [ ] Applied via add-door-swing');
      lines.push('');
    }
  }

  return `${lines.join('\n')}\n`;
}

async function generateResearchSheet(options = {}) {
  const repoRoot = options.repoRoot ?? path.resolve(__dirname, '..');
  const dataDir = options.dataDir ?? path.join(repoRoot, 'public', 'data');
  const docsDir = options.docsDir ?? path.join(repoRoot, 'docs');
  const targetCat = options.targetCat ?? 'fridge';
  const widthTolerance = options.widthTolerance ?? 5;
  const priorityBrands = options.priorityBrands ?? [
    'WESTINGHOUSE',
    'LG',
    'HISENSE',
    'FISHER & PAYKEL',
    'CHIQ'
  ];
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const logger = options.logger ?? console;

  const appliancesPath = path.join(dataDir, 'appliances.json');
  const appliancesDocument = JSON.parse(await readFile(appliancesPath, 'utf8'));
  const products = Array.isArray(appliancesDocument.products) ? appliancesDocument.products : [];

  const groups = buildResearchGroups(products, {
    priorityBrands,
    widthTolerance,
    targetCat
  });
  const pendingTotal = products.filter((product) => product.cat === targetCat && isPendingDoorSwing(product)).length;

  const markdown = buildMarkdown({
    groups,
    generated: today,
    targetCat,
    pendingTotal,
    priorityBrands
  });

  await mkdir(docsDir, { recursive: true });
  const markdownPath = path.join(docsDir, 'door-swing-research-sheet.md');
  const jsonPath = path.join(docsDir, 'research-groups.json');

  await writeFile(markdownPath, markdown, 'utf8');
  await writeFile(jsonPath, `${JSON.stringify(groups, null, 2)}\n`, 'utf8');

  if (typeof logger?.log === 'function') {
    logger.log(`[research-sheet] Wrote ${groups.length} groups to docs/research-groups.json`);
    logger.log('[research-sheet] Wrote docs/door-swing-research-sheet.md');
  }

  return {
    groups,
    markdownPath,
    jsonPath
  };
}

if (require.main === module) {
  generateResearchSheet().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  buildResearchGroups,
  generateResearchSheet
};
