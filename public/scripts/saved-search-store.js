'use strict';

(function attachSavedSearchStore(globalScope) {
  const STORAGE_KEY = 'fitappliance.savedSearches.v1';
  const MAX_SLOTS = 3;
  const MAX_NAME_LENGTH = 50;

  function clone(value) {
    try {
      return JSON.parse(JSON.stringify(value ?? null));
    } catch {
      return null;
    }
  }

  function safeName(value) {
    const name = String(value ?? '').replace(/\s+/g, ' ').trim();
    return (name || 'Saved search').slice(0, MAX_NAME_LENGTH);
  }

  function safeNow(nowFn) {
    try {
      const date = nowFn?.() ?? new Date();
      const next = date instanceof Date ? date : new Date(date);
      return Number.isFinite(next.getTime()) ? next.toISOString() : new Date().toISOString();
    } catch {
      return new Date().toISOString();
    }
  }

  function makeId(idFactory) {
    try {
      const fromFactory = idFactory?.();
      if (fromFactory) return String(fromFactory);
    } catch {
      // Fall through to runtime-generated id.
    }
    if (globalScope?.crypto?.randomUUID) {
      return globalScope.crypto.randomUUID();
    }
    return `saved-${Math.random().toString(36).slice(2, 10)}`;
  }

  function normalizeEntry(entry) {
    const id = String(entry?.id ?? '').trim();
    const name = safeName(entry?.name);
    const savedAt = String(entry?.savedAt ?? '').trim();
    const state = clone(entry?.state);
    if (!id || !savedAt || !state || typeof state !== 'object') return null;
    return { id, name, state, savedAt };
  }

  function readStoredList(storage) {
    if (!storage) return [];
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map(normalizeEntry).filter(Boolean).slice(-MAX_SLOTS);
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

  function createSavedSearchStore({
    storage = globalScope?.localStorage ?? null,
    nowFn = () => new Date(),
    idFactory = null
  } = {}) {
    const canPersist = Boolean(storage);
    let memory = canPersist ? readStoredList(storage) : [];

    const persist = () => {
      if (!canPersist) return false;
      return writeStoredList(storage, memory);
    };

    const api = {
      list() {
        if (!canPersist) return [];
        return memory.map((entry) => ({ ...entry, state: clone(entry.state) }));
      },

      save({ name, state } = {}) {
        if (!canPersist) {
          return { ok: false, reason: 'storage_unavailable', entry: null };
        }

        const nextName = safeName(name);
        const existingIndex = memory.findIndex((entry) => entry.name.toLowerCase() === nextName.toLowerCase());
        const existing = existingIndex >= 0 ? memory[existingIndex] : null;
        const entry = {
          id: existing?.id ?? makeId(idFactory),
          name: nextName,
          state: clone(state) ?? {},
          savedAt: safeNow(nowFn)
        };

        if (existingIndex >= 0) {
          memory = [
            ...memory.slice(0, existingIndex),
            entry,
            ...memory.slice(existingIndex + 1)
          ];
        } else {
          memory = [...memory, entry].slice(-MAX_SLOTS);
        }

        const ok = persist();
        return {
          ok,
          reason: ok ? null : 'storage_unavailable',
          entry: { ...entry, state: clone(entry.state) }
        };
      },

      get(id) {
        const key = String(id ?? '');
        const entry = this.list().find((row) => row.id === key);
        return entry ?? null;
      },

      remove(id) {
        if (!canPersist) return { ok: false, reason: 'storage_unavailable' };
        const key = String(id ?? '');
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
    MAX_NAME_LENGTH,
    MAX_SLOTS,
    STORAGE_KEY,
    createSavedSearchStore
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (globalScope) {
    globalScope.SavedSearchStore = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this));
