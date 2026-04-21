import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const {
  inferSeriesFromModel,
  buildDisplayName,
  buildReadableSpec,
  enrichReadableCopy
} = require('../scripts/common/readable-spec.js');
const {
  auditEnrichedCopyFields
} = require('../scripts/audit-copy.js');

function makeDictionary() {
  return {
    bosch: { KGN: 'Serie 4', KSV: 'Serie 6' },
    lg: { 'GR-': 'InstaView', 'GB-': 'Essential' },
    samsung: { RF: 'French Door', RS: 'Family Hub', SRS: 'Bespoke' },
    miele: { KFN: 'Active', KF: 'Pure' },
    'fisher-paykel': { RF: 'Series 7' }
  };
}

test('phase 42a readable-spec: Bosch KGN code maps to Serie 4', () => {
  assert.equal(
    inferSeriesFromModel({ brand: 'Bosch', model: 'KGN396LBAS Top Mount 368L' }, makeDictionary()),
    'Serie 4'
  );
});

test('phase 42a readable-spec: LG GR- prefix maps to InstaView', () => {
  assert.equal(
    inferSeriesFromModel({ brand: 'LG', model: 'GR-B460PL Fridge 460L' }, makeDictionary()),
    'InstaView'
  );
});

test('phase 42a readable-spec: Samsung RF prefix maps to French Door', () => {
  assert.equal(
    inferSeriesFromModel({ brand: 'Samsung', model: 'RF65A977FSR French Door' }, makeDictionary()),
    'French Door'
  );
});

test('phase 42a readable-spec: Miele KFN prefix maps to Active', () => {
  assert.equal(
    inferSeriesFromModel({ brand: 'Miele', model: 'KFN 4374 Active' }, makeDictionary()),
    'Active'
  );
});

test('phase 42a readable-spec: fridge readableSpec uses capacity and configuration', () => {
  assert.equal(
    buildReadableSpec({
      cat: 'fridge',
      model: 'KGN396LBAS Top Mount 368L',
      features: ['Top Mount', '5T', 'Class 5']
    }),
    '368L Top-Mount'
  );
});

test('phase 42a readable-spec: dishwasher readableSpec uses place settings and type', () => {
  assert.equal(
    buildReadableSpec({
      cat: 'dishwasher',
      model: 'DW60BG830FSSP Smart — 15 Place',
      features: ['Built-in', 'Drawer']
    }),
    '15-place Built-in'
  );
});

test('phase 42a readable-spec: washing machine readableSpec uses kg and load type', () => {
  assert.equal(
    buildReadableSpec({
      cat: 'washing_machine',
      model: 'WW90T684DLH 9kg Front Loader',
      features: ['Drum', 'Front', 'Single product class']
    }),
    '9kg Front Loader'
  );
});

test('phase 42a readable-spec: dryer readableSpec uses kg and technology', () => {
  assert.equal(
    buildReadableSpec({
      cat: 'dryer',
      model: 'RC802HM2F DualInverter Condenser — 8kg',
      features: ['Heat Pump', 'Dryer']
    }),
    '8kg Heat Pump'
  );
});

test('phase 42a readable-spec: unknown series falls back to brand-only display name', () => {
  assert.equal(
    buildDisplayName({
      brand: 'Beko',
      model: 'BDF1234 Unknown Range',
      cat: 'dishwasher'
    }, makeDictionary()),
    'Beko Dishwasher'
  );
});

test('phase 42a readable-spec: enrichReadableCopy returns series null when no mapping exists', () => {
  const enriched = enrichReadableCopy({
    brand: 'Beko',
    model: 'BDF1234 Unknown Range',
    cat: 'dishwasher',
    features: ['Built-in'],
    readableSpec: null
  }, { seriesDictionary: makeDictionary() });

  assert.equal(enriched.series, null);
  assert.equal(enriched.displayName, 'Beko Dishwasher');
  assert.equal(enriched.readableSpec, 'Built-in Dishwasher');
});

test('phase 42a readable-spec: audit-copy flags AI-tell phrases inside enriched display names', () => {
  const result = auditEnrichedCopyFields([
    {
      id: 'p1',
      displayName: 'Bosch Most Precise Series',
      readableSpec: '368L Top-Mount'
    }
  ], { file: 'public/data/appliances.json' });

  assert.equal(result.violations.length, 1);
  assert.match(result.violations[0].message, /forbidden phrase/i);
});

test('phase 42a readable-spec: audit-copy passes clean enriched copy fields', () => {
  const result = auditEnrichedCopyFields([
    {
      id: 'p1',
      displayName: 'Bosch Serie 4',
      readableSpec: '368L Top-Mount'
    }
  ], { file: 'public/data/appliances.json' });

  assert.equal(result.violations.length, 0);
});

