'use strict';

(function attachCompareStore(globalScope) {
  const STORAGE_KEY = 'fitappliance.compare.v1';
  const MAX_COMPARE = 3;

  function clone(value) {
    try {
      return JSON.parse(JSON.stringify(value ?? null));
    } catch {
      return null;
    }
  }

  function normalizeRetailers(retailers) {
    return (Array.isArray(retailers) ? retailers : [])
      .slice(0, 4)
      .map((retailer) => ({
        name: String(retailer?.name ?? retailer?.n ?? '').replace(/\s+/g, ' ').trim(),
        price: Number.isFinite(Number(retailer?.price ?? retailer?.p)) ? Math.round(Number(retailer.price ?? retailer.p)) : null
      }))
      .filter((retailer) => retailer.name);
  }

  function normalizeSnapshot(snapshot) {
    const slug = String(snapshot?.slug ?? snapshot?.id ?? '').trim();
    if (!slug) return null;
    return {
      slug,
      displayName: String(snapshot?.displayName ?? snapshot?.name ?? snapshot?.model ?? 'Appliance').replace(/\s+/g, ' ').trim(),
      brand: String(snapshot?.brand ?? '').replace(/\s+/g, ' ').trim(),
      w: Number.isFinite(Number(snapshot?.w)) ? Math.round(Number(snapshot.w)) : null,
      h: Number.isFinite(Number(snapshot?.h)) ? Math.round(Number(snapshot.h)) : null,
      d: Number.isFinite(Number(snapshot?.d)) ? Math.round(Number(snapshot.d)) : null,
      retailers: normalizeRetailers(snapshot?.retailers),
      stars: Number.isFinite(Number(snapshot?.stars)) ? Number(snapshot.stars) : null
    };
  }

  function normalizeEntry(entry) {
    const snapshot = normalizeSnapshot(entry?.snapshot ?? entry);
    const id = String(entry?.id ?? snapshot?.slug ?? '').trim();
    const addedAt = String(entry?.addedAt ?? '').trim();
    if (!id || !snapshot || !addedAt) return null;
    return { id, snapshot, addedAt };
  }

  function readStoredList(storage) {
    if (!storage) return [];
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map(normalizeEntry).filter(Boolean).slice(0, MAX_COMPARE);
    } catch {
      return [];
    }
  }

  function writeStoredList(storage, entries) {
    if (!storage) return false;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(entries));
      return true;
    } catch {
      return false;
    }
  }

  function createCompareStore({
    storage = globalScope?.localStorage ?? null,
    nowFn = () => new Date()
  } = {}) {
    const canPersist = Boolean(storage);
    let memory = canPersist ? readStoredList(storage) : [];

    const persist = () => {
      if (!canPersist) return false;
      return writeStoredList(storage, memory);
    };

    const api = {
      list() {
        return memory.map((entry) => ({
          id: entry.id,
          snapshot: clone(entry.snapshot),
          addedAt: entry.addedAt
        }));
      },

      add(snapshot) {
        const normalized = normalizeSnapshot(snapshot);
        if (!normalized) return { ok: false, reason: 'invalid' };
        if (memory.some((entry) => entry.id === normalized.slug)) {
          return { ok: true, reason: 'duplicate', entry: this.list().find((entry) => entry.id === normalized.slug) };
        }
        if (memory.length >= MAX_COMPARE) {
          return { ok: false, reason: 'capacity' };
        }
        const date = nowFn?.() ?? new Date();
        const addedAt = date instanceof Date ? date.toISOString() : new Date(date).toISOString();
        const entry = { id: normalized.slug, snapshot: normalized, addedAt };
        memory = [...memory, entry];
        const ok = persist();
        return { ok, reason: ok ? null : 'storage_unavailable', entry: clone(entry) };
      },

      has(id) {
        const key = String(id ?? '').trim();
        return memory.some((entry) => entry.id === key);
      },

      remove(id) {
        const key = String(id ?? '').trim();
        memory = memory.filter((entry) => entry.id !== key);
        const ok = persist();
        return { ok, reason: ok ? null : 'storage_unavailable' };
      },

      clear() {
        memory = [];
        if (!storage) return { ok: false, reason: 'storage_unavailable' };
        try {
          storage.removeItem(STORAGE_KEY);
          return { ok: true, reason: null };
        } catch {
          return { ok: false, reason: 'storage_unavailable' };
        }
      }
    };

    return api;
  }

  const api = {
    MAX_COMPARE,
    STORAGE_KEY,
    createCompareStore,
    normalizeSnapshot
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (globalScope) {
    globalScope.CompareStore = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this));
