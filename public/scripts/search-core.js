'use strict';

(function attachSearchCore(globalScope) {
  const fitEngine = typeof module !== 'undefined' && module.exports
    ? require('./fit-engine.js')
    : globalScope?.FitEngine;
  const replacementEngine = typeof module !== 'undefined' && module.exports
    ? require('./replacement-match-engine.js')
    : globalScope?.ReplacementMatchEngine;
  if (!fitEngine?.evaluateFit) throw new Error('FitEngine must load before SearchCore');
  if (!replacementEngine?.matchCurrentProducts) throw new Error('ReplacementMatchEngine must load before SearchCore');
  const PRACTICAL_CLEARANCE = Object.freeze({ rear: 10, side: 5, sides: 5, top: 20 });
  const CLEARANCE_MODES = Object.freeze({
    physical: Object.freeze({ rear: 0, side: 0, sides: 0, top: 0 }),
    practical: PRACTICAL_CLEARANCE,
    manufacturer: null
  });
  const DEFAULT_CLEARANCE_MODE = 'practical';
  const SEARCH_MODES = Object.freeze({
    cavity: 'cavity',
    replacement: 'replacement'
  });
  const DEFAULT_SEARCH_MODE = 'cavity';
  const WASHTOWER_COMBO_CATEGORY = 'washtower_combo';
  const STANDARD_LAUNDRY_REPLACEMENT_CATEGORIES = new Set(['washing_machine', 'dryer']);
  const CLEARANCE_DEFAULTS = {
    fridge: { ...PRACTICAL_CLEARANCE },
    dishwasher: { ...PRACTICAL_CLEARANCE },
    dryer: { ...PRACTICAL_CLEARANCE },
    washing_machine: { ...PRACTICAL_CLEARANCE }
  };

  const CATEGORY_LABELS = {
    fridge: 'Fridges',
    dishwasher: 'Dishwashers',
    dryer: 'Dryers',
    washing_machine: 'Washing Machines',
    washtower_combo: 'WashTower / Combo'
  };

  const CATEGORY_PRESETS = {
    fridge: [
      { id: 'standard-600', label: '600mm Standard', w: 600 },
      { id: 'wide-700', label: '700mm Wide', w: 700 },
      { id: 'family-900', label: '900mm Family', w: 900 }
    ],
    dishwasher: [
      { id: 'builtin-600', label: '600 × 820 × 600', w: 600, h: 820, d: 600 },
      { id: 'tall-tub', label: '600 × 850 × 620', w: 600, h: 850, d: 620 },
      { id: 'compact', label: '550 × 820 × 550', w: 550, h: 820, d: 550 }
    ],
    washing_machine: [
      { id: 'front-loader', label: '600 × 850 × 650', w: 600, h: 850, d: 650 },
      { id: 'slim', label: '600 × 850 × 600', w: 600, h: 850, d: 600 },
      { id: 'wide-family', label: '700 × 900 × 750', w: 700, h: 900, d: 750 }
    ],
    dryer: [
      { id: 'stackable', label: '600 × 850 × 650', w: 600, h: 850, d: 650 },
      { id: 'compact', label: '600 × 850 × 600', w: 600, h: 850, d: 600 },
      { id: 'large-capacity', label: '700 × 900 × 750', w: 700, h: 900, d: 750 }
    ]
  };

  const DEFAULT_FACETS = Object.freeze({
    brand: [],
    priceMin: null,
    priceMax: null,
    stars: null,
    availableOnly: false
  });

  const VALID_SORTS = new Set([
    'best-fit',
    'price-asc',
    'price-desc',
    'popularity',
    'stars'
  ]);

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function toMm(value) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.round(value);
    if (typeof value !== 'string' || !value.trim()) return null;
    if (!/^\d+(\.\d+)?$/.test(value.trim())) return null;
    const parsed = Math.round(Number.parseFloat(value));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  function normalizeClearance(row) {
    const side = Number(row?.side ?? row?.sides ?? 0);
    const top = Number(row?.top ?? 0);
    const rear = Number(row?.rear ?? 0);
    return {
      rear: Number.isFinite(rear) ? rear : 0,
      side: Number.isFinite(side) ? side : 0,
      sides: Number.isFinite(side) ? side : 0,
      top: Number.isFinite(top) ? top : 0
    };
  }

  function normalizeClearanceMode(mode) {
    const next = String(mode ?? '').trim();
    return Object.prototype.hasOwnProperty.call(CLEARANCE_MODES, next)
      ? next
      : DEFAULT_CLEARANCE_MODE;
  }

  function normalizeSearchMode(mode) {
    const next = String(mode ?? '').trim();
    return Object.prototype.hasOwnProperty.call(SEARCH_MODES, next)
      ? next
      : DEFAULT_SEARCH_MODE;
  }

  function normalizeReplacementSourceCategory(category) {
    const next = String(category ?? '').trim().toLowerCase();
    if (!next) return '';
    const normalized = next
      .replace(/[\s/]+/g, '_')
      .replace(/-+/g, '_');
    if (['washtower', 'wash_tower', 'laundry_tower', 'combo', 'washtower_combo'].includes(normalized)) {
      return WASHTOWER_COMBO_CATEGORY;
    }
    return Object.prototype.hasOwnProperty.call(CATEGORY_LABELS, normalized) ? normalized : '';
  }

  function getCategoryClearance(defaults, category) {
    const row = defaults?.[category] ?? CLEARANCE_DEFAULTS?.[category] ?? {};
    return normalizeClearance(row);
  }

  function getBrandManufacturerClearance(brandSpecific, category, brand) {
    const cat = brandSpecific?.[category] ?? {};
    const row = cat?.[brand];
    return row ? normalizeClearance(row) : null;
  }

  function getManufacturerClearance(brandSpecific, category, brand, defaults) {
    const cat = brandSpecific?.[category] ?? {};
    return normalizeClearance(cat?.[brand] ?? cat?.__default__ ?? getCategoryClearance(defaults, category));
  }

  function getEffectiveClearance(category, brand, mode = DEFAULT_CLEARANCE_MODE, options = {}) {
    const nextMode = normalizeClearanceMode(mode);
    if (nextMode === 'manufacturer') {
      return getManufacturerClearance(
        options.brandSpecificClearance,
        category,
        brand,
        options.clearanceDefaults
      );
    }
    return normalizeClearance(CLEARANCE_MODES[nextMode]);
  }

  function positiveOrNull(value) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
  }

  function productClosedEnvelope(product) {
    const geometry = product?.geometry_v2;
    if (geometry && typeof geometry === 'object') {
      const height = geometry.closedEnvelope?.heightMm;
      return {
        widthMm: positiveOrNull(geometry.closedEnvelope?.widthMm),
        heightMm: height && typeof height === 'object'
          ? {
            minimumMm: positiveOrNull(height.minimumMm),
            maximumMm: positiveOrNull(height.maximumMm)
          }
          : null,
        depthMm: positiveOrNull(geometry.closedEnvelope?.depthMm)
      };
    }
    const heightMm = positiveOrNull(product?.h);
    return {
      widthMm: positiveOrNull(product?.w),
      heightMm: heightMm === null ? null : { minimumMm: heightMm, maximumMm: heightMm },
      depthMm: positiveOrNull(product?.d)
    };
  }

  function receiptBoundField(fieldEvidence, field) {
    const row = fieldEvidence?.[field];
    return Boolean(
      row
      && /^[a-f0-9]{64}$/i.test(String(row.contentSha256 ?? ''))
      && /^[a-f0-9]{64}$/i.test(String(row.receiptBindingSha256 ?? ''))
      && /^https:\/\//i.test(String(row.sourceUrl ?? ''))
    );
  }

  function receiptBackedEvidenceLevel(product, geometry) {
    const provenance = product?.geometry_v2_provenance;
    if (!provenance || !['dimensions', 'verified'].includes(provenance.evidenceLevel)) return 'none';
    const fieldEvidence = provenance.fieldEvidence;
    const closedFields = ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'];
    if (!closedFields.every((field) => receiptBoundField(fieldEvidence, field))) return 'none';
    const required = [
      ...closedFields,
      'installation.leftMm', 'installation.rightMm', 'installation.topMm', 'installation.rearMm'
    ];
    if (['dishwasher', 'washtower_combo'].includes(geometry.category)) {
      required.push('operation.doorOpenDepthMm', 'service.rearServicesMm');
    } else if (geometry.category === 'washing_machine') {
      required.push('service.rearServicesMm');
      if (geometry.formFactor === 'front_loader') required.push('operation.doorOpenDepthMm');
      if (geometry.formFactor === 'top_loader') required.push('operation.lidOpenHeightMm');
    } else if (geometry.category === 'dryer') {
      required.push('operation.doorOpenDepthMm', 'service.rearVentilationMm');
    } else if (geometry.category === 'fridge') {
      if (geometry.formFactor === 'upright') required.push('operation.doorOpenDepthMm');
      if (geometry.formFactor === 'chest') required.push('operation.lidOpenHeightMm');
    }
    return provenance.evidenceLevel === 'verified'
      && required.every((field) => receiptBoundField(fieldEvidence, field))
      ? 'verified'
      : 'dimensions';
  }

  function nullableNonNegative(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
  }

  function createFitGeometry(product, category, mode, clearance) {
    const source = product?.geometry_v2;
    const closedEnvelope = productClosedEnvelope(product);
    if (mode === 'manufacturer') {
      return {
        category,
        formFactor: source?.formFactor ?? null,
        closedEnvelope,
        installation: {
          leftMm: nullableNonNegative(source?.installation?.leftMm),
          rightMm: nullableNonNegative(source?.installation?.rightMm),
          topMm: nullableNonNegative(source?.installation?.topMm),
          rearMm: nullableNonNegative(source?.installation?.rearMm),
          frontMm: nullableNonNegative(source?.installation?.frontMm)
        },
        operation: {
          doorOpenDepthMm: nullableNonNegative(source?.operation?.doorOpenDepthMm),
          hingeSideSpaceMm: nullableNonNegative(source?.operation?.hingeSideSpaceMm),
          lidOpenHeightMm: nullableNonNegative(source?.operation?.lidOpenHeightMm)
        },
        service: {
          plumbingRearMm: nullableNonNegative(source?.service?.plumbingRearMm),
          rearServicesMm: nullableNonNegative(source?.service?.rearServicesMm),
          rearVentilationMm: nullableNonNegative(source?.service?.rearVentilationMm)
        }
      };
    }
    const side = nullableNonNegative(clearance?.sides ?? clearance?.side) ?? 0;
    const top = nullableNonNegative(clearance?.top) ?? 0;
    const rear = nullableNonNegative(clearance?.rear) ?? 0;
    return {
      category,
      formFactor: source?.formFactor ?? null,
      closedEnvelope,
      installation: { leftMm: side, rightMm: side, topMm: top, rearMm: rear, frontMm: 0 },
      operation: {
        doorOpenDepthMm: nullableNonNegative(source?.operation?.doorOpenDepthMm),
        hingeSideSpaceMm: nullableNonNegative(source?.operation?.hingeSideSpaceMm),
        lidOpenHeightMm: nullableNonNegative(source?.operation?.lidOpenHeightMm)
      },
      service: {
        plumbingRearMm: nullableNonNegative(source?.service?.plumbingRearMm),
        rearServicesMm: rear,
        rearVentilationMm: rear
      }
    };
  }

  function clearanceFromGeometry(geometry) {
    const left = geometry.installation.leftMm;
    const right = geometry.installation.rightMm;
    const side = left === null || right === null ? null : Math.max(left, right);
    return {
      rear: geometry.installation.rearMm,
      side,
      sides: side,
      top: geometry.installation.topMm,
      left,
      right
    };
  }

  function operationAdvisoryChecks(geometry, cavity) {
    const doorApplicable = ['dishwasher', 'dryer', 'washtower_combo'].includes(geometry.category)
      || geometry.formFactor === 'upright'
      || geometry.formFactor === 'front_loader';
    const lidApplicable = geometry.formFactor === 'chest' || geometry.formFactor === 'top_loader';
    const lidRequired = geometry.operation?.lidOpenHeightMm;
    const availableHeight = cavity.heightMm;
    return [
      { id: 'door_open_space', applicable: doorApplicable, status: doorApplicable ? 'UNKNOWN' : 'PASS' },
      {
        id: 'lid_open_height',
        applicable: lidApplicable,
        status: !lidApplicable
          ? 'PASS'
          : lidRequired === null || availableHeight === null
            ? 'UNKNOWN'
            : availableHeight >= lidRequired ? 'PASS' : 'FAIL'
      }
    ];
  }

  function includesFeature(product, pattern) {
    const matcher = pattern instanceof RegExp ? pattern : new RegExp(String(pattern ?? ''), 'i');
    return (Array.isArray(product?.features) ? product.features : [])
      .some((feature) => matcher.test(String(feature ?? '')));
  }

  function collectProductSearchText(product) {
    const fields = [
      product?.cat,
      product?.category,
      product?.subcategory,
      product?.brand,
      product?.model,
      product?.displayName,
      product?.readableSpec,
      product?.type,
      product?.configuration,
      ...(Array.isArray(product?.features) ? product.features : [])
    ];
    return fields
      .map((value) => String(value ?? '').trim())
      .filter(Boolean)
      .join(' ');
  }

  function isWashtowerComboProduct(product) {
    const explicitCategory = normalizeReplacementSourceCategory(product?.cat)
      || normalizeReplacementSourceCategory(product?.category)
      || normalizeReplacementSourceCategory(product?.subcategory);
    if (explicitCategory === WASHTOWER_COMBO_CATEGORY) return true;
    const text = collectProductSearchText(product);
    return /(?:wash\s*tower|washtower|laundry\s*tower|washer[-\s]?dryer\s*tower|stacked\s+washer\s+dryer|all[-\s]?in[-\s]?one\s+laundry\s+tower|\bWWT[-\w]*\b|\bWK[-\w]*\b)/i.test(text);
  }

  function categoryMatches(product, category) {
    if (!category) return true;
    if (category === WASHTOWER_COMBO_CATEGORY) return isWashtowerComboProduct(product);
    return product?.cat === category;
  }

  function passesReplacementQuarantine(product, filters, searchMode) {
    if (normalizeSearchMode(searchMode ?? filters?.searchMode) !== SEARCH_MODES.replacement) return true;
    const sourceCategory = normalizeReplacementSourceCategory(filters?.replacementSourceCategory);
    const isTower = isWashtowerComboProduct(product);

    if (sourceCategory === WASHTOWER_COMBO_CATEGORY) return isTower;
    if (!isTower) return true;
    if (STANDARD_LAUNDRY_REPLACEMENT_CATEGORIES.has(sourceCategory)) return false;

    const inputHeight = toMm(filters?.h);
    const productHeight = toMm(product?.h);
    if (inputHeight && productHeight && inputHeight + 200 <= productHeight) return false;
    return true;
  }

  function getAwkwardSpaceFlags(product = {}) {
    if (!product || typeof product !== 'object') return [];
    const flags = [];
    const width = Number(product?.w);
    const height = Number(product?.h);
    const depth = Number(product?.d);
    const topClearance = Number(product?.manufacturerClearance?.top ?? product?.clearance?.top);

    if (Number.isFinite(depth) && depth > 0 && depth <= 550) flags.push('shallow-depth');
    if (Number.isFinite(height) && height > 0 && height <= 1700) flags.push('low-cavity');
    if (Number.isFinite(topClearance) && topClearance === 0) flags.push('no-top-clearance');
    if (product?.cat === 'dryer' && includesFeature(product, /heat\s*pump/i)) flags.push('apartment-ok');

    const minDim = Math.min(...[width, depth].filter((value) => Number.isFinite(value) && value > 0));
    if (Number.isFinite(minDim) && minDim <= 600) flags.push('narrow-doorway');

    return [...new Set(flags)];
  }

  function getAxisEntries(product, filters, clearance) {
    const entries = [];
    const cavityW = toMm(filters?.w);
    const cavityH = toMm(filters?.h);
    const cavityD = toMm(filters?.d);

    if (cavityW) {
      entries.push({ key: 'w', cavity: cavityW, appliance: Number(product?.w), clearanceMm: clearance.sides * 2 });
    }
    if (cavityH) {
      entries.push({ key: 'h', cavity: cavityH, appliance: Number(product?.h), clearanceMm: clearance.top });
    }
    if (cavityD) {
      entries.push({ key: 'd', cavity: cavityD, appliance: Number(product?.d), clearanceMm: clearance.rear });
    }

    return entries;
  }

  function computeAxisScore(cavity, appliance, clearanceMm) {
    if (!Number.isFinite(cavity) || cavity <= 0) return null;
    if (!Number.isFinite(appliance) || appliance <= 0) return null;
    return clamp((cavity - appliance - clearanceMm) / cavity, -0.05, 0.5);
  }

  function fitScoreAxisSpare(entry = {}, fallback = {}) {
    const direct = Number(entry.spareMm ?? entry.gapMm ?? entry.gap ?? entry.spare);
    if (Number.isFinite(direct)) return direct;
    const cavity = Number(entry.cavity ?? fallback.cavity);
    const appliance = Number(entry.appliance ?? fallback.appliance);
    const clearanceMm = Number(entry.clearanceMm ?? fallback.clearanceMm ?? 0);
    if (!Number.isFinite(cavity) || !Number.isFinite(appliance)) return null;
    return cavity - appliance - (Number.isFinite(clearanceMm) ? clearanceMm : 0);
  }

  function normalizeFitScoreAxis(axis) {
    const value = String(axis ?? '').trim().toLowerCase();
    if (value === 'w') return 'width';
    if (value === 'h') return 'height';
    if (value === 'd') return 'depth';
    return ['width', 'height', 'depth'].includes(value) ? value : '';
  }

  function deriveFitScoreAxisGaps(input = {}) {
    const { axisGaps, cavity, applianceDims, clearance } = input && typeof input === 'object' ? input : {};
    const fromEntries = Array.isArray(axisGaps)
      ? axisGaps
        .map((entry) => {
          const axis = normalizeFitScoreAxis(entry?.axis ?? entry?.key);
          const spareMm = fitScoreAxisSpare(entry);
          return axis && Number.isFinite(spareMm) ? { axis, spareMm } : null;
        })
        .filter(Boolean)
      : [];
    if (fromEntries.length > 0) return fromEntries;

    const cavityByAxis = {
      width: Number(cavity?.w),
      height: Number(cavity?.h),
      depth: Number(cavity?.d)
    };
    const applianceByAxis = {
      width: Number(applianceDims?.w),
      height: Number(applianceDims?.h),
      depth: Number(applianceDims?.d)
    };
    const clearanceByAxis = {
      width: Number(clearance?.sides ?? clearance?.side ?? 0) * 2,
      height: Number(clearance?.top ?? 0),
      depth: Number(clearance?.rear ?? 0)
    };

    return ['width', 'height', 'depth']
      .map((axis) => {
        const cavityMm = cavityByAxis[axis];
        const applianceMm = applianceByAxis[axis];
        const clearanceMm = clearanceByAxis[axis];
        if (!Number.isFinite(cavityMm) || cavityMm <= 0 || !Number.isFinite(applianceMm) || applianceMm <= 0) {
          return null;
        }
        return {
          axis,
          spareMm: cavityMm - applianceMm - (Number.isFinite(clearanceMm) ? clearanceMm : 0)
        };
      })
      .filter(Boolean);
  }

  function deriveFitScoreDimensionGaps(input = {}) {
    return deriveFitScoreAxisGaps({
      cavity: input?.cavity,
      applianceDims: input?.applianceDims,
      clearance: input?.clearance
    });
  }

  function computeFitScoreNumeric(input = {}) {
    const safeInput = input && typeof input === 'object' ? input : {};
    const entries = deriveFitScoreAxisGaps(safeInput);
    if (entries.length === 0) return 0;
    const dimensionEntries = deriveFitScoreDimensionGaps(safeInput);
    if (dimensionEntries.some((entry) => entry.spareMm < 0)) return 0;
    if (entries.some((entry) => entry.spareMm < 0)) return 0;

    const cavityByAxis = {
      width: Number(safeInput?.cavity?.w),
      height: Number(safeInput?.cavity?.h),
      depth: Number(safeInput?.cavity?.d)
    };
    const weights = { width: 0.40, height: 0.30, depth: 0.30 };
    let weighted = 0;

    for (const entry of entries) {
      const cavityMm = cavityByAxis[entry.axis] || Number(entry.cavity);
      if (!Number.isFinite(cavityMm) || cavityMm <= 0) continue;
      const ratio = Math.max(0, Number(entry.spareMm)) / cavityMm;
      const axisFactor = Math.min(1, ratio / 0.2);
      weighted += axisFactor * (weights[entry.axis] ?? 0);
    }

    const tightest = Math.min(...entries.map((entry) => entry.spareMm));
    let penalty = 1;
    if (tightest < 5) penalty = 0.85;
    else if (tightest < 10) penalty = 0.95;

    const raw = weighted * 100 * penalty;
    if (!Number.isFinite(raw)) return 0;
    return Math.max(0, Math.min(100, Math.round(raw)));
  }

  function getFitScoreTier(score) {
    const value = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
    if (value >= 90) return 'excellent';
    if (value >= 75) return 'strong';
    if (value >= 60) return 'workable';
    if (value >= 40) return 'tight';
    if (value >= 1) return 'marginal';
    return 'no-fit';
  }

  function getFitScoreLabel(score) {
    return {
      excellent: 'Excellent margin',
      strong: 'Strong margin',
      workable: 'Workable margin',
      tight: 'Tight margin',
      marginal: 'Marginal margin',
      'no-fit': 'No dimensional fit'
    }[getFitScoreTier(score)];
  }

  function computeFitMeta(product, filters, options = {}) {
    const category = filters?.cat === WASHTOWER_COMBO_CATEGORY ? product?.cat : (filters?.cat ?? product?.cat);
    const clearanceMode = normalizeClearanceMode(filters?.clearanceMode ?? options.clearanceMode);
    const searchMode = normalizeSearchMode(filters?.searchMode ?? options.searchMode);
    const replacementSourceCategory = normalizeReplacementSourceCategory(
      filters?.replacementSourceCategory ?? options.replacementSourceCategory
    );
    const fitMode = searchMode === 'replacement' ? 'physical' : clearanceMode;
    const estimatedClearance = fitMode === 'manufacturer'
      ? null
      : getEffectiveClearance(category, product?.brand, fitMode, options);
    const geometry = createFitGeometry(product, category, fitMode, estimatedClearance);
    const cavity = {
      widthMm: toMm(filters?.w),
      heightMm: toMm(filters?.h),
      depthMm: toMm(filters?.d)
    };
    if ([cavity.widthMm, cavity.heightMm, cavity.depthMm].every((value) => value === null)) return null;
    const evidenceLevel = fitMode === 'manufacturer'
      ? receiptBackedEvidenceLevel(product, geometry)
      : 'none';
    const fitDecision = fitEngine.evaluateFit({
      geometry,
      cavity,
      evidenceLevel,
      advisoryChecks: operationAdvisoryChecks(geometry, cavity)
    });
    const applianceByAxis = {
      width: geometry.closedEnvelope.widthMm,
      height: geometry.closedEnvelope.heightMm?.maximumMm ?? null,
      depth: geometry.closedEnvelope.depthMm
    };
    const keyByAxis = { width: 'w', height: 'h', depth: 'd' };
    const axisEntries = fitDecision.checks.slice(0, 3)
      .map((check) => {
        const axis = check.id.replace('installation_', '');
        const appliance = applianceByAxis[axis];
        if (check.availableMm === null || check.requiredMm === null || appliance === null) return null;
        return {
          key: keyByAxis[axis],
          cavity: check.availableMm,
          appliance,
          clearanceMm: check.requiredMm - appliance,
          spareMm: check.spareMm
        };
      })
      .filter(Boolean);
    const axisScores = axisEntries
      .map((entry) => computeAxisScore(entry.cavity, entry.appliance, entry.clearanceMm))
      .filter(Number.isFinite);
    const fitScore = axisScores.length ? Math.min(...axisScores) : null;
    const sortScore = axisScores.length
      ? axisScores.reduce((sum, score) => sum + score, 0) / axisScores.length
      : null;
    const cavityMin = axisEntries.length ? Math.min(...axisEntries.map((entry) => entry.cavity)) : null;
    const toleranceMm = searchMode === 'replacement'
      ? 0
      : (Number.isFinite(Number(filters?.toleranceMm)) ? Number(filters.toleranceMm) : 0);
    const threshold = cavityMin === null ? 0 : -(toleranceMm / cavityMin);
    const installationChecks = fitDecision.checks.slice(0, 3);
    const exactFit = installationChecks.every((check) => check.status === 'PASS');
    const fitsTightly = axisScores.some((score) => score < 0.02);
    const axisGaps = axisEntries.map((entry) => ({
      axis: entry.key === 'w' ? 'width' : entry.key === 'h' ? 'height' : 'depth',
      label: entry.key === 'w' ? 'W' : entry.key === 'h' ? 'H' : 'D',
      cavity: Math.round(entry.cavity),
      appliance: Math.round(entry.appliance),
      clearanceMm: Math.round(entry.clearanceMm),
      gapMm: Math.round(entry.spareMm)
    }));
    const binding = axisGaps
      .slice()
      .sort((left, right) => left.gapMm - right.gapMm)[0] ?? null;
    const recommendationMode = searchMode === 'replacement' ? clearanceMode : fitMode;
    const recommendationClearance = recommendationMode === 'manufacturer'
      ? null
      : getEffectiveClearance(category, product?.brand, recommendationMode, options);
    const recommendationGeometry = searchMode === 'replacement'
      ? createFitGeometry(product, category, recommendationMode, recommendationClearance)
      : geometry;
    const recommendation = searchMode === 'replacement'
      ? fitEngine.evaluateFit({
        geometry: recommendationGeometry,
        cavity,
        evidenceLevel: recommendationMode === 'manufacturer'
          ? receiptBackedEvidenceLevel(product, recommendationGeometry)
          : 'none',
        advisoryChecks: operationAdvisoryChecks(recommendationGeometry, cavity)
      })
      : fitDecision;
    const clearance = recommendationMode === 'manufacturer'
      ? clearanceFromGeometry(recommendationGeometry)
      : recommendationClearance;
    const completeAxisChecks = installationChecks.every((check) => check.status !== 'UNKNOWN');
    const scoreCavity = { w: cavity.widthMm, h: cavity.heightMm, d: cavity.depthMm };

    return {
      fitScore,
      fitScoreNumeric: searchMode === 'replacement' || !completeAxisChecks
        ? null
        : computeFitScoreNumeric({
          axisGaps,
          cavity: scoreCavity,
          applianceDims: {
            w: applianceByAxis.width,
            h: applianceByAxis.height,
            d: applianceByAxis.depth
          },
          clearance
        }),
      sortScore,
      threshold,
      requiredClearancePass: installationChecks.every((check) => check.status === 'PASS'),
      exactFit,
      fitsTightly: fitsTightly || (Number.isFinite(fitScore) && fitScore < 0),
      axisGaps,
      searchMode,
      replacementSourceCategory,
      requiredCavityMm: {
        w: recommendation.required.widthMm,
        h: recommendation.required.heightMm,
        d: recommendation.required.depthMm
      },
      sizeMatchGaps: {
        w: cavity.widthMm === null || applianceByAxis.width === null ? null : Math.round(cavity.widthMm - applianceByAxis.width),
        h: cavity.heightMm === null || applianceByAxis.height === null ? null : Math.round(cavity.heightMm - applianceByAxis.height),
        d: cavity.depthMm === null || applianceByAxis.depth === null ? null : Math.round(cavity.depthMm - applianceByAxis.depth)
      },
      bindingAxis: binding?.axis ?? '',
      tightestGapMm: binding?.gapMm ?? null,
      clearance,
      clearanceMode,
      manufacturerClearance: getBrandManufacturerClearance(
        options.brandSpecificClearance,
        category,
        product?.brand
      ),
      fitDecision
    };
  }

  function buildProductUrl(product, filters) {
    const params = new URLSearchParams();
    if (product?.cat) params.set('cat', String(product.cat));
    if (filters?.w) params.set('w', String(filters.w));
    if (filters?.h) params.set('h', String(filters.h));
    if (filters?.d) params.set('d', String(filters.d));
    if (product?.brand) params.set('brand', String(product.brand));
    return `/?${params.toString()}`;
  }

  function normalizeBrand(value) {
    return String(value ?? '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }

  function normalizeFacetBrands(values) {
    if (!Array.isArray(values)) return [];
    return values
      .map((value) => String(value ?? '').trim().slice(0, 50))
      .filter(Boolean);
  }

  function normalizeNumberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function normalizeFacets(facets) {
    const rawPriceMin = normalizeNumberOrNull(facets?.priceMin);
    const rawPriceMax = normalizeNumberOrNull(facets?.priceMax);
    const rawStars = normalizeNumberOrNull(facets?.stars);
    return {
      brand: normalizeFacetBrands(facets?.brand),
      priceMin: rawPriceMin !== null && rawPriceMin >= 0 ? rawPriceMin : null,
      priceMax: rawPriceMax !== null && rawPriceMax >= 0 ? rawPriceMax : null,
      stars: rawStars !== null && rawStars >= 0 ? rawStars : null,
      availableOnly: facets?.availableOnly === true
    };
  }

  function normalizeSortBy(value) {
    const next = String(value ?? '').trim();
    return VALID_SORTS.has(next) ? next : 'best-fit';
  }

  function normalizeRetailerOnly(filters, options) {
    if (options && Object.prototype.hasOwnProperty.call(options, 'retailerOnly')) {
      return options.retailerOnly !== false;
    }
    if (filters && Object.prototype.hasOwnProperty.call(filters, 'retailerOnly')) {
      return filters.retailerOnly !== false;
    }
    return true;
  }

  function isRetailerProductPageUrl(url) {
    let parsed;
    try {
      parsed = new URL(String(url ?? '').trim());
    } catch {
      return false;
    }
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    const pathname = parsed.pathname.replace(/\/+$/, '').toLowerCase();
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    if (!host || pathname === '' || pathname === '/') return false;
    if (host === 'prf.hn') return false;
    if (['q', 'query', 'searchterm', 'text', 'keyword'].some((key) => parsed.searchParams.has(key))) return false;
    if (/\/(search|searchdisplay|catalogsearch|collections?|category|categories|cart|checkout)(\/|$)/i.test(pathname)) {
      return false;
    }

    if (host.endsWith('jbhifi.com.au')) return /^\/products\//.test(pathname);
    if (host.endsWith('appliancesonline.com.au') || host.endsWith('appliances-online.com.au')) return /^\/product\//.test(pathname);
    if (host.endsWith('binglee.com.au')) return /^\/products\//.test(pathname);
    if (host.endsWith('harveynorman.com.au')) return /\.html$/.test(pathname);
    if (host.endsWith('thegoodguys.com.au')) return /^\/[^/]+-[^/]+$/.test(pathname);

    return true;
  }

  function hasRetailerLink(product) {
    return Array.isArray(product?.retailers) && product.retailers.some((retailer) => (
      isRetailerProductPageUrl(retailer?.url ?? retailer?.href ?? retailer?.u ?? retailer?.link)
    ));
  }

  function isCurrentProduct(product) {
    return product?.unavailable === false && hasRetailerLink(product);
  }

  function getComparablePrice(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function buildResult(product, fitMeta, filters) {
    return {
      ...product,
      fitScore: fitMeta.fitScore,
      fitScoreNumeric: fitMeta.fitScoreNumeric,
      sortScore: fitMeta.sortScore,
      exactFit: fitMeta.exactFit,
      fitsTightly: fitMeta.fitsTightly,
      clearance: fitMeta.clearance,
      clearanceMode: fitMeta.clearanceMode,
      manufacturerClearance: fitMeta.manufacturerClearance,
      fitAxisGaps: fitMeta.axisGaps,
      searchMode: fitMeta.searchMode,
      replacementSourceCategory: fitMeta.replacementSourceCategory,
      requiredCavityMm: fitMeta.requiredCavityMm,
      sizeMatchGaps: fitMeta.sizeMatchGaps,
      bindingAxis: fitMeta.bindingAxis,
      tightestGapMm: fitMeta.tightestGapMm,
      fitDecision: fitMeta.fitDecision,
      showPopularityBadge: Number(product?.priorityScore ?? 0) >= 70,
      sku: String(product?.model ?? '').trim().split(/\s+/)[0] ?? '',
      url: buildProductUrl(product, filters)
    };
  }

  function buildReplacementResult(product, replacementMatch, filters) {
    const {
      fitScore: _fitScore,
      fitScoreNumeric: _fitScoreNumeric,
      fitDecision: _fitDecision,
      exactFit: _exactFit,
      fitsTightly: _fitsTightly,
      sortScore: _sortScore,
      clearance: _clearance,
      clearanceMode: _clearanceMode,
      manufacturerClearance: _manufacturerClearance,
      fitAxisGaps: _fitAxisGaps,
      requiredCavityMm: _requiredCavityMm,
      sizeMatchGaps: _sizeMatchGaps,
      bindingAxis: _bindingAxis,
      tightestGapMm: _tightestGapMm,
      ...publicProduct
    } = product;
    const candidateDimensions = replacementMatch?.candidateDimensionsMm ?? {};
    return {
      ...publicProduct,
      w: candidateDimensions.width ?? publicProduct.w,
      h: candidateDimensions.height ?? publicProduct.h,
      d: candidateDimensions.depth ?? publicProduct.d,
      searchMode: SEARCH_MODES.replacement,
      replacementSourceCategory: normalizeReplacementSourceCategory(filters?.replacementSourceCategory),
      replacementMatch,
      showPopularityBadge: Number(product?.priorityScore ?? 0) >= 70,
      sku: String(product?.model ?? '').trim().split(/\s+/)[0] ?? '',
      url: buildProductUrl(product, filters)
    };
  }

  function compareMatches(left, right) {
    if (left?.replacementMatch && right?.replacementMatch) {
      return replacementEngine.compareMatches(
        { product: left, match: left.replacementMatch },
        { product: right, match: right.replacementMatch }
      );
    }
    if (left.exactFit !== right.exactFit) return left.exactFit ? -1 : 1;
    if (left.sortScore !== right.sortScore) return left.sortScore - right.sortScore;
    if ((right.priorityScore ?? 0) !== (left.priorityScore ?? 0)) {
      return (right.priorityScore ?? 0) - (left.priorityScore ?? 0);
    }
    return String(left.displayName ?? left.brand ?? '').localeCompare(String(right.displayName ?? right.brand ?? ''));
  }

  function buildFacetCounts(pool) {
    const rows = Array.isArray(pool) ? pool : [];
    if (rows.length === 0) return {};

    const brandMap = new Map();
    const starsMap = new Map();
    let pricedCount = 0;
    let availableCount = 0;

    for (const row of rows) {
      const brandLabel = String(row?.brand ?? '').trim();
      if (brandLabel) {
        brandMap.set(brandLabel, (brandMap.get(brandLabel) ?? 0) + 1);
      }
      const stars = Number(row?.stars);
      if (Number.isFinite(stars)) {
        starsMap.set(String(Math.round(stars)), (starsMap.get(String(Math.round(stars))) ?? 0) + 1);
      }
      if (Number.isFinite(Number(row?.price))) pricedCount += 1;
      if (isCurrentProduct(row)) {
        availableCount += 1;
      }
    }

    const orderedBrands = Object.fromEntries(
      [...brandMap.entries()].sort((left, right) => {
        if (right[1] !== left[1]) return right[1] - left[1];
        return left[0].localeCompare(right[0], 'en-AU', { sensitivity: 'base' });
      })
    );
    const orderedStars = Object.fromEntries(
      [...starsMap.entries()].sort((left, right) => Number(left[0]) - Number(right[0]))
    );

    return {
      brand: orderedBrands,
      stars: orderedStars,
      availability: {
        available: availableCount,
        withPrice: pricedCount
      }
    };
  }

  function applyFacets(matches, facets = {}) {
    const pool = Array.isArray(matches) ? matches : [];
    const normalized = normalizeFacets(facets);
    const selectedBrands = new Set(normalized.brand.map(normalizeBrand));

    const rows = pool.filter((row) => {
      if (selectedBrands.size > 0 && !selectedBrands.has(normalizeBrand(row?.brand))) {
        return false;
      }
      const price = Number(row?.price);
      const hasPriceBounds = normalized.priceMin !== null || normalized.priceMax !== null;
      if (hasPriceBounds) {
        if (!Number.isFinite(price)) return false;
        if (normalized.priceMin !== null && price < normalized.priceMin) return false;
        if (normalized.priceMax !== null && price > normalized.priceMax) return false;
      }
      if (normalized.stars !== null && Number(row?.stars ?? 0) < normalized.stars) {
        return false;
      }
      if (normalized.availableOnly) {
        if (!isCurrentProduct(row)) {
          return false;
        }
      }
      return true;
    });

    return {
      rows,
      counts: buildFacetCounts(pool)
    };
  }

  function sortMatches(rows, sortBy = 'best-fit') {
    const list = Array.isArray(rows) ? [...rows] : [];
    const nextSort = normalizeSortBy(sortBy);

    if (nextSort === 'price-asc') {
      return list.sort((left, right) => {
        const leftComparable = getComparablePrice(left?.price);
        const rightComparable = getComparablePrice(right?.price);
        const leftPrice = leftComparable ?? Infinity;
        const rightPrice = rightComparable ?? Infinity;
        const leftHasPrice = leftComparable !== null;
        const rightHasPrice = rightComparable !== null;
        if (leftHasPrice !== rightHasPrice) return leftHasPrice ? -1 : 1;
        if (leftPrice !== rightPrice) return leftPrice - rightPrice;
        return compareMatches(left, right);
      });
    }
    if (nextSort === 'price-desc') {
      return list.sort((left, right) => {
        const leftComparable = getComparablePrice(left?.price);
        const rightComparable = getComparablePrice(right?.price);
        const leftPrice = leftComparable ?? -Infinity;
        const rightPrice = rightComparable ?? -Infinity;
        const leftHasPrice = leftComparable !== null;
        const rightHasPrice = rightComparable !== null;
        if (leftHasPrice !== rightHasPrice) return leftHasPrice ? -1 : 1;
        if (rightPrice !== leftPrice) return rightPrice - leftPrice;
        return compareMatches(left, right);
      });
    }
    if (nextSort === 'popularity') {
      return list.sort((left, right) => {
        const delta = Number(right?.priorityScore ?? 0) - Number(left?.priorityScore ?? 0);
        if (delta !== 0) return delta;
        return compareMatches(left, right);
      });
    }
    if (nextSort === 'stars') {
      return list.sort((left, right) => {
        const delta = Number(right?.stars ?? 0) - Number(left?.stars ?? 0);
        if (delta !== 0) return delta;
        return compareMatches(left, right);
      });
    }

    return list.sort(compareMatches);
  }

  function findSearchMatches(products, filters, {
    clearanceDefaults = CLEARANCE_DEFAULTS,
    brandSpecificClearance = null,
    clearanceMode = DEFAULT_CLEARANCE_MODE,
    searchMode = DEFAULT_SEARCH_MODE,
    replacementSourceCategory = null,
    limit = 60
  } = {}) {
    const rows = Array.isArray(products) ? products : [];
    const hasAtLeastOneDimension = [filters?.w, filters?.h, filters?.d].some((value) => toMm(value));
    if (!hasAtLeastOneDimension) return [];
    const nextSearchMode = normalizeSearchMode(filters?.searchMode ?? searchMode);
    const nextFilters = {
      ...filters,
      searchMode: nextSearchMode,
      replacementSourceCategory: normalizeReplacementSourceCategory(
        filters?.replacementSourceCategory
          ?? replacementSourceCategory
          ?? (nextSearchMode === SEARCH_MODES.replacement ? filters?.cat : null)
      )
    };

    if (nextSearchMode === SEARCH_MODES.replacement) {
      const hasCompleteSourceDimensions = [nextFilters.w, nextFilters.h, nextFilters.d]
        .every((value) => toMm(value));
      if (!hasCompleteSourceDimensions) return [];
      const candidates = rows
        .filter((product) => categoryMatches(product, nextFilters?.cat))
        .filter((product) => passesReplacementQuarantine(product, nextFilters, nextSearchMode));
      return replacementEngine.matchCurrentProducts(candidates, {
        sourceDimensions: { w: nextFilters.w, h: nextFilters.h, d: nextFilters.d },
        limit
      }).map(({ product, match }) => buildReplacementResult(product, match, nextFilters));
    }

    return rows
      .filter((product) => categoryMatches(product, nextFilters?.cat))
      .map((product) => {
        if (!passesReplacementQuarantine(product, nextFilters, nextSearchMode)) return null;
        const fitMeta = computeFitMeta(product, nextFilters, {
          clearanceDefaults,
          brandSpecificClearance,
          clearanceMode,
          searchMode: nextSearchMode,
          replacementSourceCategory: nextFilters.replacementSourceCategory
        });
        if (!fitMeta) return null;
        if (fitMeta.fitDecision.outcome === 'NO_FIT') return null;
        if (fitMeta.clearanceMode === 'manufacturer' && fitMeta.fitDecision.outcome === 'INSUFFICIENT_DATA') return null;
        if (Number.isFinite(fitMeta.fitScore) && fitMeta.fitScore < fitMeta.threshold) return null;
        return buildResult(product, fitMeta, nextFilters);
      })
      .filter(Boolean)
      .sort(compareMatches)
      .slice(0, Math.max(1, limit));
  }

  function searchWithFacets(products, filters, facets = {}, options = {}) {
    const pool = findSearchMatches(products, filters, {
      clearanceDefaults: options.clearanceDefaults ?? CLEARANCE_DEFAULTS,
      brandSpecificClearance: options.brandSpecificClearance,
      clearanceMode: options.clearanceMode ?? filters?.clearanceMode ?? DEFAULT_CLEARANCE_MODE,
      searchMode: options.searchMode ?? filters?.searchMode ?? DEFAULT_SEARCH_MODE,
      replacementSourceCategory: options.replacementSourceCategory ?? filters?.replacementSourceCategory,
      limit: options.limit ?? Number.MAX_SAFE_INTEGER
    });
    const retailerPool = normalizeRetailerOnly(filters, options)
      ? pool.filter(isCurrentProduct)
      : pool;
    const filtered = applyFacets(retailerPool, facets);
    return {
      rows: sortMatches(filtered.rows, options.sortBy ?? filters?.sortBy ?? facets?.sortBy ?? 'best-fit'),
      counts: filtered.counts
    };
  }

  function calculateClearanceDeficit(product, filters, clearance) {
    const cavityW = toMm(filters?.w);
    const cavityH = toMm(filters?.h);
    const cavityD = toMm(filters?.d);
    const deficits = [];
    if (cavityW) {
      deficits.push({
        axis: 'width',
        needed: Number(product?.w ?? 0) + (Number(clearance?.sides ?? clearance?.side ?? 0) * 2) - cavityW
      });
    }
    if (cavityH) {
      deficits.push({
        axis: 'height',
        needed: Number(product?.h ?? 0) + Number(clearance?.top ?? 0) - cavityH
      });
    }
    if (cavityD) {
      deficits.push({
        axis: 'depth',
        needed: Number(product?.d ?? 0) + Number(clearance?.rear ?? 0) - cavityD
      });
    }
    const finite = deficits
      .map((entry) => ({
        axis: entry.axis,
        needed: Number.isFinite(entry.needed) ? Math.ceil(Math.max(0, entry.needed)) : Infinity
      }))
      .filter((entry) => Number.isFinite(entry.needed));
    if (finite.length === 0) return { axis: 'width', needed: 0 };
    return finite.reduce((max, entry) => (entry.needed > max.needed ? entry : max), finite[0]);
  }

  function buildNearMisses(products, filters, options = {}) {
    const limit = Math.max(1, Number(options.limit ?? 10));
    const physicalPool = findSearchMatches(products, { ...filters, clearanceMode: 'physical' }, {
      clearanceDefaults: options.clearanceDefaults ?? CLEARANCE_DEFAULTS,
      brandSpecificClearance: options.brandSpecificClearance,
      clearanceMode: 'physical',
      limit: Number.MAX_SAFE_INTEGER
    });
    return physicalPool
      .map((row) => {
        const practical = getEffectiveClearance(row?.cat ?? filters?.cat, row?.brand, 'practical', options);
        const deficit = calculateClearanceDeficit(row, filters, practical);
        if (deficit.needed <= 0) return null;
        return {
          ...row,
          clearance: practical,
          clearanceMode: 'practical',
          nearMiss: true,
          cavityNeededMm: deficit.needed,
          bindingAxis: deficit.axis,
          manufacturerClearance: getBrandManufacturerClearance(
            options.brandSpecificClearance,
            row?.cat ?? filters?.cat,
            row?.brand
          )
        };
      })
      .filter(Boolean)
      .sort((left, right) => {
        if (left.cavityNeededMm !== right.cavityNeededMm) return left.cavityNeededMm - right.cavityNeededMm;
        return compareMatches(left, right);
      })
      .slice(0, limit);
  }

  function serializeSearchState(state) {
    const params = new URLSearchParams();
    const facets = normalizeFacets(state?.facets);
    if (state?.cat) params.set('cat', String(state.cat));
    if (toMm(state?.w)) params.set('w', String(toMm(state.w)));
    if (toMm(state?.h)) params.set('h', String(toMm(state.h)));
    if (toMm(state?.d)) params.set('d', String(toMm(state.d)));
    params.set('tol', String(Number.isFinite(Number(state?.toleranceMm)) ? Number(state.toleranceMm) : 5));
    if (state?.preset) params.set('preset', String(state.preset));
    facets.brand.forEach((brand) => params.append('brand', brand));
    if (facets.priceMin !== null) params.set('pmin', String(facets.priceMin));
    if (facets.priceMax !== null) params.set('pmax', String(facets.priceMax));
    if (facets.stars !== null) params.set('stars', String(facets.stars));
    if (facets.availableOnly === true) params.set('avail', '1');
    const clearanceMode = normalizeClearanceMode(state?.clearanceMode);
    const searchMode = normalizeSearchMode(state?.searchMode);
    const replacementSourceCategory = normalizeReplacementSourceCategory(state?.replacementSourceCategory);
    if (clearanceMode !== DEFAULT_CLEARANCE_MODE) params.set('mode', clearanceMode);
    if (searchMode !== DEFAULT_SEARCH_MODE) params.set('searchMode', searchMode);
    if (replacementSourceCategory) params.set('replaceCat', replacementSourceCategory);
    if (state?.retailerOnly === false) params.set('showAll', '1');
    if (state?.sortBy) params.set('sort', normalizeSortBy(state.sortBy));
    return params;
  }

  function parseSearchParams(queryString) {
    const params = new URLSearchParams(String(queryString ?? '').replace(/^\?/, ''));
    const repeatedBrands = params.getAll('brand').map((value) => String(value ?? '').trim());
    const rawBrands = (repeatedBrands.length <= 1
      ? repeatedBrands.flatMap((value) => value.split(','))
      : repeatedBrands
    )
      .map((value) => value.trim().slice(0, 50))
      .filter(Boolean);
    const rawPriceMin = normalizeNumberOrNull(params.get('pmin'));
    const rawPriceMax = normalizeNumberOrNull(params.get('pmax'));
    const rawStars = normalizeNumberOrNull(params.get('stars'));
    const searchMode = normalizeSearchMode(params.get('searchMode'));
    const parsed = {
      cat: params.get('cat') || null,
      w: toMm(params.get('w')),
      h: toMm(params.get('h')),
      d: toMm(params.get('d')),
      toleranceMm: clamp(Number(params.get('tol') ?? 5) || 5, 0, 20),
      preset: params.get('preset') || null,
      facets: {
        ...DEFAULT_FACETS,
        brand: rawBrands,
        priceMin: rawPriceMin !== null && rawPriceMin >= 0 ? rawPriceMin : null,
        priceMax: rawPriceMax !== null && rawPriceMax >= 0 ? rawPriceMax : null,
        stars: rawStars !== null && rawStars >= 0 ? rawStars : null,
        availableOnly: params.get('avail') === '1'
      },
      clearanceMode: normalizeClearanceMode(params.get('mode')),
      retailerOnly: params.get('showAll') !== '1',
      sortBy: normalizeSortBy(params.get('sort'))
    };
    if (searchMode !== DEFAULT_SEARCH_MODE) {
      parsed.searchMode = searchMode;
    }
    const replacementSourceCategory = normalizeReplacementSourceCategory(params.get('replaceCat'));
    if (replacementSourceCategory) {
      parsed.replacementSourceCategory = replacementSourceCategory;
    }
    return parsed;
  }

  function buildEmptyState({
    exactCount = 0,
    relaxedCount = 0,
    toleranceMm = 5,
    categoryLabel = 'Appliances'
  } = {}) {
    const relaxCount = Number.isFinite(relaxedCount) ? relaxedCount : 0;
    const tol = Number.isFinite(toleranceMm) ? toleranceMm : 5;

    return {
      title: `${exactCount} exact matches.`,
      detail: relaxCount > 0
        ? `${relaxCount} fit with +${tol}mm tolerance.`
        : `No ${categoryLabel.toLowerCase()} fit yet. Try a preset or relax the tolerance.`,
      ctaLabel: relaxCount > 0 ? `Relax to ${tol}mm` : 'Try a preset'
    };
  }

  const api = {
    CATEGORY_LABELS,
    CATEGORY_PRESETS,
    CLEARANCE_DEFAULTS,
    CLEARANCE_MODES,
    DEFAULT_CLEARANCE_MODE,
    DEFAULT_SEARCH_MODE,
    SEARCH_MODES,
    buildEmptyState,
    buildNearMisses,
    calculateClearanceDeficit,
    applyFacets,
    computeAxisScore,
    computeFitScoreNumeric,
    computeFitMeta,
    findSearchMatches,
    getCategoryClearance,
    getFitScoreLabel,
    getFitScoreTier,
    getAwkwardSpaceFlags,
    getEffectiveClearance,
    hasRetailerLink,
    isCurrentProduct,
    isRetailerProductPageUrl,
    isWashtowerComboProduct,
    normalizeClearanceMode,
    normalizeReplacementSourceCategory,
    normalizeSearchMode,
    parseSearchParams,
    searchWithFacets,
    serializeSearchState,
    sortMatches,
    toMm
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (globalScope) {
    globalScope.SearchCore = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this));
