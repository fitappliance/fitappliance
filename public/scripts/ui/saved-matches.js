const STORAGE_KEY = 'fitappliance-saved-v1';

function readSavedIds() {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return [];
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string' && id.trim()) : [];
  } catch {
    return [];
  }
}

function writeSavedIds(ids) {
  const storage = globalThis.localStorage;
  if (!storage) return;
  storage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

export function getSavedIds() {
  return readSavedIds();
}

export function saveProduct(id) {
  if (!id) return;
  const ids = readSavedIds();
  if (ids.includes(id)) return;
  writeSavedIds([...ids, id]);
}

export function unsaveProduct(id) {
  if (!id) return;
  const ids = readSavedIds().filter((savedId) => savedId !== id);
  writeSavedIds(ids);
}

export function isProductSaved(id) {
  return readSavedIds().includes(id);
}

export function clearSaved() {
  const storage = globalThis.localStorage;
  if (!storage) return;
  storage.removeItem(STORAGE_KEY);
}
