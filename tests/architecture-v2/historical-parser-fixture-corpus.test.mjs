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
const electroluxCorpus = JSON.parse(readFileSync(electroluxFixtureUrl, 'utf8'));
const lgCorpus = JSON.parse(readFileSync(lgFixtureUrl, 'utf8'));
const corpus = {
  schemaVersion: 1,
  profiles: [...electroluxCorpus.profiles, ...lgCorpus.profiles],
};
const profile = electroluxCorpus.profiles[0];
const lgProfile = lgCorpus.profiles[0];
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
