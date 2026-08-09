import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { JSDOM } from 'jsdom';

import {
  createFitV4UiHarness,
  deriveConservativeMeasurement,
  matchReplacementDimensions,
} from './helpers/fit-v4-ui-harness.mjs';

const fixtureUrl = new URL('./fixtures/fit-v4-ui/synthetic-fit-case.json', import.meta.url);
const fixture = JSON.parse(await readFile(fixtureUrl, 'utf8'));

function createDocument() {
  return new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', {
    url: 'https://synthetic.invalid/',
  }).window.document;
}

function createHarness(overrides = {}) {
  const document = createDocument();
  const harness = createFitV4UiHarness(document, {
    ...fixture,
    deliverySelected: true,
    measurementRecordedAt: '2026-08-01T00:00:00.000Z',
    now: '2026-08-08T00:00:00.000Z',
    ...overrides,
  });
  document.querySelector('#app').append(harness.root);
  return { document, harness };
}

test('repeated readings remain visible and use the conservative bound without averaging', () => {
  const minimum = deriveConservativeMeasurement(fixture.measurements[0]);
  assert.deepEqual(minimum.readings, [602, 598, 600]);
  assert.equal(minimum.conservativeValue, 598);
  assert.equal(minimum.method, 'MINIMUM_OF_REPEATED_READINGS');

  const maximum = deriveConservativeMeasurement(fixture.measurements[1]);
  assert.deepEqual(maximum.readings, [48, 52, 50]);
  assert.equal(maximum.conservativeValue, 52);
  assert.equal(maximum.method, 'MAXIMUM_OF_REPEATED_READINGS');

  const { document } = createHarness();
  const rows = [...document.querySelectorAll('[data-measurement-datum]')];
  assert.equal(rows.length, 2);
  assert.match(rows[0].textContent, /602.*598.*600.*598/s);
  assert.match(rows[1].textContent, /48.*52.*50.*52/s);
});

test('explanation DOM order is fixed and no generic numeric score can render', () => {
  const { document } = createHarness();
  assert.deepEqual(
    [...document.querySelectorAll('[data-fit-v4-section]')].map((node) => node.dataset.fitV4Section),
    [
      'installation-outcome',
      'delivery-outcome',
      'limiting-checks',
      'unresolved-checks',
      'scope',
      'measurement-age',
      'categorical-rank',
    ],
  );
  assert.match(document.querySelector('[data-fit-v4-section="installation-outcome"]').textContent, /CONDITIONAL FIT/);
  assert.match(document.querySelector('[data-fit-v4-section="delivery-outcome"]').textContent, /NO FIT/);
  assert.match(document.querySelector('[data-fit-v4-section="limiting-checks"]').textContent, /Rear service/);
  assert.match(document.querySelector('[data-fit-v4-section="unresolved-checks"]').textContent, /Door opening sweep/);
  assert.match(document.querySelector('[data-fit-v4-section="unresolved-checks"]').textContent, /service\.power\.outlet\.location/);
  assert.match(document.querySelector('[data-fit-v4-section="scope"]').textContent, /fit-policy-v4-test/);
  assert.match(document.querySelector('[data-fit-v4-section="measurement-age"]').textContent, /7 days old/);
  assert.match(document.querySelector('[data-fit-v4-section="categorical-rank"]').textContent, /CONDITIONAL FIT/);

  const text = document.body.textContent;
  assert.doesNotMatch(text, /\b98\b/);
  assert.doesNotMatch(text, /generic score|total score|fit score/i);
  assert.equal(document.querySelector('[data-score-total]'), null);
});

test('delivery is optional, independent, and invalidates stale evaluation when changed', () => {
  const { document, harness } = createHarness({ deliverySelected: false });
  assert.match(document.querySelector('[data-fit-v4-section="installation-outcome"]').textContent, /CONDITIONAL FIT/);
  assert.match(document.querySelector('[data-fit-v4-section="delivery-outcome"]').textContent, /Not assessed.*delivery was not selected/i);
  assert.doesNotMatch(document.querySelector('[data-fit-v4-section="delivery-outcome"]').textContent, /NO FIT/);

  const checkbox = document.querySelector('#fit-v4-delivery-selected');
  checkbox.checked = true;
  checkbox.dispatchEvent(new document.defaultView.Event('change', { bubbles: true }));
  assert.equal(harness.root.dataset.evaluationState, 'stale');
  assert.match(document.querySelector('[data-fit-v4-section="delivery-outcome"]').textContent, /Re-evaluation required/i);
  assert.match(document.querySelector('[data-fit-v4-section="installation-outcome"]').textContent, /Re-evaluation required/i);
  assert.match(document.querySelector('[data-layout-status]').textContent, /Delivery input changed.*re-evaluation required/i);
});

test('zero results and disabled rank are explicit without fabricating an outcome or score', () => {
  const { document } = createHarness({ zeroResults: true, result: null, rank: null });
  assert.match(document.querySelector('[role="status"]').textContent, /No products were evaluated for this synthetic scenario/);
  assert.match(document.querySelector('[data-fit-v4-section="installation-outcome"]').textContent, /Not evaluated/);
  assert.match(document.querySelector('[data-fit-v4-section="categorical-rank"]').textContent, /No categorical rank is available/);
  assert.doesNotMatch(document.body.textContent, /NO FIT/);
});

test('forms are labelled, grouped, keyboard operable and announce layout changes', () => {
  const { document, harness } = createHarness({ layout: 'desktop' });
  const fieldsets = [...document.querySelectorAll('fieldset')];
  assert.ok(fieldsets.length >= 4);
  for (const fieldset of fieldsets) assert.ok(fieldset.querySelector('legend')?.textContent.trim());
  for (const control of document.querySelectorAll('input, select, button')) {
    const labelled = control.getAttribute('aria-label')
      || control.getAttribute('aria-labelledby')
      || (control.id && document.querySelector(`label[for="${control.id}"]`)?.textContent.trim())
      || control.textContent.trim();
    assert.ok(labelled, `control ${control.outerHTML} should have an accessible name`);
  }

  const mobileButton = document.querySelector('[data-layout-option="mobile"]');
  mobileButton.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.equal(harness.root.dataset.layout, 'mobile');
  assert.match(document.querySelector('[aria-live="polite"]').textContent, /Mobile layout selected/);
  assert.equal(mobileButton.getAttribute('aria-pressed'), 'true');

  const longLabel = document.querySelector('[data-check-id="installation.hinge-side"]');
  assert.ok(longLabel.classList.contains('fit-v4-wrap'));
  assert.equal(document.querySelector('[data-fit-v4-harness-style]').textContent.includes('overflow-wrap: anywhere'), true);
  assert.equal(document.querySelector('[data-fit-v4-harness-style]').textContent.includes('height:'), false);
  assert.equal(document.querySelector('[data-fit-v4-harness-style]').textContent.includes('vw'), false);
});

test('editable configuration, service and delivery answers can be exported without inference', () => {
  const { document, harness } = createHarness({ deliverySelected: false });
  const configuration = document.querySelector('#configuration-hinge-side');
  const service = document.querySelector('#service-water-route');
  const delivery = document.querySelector('#fit-v4-delivery-selected');
  configuration.value = 'yes';
  service.value = 'no';
  delivery.checked = true;

  assert.deepEqual(harness.readScenarioInputs(), {
    configurationAnswers: { 'hinge-side': 'yes' },
    serviceAnswers: { 'water-route': 'no' },
    deliverySelected: true,
    measurements: [
      {
        datum: 'cavity.front.opening.width',
        axis: 'width',
        boundType: 'MINIMUM_AVAILABLE',
        unit: 'mm',
        readings: [602, 598, 600],
        conservativeValue: 598,
        method: 'MINIMUM_OF_REPEATED_READINGS',
      },
      {
        datum: 'service.rear.required.depth',
        axis: 'depth',
        boundType: 'MAXIMUM_REQUIRED',
        unit: 'mm',
        readings: [48, 52, 50],
        conservativeValue: 52,
        method: 'MAXIMUM_OF_REPEATED_READINGS',
      },
    ],
  });
});

test('editing a fit input invalidates the previously completed result and rank', () => {
  const { document, harness } = createHarness();
  const firstReading = document.querySelector('#measurement-0-reading-0');
  firstReading.value = '590';
  firstReading.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }));

  assert.equal(harness.root.dataset.evaluationState, 'stale');
  assert.match(
    document.querySelector('[data-fit-v4-section="installation-outcome"]').textContent,
    /Inputs changed.*re-evaluation required/i,
  );
  const rank = document.querySelector('[data-fit-v4-section="categorical-rank"]');
  assert.equal(rank.dataset.state, 'no-score');
  assert.match(rank.textContent, /re-evaluation required/i);
  assert.doesNotMatch(rank.textContent, /CONDITIONAL FIT/);
});

test('an invalid edited reading fails closed without retaining a stale conservative value', () => {
  const { document, harness } = createHarness();
  const firstReading = document.querySelector('#measurement-0-reading-0');
  firstReading.value = '';
  firstReading.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }));

  assert.equal(firstReading.getAttribute('aria-invalid'), 'true');
  assert.match(
    document.querySelector('[data-measurement-datum="cavity.front.opening.width"] [data-conservative-method]').textContent,
    /Conservative value unavailable/i,
  );
  assert.equal(harness.root.dataset.evaluationState, 'stale');
  assert.throws(() => harness.readMeasurements(), /finite non-negative number/i);
});

test('unknown outcomes and rank/outcome disagreement fail closed in the explanation view', () => {
  const mismatch = createHarness({
    rank: { fitV4Rank: { outcomeBand: { name: 'VERIFIED_FIT' }, total: null } },
  }).document;
  assert.equal(
    mismatch.querySelector('[data-fit-v4-section="categorical-rank"]').dataset.state,
    'no-score',
  );
  assert.doesNotMatch(
    mismatch.querySelector('[data-fit-v4-section="categorical-rank"]').textContent,
    /VERIFIED FIT/,
  );

  const unknown = createHarness({
    result: {
      ...fixture.result,
      installationOutcome: { status: 'MAGIC_FIT' },
    },
    rank: null,
  }).document;
  assert.match(
    unknown.querySelector('[data-fit-v4-section="installation-outcome"]').textContent,
    /Not evaluated/,
  );
  assert.doesNotMatch(unknown.body.textContent, /MAGIC FIT/);
});

test('edited readings can be exported with datum, axis and bound semantics intact', () => {
  const { document, harness } = createHarness();
  const firstReading = document.querySelector('#measurement-0-reading-0');
  firstReading.value = '590';
  firstReading.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }));

  assert.deepEqual(harness.readMeasurements()[0], {
    datum: 'cavity.front.opening.width',
    axis: 'width',
    boundType: 'MINIMUM_AVAILABLE',
    unit: 'mm',
    readings: [590, 598, 600],
    conservativeValue: 590,
    method: 'MINIMUM_OF_REPEATED_READINGS',
  });
  assert.match(document.querySelector('[data-measurement-datum="cavity.front.opening.width"]').textContent, /590.*598.*600.*590/s);
});

test('untrusted rank labels cannot smuggle a numeric total into the categorical rank', () => {
  const { document } = createHarness({
    rank: { fitV4Rank: { outcomeBand: { name: 98 }, total: 98 } },
  });
  const rank = document.querySelector('[data-fit-v4-section="categorical-rank"]');
  assert.equal(rank.dataset.state, 'no-score');
  assert.match(rank.textContent, /No categorical rank is available/);
  assert.doesNotMatch(document.body.textContent, /\b98\b/);
});

test('test-only harness has no production import or public write path', async () => {
  const source = await readFile(new URL('./helpers/fit-v4-ui-harness.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /^\s*import\s/m);
  assert.doesNotMatch(source, /(?:\.\.\/)+public\/|writeFile|appendFile|localStorage|sessionStorage/);
});

test('replacement mode only performs direct old/new W/H/D matching', () => {
  assert.deepEqual(
    matchReplacementDimensions(
      { widthMm: 600, heightMm: 850, depthMm: 620 },
      { widthMm: 598, heightMm: 845, depthMm: 615 },
    ),
    {
      status: 'DIMENSION_MATCH',
      axes: {
        width: { oldMm: 600, newMm: 598, differenceMm: 2, fits: true },
        height: { oldMm: 850, newMm: 845, differenceMm: 5, fits: true },
        depth: { oldMm: 620, newMm: 615, differenceMm: 5, fits: true },
      },
    },
  );
  assert.equal(
    matchReplacementDimensions(
      { widthMm: 600, heightMm: 850, depthMm: 620 },
      { widthMm: 605, heightMm: 845, depthMm: 615 },
    ).status,
    'DIMENSION_MISMATCH',
  );

  const { document } = createHarness({
    mode: 'replacement',
    replacement: {
      oldAppliance: { widthMm: 600, heightMm: 850, depthMm: 620 },
      newAppliance: { widthMm: 598, heightMm: 845, depthMm: 615 },
    },
    result: { installationOutcome: { status: 'VERIFIED_FIT' } },
    rank: { fitV4Rank: { outcomeBand: { name: 'VERIFIED_FIT' } } },
  });
  assert.match(document.body.textContent, /Direct dimensional match/);
  assert.doesNotMatch(document.body.textContent, /VERIFIED FIT|CONDITIONAL FIT|NO FIT/);
  assert.equal(document.querySelector('[data-fit-v4-section]'), null);
});
