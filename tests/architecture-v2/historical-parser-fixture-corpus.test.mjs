import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  inspectMineruContentListV2,
  parseMineruContentListV2,
} from '../../src/domain/mineru-document.mjs';
import { validateHistoricalParserFixtureCorpus } from '../../src/domain/historical-parser-gap-priority.mjs';

const electroluxFixtureUrl = new URL(
  '../fixtures/architecture-v2/historical-parser-gaps/electrolux-washer-total-depth-v1.json',
  import.meta.url,
);
const lgFixtureUrl = new URL(
  '../fixtures/architecture-v2/historical-parser-gaps/lg-dryer-dimension-diagram-v1.json',
  import.meta.url,
);
const esattoFixtureUrl = new URL(
  '../fixtures/architecture-v2/historical-parser-gaps/esatto-dishwasher-technical-information-d1-d2-v1.json',
  import.meta.url,
);
const esattoProductCardFixtureUrl = new URL(
  '../fixtures/architecture-v2/historical-parser-gaps/esatto-dishwasher-product-card-physical-wdh-v1.json',
  import.meta.url,
);
const electroluxCorpus = JSON.parse(readFileSync(electroluxFixtureUrl, 'utf8'));
const lgCorpus = JSON.parse(readFileSync(lgFixtureUrl, 'utf8'));
const esattoCorpus = JSON.parse(readFileSync(esattoFixtureUrl, 'utf8'));
const esattoProductCardCorpus = JSON.parse(readFileSync(esattoProductCardFixtureUrl, 'utf8'));
const corpus = {
  schemaVersion: 1,
  profiles: [
    ...electroluxCorpus.profiles,
    ...lgCorpus.profiles,
    ...esattoCorpus.profiles,
    ...esattoProductCardCorpus.profiles,
  ],
};
const profile = electroluxCorpus.profiles[0];
const lgProfile = lgCorpus.profiles[0];
const esattoProfile = esattoCorpus.profiles[0];
const esattoProductCardProfile = esattoProductCardCorpus.profiles[0];
const fields = [
  'closedEnvelope.widthMm',
  'closedEnvelope.heightMm',
  'closedEnvelope.depthMm',
];

function parseFixture(row) {
  return parseMineruContentListV2(Buffer.from(JSON.stringify(row.contentList)), {
    pdfSha256: row.source.pdfSha256,
    parserVersion: '3.4.4',
    modelRevision: '1'.repeat(40),
    caseIdentity: row.identity,
    claimSemanticsVersion: 2,
    fields,
    sourceUrls: row.sourceUrls ?? [],
  });
}

test('Electrolux fixture corpus binds six source fragments and six adversarial rejects', () => {
  validateHistoricalParserFixtureCorpus(corpus);
  assert.equal(profile.cases.filter((row) => row.expectation === 'ACCEPT').length, 6);
  assert.equal(profile.cases.filter((row) => row.expectation === 'REJECT').length, 6);

  for (const row of profile.cases.filter((candidate) => candidate.derivation === 'SOURCE_FRAGMENT')) {
    const inspected = inspectMineruContentListV2(Buffer.from(JSON.stringify(row.contentList)));
    const page = inspected.pages[row.source.page - 1];
    assert.ok(page.fragments.some((fragment) => (
      fragment.fragmentSha256 === row.source.fragmentSha256
        && fragment.type === row.source.fragmentType
        && JSON.stringify(fragment.bbox) === JSON.stringify(row.source.bbox)
    )), `${row.caseId} must preserve its immutable source fragment`);
  }
});

test('Electrolux source fixtures publish Total depth and never Depth with hoses', () => {
  for (const row of profile.cases.filter((candidate) => candidate.expectation === 'ACCEPT')) {
    const parsed = parseFixture(row);
    const actual = Object.fromEntries(parsed.claims.map((claim) => [
      claim.field,
      claim.value.kind === 'fixed' ? claim.value.mm : claim.value,
    ]));
    const expected = Object.fromEntries(row.expectedClaims.map((claim) => [claim.field, claim.mm]));
    assert.deepEqual(actual, expected, row.caseId);
    assert.deepEqual(parsed.grammarProfileIds, [profile.parserProfileId], row.caseId);
    assert.ok(parsed.claims.every((claim) => claim.page === row.source.page), row.caseId);
    assert.ok(parsed.claims.every((claim) => !/hoses/i.test(claim.sourceLabel)), row.caseId);
  }
});

test('Electrolux adversarial fixtures fail closed instead of falling back to generic axis parsing', () => {
  for (const row of profile.cases.filter((candidate) => candidate.expectation === 'REJECT')) {
    assert.throws(() => parseFixture(row), /identity|exact-model|evidence|missing|ambiguous|scope/i, row.caseId);
  }
});

test('LG fixture corpus binds both audited primary MinerU fragments', () => {
  validateHistoricalParserFixtureCorpus(corpus);
  assert.deepEqual(
    lgProfile.cases.filter((row) => row.expectation === 'ACCEPT')
      .map((row) => row.source.pdfSha256).sort(),
    [
      '22c0a224a7a41de6589acfd7ae69cfb5d2b2e531eb0058dfb1ab7e6a3bcd3957',
      '521077b559417d620664ead6be32ee1738e575ae50a7ffb3734b3fc24458d462',
    ],
  );
  for (const row of lgProfile.cases.filter((candidate) => candidate.derivation === 'SOURCE_FRAGMENT')) {
    const inspected = inspectMineruContentListV2(Buffer.from(JSON.stringify(row.contentList)));
    const page = inspected.pages[row.source.page - 1];
    assert.ok(page.fragments.some((fragment) => (
      fragment.fragmentSha256 === row.source.fragmentSha256
        && fragment.type === row.source.fragmentType
        && JSON.stringify(fragment.bbox) === JSON.stringify(row.source.bbox)
    )), `${row.caseId} must preserve its primary MinerU table locator`);
  }
});

test('LG audited diagram fixtures map unprimed D to closed depth and reject D-prime lookalikes', () => {
  for (const row of lgProfile.cases.filter((candidate) => candidate.expectation === 'ACCEPT')) {
    const parsed = parseFixture(row);
    const actual = Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value.mm]));
    const expected = Object.fromEntries(row.expectedClaims.map((claim) => [claim.field, claim.mm]));
    assert.deepEqual(actual, expected, row.caseId);
    assert.deepEqual(parsed.grammarProfileIds, [lgProfile.parserProfileId], row.caseId);
    assert.ok(parsed.claims.every((claim) => claim.page === row.source.page), row.caseId);
    assert.ok(parsed.claims.every((claim) => !/^D['"′″]$/.test(claim.sourceLabel)), row.caseId);
  }
});

test('LG adversarial mutations cannot publish closed depth through the audited profile', () => {
  for (const row of lgProfile.cases.filter((candidate) => candidate.expectation === 'REJECT')) {
    try {
      const parsed = parseFixture(row);
      assert.equal(parsed.grammarProfileIds.includes(lgProfile.parserProfileId), false, row.caseId);
      assert.equal(parsed.claims.some((claim) => claim.field === 'closedEnvelope.depthMm'), false, row.caseId);
    } catch (error) {
      assert.match(String(error?.message ?? error), /identity|exact-model|evidence|missing|ambiguous|scope/i, row.caseId);
    }
  }
});

test('Esatto fixture corpus binds the real EDW456S page-24 table and rejects sibling scope', () => {
  validateHistoricalParserFixtureCorpus(corpus);
  const accepted = esattoProfile.cases.find((row) => row.expectation === 'ACCEPT');
  const inspected = inspectMineruContentListV2(Buffer.from(JSON.stringify(accepted.contentList)));
  assert.equal(accepted.contentList.length, 24);
  assert.ok(inspected.pages[23].fragments.some((fragment) => (
    fragment.type === accepted.source.fragmentType
      && fragment.fragmentSha256 === accepted.source.fragmentSha256
      && JSON.stringify(fragment.bbox) === JSON.stringify(accepted.source.bbox)
  )));

  const parsed = parseFixture(accepted);
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value.mm])), {
    'closedEnvelope.depthMm': 600,
    'closedEnvelope.heightMm': 845,
    'closedEnvelope.widthMm': 448,
  });
  assert.deepEqual(parsed.grammarProfileIds, [esattoProfile.parserProfileId]);
  assert.ok(parsed.claims.every((claim) => claim.page === 24));
  assert.ok(parsed.claims.every((claim) => !/1150|door opened/i.test(claim.quote)));

  for (const row of esattoProfile.cases.filter((candidate) => candidate.expectation === 'REJECT')) {
    assert.throws(
      () => parseFixture(row),
      /identity|exact-model|evidence|missing|ambiguous|scope/i,
      row.caseId,
    );
  }
});

test('Esatto product-card fixture publishes only the physical W/D/H tuple', () => {
  validateHistoricalParserFixtureCorpus(corpus);
  const accepted = esattoProductCardProfile.cases.find((row) => row.expectation === 'ACCEPT');
  const inspected = inspectMineruContentListV2(Buffer.from(JSON.stringify(accepted.contentList)));
  assert.ok(inspected.pages[0].fragments.some((fragment) => (
    fragment.type === accepted.source.fragmentType
      && fragment.fragmentSha256 === accepted.source.fragmentSha256
      && JSON.stringify(fragment.bbox) === JSON.stringify(accepted.source.bbox)
  )));

  const parsed = parseFixture(accepted);
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value.mm])), {
    'closedEnvelope.depthMm': 610,
    'closedEnvelope.heightMm': 845,
    'closedEnvelope.widthMm': 598,
  });
  assert.deepEqual(parsed.grammarProfileIds, [esattoProductCardProfile.parserProfileId]);
  assert.ok(parsed.identitySignals.some((signal) => (
    signal.type === 'mineru_esatto_edw_product_card_exact_model'
  )));
  assert.ok(!parsed.identitySignals.some((signal) => (
    signal.type === 'mineru_esatto_product_card_exact_model'
  )));
  assert.ok(parsed.claims.every((claim) => claim.page === 1));
  assert.ok(parsed.claims.every((claim) => !/645|672|871|1175|packaged|door open/i.test(claim.quote)));

  for (const row of esattoProductCardProfile.cases.filter(
    (candidate) => candidate.expectation === 'REJECT',
  )) {
    assert.throws(
      () => parseFixture(row),
      /identity|exact-model|evidence|missing|ambiguous|scope/i,
      row.caseId,
    );
  }
});

test('Esatto fridge ProductCard accepts the observed inline Physical W/D/H layout', () => {
  const row = {
    source: { pdfSha256: '2'.repeat(64) },
    sourceUrls: ['https://esatto.house/s/Esatto_ProductCard-EUF172W-m95s.pdf'],
    identity: { category: 'fridge', brand: 'Esatto', model: 'EUF172W' },
    contentList: [[
      {
        type: 'title',
        content: { title_content: [{ type: 'text', content: 'Product Dimensions' }], level: 2 },
        bbox: [745, 211, 851, 233],
      },
      {
        type: 'paragraph',
        content: { paragraph_content: [{ type: 'text', content: 'Packaged (w, d, h mm): 585 × 585 × 1450mm' }] },
        bbox: [745, 236, 963, 258],
      },
      {
        type: 'paragraph',
        content: { paragraph_content: [{ type: 'text', content: 'Physical (w, d, h mm): 550 × 550 × 1420mm' }] },
        bbox: [745, 263, 957, 284],
      },
      {
        type: 'page_header',
        content: { page_header_content: [{ type: 'text', content: '162L Upright Freezer, White EUF172W' }] },
        bbox: [23, 28, 325, 99],
      },
    ]],
  };

  const parsed = parseFixture(row);
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value.mm])), {
    'closedEnvelope.depthMm': 550,
    'closedEnvelope.heightMm': 1420,
    'closedEnvelope.widthMm': 550,
  });
  assert.deepEqual(parsed.grammarProfileIds, ['esatto-au-refrigeration-product-card-physical-wdh-v1']);
  assert.ok(parsed.identitySignals.some((signal) => (
    signal.type === 'mineru_esatto_product_card_exact_model'
  )));

  for (const mutate of [
    (copy) => { copy.sourceUrls = ['https://esatto.house/s/Esatto_ProductCard-EUF172W2-m95s.pdf']; },
    (copy) => { copy.sourceUrls = ['https://esatto.house/archive/Esatto_ProductCard-EUF172W-m95s.pdf']; },
    (copy) => { copy.sourceUrls = ['https://esatto.house/s/Esatto_ProductCard-EUF172W-m95s.pdf?model=EUF172W']; },
    (copy) => { copy.contentList[0][3].content.page_header_content[0].content = 'EUF172W EUF172S'; },
    (copy) => { copy.contentList[0][2].content.paragraph_content[0].content = 'Physical (h, w, d mm): 1420 × 550 × 550mm'; },
  ]) {
    const invalid = structuredClone(row);
    mutate(invalid);
    assert.throws(() => parseFixture(invalid), /identity|exact-model|evidence|scope/i);
  }
});

test('Esatto product-card grammar fails closed when its physical tuple contract is weakened', () => {
  const accepted = esattoProductCardProfile.cases.find((row) => row.expectation === 'ACCEPT');
  const mutate = (change) => {
    const row = structuredClone(accepted);
    change(row);
    return row;
  };
  const setText = (fragment, text) => {
    fragment.content.paragraph_content[0].content = text;
  };
  const cases = [
    ['axis order changed', mutate((row) => {
      setText(row.contentList[0][3], 'Physical (h, w, d mm)');
    })],
    ['packaged tuple missing', mutate((row) => {
      row.contentList[0].splice(2, 1);
    })],
    ['packaged tuple smaller than physical', mutate((row) => {
      setText(row.contentList[0][2], '→ 500 × 500 × 500mm');
    })],
    ['physical tuple duplicated', mutate((row) => {
      const duplicate = structuredClone(row.contentList[0][4]);
      duplicate.bbox = [664, 278, 778, 298];
      row.contentList[0].splice(5, 0, duplicate);
    })],
    ['physical tuple moved to another column', mutate((row) => {
      row.contentList[0][4].bbox = [744, 257, 858, 277];
    })],
    ['source URL is not an exact-model ProductCard', mutate((row) => {
      row.sourceUrls = ['https://esatto.house/s/EDW7CS_UserManual_V30_0223.pdf'];
    })],
    ['source URL names a sibling ProductCard', mutate((row) => {
      row.sourceUrls = ['https://esatto.house/s/Esatto_ProductCard_EDW7CSB.pdf'];
    })],
    ['redirect host lacks the official Esatto source URL', mutate((row) => {
      row.sourceUrls = [
        'https://static1.squarespace.com/static/example/Esatto_ProductCard_EDW7CS.pdf',
      ];
    })],
    ['source URL contains credentials', mutate((row) => {
      row.sourceUrls = ['https://user:secret@esatto.house/s/Esatto_ProductCard_EDW7CS.pdf'];
    })],
  ];

  for (const [label, row] of cases) {
    assert.throws(
      () => parseFixture(row),
      /identity|exact-model|evidence|missing|ambiguous|scope/i,
      label,
    );
  }
});
