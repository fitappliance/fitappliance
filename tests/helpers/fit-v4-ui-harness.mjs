const BOUND_METHODS = Object.freeze({
  MINIMUM_AVAILABLE: { select: Math.min, method: 'MINIMUM_OF_REPEATED_READINGS' },
  MAXIMUM_REQUIRED: { select: Math.max, method: 'MAXIMUM_OF_REPEATED_READINGS' },
});

const REPLACEMENT_AXES = Object.freeze([
  ['width', 'widthMm'],
  ['height', 'heightMm'],
  ['depth', 'depthMm'],
]);

const CATEGORICAL_OUTCOMES = new Set([
  'NO_FIT',
  'INSUFFICIENT_DATA',
  'CONDITIONAL_FIT',
  'LIKELY_FIT_ESTIMATED',
  'VERIFIED_FIT',
]);

const DELIVERY_OUTCOMES = new Set([
  'NO_FIT',
  'INSUFFICIENT_DATA',
  'LIKELY_FIT_ESTIMATED',
  'VERIFIED_FIT',
  'NOT_EVALUATED',
]);

function finiteNonNegative(value, label) {
  if (!Number.isFinite(value) || value < 0) throw new TypeError(`${label} must be a finite non-negative number`);
  return value;
}

function element(document, tagName, attributes = {}, text = null) {
  const node = document.createElement(tagName);
  for (const [name, value] of Object.entries(attributes)) {
    if (name === 'className') node.className = value;
    else if (name === 'dataset') Object.assign(node.dataset, value);
    else node.setAttribute(name, String(value));
  }
  if (text !== null) node.textContent = text;
  return node;
}

function statusLabel(value) {
  if (!value) return 'Not evaluated';
  return String(value).replaceAll('_', ' ');
}

function allowedStatusLabel(value, allowed) {
  return allowed.has(value) ? statusLabel(value) : 'Not evaluated';
}

function appendTextList(document, parent, rows, emptyText) {
  if (rows.length === 0) {
    parent.append(element(document, 'p', { className: 'fit-v4-muted' }, emptyText));
    return;
  }
  const list = element(document, 'ul');
  for (const row of rows) {
    list.append(element(document, 'li', {
      className: 'fit-v4-wrap',
      dataset: row.id ? { checkId: row.id } : {},
    }, row.label ?? row.fieldId ?? row.reasonCode ?? 'Unspecified check'));
  }
  parent.append(list);
}

function section(document, name, title) {
  const node = element(document, 'section', { dataset: { fitV4Section: name } });
  node.append(element(document, 'h2', {}, title));
  return node;
}

function questionFieldset(document, legendText, questions, prefix, onChange) {
  const fieldset = element(document, 'fieldset');
  const controls = [];
  fieldset.append(element(document, 'legend', {}, legendText));
  if (questions.length === 0) {
    fieldset.append(element(document, 'p', { className: 'fit-v4-muted' }, 'No questions in this synthetic scenario.'));
    return { fieldset, controls };
  }
  for (const question of questions) {
    const id = `${prefix}-${question.id}`;
    const label = element(document, 'label', { for: id, className: 'fit-v4-wrap' }, question.label);
    const select = element(document, 'select', { id, name: id });
    for (const [value, text] of [['unknown', 'Not answered'], ['yes', 'Yes'], ['no', 'No']]) {
      const option = element(document, 'option', { value }, text);
      if ((question.answer ?? 'unknown') === value) option.selected = true;
      select.append(option);
    }
    select.addEventListener('change', onChange);
    controls.push({ questionId: question.id, control: select });
    fieldset.append(label, select);
  }
  return { fieldset, controls };
}

function measurementFieldset(document, measurements, onChange) {
  const fieldset = element(document, 'fieldset');
  fieldset.append(element(document, 'legend', {}, 'Repeated site measurements'));
  for (const [measurementIndex, measurement] of measurements.entries()) {
    const derived = deriveConservativeMeasurement(measurement);
    const row = element(document, 'div', {
      className: 'fit-v4-measurement fit-v4-wrap',
      dataset: { measurementDatum: measurement.datum, measurementIndex },
    });
    row.append(element(document, 'h3', {}, `${measurement.datum} (${measurement.axis}, ${measurement.boundType})`));
    const readings = element(document, 'div', { className: 'fit-v4-reading-grid' });
    for (const [readingIndex, reading] of derived.readings.entries()) {
      const id = `measurement-${measurementIndex}-reading-${readingIndex}`;
      readings.append(
        element(document, 'label', { for: id }, `Reading ${readingIndex + 1} (${measurement.unit})`),
        element(document, 'input', {
          id,
          name: id,
          type: 'number',
          inputmode: 'decimal',
          value: reading,
          min: 0,
        }),
      );
    }
    const readingSummary = element(document, 'p', { dataset: { readingSummary: '' } });
    const conservativeSummary = element(document, 'p', { dataset: { conservativeMethod: derived.method } });
    const refresh = (invalidate = true) => {
      const inputs = [...readings.querySelectorAll('input')];
      const values = inputs.map((input) => input.valueAsNumber);
      for (const [index, input] of inputs.entries()) {
        if (Number.isFinite(values[index]) && values[index] >= 0) input.removeAttribute('aria-invalid');
        else input.setAttribute('aria-invalid', 'true');
      }
      try {
        const current = deriveConservativeMeasurement({ ...measurement, readings: values });
        readingSummary.textContent = `Recorded readings: ${current.readings.join(', ')} ${measurement.unit}`;
        conservativeSummary.dataset.conservativeMethod = current.method;
        conservativeSummary.textContent = `Conservative value: ${current.conservativeValue} ${measurement.unit}`;
      } catch {
        readingSummary.textContent = 'Recorded readings include an invalid value.';
        conservativeSummary.dataset.conservativeMethod = 'UNAVAILABLE_INVALID_READING';
        conservativeSummary.textContent = 'Conservative value unavailable until every reading is valid.';
      }
      if (invalidate) onChange();
    };
    for (const input of readings.querySelectorAll('input')) input.addEventListener('input', () => refresh());
    refresh(false);
    row.append(
      readings,
      readingSummary,
      conservativeSummary,
    );
    fieldset.append(row);
  }
  return fieldset;
}

function layoutFieldset(document, root, liveRegion, initialLayout) {
  const fieldset = element(document, 'fieldset');
  fieldset.append(element(document, 'legend', {}, 'Preview layout'));
  const buttons = [];
  const selectLayout = (layout) => {
    root.dataset.layout = layout;
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.layoutOption === layout));
    liveRegion.textContent = `${layout === 'mobile' ? 'Mobile' : 'Desktop'} layout selected.`;
  };
  for (const layout of ['desktop', 'mobile']) {
    const button = element(document, 'button', {
      type: 'button',
      dataset: { layoutOption: layout },
      'aria-pressed': 'false',
    }, layout === 'mobile' ? 'Mobile preview' : 'Desktop preview');
    button.addEventListener('click', () => selectLayout(layout));
    button.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectLayout(layout);
      }
    });
    buttons.push(button);
    fieldset.append(button);
  }
  selectLayout(initialLayout);
  return fieldset;
}

function ageInDays(recordedAt, now) {
  const recorded = Date.parse(recordedAt ?? '');
  const current = Date.parse(now ?? '');
  if (!Number.isFinite(recorded) || !Number.isFinite(current) || current < recorded) return null;
  return Math.floor((current - recorded) / 86_400_000);
}

function renderReplacement(document, root, replacement) {
  const match = matchReplacementDimensions(replacement?.oldAppliance, replacement?.newAppliance);
  root.append(element(document, 'h1', {}, 'Direct dimensional match'));
  root.append(element(document, 'p', { role: 'status', 'aria-live': 'polite' },
    match.status === 'DIMENSION_MATCH'
      ? 'The new appliance is no larger than the old appliance on width, height and depth.'
      : 'The new appliance exceeds the old appliance on at least one dimension.'));
  const table = element(document, 'table');
  const caption = element(document, 'caption', {}, 'Old and new appliance dimensions');
  const body = element(document, 'tbody');
  for (const [axis, values] of Object.entries(match.axes)) {
    const row = element(document, 'tr');
    row.append(
      element(document, 'th', { scope: 'row' }, axis),
      element(document, 'td', {}, `Old ${values.oldMm} mm`),
      element(document, 'td', {}, `New ${values.newMm} mm`),
      element(document, 'td', {}, values.fits ? 'Within old dimension' : 'Exceeds old dimension'),
    );
    body.append(row);
  }
  table.append(caption, body);
  root.append(table);
}

export function deriveConservativeMeasurement(measurement) {
  if (!measurement || typeof measurement !== 'object') throw new TypeError('measurement is required');
  const behavior = BOUND_METHODS[measurement.boundType];
  if (!behavior) throw new TypeError('measurement boundType must be MINIMUM_AVAILABLE or MAXIMUM_REQUIRED');
  if (!Array.isArray(measurement.readings) || measurement.readings.length === 0) {
    throw new TypeError('at least one measurement reading is required');
  }
  const readings = measurement.readings.map((value, index) => finiteNonNegative(value, `reading ${index + 1}`));
  return Object.freeze({
    datum: measurement.datum,
    axis: measurement.axis,
    boundType: measurement.boundType,
    unit: measurement.unit,
    readings: Object.freeze([...readings]),
    conservativeValue: behavior.select(...readings),
    method: behavior.method,
  });
}

export function matchReplacementDimensions(oldAppliance, newAppliance) {
  if (!oldAppliance || !newAppliance) throw new TypeError('old and new appliance dimensions are required');
  const axes = {};
  for (const [axis, key] of REPLACEMENT_AXES) {
    const oldMm = finiteNonNegative(oldAppliance[key], `old appliance ${key}`);
    const newMm = finiteNonNegative(newAppliance[key], `new appliance ${key}`);
    axes[axis] = Object.freeze({ oldMm, newMm, differenceMm: oldMm - newMm, fits: newMm <= oldMm });
  }
  return Object.freeze({
    status: Object.values(axes).every((axis) => axis.fits) ? 'DIMENSION_MATCH' : 'DIMENSION_MISMATCH',
    axes: Object.freeze(axes),
  });
}

export function createFitV4UiHarness(document, options = {}) {
  if (!document?.createElement) throw new TypeError('DOM document is required');
  const root = element(document, 'article', {
    className: 'fit-v4-harness',
    dataset: {
      layout: options.layout === 'mobile' ? 'mobile' : 'desktop',
      mode: options.mode ?? 'fit',
      evaluationState: 'current',
    },
  });
  const style = element(document, 'style', { dataset: { fitV4HarnessStyle: '' } }, [
    '.fit-v4-harness { font-size: 1rem; max-width: 72rem; }',
    '.fit-v4-harness[data-layout="desktop"] .fit-v4-reading-grid { display: grid; grid-template-columns: auto minmax(8rem, 1fr); gap: .5rem; }',
    '.fit-v4-harness[data-layout="mobile"] .fit-v4-reading-grid { display: grid; grid-template-columns: 1fr; gap: .5rem; }',
    '.fit-v4-wrap { overflow-wrap: anywhere; white-space: normal; }',
    '.fit-v4-harness fieldset { margin-block: 1rem; min-width: 0; }',
    '.fit-v4-harness input, .fit-v4-harness select, .fit-v4-harness button { font: inherit; }',
  ].join('\n'));
  root.append(style);

  if (options.mode === 'replacement') {
    renderReplacement(document, root, options.replacement);
    return Object.freeze({ root, mode: 'replacement' });
  }

  const resultStatus = element(document, 'p', options.zeroResults ? { role: 'status', 'aria-live': 'polite' } : {});
  if (options.zeroResults) resultStatus.textContent = 'No products were evaluated for this synthetic scenario.';
  const layoutStatus = element(document, 'p', { 'aria-live': 'polite', dataset: { layoutStatus: '' } });
  root.append(element(document, 'h1', {}, 'Fit V4 explanation harness'), resultStatus, layoutStatus);

  let invalidateEvaluation = () => {};
  const invalidateOnInput = () => invalidateEvaluation();
  const measurements = options.measurements ?? [];
  const measurementGroup = measurementFieldset(document, measurements, invalidateOnInput);
  const configurationGroup = questionFieldset(
    document,
    'Configuration questions',
    options.configurationQuestions ?? [],
    'configuration',
    invalidateOnInput,
  );
  const serviceGroup = questionFieldset(
    document,
    'Service questions',
    options.serviceQuestions ?? [],
    'service',
    invalidateOnInput,
  );
  root.append(
    measurementGroup,
    configurationGroup.fieldset,
    serviceGroup.fieldset,
  );

  const deliveryFieldset = element(document, 'fieldset');
  deliveryFieldset.append(element(document, 'legend', {}, 'Delivery scope'));
  const deliveryControl = element(document, 'input', {
    id: 'fit-v4-delivery-selected',
    name: 'fit-v4-delivery-selected',
    type: 'checkbox',
  });
  deliveryControl.checked = options.deliverySelected === true;
  deliveryFieldset.append(
    deliveryControl,
    element(document, 'label', { for: 'fit-v4-delivery-selected' }, 'Assess the optional delivery path'),
  );
  root.append(deliveryFieldset, layoutFieldset(document, root, layoutStatus, root.dataset.layout));

  const result = options.result;
  const installationStatusName = CATEGORICAL_OUTCOMES.has(result?.installationOutcome?.status)
    ? result.installationOutcome.status
    : null;
  const installation = section(document, 'installation-outcome', 'Installation outcome');
  const installationStatus = element(
    document,
    'p',
    {},
    allowedStatusLabel(result?.installationOutcome?.status, CATEGORICAL_OUTCOMES),
  );
  installation.append(installationStatus);

  const delivery = section(document, 'delivery-outcome', 'Delivery outcome');
  const deliveryStatus = element(document, 'p');
  const updateDelivery = (selected, announce = false) => {
    deliveryStatus.textContent = selected
      ? allowedStatusLabel(result?.deliveryOutcome?.status, DELIVERY_OUTCOMES)
      : 'Not assessed because delivery was not selected.';
    if (announce) layoutStatus.textContent = 'Delivery display updated. Installation outcome unchanged.';
  };
  updateDelivery(options.deliverySelected === true);
  deliveryControl.addEventListener('change', () => {
    invalidateEvaluation();
    layoutStatus.textContent = 'Delivery input changed; re-evaluation required.';
  });
  delivery.append(deliveryStatus);

  const limiting = section(document, 'limiting-checks', 'Limiting checks');
  appendTextList(
    document,
    limiting,
    (result?.checks ?? []).filter((check) => check.status === 'FAIL'),
    'No limiting checks were supplied.',
  );

  const unresolved = section(document, 'unresolved-checks', 'Unresolved checks');
  appendTextList(document, unresolved, [
    ...(result?.checks ?? []).filter((check) => check.status === 'UNKNOWN'),
    ...(result?.gaps ?? []),
  ], 'No unresolved checks were supplied.');

  const scope = section(document, 'scope', 'Policy and evidence scope');
  scope.append(
    element(document, 'p', {}, `Policy: ${result?.policyScope?.category ?? 'not supplied'} / ${result?.policyScope?.version ?? 'not supplied'}`),
    element(document, 'p', {}, `Evidence: ${result?.evidenceScope?.model ?? 'not supplied'}; receipts: ${result?.evidenceScope?.receiptCount ?? 'not supplied'}`),
  );

  const measurementAge = section(document, 'measurement-age', 'Measurement age');
  const days = ageInDays(options.measurementRecordedAt, options.now);
  measurementAge.append(element(document, 'p', {}, days === null ? 'Measurement age is unknown.' : `${days} days old.`));

  const rank = section(document, 'categorical-rank', 'Categorical rank');
  const candidateRankName = options.rank?.fitV4Rank?.outcomeBand?.name;
  const rankName = CATEGORICAL_OUTCOMES.has(candidateRankName)
    && candidateRankName === installationStatusName
    ? candidateRankName
    : null;
  rank.dataset.state = rankName ? 'categorical-rank' : 'no-score';
  const rankStatus = element(document, 'p', {}, rankName
    ? statusLabel(rankName)
    : 'No categorical rank is available; ranking remains disabled.');
  rank.append(rankStatus);

  root.append(installation, delivery, limiting, unresolved, scope, measurementAge, rank);
  invalidateEvaluation = () => {
    root.dataset.evaluationState = 'stale';
    installationStatus.textContent = 'Inputs changed; re-evaluation required.';
    deliveryStatus.textContent = 'Inputs changed; re-evaluation required.';
    rank.dataset.state = 'no-score';
    rankStatus.textContent = 'Inputs changed; re-evaluation required before ranking.';
    layoutStatus.textContent = 'Fit inputs changed. Previous outcomes are no longer current.';
  };
  const readMeasurements = () => measurements.map((measurement, index) => deriveConservativeMeasurement({
    ...measurement,
    readings: [...root.querySelectorAll(`[data-measurement-index="${index}"] input`)]
      .map((input) => input.valueAsNumber),
  }));
  const readAnswers = (group) => Object.fromEntries(
    group.controls.map(({ questionId, control }) => [questionId, control.value]),
  );
  const readScenarioInputs = () => ({
    configurationAnswers: readAnswers(configurationGroup),
    serviceAnswers: readAnswers(serviceGroup),
    deliverySelected: deliveryControl.checked,
    measurements: readMeasurements(),
  });
  return Object.freeze({ root, mode: 'fit', readMeasurements, readScenarioInputs });
}
