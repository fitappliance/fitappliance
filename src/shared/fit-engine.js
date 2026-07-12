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

  const api = Object.freeze({ evaluateFit });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (globalScope) globalScope.FitEngine = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
