function requireObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${field} must be an object`);
  }
  return value;
}

function measurement(value, field, { allowZero }) {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${field} must be a finite number or null`);
  }
  if (allowZero ? value < 0 : value <= 0) {
    throw new RangeError(`${field} must be ${allowZero ? 'non-negative' : 'positive'}`);
  }
  return value;
}

function heightRange(value) {
  if (value === null) {
    return null;
  }
  if (typeof value === 'number') {
    const height = measurement(value, 'closedEnvelope.heightMm', { allowZero: false });
    return { minimumMm: height, maximumMm: height };
  }

  const range = requireObject(value, 'closedEnvelope.heightMm');
  const minimumMm = measurement(range.minimumMm, 'closedEnvelope.heightMm.minimumMm', {
    allowZero: false,
  });
  const maximumMm = measurement(range.maximumMm, 'closedEnvelope.heightMm.maximumMm', {
    allowZero: false,
  });
  if (minimumMm === null || maximumMm === null) {
    throw new TypeError('closedEnvelope.heightMm range endpoints cannot be null');
  }
  if (minimumMm > maximumMm) {
    throw new RangeError('closedEnvelope.heightMm minimum cannot exceed maximum');
  }
  return { minimumMm, maximumMm };
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      freezeDeep(child);
    }
  }
  return value;
}

export function createGeometry(input) {
  const geometry = requireObject(input, 'geometry');
  const closedEnvelope = requireObject(geometry.closedEnvelope, 'closedEnvelope');
  const installation = requireObject(geometry.installation, 'installation');

  return freezeDeep({
    closedEnvelope: {
      widthMm: measurement(closedEnvelope.widthMm, 'closedEnvelope.widthMm', {
        allowZero: false,
      }),
      heightMm: heightRange(closedEnvelope.heightMm),
      depthMm: measurement(closedEnvelope.depthMm, 'closedEnvelope.depthMm', {
        allowZero: false,
      }),
    },
    installation: {
      leftMm: measurement(installation.leftMm, 'installation.leftMm', { allowZero: true }),
      rightMm: measurement(installation.rightMm, 'installation.rightMm', { allowZero: true }),
      topMm: measurement(installation.topMm, 'installation.topMm', { allowZero: true }),
      rearMm: measurement(installation.rearMm, 'installation.rearMm', { allowZero: true }),
      frontMm: measurement(installation.frontMm, 'installation.frontMm', { allowZero: true }),
    },
    operation: null,
    delivery: null,
  });
}

export function requiredInstallationEnvelope(geometry) {
  const input = requireObject(geometry, 'geometry');
  const closed = requireObject(input.closedEnvelope, 'closedEnvelope');
  const installation = requireObject(input.installation, 'installation');
  const requiredValues = [
    closed.widthMm,
    closed.heightMm?.maximumMm ?? null,
    closed.depthMm,
    installation.leftMm,
    installation.rightMm,
    installation.topMm,
    installation.rearMm,
    installation.frontMm,
  ];
  if (requiredValues.some((value) => value === null)) {
    return null;
  }

  return freezeDeep({
    widthMm: closed.widthMm + installation.leftMm + installation.rightMm,
    heightMm: closed.heightMm.maximumMm + installation.topMm,
    depthMm: closed.depthMm + installation.rearMm + installation.frontMm,
  });
}
