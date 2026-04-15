'use strict';

const BRAND_DISPLAY_MAP = {
  'FISHER & PAYKEL': 'Fisher & Paykel',
  HISENSE: 'Hisense',
  WESTINGHOUSE: 'Westinghouse',
  CHIQ: 'CHiQ',
  MIDEA: 'Midea',
  LIEBHERR: 'Liebherr',
  TECO: 'Teco',
  HELLER: 'Heller',
  VOGUE: 'Vogue'
};

function displayBrandName(raw) {
  if (typeof raw !== 'string') {
    return String(raw ?? '');
  }
  return BRAND_DISPLAY_MAP[raw] ?? raw;
}

module.exports = {
  displayBrandName,
  BRAND_DISPLAY_MAP
};
