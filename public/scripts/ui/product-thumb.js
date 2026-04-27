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

export function brandAccentColor(brand) {
  const value = String(brand ?? '').trim().toLowerCase() || 'appliance';
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash + value.charCodeAt(index) * (index + 1)) % ACCENT_COLORS.length;
  }
  return ACCENT_COLORS[hash];
}

export function brandInitials(brand) {
  const parts = String(brand ?? '').split(/[\s\-&]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase() || '?';
}

function safeAriaLabel(brand, initials) {
  const trimmed = String(brand ?? '').replace(/\s+/g, ' ').trim();
  return /^[\w\s&.'-]{1,48}$/u.test(trimmed) ? `${trimmed} product card` : `${initials} product card`;
}

export function renderProductThumb(product = {}) {
  const brand = String(product?.brand ?? '').trim();
  const initials = brandInitials(brand);
  const accent = brandAccentColor(product?.brand);
  const aria = brand ? safeAriaLabel(brand, initials) : 'Product card';

  return `<svg class="product-thumb-svg" role="img" aria-label="${escHtml(aria)}" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="80" height="80" rx="10" fill="${escHtml(accent)}"/>
    <text x="40" y="50" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="28" font-weight="600" fill="#fff" letter-spacing="0.5">${escHtml(initials)}</text>
  </svg>`;
}
