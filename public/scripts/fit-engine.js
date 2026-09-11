'use strict';

(function attachFitEngine(globalScope) {
  const EVIDENCE_LEVELS = new Set(['none', 'dimensions', 'verified']);
  const CHECK_STATUSES = new Set(['PASS', 'FAIL', 'UNKNOWN']);

  function requireObject(value, field) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new TypeError(`${field} must be an object`);
    }
    return value;
  }

  function requireString(value, field) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new TypeError(`${field} must be a non-empty string`);
    }
    return value.trim();
  }

  function finiteOrNull(value, field, { allowZero = false } = {}) {
    if (value === null) return null;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new TypeError(`${field} must be a finite number or null`);
    }
    if (allowZero ? value < 0 : value <= 0) {
      throw new RangeError(`${field} must be ${allowZero ? 'non-negative' : 'positive'}`);
    }
    return value;
  }

  function sumKnown(values) {
    return values.some((value) => value === null)
      ? null
      : values.reduce((total, value) => total + value, 0);
  }

  function requiredRearService(geometry) {
    const category = geometry.category ?? null;
    const service = geometry.service ?? {};
    if (['dishwasher', 'washing_machine', 'washtower_combo'].includes(category)) {
      return finiteOrNull(service.rearServicesMm ?? null, 'service.rearServicesMm', { allowZero: true });
    }
    if (category === 'dryer') {
      return finiteOrNull(service.rearVentilationMm ?? null, 'service.rearVentilationMm', { allowZero: true });
    }
    return 0;
  }

  function makeAxisCheck(id, requiredMm, availableMm) {
    if (requiredMm === null || availableMm === null) {
      return { id, status: 'UNKNOWN', requiredMm, availableMm, spareMm: null };
    }
    const spareMm = availableMm - requiredMm;
    return { id, status: spareMm >= 0 ? 'PASS' : 'FAIL', requiredMm, availableMm, spareMm };
  }

  function normalizeAdvisoryChecks(checks) {
    if (!Array.isArray(checks)) throw new TypeError('advisory checks must be an array');
    const seen = new Set();
    return checks.map((input, index) => {
      const check = requireObject(input, `advisory check ${index}`);
      if (typeof check.applicable !== 'boolean') {
        throw new TypeError(`advisory check ${index} applicable must be a boolean`);
      }
      const status = requireString(check.status, `advisory check ${index} status`);
      if (!CHECK_STATUSES.has(status)) throw new RangeError(`unsupported advisory check status: ${status}`);
      const id = requireString(check.id, `advisory check ${index} id`);
      if (id.startsWith('installation_')) throw new RangeError(`reserved advisory check id: ${id}`);
      if (seen.has(id)) throw new RangeError(`duplicate advisory check id: ${id}`);
      seen.add(id);
      return { id, applicable: check.applicable, status };
    });
  }

  function freezeDeep(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const child of Object.values(value)) freezeDeep(child);
    }
    return value;
  }

  function evaluateFit(input) {
    const request = requireObject(input, 'fit evaluation');
    const geometry = requireObject(request.geometry, 'geometry');
    const closed = requireObject(geometry.closedEnvelope, 'closedEnvelope');
    const installation = requireObject(geometry.installation, 'installation');
    const cavity = requireObject(request.cavity, 'cavity');
    const level = requireString(request.evidenceLevel, 'evidence level');
    if (!EVIDENCE_LEVELS.has(level)) throw new RangeError(`unsupported evidence level: ${level}`);

    const widthMm = finiteOrNull(closed.widthMm, 'closedEnvelope.widthMm');
    const depthMm = finiteOrNull(closed.depthMm, 'closedEnvelope.depthMm');
    const heightMm = closed.heightMm === null
      ? null
      : finiteOrNull(
        requireObject(closed.heightMm, 'closedEnvelope.heightMm').maximumMm,
        'closedEnvelope.heightMm.maximumMm',
      );
    const rearMm = finiteOrNull(installation.rearMm, 'installation.rearMm', { allowZero: true });
    const rearServiceMm = requiredRearService(geometry);
    const required = {
      widthMm: sumKnown([
        widthMm,
        finiteOrNull(installation.leftMm, 'installation.leftMm', { allowZero: true }),
        finiteOrNull(installation.rightMm, 'installation.rightMm', { allowZero: true }),
      ]),
      heightMm: sumKnown([
        heightMm,
        finiteOrNull(installation.topMm, 'installation.topMm', { allowZero: true }),
      ]),
      depthMm: depthMm === null || rearMm === null || rearServiceMm === null
        ? null
        : depthMm + Math.max(rearMm, rearServiceMm),
    };
    const available = {
      widthMm: finiteOrNull(cavity.widthMm, 'cavity.widthMm'),
      heightMm: finiteOrNull(cavity.heightMm, 'cavity.heightMm'),
      depthMm: finiteOrNull(cavity.depthMm, 'cavity.depthMm'),
    };
    const axisChecks = [
      makeAxisCheck('installation_width', required.widthMm, available.widthMm),
      makeAxisCheck('installation_height', required.heightMm, available.heightMm),
      makeAxisCheck('installation_depth', required.depthMm, available.depthMm),
    ];
    const advisoryChecks = normalizeAdvisoryChecks(request.advisoryChecks);
    const applicableChecks = advisoryChecks.filter((check) => check.applicable);

    let outcome;
    if (axisChecks.some((check) => check.status === 'FAIL')
      || applicableChecks.some((check) => check.status === 'FAIL')) {
      outcome = 'NO_FIT';
    } else if (axisChecks.some((check) => check.status === 'UNKNOWN')) {
      outcome = 'INSUFFICIENT_DATA';
    } else if (applicableChecks.some((check) => check.status === 'UNKNOWN')) {
      outcome = 'CONDITIONAL_FIT';
    } else if (level === 'verified') {
      outcome = 'VERIFIED_FIT';
    } else {
      outcome = 'LIKELY_FIT_ESTIMATED';
    }

    return freezeDeep({
      outcome,
      checks: [...axisChecks, ...advisoryChecks],
      required,
      spare: {
        widthMm: axisChecks[0].spareMm,
        heightMm: axisChecks[1].spareMm,
        depthMm: axisChecks[2].spareMm,
      },
      evidenceLevel: level,
    });
  }

  const VERIFIED_EVIDENCE_FIELDS = Object.freeze({
    closedEnvelope: Object.freeze([
      'closedEnvelope.widthMm',
      'closedEnvelope.heightMm',
      'closedEnvelope.depthMm',
    ]),
    placement: Object.freeze([
      'installation.leftMm',
      'installation.rightMm',
      'installation.topMm',
      'installation.rearMm',
    ]),
    category: Object.freeze({
      fridge: Object.freeze([]),
      dishwasher: Object.freeze(['operation.doorOpenDepthMm', 'service.rearServicesMm']),
      washing_machine: Object.freeze(['service.rearServicesMm']),
      dryer: Object.freeze(['operation.doorOpenDepthMm', 'service.rearVentilationMm']),
      washtower_combo: Object.freeze(['operation.doorOpenDepthMm', 'service.rearServicesMm']),
    }),
    formFactor: Object.freeze({
      'fridge:upright': Object.freeze(['operation.doorOpenDepthMm']),
      'fridge:chest': Object.freeze(['operation.lidOpenHeightMm']),
      'washing_machine:front_loader': Object.freeze(['operation.doorOpenDepthMm']),
      'washing_machine:top_loader': Object.freeze(['operation.lidOpenHeightMm']),
    }),
  });

  function getPath(object, path) {
    return path.split('.').reduce((value, key) => value?.[key], object);
  }

  function isHttpsUrl(value) {
    try {
      const parsed = new URL(String(value ?? ''));
      return parsed.protocol === 'https:' && Boolean(parsed.hostname);
    } catch {
      return false;
    }
  }

  function receiptBoundField(fieldEvidence, field) {
    const row = fieldEvidence?.[field];
    return Boolean(
      row
      && /^[a-f0-9]{64}$/i.test(String(row.contentSha256 ?? ''))
      && /^[a-f0-9]{64}$/i.test(String(row.receiptBindingSha256 ?? ''))
      && isHttpsUrl(row.sourceUrl)
    );
  }

  function applicableEvidenceFields(geometry) {
    const category = geometry?.category;
    if (!Object.hasOwn(VERIFIED_EVIDENCE_FIELDS.category, category)) return null;
    return [
      ...VERIFIED_EVIDENCE_FIELDS.closedEnvelope,
      ...VERIFIED_EVIDENCE_FIELDS.placement,
      ...VERIFIED_EVIDENCE_FIELDS.category[category],
      ...(VERIFIED_EVIDENCE_FIELDS.formFactor[`${category}:${geometry?.formFactor}`] ?? []),
    ];
  }

  function resolveEvidenceLevel(geometry, evidence) {
    if (!geometry || typeof geometry !== 'object' || Array.isArray(geometry)) return 'none';
    if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) return 'none';
    if (evidence.identityOutcome !== 'exact') return 'none';
    if (!['dimensions', 'verified'].includes(evidence.evidenceLevel)) return 'none';

    const fields = applicableEvidenceFields(geometry);
    if (!fields) return 'none';
    const fieldEvidence = evidence.fieldEvidence;
    const closedFields = VERIFIED_EVIDENCE_FIELDS.closedEnvelope;
    if (!closedFields.every((field) => (
      getPath(geometry, field) !== null
      && getPath(geometry, field) !== undefined
      && receiptBoundField(fieldEvidence, field)
    ))) return 'none';
    if (evidence.evidenceLevel !== 'verified') return 'dimensions';
    return fields.every((field) => (
      getPath(geometry, field) !== null
      && getPath(geometry, field) !== undefined
      && receiptBoundField(fieldEvidence, field)
    )) ? 'verified' : 'dimensions';
  }

  function positiveOrNull(value) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
  }

  function nonNegativeOrNull(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
  }

  function normalizeHeight(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') {
      const height = positiveOrNull(value);
      return height === null ? null : { minimumMm: height, maximumMm: height };
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const minimumMm = positiveOrNull(value.minimumMm);
    const maximumMm = positiveOrNull(value.maximumMm);
    if (minimumMm === null || maximumMm === null || minimumMm > maximumMm) return null;
    return { minimumMm, maximumMm };
  }

  function normalizeV4Geometry(input) {
    const source = requireObject(input, 'geometry');
    const closed = source.closedEnvelope && typeof source.closedEnvelope === 'object'
      ? source.closedEnvelope
      : {};
    const installation = source.installation && typeof source.installation === 'object'
      ? source.installation
      : {};
    const operation = source.operation && typeof source.operation === 'object' ? source.operation : {};
    const service = source.service && typeof source.service === 'object' ? source.service : {};
    return {
      category: typeof source.category === 'string' ? source.category : null,
      formFactor: typeof source.formFactor === 'string' ? source.formFactor : null,
      closedEnvelope: {
        widthMm: positiveOrNull(closed.widthMm),
        heightMm: normalizeHeight(closed.heightMm),
        depthMm: positiveOrNull(closed.depthMm),
      },
      installation: {
        leftMm: nonNegativeOrNull(installation.leftMm),
        rightMm: nonNegativeOrNull(installation.rightMm),
        topMm: nonNegativeOrNull(installation.topMm),
        rearMm: nonNegativeOrNull(installation.rearMm),
        frontMm: nonNegativeOrNull(installation.frontMm),
      },
      operation: {
        doorOpenDepthMm: nonNegativeOrNull(operation.doorOpenDepthMm),
        hingeSideSpaceMm: nonNegativeOrNull(operation.hingeSideSpaceMm),
        lidOpenHeightMm: nonNegativeOrNull(operation.lidOpenHeightMm),
      },
      service: {
        plumbingRearMm: nonNegativeOrNull(service.plumbingRearMm),
        rearServicesMm: nonNegativeOrNull(service.rearServicesMm),
        rearVentilationMm: nonNegativeOrNull(service.rearVentilationMm),
      },
    };
  }

  function normalizeV4Cavity(input) {
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    return {
      widthMm: positiveOrNull(source.widthMm),
      heightMm: positiveOrNull(source.heightMm),
      depthMm: positiveOrNull(source.depthMm),
    };
  }

  function sizeMatch(geometry, cavity) {
    const productDimensions = {
      width: geometry.closedEnvelope.widthMm,
      height: geometry.closedEnvelope.heightMm?.maximumMm ?? null,
      depth: geometry.closedEnvelope.depthMm,
    };
    const cavityDimensions = {
      width: cavity.widthMm,
      height: cavity.heightMm,
      depth: cavity.depthMm,
    };
    const entries = Object.entries(productDimensions).map(([axis, productMm]) => {
      const cavityMm = cavityDimensions[axis];
      if (productMm === null || cavityMm === null) {
        return { axis, status: 'UNKNOWN', productMm, cavityMm, gapMm: null };
      }
      const gapMm = cavityMm - productMm;
      return { axis, status: gapMm >= 0 ? 'PASS' : 'FAIL', productMm, cavityMm, gapMm };
    });
    return {
      statuses: Object.fromEntries(entries.map((entry) => [entry.axis, entry.status])),
      gapsMm: Object.fromEntries(entries.map((entry) => [entry.axis, entry.gapMm])),
      entries,
    };
  }

  function evaluateFitV4(input) {
    const request = requireObject(input, 'Fit V4 evaluation');
    const geometry = normalizeV4Geometry(request.geometry);
    const cavity = normalizeV4Cavity(request.cavity);
    const evidenceLevel = resolveEvidenceLevel(geometry, request.evidence);
    const match = sizeMatch(geometry, cavity);
    const decision = evaluateFit({
      geometry,
      cavity,
      evidenceLevel,
      advisoryChecks: request.advisoryChecks ?? [],
    });
    const axisChecks = decision.checks.slice(0, 3);
    const advisoryChecks = decision.checks.slice(3);
    const hasSizeFailure = match.entries.some((entry) => entry.status === 'FAIL');
    const hasAxisFailure = axisChecks.some((check) => check.status === 'FAIL');
    const hasAdvisoryFailure = advisoryChecks.some((check) => check.applicable && check.status === 'FAIL');
    const hasAxisUnknown = match.entries.some((entry) => entry.status === 'UNKNOWN')
      || axisChecks.some((check) => check.status === 'UNKNOWN');
    const hasAdvisoryUnknown = advisoryChecks.some((check) => check.applicable && check.status === 'UNKNOWN');
    const outcome = hasSizeFailure || hasAxisFailure || hasAdvisoryFailure
      ? 'NO_FIT'
      : hasAxisUnknown || hasAdvisoryUnknown
        ? 'INSUFFICIENT_DATA'
        : evidenceLevel === 'verified'
          ? 'VERIFIED_FIT'
          : 'INSUFFICIENT_DATA';

    return freezeDeep({
      schemaVersion: 4,
      engine: 'fit-v4-safe-boundary',
      outcome,
      evidenceLevel,
      sizeMatch: match,
      checks: decision.checks,
      required: decision.required,
      spare: decision.spare,
    });
  }

  const api = Object.freeze({ evaluateFit, evaluateFitV4, resolveEvidenceLevel });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (globalScope) globalScope.FitEngine = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
