export const ACCOUNT_STORAGE_KEY = 'fitappliance.accounts.v1';
export const ACCOUNT_SESSION_KEY = 'fitappliance.accountSession.v1';
export const INVENTORY_CATEGORIES = Object.freeze([
  'fridge',
  'washing_machine',
  'dishwasher',
  'dryer',
]);

const PASSWORD_ALGORITHM = 'PBKDF2-SHA256';
const PASSWORD_ITERATIONS = 120000;
const CATEGORY_LABELS = Object.freeze({
  fridge: 'Fridge',
  washing_machine: 'Washing Machine',
  dishwasher: 'Dishwasher',
  dryer: 'Dryer',
});

function fallbackStorage() {
  const map = new Map();
  return {
    getItem: (key) => map.has(String(key)) ? map.get(String(key)) : null,
    setItem: (key, value) => map.set(String(key), String(value)),
    removeItem: (key) => map.delete(String(key)),
  };
}

function getDefaultStorage(name) {
  try {
    return globalThis?.[name] ?? fallbackStorage();
  } catch {
    return fallbackStorage();
  }
}

function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

function cleanText(value) {
  return String(value ?? '').trim();
}

function toPositiveInteger(value, field) {
  const numeric = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error(`${field} must be a positive millimetre value`);
  }
  return numeric;
}

function categoryLabel(category) {
  return CATEGORY_LABELS[category] ?? 'Appliance';
}

function readJson(storage, key, fallback) {
  try {
    const raw = storage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(storage, key, value) {
  storage.setItem(key, JSON.stringify(value));
}

function bytesToBase64(bytes) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(String(value ?? ''), 'base64'));
  }
  const binary = atob(String(value ?? ''));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function sha256Fallback(input) {
  const text = String(input ?? '');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const bytes = new Uint8Array(32);
  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= i + text.length;
    hash = Math.imul(hash, 16777619);
    bytes[i] = hash & 0xff;
  }
  return bytes;
}

async function derivePasswordHash(password, saltBytes, cryptoImpl) {
  const subtle = cryptoImpl?.subtle;
  if (!subtle) {
    return bytesToBase64(await sha256Fallback(`${PASSWORD_ITERATIONS}:${bytesToBase64(saltBytes)}:${password}`));
  }
  const encoded = new TextEncoder().encode(String(password ?? ''));
  const key = await subtle.importKey('raw', encoded, 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: saltBytes,
      iterations: PASSWORD_ITERATIONS,
    },
    key,
    256,
  );
  return bytesToBase64(new Uint8Array(bits));
}

function randomBytes(length, cryptoImpl) {
  const bytes = new Uint8Array(length);
  if (cryptoImpl?.getRandomValues) {
    cryptoImpl.getRandomValues(bytes);
    return bytes;
  }
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

function makeDefaultId(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function emptyDatabase() {
  return { schema_version: 1, accounts: {} };
}

function normalizeDatabase(value) {
  if (!value || typeof value !== 'object') return emptyDatabase();
  return {
    schema_version: 1,
    accounts: value.accounts && typeof value.accounts === 'object' ? value.accounts : {},
  };
}

function publicProfile(account) {
  if (!account) return null;
  return {
    id: account.id,
    email: account.email,
    inventory_count: Array.isArray(account.inventory) ? account.inventory.length : 0,
  };
}

function normalizeInventoryItem(input, idFactory, now) {
  const category = cleanText(input?.category);
  if (!INVENTORY_CATEGORIES.includes(category)) {
    throw new Error(`category must be one of ${INVENTORY_CATEGORIES.join(', ')}`);
  }
  return {
    id: input?.id ? cleanText(input.id) : idFactory('appliance'),
    category,
    brand: cleanText(input?.brand),
    model: cleanText(input?.model),
    width: toPositiveInteger(input?.width, 'width'),
    height: toPositiveInteger(input?.height, 'height'),
    depth: toPositiveInteger(input?.depth, 'depth'),
    is_current: input?.is_current !== false,
  };
}

function normalizePendingAsset(input, idFactory, now) {
  const item = normalizeInventoryItem({
    ...input,
    category: input?.category,
    brand: input?.brand,
    model: input?.model,
    width: input?.width,
    height: input?.height,
    depth: input?.depth,
    is_current: true,
  }, idFactory, now);
  return {
    ...item,
    id: input?.id ? cleanText(input.id) : idFactory('pending'),
    product_id: cleanText(input?.product_id ?? input?.productId),
    retailer: cleanText(input?.retailer),
    target_url: cleanText(input?.target_url ?? input?.targetUrl),
    clicked_at: input?.clicked_at ?? input?.clickedAt ?? now(),
  };
}

export function createAccountStore(options = {}) {
  const storage = options.storage ?? getDefaultStorage('localStorage');
  const sessionStorage = options.sessionStorage ?? getDefaultStorage('sessionStorage');
  const cryptoImpl = options.cryptoImpl ?? globalThis.crypto;
  const nowFn = options.nowFn ?? (() => new Date().toISOString());
  const idFactory = options.idFactory ?? ((prefix = 'id') => makeDefaultId(prefix));

  function readDb() {
    return normalizeDatabase(readJson(storage, ACCOUNT_STORAGE_KEY, emptyDatabase()));
  }

  function writeDb(db) {
    writeJson(storage, ACCOUNT_STORAGE_KEY, normalizeDatabase(db));
  }

  function readSession() {
    const session = readJson(sessionStorage, ACCOUNT_SESSION_KEY, null);
    if (!session?.email) return null;
    return { email: normalizeEmail(session.email) };
  }

  function writeSession(email) {
    writeJson(sessionStorage, ACCOUNT_SESSION_KEY, { email: normalizeEmail(email), signed_in_at: nowFn() });
  }

  function getActiveAccount(db = readDb()) {
    const session = readSession();
    if (!session?.email) return null;
    return db.accounts[session.email] ?? null;
  }

  function updateActiveAccount(mutator) {
    const db = readDb();
    const session = readSession();
    if (!session?.email || !db.accounts[session.email]) {
      return { ok: false, error: 'Sign in before managing appliances.' };
    }
    const current = db.accounts[session.email];
    const nextAccount = {
      ...mutator(current),
      updated_at: nowFn(),
    };
    writeDb({
      ...db,
      accounts: {
        ...db.accounts,
        [session.email]: nextAccount,
      },
    });
    return { ok: true, account: publicProfile(nextAccount) };
  }

  async function signup({ email, password } = {}) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      return { ok: false, error: 'Enter a valid email address.' };
    }
    if (String(password ?? '').length < 8) {
      return { ok: false, error: 'Use at least 8 characters for the password.' };
    }
    const db = readDb();
    if (db.accounts[normalizedEmail]) {
      return { ok: false, error: 'An account already exists on this device.' };
    }
    const saltBytes = randomBytes(16, cryptoImpl);
    const hash = await derivePasswordHash(password, saltBytes, cryptoImpl);
    const account = {
      id: idFactory('account'),
      email: normalizedEmail,
      password: {
        algorithm: PASSWORD_ALGORITHM,
        iterations: PASSWORD_ITERATIONS,
        salt: bytesToBase64(saltBytes),
        hash,
      },
      inventory: [],
      pending_assets: [],
      created_at: nowFn(),
      updated_at: nowFn(),
    };
    writeDb({
      ...db,
      accounts: {
        ...db.accounts,
        [normalizedEmail]: account,
      },
    });
    writeSession(normalizedEmail);
    return { ok: true, account: publicProfile(account) };
  }

  async function login({ email, password } = {}) {
    const normalizedEmail = normalizeEmail(email);
    const db = readDb();
    const account = db.accounts[normalizedEmail];
    if (!account?.password?.hash || !account?.password?.salt) {
      return { ok: false, error: 'No local account found for that email.' };
    }
    const hash = await derivePasswordHash(password, base64ToBytes(account.password.salt), cryptoImpl);
    if (hash !== account.password.hash) {
      return { ok: false, error: 'Email or password did not match.' };
    }
    writeSession(normalizedEmail);
    return { ok: true, account: publicProfile(account) };
  }

  function logout() {
    sessionStorage.removeItem(ACCOUNT_SESSION_KEY);
  }

  function getSession() {
    return readSession();
  }

  function getCurrentAccount() {
    return publicProfile(getActiveAccount());
  }

  function listInventory() {
    const account = getActiveAccount();
    return Array.isArray(account?.inventory) ? account.inventory.map((item) => ({ ...item })) : [];
  }

  function addInventoryItem(input) {
    try {
      const item = normalizeInventoryItem(input, idFactory, nowFn);
      const result = updateActiveAccount((account) => ({
        ...account,
        inventory: [...(account.inventory ?? []), item],
      }));
      return result.ok ? { ok: true, item } : result;
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }

  function removeInventoryItem(id) {
    const cleanId = cleanText(id);
    return updateActiveAccount((account) => ({
      ...account,
      inventory: (account.inventory ?? []).filter((item) => item.id !== cleanId),
    }));
  }

  function setInventoryCurrent(id, is_current) {
    const cleanId = cleanText(id);
    return updateActiveAccount((account) => ({
      ...account,
      inventory: (account.inventory ?? []).map((item) => (
        item.id === cleanId ? { ...item, is_current: Boolean(is_current) } : item
      )),
    }));
  }

  function listPendingAssets() {
    const account = getActiveAccount();
    return Array.isArray(account?.pending_assets) ? account.pending_assets.map((item) => ({ ...item })) : [];
  }

  function recordPendingAsset(input) {
    try {
      const pending = normalizePendingAsset(input, idFactory, nowFn);
      const result = updateActiveAccount((account) => {
        const existing = (account.pending_assets ?? []).filter((item) => item.product_id !== pending.product_id || !pending.product_id);
        return {
          ...account,
          pending_assets: [pending, ...existing].slice(0, 10),
        };
      });
      return result.ok ? { ok: true, item: pending } : result;
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }

  function confirmPendingAsset(id) {
    const cleanId = cleanText(id);
    const pending = listPendingAssets().find((item) => item.id === cleanId);
    if (!pending) return { ok: false, error: 'Pending appliance not found.' };
    return updateActiveAccount((account) => ({
      ...account,
      pending_assets: (account.pending_assets ?? []).filter((item) => item.id !== cleanId),
      inventory: [
        ...(account.inventory ?? []),
        {
          id: idFactory('appliance'),
          category: pending.category,
          brand: pending.brand,
          model: pending.model,
          width: pending.width,
          height: pending.height,
          depth: pending.depth,
          is_current: true,
        },
      ],
    }));
  }

  function dismissPendingAsset(id) {
    const cleanId = cleanText(id);
    return updateActiveAccount((account) => ({
      ...account,
      pending_assets: (account.pending_assets ?? []).filter((item) => item.id !== cleanId),
    }));
  }

  return {
    signup,
    login,
    logout,
    getSession,
    getCurrentAccount,
    listInventory,
    addInventoryItem,
    removeInventoryItem,
    setInventoryCurrent,
    listPendingAssets,
    recordPendingAsset,
    confirmPendingAsset,
    dismissPendingAsset,
    categoryLabel,
  };
}
