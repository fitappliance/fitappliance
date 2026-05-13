import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const accountStoreUrl = pathToFileURL(path.join(repoRoot, 'public', 'scripts', 'account-store.mjs')).href;

function makeStorage() {
  const map = new Map();
  return {
    getItem: (key) => map.has(key) ? map.get(key) : null,
    setItem: (key, value) => map.set(String(key), String(value)),
    removeItem: (key) => map.delete(String(key)),
    clear: () => map.clear(),
    dump: () => Object.fromEntries(map.entries())
  };
}

test('account store: signup stores a password hash, not plaintext', async () => {
  const { createAccountStore, ACCOUNT_STORAGE_KEY } = await import(`${accountStoreUrl}?t=${Date.now()}`);
  const storage = makeStorage();
  const store = createAccountStore({ storage, sessionStorage: storage, idFactory: () => 'acct-1' });

  const result = await store.signup({ email: 'owner@example.com', password: 'correct-horse-1' });

  assert.equal(result.ok, true);
  const raw = storage.getItem(ACCOUNT_STORAGE_KEY);
  assert.ok(raw);
  assert.doesNotMatch(raw, /correct-horse-1/);
  const parsed = JSON.parse(raw);
  assert.equal(parsed.accounts['owner@example.com'].password.algorithm, 'PBKDF2-SHA256');
  assert.ok(parsed.accounts['owner@example.com'].password.hash.length >= 40);
});

test('account store: login validates password and exposes the active local profile', async () => {
  const { createAccountStore } = await import(`${accountStoreUrl}?t=${Date.now()}`);
  const storage = makeStorage();
  const store = createAccountStore({ storage, sessionStorage: storage, idFactory: () => 'acct-1' });

  await store.signup({ email: 'owner@example.com', password: 'correct-horse-1' });
  store.logout();

  assert.equal((await store.login({ email: 'owner@example.com', password: 'wrong-password' })).ok, false);
  assert.equal((await store.login({ email: 'owner@example.com', password: 'correct-horse-1' })).ok, true);
  assert.equal(store.getSession()?.email, 'owner@example.com');
});

test('account store: inventory supports the four core appliance categories', async () => {
  const { createAccountStore, INVENTORY_CATEGORIES } = await import(`${accountStoreUrl}?t=${Date.now()}`);
  const storage = makeStorage();
  let id = 0;
  const store = createAccountStore({ storage, sessionStorage: storage, idFactory: () => `item-${++id}` });
  await store.signup({ email: 'owner@example.com', password: 'correct-horse-1' });

  for (const category of INVENTORY_CATEGORIES) {
    const result = store.addInventoryItem({
      category,
      brand: 'Test',
      model: `${category}-old`,
      width: 600,
      height: 1800,
      depth: 650,
      is_current: true
    });
    assert.equal(result.ok, true);
  }

  const rows = store.listInventory();
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map((row) => row.category).sort(), [...INVENTORY_CATEGORIES].sort());
});

test('account store: inventory entries preserve replacement dimensions as integers', async () => {
  const { createAccountStore } = await import(`${accountStoreUrl}?t=${Date.now()}`);
  const storage = makeStorage();
  const store = createAccountStore({ storage, sessionStorage: storage, idFactory: () => 'fridge-1' });
  await store.signup({ email: 'owner@example.com', password: 'correct-horse-1' });

  const result = store.addInventoryItem({
    category: 'fridge',
    brand: 'Westinghouse',
    model: 'WTB4600WA',
    width: '699',
    height: '1725',
    depth: '723',
    is_current: true
  });

  assert.equal(result.ok, true);
  assert.deepEqual(store.listInventory()[0], {
    id: 'fridge-1',
    category: 'fridge',
    brand: 'Westinghouse',
    model: 'WTB4600WA',
    width: 699,
    height: 1725,
    depth: 723,
    is_current: true
  });
});

test('account store: pending purchase can be confirmed into active inventory', async () => {
  const { createAccountStore } = await import(`${accountStoreUrl}?t=${Date.now()}`);
  const storage = makeStorage();
  let id = 0;
  const store = createAccountStore({ storage, sessionStorage: storage, idFactory: (prefix) => `${prefix}-${++id}` });
  await store.signup({ email: 'owner@example.com', password: 'correct-horse-1' });

  const pending = store.recordPendingAsset({
    product_id: 'fridge-123',
    category: 'fridge',
    brand: 'Hisense',
    model: 'HRTF206',
    width: 550,
    height: 1410,
    depth: 490,
    retailer: 'JB Hi-Fi',
    target_url: 'https://www.jbhifi.com.au/products/hisense-hrtf206'
  });

  assert.equal(pending.ok, true);
  assert.equal(store.listPendingAssets().length, 1);

  const confirmed = store.confirmPendingAsset(pending.item.id);

  assert.equal(confirmed.ok, true);
  assert.equal(store.listPendingAssets().length, 0);
  assert.deepEqual(store.listInventory()[0], {
    id: 'appliance-4',
    category: 'fridge',
    brand: 'Hisense',
    model: 'HRTF206',
    width: 550,
    height: 1410,
    depth: 490,
    is_current: true
  });
});
