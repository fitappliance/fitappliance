function normalizeToken(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getCatalogRows(catalog) {
  if (Array.isArray(catalog)) return catalog;
  if (Array.isArray(catalog?.products)) return catalog.products;
  return [];
}

function modelsMatch(extractedModel, catalogModel) {
  const extracted = normalizeToken(extractedModel);
  const candidate = normalizeToken(catalogModel);
  if (!extracted || !candidate) return false;
  return candidate.startsWith(extracted) || extracted.startsWith(candidate);
}

function findMatch(extracted, catalog) {
  const brand = normalizeToken(extracted?.brand);
  return getCatalogRows(catalog).find((row) => (
    normalizeToken(row.brand) === brand && modelsMatch(extracted.model, row.model || row.sku || row.id)
  )) || null;
}

function buildPatch(extracted) {
  if (extracted?.confidence === 'low') return {};
  const dims = extracted?.dimensions_mm || {};
  const patch = {};

  if (Number.isFinite(dims.width)) patch.w = dims.width;
  if (Number.isFinite(dims.height)) patch.h = dims.height;
  if (Number.isFinite(dims.depth)) patch.d = dims.depth;
  if (Number.isFinite(extracted.capacity_litres)) patch.capacity_litres = extracted.capacity_litres;
  if (Number.isFinite(extracted.annual_kwh)) patch.annual_kwh = extracted.annual_kwh;
  if (Number.isFinite(extracted.energy_stars)) patch.stars = extracted.energy_stars;
  if (Number.isFinite(extracted.weight_kg)) patch.weight_kg = extracted.weight_kg;
  if (Number.isFinite(extracted.noise_db)) patch.noise_db = extracted.noise_db;
  if (extracted.clearance_mm) patch.manufacturer_clearance_mm = { ...extracted.clearance_mm };

  return patch;
}

function collectConflicts(match, patch) {
  if (!match) return [];
  const conflicts = [];
  for (const [field, current] of Object.entries({ w: match.w, h: match.h, d: match.d })) {
    const extracted = patch[field];
    if (Number.isFinite(current) && Number.isFinite(extracted)) {
      const difference = Math.abs(current - extracted);
      if (difference >= 5) {
        conflicts.push({
          field,
          current,
          extracted,
          difference_mm: difference
        });
      }
    }
  }
  return conflicts;
}

async function prepareCatalogPatch(extracted, catalog) {
  const matched = findMatch(extracted, catalog);
  const patch = buildPatch(extracted);
  return {
    matched,
    patch,
    conflicts: collectConflicts(matched, patch)
  };
}

exports.prepareCatalogPatch = prepareCatalogPatch;
exports.normalizeToken = normalizeToken;
