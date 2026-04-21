'use strict';

const { normalizeBrandName } = require('./brand-name.js');

const RETAILER_WEIGHTS = {
  'Harvey Norman': 20,
  'The Good Guys': 20,
  'JB Hi-Fi': 18,
  'Appliances Online': 18,
  'Bing Lee': 10,
  Betta: 8,
  'Winning Appliances': 12,
  Retravision: 6,
  '2nds World': 4
};

const DEFAULT_RETAILER_WEIGHT = 3;

const FEATURED_BRANDS = new Set([
  'Samsung',
  'LG',
  'Westinghouse',
  'Electrolux',
  'Fisher & Paykel',
  'Bosch',
  'Miele',
  'Hisense',
  'Beko',
  'Haier',
  'Panasonic',
  'Smeg',
  'Asko'
]);

const LEGITIMATE_BRANDS = new Set([
  'Siemens',
  'Liebherr',
  'Neff',
  'V-Zug',
  'Gaggenau',
  'Blomberg',
  'Whirlpool',
  'Sharp',
  'DeLonghi',
  'ILVE',
  'Omega'
]);

const HOUSE_BRANDS = new Set([
  'Kogan',
  'Inalto',
  'Esatto',
  'Solt',
  'Euromaid',
  'Artusi',
  'Heller',
  'Vogue',
  'Chef'
]);

const DROPPED_BRANDS = new Set([
  'Sub-Zero',
  'CHiQ',
  'CHIQ',
  'SEIKI',
  'Seiki'
]);

const TIER_BOOSTS = {
  tier1: 30,
  tier2: 15,
  tier3: 0,
  dropped: Number.NEGATIVE_INFINITY,
  unknown: 0
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toDateValue(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function inferBrandTier(brand) {
  const normalized = normalizeBrandName(brand);
  if (DROPPED_BRANDS.has(normalized) || DROPPED_BRANDS.has(String(brand ?? '').trim())) return 'dropped';
  if (FEATURED_BRANDS.has(normalized)) return 'tier1';
  if (LEGITIMATE_BRANDS.has(normalized)) return 'tier2';
  if (HOUSE_BRANDS.has(normalized)) return 'tier3';
  return 'unknown';
}

function getRetailerWeight(name) {
  return RETAILER_WEIGHTS[String(name ?? '').trim()] ?? DEFAULT_RETAILER_WEIGHT;
}

function computeRetailerReach(retailers) {
  const rows = Array.isArray(retailers) ? retailers : [];
  return rows.reduce((total, retailer) => total + getRetailerWeight(retailer?.n), 0);
}

function computeResearchBoost(research) {
  if (!research || typeof research !== 'object') return 0;
  const availableRetailers = Number.isFinite(Number(research.retailersAvailable))
    ? Number(research.retailersAvailable)
    : 0;
  const reviewCountSum = Number.isFinite(Number(research.reviewCountSum))
    ? Number(research.reviewCountSum)
    : 0;
  return (availableRetailers * 5) + (Math.min(reviewCountSum, 500) / 10);
}

function computePriorityScore(product, {
  now = new Date().toISOString().slice(0, 10),
  verifiedAt = product?.verifiedAt ?? null,
  research = null
} = {}) {
  const tier = String(product?.brandTier ?? inferBrandTier(product?.brand));
  if (tier === 'dropped') return 0;

  const retailerReach = computeRetailerReach(product?.retailers);
  const tierBoost = TIER_BOOSTS[tier] ?? TIER_BOOSTS.unknown;
  const stars = Number.isFinite(Number(product?.stars)) ? Number(product.stars) : 0;
  const stars10 = stars * 6;

  const nowDate = toDateValue(now);
  const verifiedDate = toDateValue(verifiedAt);
  const stalePen = (nowDate && verifiedDate && (nowDate - verifiedDate) > (90 * 24 * 60 * 60 * 1000)) ? -10 : 0;

  const raw = retailerReach + tierBoost + stars10 + stalePen;
  const score = raw + computeResearchBoost(research);
  return clamp(Math.round(score), 0, 100);
}

module.exports = {
  DEFAULT_RETAILER_WEIGHT,
  RETAILER_WEIGHTS,
  FEATURED_BRANDS,
  LEGITIMATE_BRANDS,
  HOUSE_BRANDS,
  DROPPED_BRANDS,
  computePriorityScore,
  computeResearchBoost,
  computeRetailerReach,
  inferBrandTier
};
