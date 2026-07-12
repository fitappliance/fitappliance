function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) freezeDeep(item);
  }
  return value;
}

const CONFIRMED_ROUTES = Object.freeze({
  'Fisher & Paykel': {
    state: 'official_trade_portal_confirmed',
    url: 'https://www.fisherpaykel.com/au/trade-resources',
    evidence: 'Official AU trade portal provides dimensions, datasheets, CAD, installation guides and a Design Support contact route.',
  },
});

export function buildBrandDataOutreachQueue(pilot) {
  const groups = new Map();
  for (const product of pilot.products ?? []) {
    if (!groups.has(product.brand)) groups.set(product.brand, { refrigeratorModels: 0, dishwasherModels: 0, models: [] });
    const group = groups.get(product.brand);
    if (product.category === 'fridge') group.refrigeratorModels += 1;
    if (product.category === 'dishwasher') group.dishwasherModels += 1;
    group.models.push(product.model);
  }
  const brands = [...groups.entries()].map(([brand, group]) => {
    const confirmed = CONFIRMED_ROUTES[brand];
    return {
      brand,
      priority: group.models.length,
      pilotModels: [...new Set(group.models)].sort(),
      categoryCounts: { dishwasher: group.dishwasherModels, fridge: group.refrigeratorModels },
      route: confirmed ?? {
        state: 'official_contact_research_required',
        url: null,
        evidence: 'Use the manufacturer AU site to identify PIM, e-commerce, trade/specification or data-governance ownership; do not guess an email address.',
      },
      requestFields: [
        'exact AU model code and GTIN',
        'current/discontinued status and replacement model',
        'product W/H/D with axis and adjustable ranges',
        'installation/cavity clearances',
        'door/lid/drawer operation envelope',
        'ventilation requirements',
        'water, power and drainage connection zones and reach',
        'delivery/package dimensions and weight',
        'installation guides, QRG, datasheets and CAD URLs',
      ],
      rightsQuestions: [
        'May FitAppliance cache and display factual fields with attribution?',
        'May source document links and excerpts be shown to users?',
        'What update or deletion feed is available?',
        'Which fields are product, package, cavity or installation measurements?',
      ],
      state: 'not_contacted',
    };
  }).sort((left, right) => right.priority - left.priority || left.brand.localeCompare(right.brand));
  return freezeDeep({
    schemaVersion: 1,
    sourcePilotProducts: pilot.products?.length ?? 0,
    brands,
    summary: {
      brands: brands.length,
      confirmedOfficialTradeRoutes: brands.filter((row) => row.route.state === 'official_trade_portal_confirmed').length,
      contactResearchRequired: brands.filter((row) => row.route.state === 'official_contact_research_required').length,
      messagesSent: 0,
    },
  });
}
