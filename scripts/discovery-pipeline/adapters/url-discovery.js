const BROWSER_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const BRAND_PREFIXES = [
  ['fisher-paykel', 'Fisher & Paykel'],
  ['fisher-and-paykel', 'Fisher & Paykel'],
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
  ['mitsubishi', 'Mitsubishi'],
];

const MODEL_BRAND_PREFIXES = [
  [/^(?:RF|RS|WH|DH)\d/i, 'Fisher & Paykel'],
  [/^(?:WBB|WBE|WHE|WQE|WSE|WSF|WWF|WWT|WTM|WTB|WDH)\d/i, 'Westinghouse'],
  [/^(?:EWF|EDV|EDH)\d/i, 'Electrolux'],
  [/^(?:HRCD|HRBM|HRTF|HRSBS|HRVF)\d/i, 'Hisense'],
  [/^(?:HRF|HDFS|HWT|HDHP)\d/i, 'Haier'],
  [/^(?:GF|GS|GB|GT|WV|WVC|WD)\d/i, 'LG'],
  [/^(?:SRF|SRS|SRL|WW|WD)\d/i, 'Samsung'],
  [/^(?:WGG|WAN|WGA|WQG|SMU|SMV|SMS|SPU)\d/i, 'Bosch'],
  [/^(?:BDF|BDFN|BM|BVF|BDP)\d/i, 'Beko'],
  [/^(?:CTM|CBM|CSF|CRSR)\d/i, 'CHiQ'],
  [/^(?:MDR|MF|MD)\d/i, 'Midea'],
];

const CATEGORY_RULES = [
  ['dishwasher', ['dishwasher', 'dish-washer', 'dishwash', ' fstand-dish', 'bench-dishwasher', 'dish-ss', 'dish-silv']],
  ['washing_machine', ['washing-machine', 'washer-dryer', 'combo-washer', 'front-load-washing', 'top-load-washing', 'front-loader', 'front-load', 'top-load', 'fronload', 'washer']],
  ['dryer', ['heat-pump-dryer', 'condenser-dryer', 'vented-dryer', 'clothes-dryer', 'dryer']],
  ['fridge', ['fridge-freezer', 'fridges-freezers', 'refrigerator', 'fridge', 'freezer', 'top-mount', 'bottom-mount', 'french-door', 'quad-door', 'side-by-side', 'sbs']],
];

const EXCLUDED_PRODUCT_PATTERNS = [
  /baby-bottle-washer/,
  /dishwasher-bonus/,
  /finish-dishwasher-bonus/,
  /hair-dryer/,
  /hand-dryer/,
  /dehumidifier/,
  /pressure-washer/,
  /washer-fluid/,
  /stacking-kit/,
  /trim-kit/,
];

function normalizeSlug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\.html?$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function slugFromUrl(url, { productSegment } = {}) {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (productSegment) {
      const productIndex = parts.indexOf(productSegment);
      if (productIndex !== -1 && parts[productIndex + 1]) {
        return normalizeSlug(parts[productIndex + 1]);
      }
    }
    return normalizeSlug(parts[parts.length - 1] || '');
  } catch {
    return '';
  }
}

function detectCategory(slug) {
  if (EXCLUDED_PRODUCT_PATTERNS.some((pattern) => pattern.test(slug))) return null;
  const haystack = ` ${slug.replace(/-/g, ' ')} `;
  for (const [category, needles] of CATEGORY_RULES) {
    if (needles.some((needle) => slug.includes(needle.trim()) || haystack.includes(needle))) {
      return category;
    }
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
  return /^\d+(?:\.\d+)?(?:l|kg|cm|mm|place|pl|p|star|stars)$/i.test(value);
}

function isWeakDescriptorToken(value) {
  return /^(?:series|serie|class|door|load|front|top|heat|pump|vented|condenser|freestanding|fstand|built|under|bench|white|black|silver|stainless|steel|dark|inox|right|left|with|and|by|sbs|quad)$/i.test(value);
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

function isModelPrefixToken(token) {
  return /^(?:gf|gb|gs|gt|wv|wd|rf|rs|wh|dh|ww|sr|sp|sm|ctm|cbm)$/i.test(token);
}

function formatModelToken(token) {
  return String(token || '').toUpperCase();
}

function extractModelFromSlug(slug, brandPrefix = '') {
  const remaining = brandPrefix
    ? slug.replace(new RegExp(`^${brandPrefix}-?`), '')
    : slug;
  const tokens = remaining.split('-').filter(Boolean);
  const candidates = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!hasLettersAndDigits(token) && !isModelPrefixToken(token)) continue;

    if (
      token.length <= 5
      && !isCapacityOrDimensionToken(token)
      && tokens[index + 1]
      && hasLettersAndDigits(tokens[index + 1])
      && !isCapacityOrDimensionToken(tokens[index + 1])
    ) {
      candidates.push({
        model: `${formatModelToken(token)}-${formatModelToken(tokens[index + 1])}`,
        score: Math.max(scoreModelToken(token), 0) + scoreModelToken(tokens[index + 1]) + 8,
      });
    }

    if (!hasLettersAndDigits(token)) continue;

    candidates.push({
      model: formatModelToken(token),
      score: scoreModelToken(token),
    });
  }

  return candidates
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.model || '';
}

function inferBrandFromModel(model) {
  for (const [pattern, brand] of MODEL_BRAND_PREFIXES) {
    if (pattern.test(model)) return brand;
  }
  return null;
}

function extractDiscoveryFromUrl(url, {
  displayName,
  productSegment,
  retailer,
  source = 'sitemap',
} = {}) {
  const slug = slugFromUrl(url, { productSegment });
  if (!slug) return null;

  const category = detectCategory(slug);
  const brandMatch = detectBrand(slug);
  const model = extractModelFromSlug(slug, brandMatch?.prefix || '');
  const brand = brandMatch?.brand || inferBrandFromModel(model);

  if (!category || !brand || !model) return null;

  return {
    retailer: displayName,
    retailer_key: retailer,
    category,
    brand,
    model,
    url,
    source,
  };
}

function extractDiscoveriesFromUrls(urls, options) {
  return urls
    .map((url) => extractDiscoveryFromUrl(url, options))
    .filter(Boolean);
}

module.exports = {
  BROWSER_USER_AGENT,
  extractDiscoveriesFromUrls,
  extractDiscoveryFromUrl,
  extractModelFromSlug,
  inferBrandFromModel,
  slugFromUrl,
};
