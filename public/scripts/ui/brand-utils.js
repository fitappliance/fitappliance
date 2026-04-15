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

export function displayBrandName(raw) {
  if (typeof raw !== 'string') {
    return String(raw ?? '');
  }
  return BRAND_DISPLAY_MAP[raw] ?? raw;
}

export { BRAND_DISPLAY_MAP };
