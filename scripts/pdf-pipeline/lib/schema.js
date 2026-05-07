const ALLOWED_CATEGORIES = new Set(['fridge', 'dishwasher', 'dryer', 'washing_machine']);
const ALLOWED_CONFIDENCE = new Set(['high', 'medium', 'low']);

const DIMENSION_RANGES_MM = {
  fridge: {
    width: [300, 1200],
    height: [500, 2300],
    depth: [250, 1200]
  },
  dishwasher: {
    width: [350, 800],
    height: [400, 1000],
    depth: [350, 800]
  },
  dryer: {
    width: [350, 900],
    height: [400, 1100],
    depth: [350, 900]
  },
  washing_machine: {
    width: [350, 900],
    height: [400, 1200],
    depth: [350, 900]
  }
};

const CLEARANCE_RANGE_MM = [0, 300];

const OPTIONAL_RANGES = {
  capacity_litres: [1, 1200],
  energy_stars: [0, 10],
  annual_kwh: [1, 2000],
  door_swing_mm: [0, 1500],
  weight_kg: [1, 250],
  noise_db: [10, 80]
};

exports.ALLOWED_CATEGORIES = ALLOWED_CATEGORIES;
exports.ALLOWED_CONFIDENCE = ALLOWED_CONFIDENCE;
exports.DIMENSION_RANGES_MM = DIMENSION_RANGES_MM;
exports.CLEARANCE_RANGE_MM = CLEARANCE_RANGE_MM;
exports.OPTIONAL_RANGES = OPTIONAL_RANGES;
