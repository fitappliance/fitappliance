const RETAILER = 'appliancesonline';
const DISPLAY_NAME = 'Appliances Online';

const BRAND_PREFIXES = [
  ['fisher-paykel', 'Fisher & Paykel'],
  ['fisherpaykel', 'Fisher & Paykel'],
  ['westinghouse', 'Westinghouse'],
  ['electrolux', 'Electrolux'],
  ['hisense', 'Hisense'],
  ['samsung', 'Samsung'],
  ['haier', 'Haier'],
  ['bosch', 'Bosch'],
  ['beko', 'Beko'],
  ['miele', 'Miele'],
  ['chiq', 'CHiQ'],
  ['tcl', 'TCL'],
  ['lg', 'LG'],
  ['asko', 'Asko'],
  ['ilve', 'Ilve'],
  ['smeg', 'Smeg'],
  ['midea', 'Midea'],
  ['esatto', 'Esatto'],
  ['solt', 'Solt'],
  ['omega', 'Omega'],
  ['whirlpool', 'Whirlpool'],
];

const CATEGORY_RULES = [
  ['dishwasher', ['dishwasher']],
  ['washing_machine', ['washing-machine', 'washing-machine', 'front-load-washer', 'top-load-washer', 'washer']],
  ['dryer', ['heat-pump-dryer', 'condenser-dryer', 'vented-dryer', 'clothes-dryer', 'dryer']],
  ['fridge', ['fridge-freezer', 'fridges-freezers', 'refrigerator', 'fridge', 'freezer']],
];

function slugFromUrl(url) {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(Boolean);
    const productIndex = parts.indexOf('product');
    if (productIndex === -1 || !parts[productIndex + 1]) return '';
    return parts[productIndex + 1].toLowerCase();
  } catch {
    return '';
  }
}

function detectCategory(slug) {
  for (const [category, needles] of CATEGORY_RULES) {
    if (needles.some((needle) => slug.includes(needle))) return category;
  }
  return null;
}

function detectBrand(slug) {
  for (const [prefix, brand] of BRAND_PREFIXES) {
    if (slug === prefix || slug.startsWith(`${prefix}-`)) {
      return { brand, prefix };
    }
  }
  return null;
}

function hasLettersAndDigits(value) {
  return /[a-z]/i.test(value) && /\d/.test(value);
}

function isCapacityOrDimensionToken(value) {
  return /^\d+(?:\.\d+)?(?:l|kg|cm|mm|place|star|stars)$/i.test(value);
}

function isWeakDescriptorToken(value) {
  return /^(series|serie|class|door|load|front|top|heat|pump|vented|condenser|freestanding|built|under|bench)$/i.test(value);
}

function scoreModelToken(token) {
  if (!hasLettersAndDigits(token)) return -100;
  if (isCapacityOrDimensionToken(token)) return -100;
  if (isWeakDescriptorToken(token)) return -50;

  const letters = (token.match(/[a-z]/gi) || []).length;
  const digits = (token.match(/\d/g) || []).length;
  let score = token.length;
  if (letters >= 2) score += 6;
  if (digits >= 2) score += 6;
  if (token.length >= 6) score += 6;
  if (/^[a-z]{1,4}\d/i.test(token)) score += 4;
  return score;
}

function extractModelFromSlug(slug, brandPrefix) {
  const remaining = slug.replace(new RegExp(`^${brandPrefix}-?`), '');
  const tokens = remaining.split('-').filter(Boolean);
  const candidates = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!hasLettersAndDigits(token)) continue;

    if (
      token.length < 5
      && !isCapacityOrDimensionToken(token)
      && tokens[index + 1]
      && hasLettersAndDigits(tokens[index + 1])
      && !isCapacityOrDimensionToken(tokens[index + 1])
    ) {
      const combined = `${token}-${tokens[index + 1]}`;
      candidates.push({
        model: combined.toUpperCase(),
        score: scoreModelToken(token) + scoreModelToken(tokens[index + 1]) + 8
      });
    }

    candidates.push({
      model: token.toUpperCase(),
      score: scoreModelToken(token)
    });
  }

  return candidates
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.model || '';
}

function extractDiscovery(url) {
  const slug = slugFromUrl(url);
  if (!slug) return null;

  const category = detectCategory(slug);
  const brandMatch = detectBrand(slug);
  if (!category || !brandMatch) return null;

  const model = extractModelFromSlug(slug, brandMatch.prefix);
  if (!model) return null;

  return {
    retailer: DISPLAY_NAME,
    retailer_key: RETAILER,
    category,
    brand: brandMatch.brand,
    model,
    url,
    source: 'sitemap',
  };
}

function extractDiscoveries(urls) {
  return urls
    .map(extractDiscovery)
    .filter(Boolean);
}

module.exports = {
  displayName: DISPLAY_NAME,
  extractDiscoveries,
  extractDiscovery,
  extractModelFromSlug,
  retailer: RETAILER,
  sitemapUrls: ['https://www.appliancesonline.com.au/public/sitemaps/sitemap-products.xml'],
};
