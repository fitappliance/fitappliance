function textFor(product) {
  return [
    product?.displayName,
    product?.title,
    product?.name,
    product?.readableSpec,
    ...(Array.isArray(product?.features) ? product.features : []),
  ].filter(Boolean).join(' ');
}

export function inferApplianceFormFactor(product) {
  const existing = product?.geometry_v2?.formFactor;
  if (typeof existing === 'string' && existing.trim()) return existing.trim();

  const category = String(product?.cat ?? product?.category ?? '').trim();
  const description = textFor(product);
  if (category === 'fridge') {
    if (/\bchest(?:\s+freezer)?\b/i.test(description)) return 'chest';
    if (/\b(?:upright|french\s+door|side[- ]by[- ]side|bottom\s+mount|top\s+mount|vertical\s+freezer|integrated|refrigerator|fridge)\b/i.test(description)) {
      return 'upright';
    }
  }
  if (category === 'washing_machine') {
    if (/\btop[- ]load(?:er|ing)?\b/i.test(description)) return 'top_loader';
    if (/\b(?:front[- ]load(?:er|ing)?|washer[- ]dryer|washing\s+machine\s+and\s+dryer)\b/i.test(description)) {
      return 'front_loader';
    }
  }
  return null;
}
