const ACCENT_COLORS = [
  '#8b7355',
  '#6b8e6b',
  '#7d6b8e',
  '#8e756b',
  '#5f7f8f',
  '#8a6f4d',
  '#6f7f5f',
  '#7a6f8f',
  '#8f6f6f',
  '#5f7d73'
];

function escHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function compactLabel(value, maxChars) {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.length > maxChars ? `${normalized.slice(0, maxChars)}…` : normalized;
}

export function shortBrandLabel(brand) {
  return compactLabel(brand, 9);
}

export function shortModelLabel(model) {
  return compactLabel(model, 10);
}

export function categoryLabel(cat) {
  return {
    fridge: 'FRIDGE',
    dishwasher: 'D/WASHER',
    dryer: 'DRYER',
    washing_machine: 'WASHER'
  }[cat] || 'APPLIANCE';
}

export function brandAccentColor(brand) {
  const value = String(brand ?? '').trim().toLowerCase() || 'appliance';
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash + value.charCodeAt(index) * (index + 1)) % ACCENT_COLORS.length;
  }
  return ACCENT_COLORS[hash];
}

export function renderProductThumb(product = {}) {
  const brand = shortBrandLabel(product?.brand);
  const model = shortModelLabel(product?.model);
  const category = categoryLabel(product?.cat);
  const accent = brandAccentColor(product?.brand);
  const aria = [brand || 'Brand', model, category].filter(Boolean).join(' ');

  return `<svg class="product-thumb-svg" role="img" aria-label="${escHtml(aria)} appliance card" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
    <rect x="8" y="8" width="104" height="104" rx="12" fill="#fafaf7" stroke="#dfdbd2" stroke-width="1"/>
    <path d="M20 8h80a12 12 0 0 1 12 12v24H8V20A12 12 0 0 1 20 8z" fill="${escHtml(accent)}"/>
    <text x="60" y="32" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="13" font-weight="600" fill="#fff">${escHtml(brand || 'Brand')}</text>
    ${model ? `<text x="60" y="68" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="11" font-weight="500" fill="#2c2c2c">${escHtml(model)}</text>` : ''}
    <text x="60" y="92" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="9" fill="#6b6b6b" letter-spacing="0.05em">${escHtml(category)}</text>
  </svg>`;
}
