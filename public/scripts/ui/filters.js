function escHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function buildBrandOptions(products, cat) {
  const brandMap = new Map();

  for (const product of products ?? []) {
    if (!product || product.cat !== cat) continue;
    if (typeof product.brand !== 'string') continue;

    const brand = product.brand.trim();
    if (!brand) continue;

    const key = brand.toLocaleLowerCase('en-AU');
    if (!brandMap.has(key)) {
      brandMap.set(key, brand);
    }
  }

  const brands = Array.from(brandMap.values())
    .sort((a, b) => a.localeCompare(b, 'en-AU', { sensitivity: 'base' }));

  const options = ['<option value="">All Brands</option>'];
  for (const brand of brands) {
    const safeBrand = escHtml(brand);
    options.push(`<option value="${safeBrand}">${safeBrand}</option>`);
  }

  return options.join('');
}
