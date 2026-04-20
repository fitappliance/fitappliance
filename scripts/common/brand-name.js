'use strict';

const BRAND_NAME_MAP = {
  'FISHER & PAYKEL': 'Fisher & Paykel',
  HISENSE: 'Hisense',
  WESTINGHOUSE: 'Westinghouse',
  CHIQ: 'CHiQ',
  chiq: 'CHiQ',
  MIDEA: 'Midea',
  LIEBHERR: 'Liebherr',
  TECO: 'Teco',
  HELLER: 'Heller',
  VOGUE: 'Vogue',
  anko: 'Anko',
  carson: 'Carson'
};

function toTitleCase(value) {
  return String(value)
    .toLowerCase()
    .replace(/\b([a-z])/g, (_, letter) => letter.toUpperCase());
}

function normalizeBrandName(raw) {
  if (typeof raw !== 'string') {
    return String(raw ?? '');
  }
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (BRAND_NAME_MAP[trimmed]) return BRAND_NAME_MAP[trimmed];
  if (/^[A-Z]{2,}$/.test(trimmed)) return trimmed;
  if (/^[a-z][a-z\s&/-]*$/.test(trimmed)) return toTitleCase(trimmed);
  return trimmed;
}

module.exports = {
  BRAND_NAME_MAP,
  normalizeBrandName
};
