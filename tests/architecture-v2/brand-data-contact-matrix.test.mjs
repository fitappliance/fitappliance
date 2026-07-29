import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const MATRIX_PATH = 'data/architecture-v2/policies/brand-data-contact-matrix.json';

const EXPECTED_ORGANIZATIONS = [
  'asko-appliances-australia',
  'beko-australia',
  'bsh-home-appliances-australia',
  'chiq-australia',
  'electrolux-home-products',
  'fisher-paykel-australia',
  'hisense-australia',
  'ilve-australia',
  'lg-australia',
  'midea-electronics-australia',
  'miele-australia',
  'residentia-group',
  'samsung-electronics-australia',
  'smeg-australia',
];

const SENT_ORGANIZATIONS = EXPECTED_ORGANIZATIONS;

const EXPECTED_BRANDS = [
  'ASKO',
  'Beko',
  'Bosch',
  'CHiQ',
  'Electrolux',
  'Esatto',
  'Fisher & Paykel',
  'Haier',
  'Hisense',
  'InAlto',
  'LG',
  'Ilve',
  'Midea',
  'Miele',
  'MyKin',
  'Samsung',
  'Smeg',
  'Sôlt',
  'Westinghouse',
];

async function readMatrix() {
  return JSON.parse(await readFile(MATRIX_PATH, 'utf8'));
}

function assertPublicHttpsUrl(value) {
  const url = new URL(value);
  assert.equal(url.protocol, 'https:');
  assert.ok(url.hostname.includes('.'), `expected an official public hostname: ${value}`);
}

test('contact matrix covers each target organization and brand exactly once', async () => {
  const matrix = await readMatrix();
  assert.equal(matrix.schemaVersion, 1);
  assert.equal(matrix.researchedOn, '2026-07-29');
  assert.deepEqual(
    matrix.organizations.map(({ id }) => id).sort(),
    EXPECTED_ORGANIZATIONS,
  );
  assert.deepEqual(
    matrix.organizations.flatMap(({ coveredBrands }) => coveredBrands).sort(),
    EXPECTED_BRANDS.sort(),
  );
});

test('contact routes are official, evidence-backed, and contain no inferred addresses', async () => {
  const matrix = await readMatrix();
  for (const organization of matrix.organizations) {
    assert.ok(organization.ownershipSourceUrls.length > 0);
    organization.ownershipSourceUrls.forEach(assertPublicHttpsUrl);
    assertPublicHttpsUrl(organization.route.publicSourceUrl);
    assert.equal(organization.route.discoveryMethod, 'official_published_route');
    assert.notEqual(organization.route.type, 'inferred_email');
    assert.ok(['high', 'medium'].includes(organization.confidence));
    assert.ok(['sent', 'route_verified'].includes(organization.state));
  }

  const serialized = JSON.stringify(matrix.organizations);
  assert.doesNotMatch(serialized, /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/);
  assert.doesNotMatch(serialized, /recipient|mailbox|contactName/i);
});

test('contact matrix dispatch state matches the Git-safe outreach ledger', async () => {
  const [matrix, ledger] = await Promise.all([
    readMatrix(),
    readFile('data/architecture-v2/reviews/automated/brand-data-outreach-ledger.json', 'utf8')
      .then(JSON.parse),
  ]);
  assert.deepEqual(
    matrix.organizations.filter(({ state }) => state === 'sent').map(({ id }) => id).sort(),
    ledger.threads.filter(({ state }) => state === 'sent').map(({ id }) => id).sort(),
  );
  assert.deepEqual(
    ledger.threads.filter(({ state }) => state === 'sent').map(({ id }) => id).sort(),
    SENT_ORGANIZATIONS,
  );
  const ledgerById = new Map(ledger.threads.map((thread) => [thread.id, thread]));
  for (const organization of matrix.organizations) {
    const ledgerThread = ledgerById.get(organization.id);
    if (organization.state === 'sent') {
      assert.equal(
        new URL(organization.route.publicSourceUrl).toString().replace(/\/$/, ''),
        new URL(ledgerThread.publicRouteSourceUrl).toString().replace(/\/$/, ''),
        organization.id,
      );
    } else {
      assert.equal(organization.state, 'route_verified');
      assert.equal(ledgerThread?.state, 'draft_ready');
      assert.equal(
        new URL(organization.route.publicSourceUrl).toString().replace(/\/$/, ''),
        new URL(ledgerThread.publicRouteSourceUrl).toString().replace(/\/$/, ''),
        organization.id,
      );
    }
  }
});
