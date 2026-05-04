function toPositiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function addAlert(alerts, id, severity, label, detail) {
  alerts.push({ id, severity, label, detail });
}

export function buildSpaceAlerts({ cat, w, h, d, door } = {}) {
  const category = String(cat ?? '').trim();
  const width = toPositiveNumber(w);
  const height = toPositiveNumber(h);
  const depth = toPositiveNumber(d);
  const doorway = toPositiveNumber(door);
  if (!category || !width || !height || !depth) return [];

  const alerts = [];

  if (category === 'fridge') {
    if (width <= 600) {
      addAlert(
        alerts,
        'fridge-600-width',
        'info',
        '600mm cavity',
        'This is a common Australian fridge opening. Check side clearance and door swing carefully.'
      );
    }
    if (depth < 650) {
      addAlert(
        alerts,
        'shallow-depth',
        'warning',
        'Shallow depth',
        'Rear pipe, socket or skirting boards can make a shallow cavity tighter than the raw depth suggests.'
      );
    }
    if (height < 1700) {
      addAlert(
        alerts,
        'low-height',
        'warning',
        'Low-height cavity',
        'Top cabinets may rule out taller bottom-mount or French-door fridges.'
      );
    }
  }

  if (category === 'dishwasher' && width < 600) {
    addAlert(
      alerts,
      'slimline-dishwasher',
      'info',
      'Narrow dishwasher cavity',
      'A cavity under 600mm often needs a slimline or compact dishwasher.'
    );
  }

  if ((category === 'washing_machine' || category === 'dryer') && depth < 600) {
    addAlert(
      alerts,
      'shallow-laundry-depth',
      'warning',
      'Shallow laundry depth',
      'Allow room for hoses, plugs and ventilation behind laundry appliances.'
    );
  }

  if (doorway && doorway < 760) {
    addAlert(
      alerts,
      'tight-delivery-path',
      'warning',
      'Tight delivery path',
      'Measure the narrowest door, lift and hallway turn before ordering.'
    );
  }

  return alerts;
}

