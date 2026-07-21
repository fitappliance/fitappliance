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
  const category = String(product?.cat ?? product?.category ?? '').trim();
  const existing = product?.geometry_v2?.formFactor;
  const allowedExisting = {
    fridge: new Set(['upright', 'chest']),
    dishwasher: new Set(['built_in', 'freestanding', 'integrated', 'drawer']),
    washing_machine: new Set(['front_loader', 'top_loader', 'washer_dryer_combo']),
    dryer: new Set(['front_loader']),
  };
  if (typeof existing === 'string' && allowedExisting[category]?.has(existing.trim())) return existing.trim();

  const description = textFor(product);
  if (category === 'fridge') {
    if (/\bchest(?:\s+freezer)?\b/i.test(description)) return 'chest';
    if (/\b(?:upright|french\s+door|side[- ]by[- ]side|bottom\s+mount|top\s+mount|vertical\s+freezer|integrated|refrigerator|fridge)\b/i.test(description)) {
      return 'upright';
    }
  }
  if (category === 'dishwasher') {
    if (/\b(?:dishdrawer|dish\s*drawer|drawer\s+dishwasher)\b/i.test(description)) return 'drawer';
    if (/\bintegrated\b/i.test(description)) return 'integrated';
    if (/\bfree[- ]?standing\b/i.test(description)) return 'freestanding';
    if (/\b(?:built[- ]?in|built[- ]?under|under[- ]?bench)\b/i.test(description)) return 'built_in';
  }
  if (category === 'washing_machine') {
    if (/\btop[- ]load(?:er|ing)?\b/i.test(description)) return 'top_loader';
    if (/\b(?:washer[- ]dryer|washing\s+machine\s+and\s+dryer)\b/i.test(description)) {
      return 'washer_dryer_combo';
    }
    if (/\bfront[- ]load(?:er|ing)?\b/i.test(description)) {
      return 'front_loader';
    }
  }
  if (category === 'dryer' && /\b(?:dryer|tumble\s+dryer)\b/i.test(description)) return 'front_loader';
  return null;
}
