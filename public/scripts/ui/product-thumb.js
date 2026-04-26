const VALID_CATEGORIES = new Set(['fridge', 'washing_machine', 'dryer', 'dishwasher']);

const CATEGORY_ICONS = {
  fridge: '<path d="M43 26h34v58H43z"/><path d="M43 47h34"/><path d="M51 38h4M51 61h4"/>',
  washing_machine: '<rect x="39" y="30" width="42" height="50" rx="5"/><circle cx="60" cy="56" r="13"/><path d="M46 38h10M67 38h7"/>',
  dryer: '<rect x="39" y="30" width="42" height="50" rx="5"/><circle cx="60" cy="56" r="13"/><path d="M47 38h8M66 38h3M72 38h3M48 80h24"/>',
  dishwasher: '<rect x="34" y="38" width="52" height="38" rx="4"/><path d="M40 50h40M44 58h32M44 66h32"/><path d="M45 44h6M69 44h6"/>',
  generic: '<rect x="38" y="34" width="44" height="44" rx="7"/><path d="M48 48h24M48 58h24M48 68h24"/>'
};

function escHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function normalizeCategory(cat) {
  const value = String(cat ?? '').trim();
  return VALID_CATEGORIES.has(value) ? value : 'generic';
}

function shortBrandLabel(brand) {
  const value = String(brand ?? '').replace(/\s+/g, ' ').trim();
  if (!value) return '';
  return value.length > 12 ? `${value.slice(0, 9)}…` : value;
}

export function renderProductThumb(product = {}) {
  const category = normalizeCategory(product?.cat);
  const brand = shortBrandLabel(product?.brand);
  const escapedBrand = escHtml(brand);
  const label = brand ? `${escapedBrand} appliance placeholder` : 'Appliance placeholder';
  const brandText = escapedBrand
    ? `<text x="60" y="102" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="10" fill="#2c2c2c">${escapedBrand}</text>`
    : '';

  return `<svg class="product-thumb-svg" data-thumb-category="${escHtml(category)}" role="img" aria-label="${label}" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
    <rect x="8" y="8" width="104" height="104" rx="14" fill="#f5f3ee" stroke="#dfdbd2"/>
    <g fill="none" stroke="#2c2c2c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      ${CATEGORY_ICONS[category]}
    </g>
    ${brandText}
  </svg>`;
}
