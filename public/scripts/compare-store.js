'use strict';

(function attachCompareStore(globalScope) {
  const STORAGE_KEY = 'fitappliance.compare.v1';
  const MAX_COMPARE = 4;

  function clone(value) {
    try {
      return JSON.parse(JSON.stringify(value ?? null));
    } catch {
      return null;
    }
  }

  function normalizeRetailers(retailers) {
    return (Array.isArray(retailers) ? retailers : [])
      .slice(0, 5)
      .map((retailer) => ({
        name: String(retailer?.name ?? retailer?.n ?? '').replace(/\s+/g, ' ').trim(),
        price: Number.isFinite(Number(retailer?.price ?? retailer?.p)) ? Math.round(Number(retailer.price ?? retailer.p)) : null
      }))
      .filter((retailer) => retailer.name);
  }

  function normalizeClearance(clearance) {
    if (!clearance || typeof clearance !== 'object') return null;
    const side = Number(clearance.side ?? clearance.sides);
    const top = Number(clearance.top);
    const rear = Number(clearance.rear);
    const row = {
      side: Number.isFinite(side) ? Math.max(0, Math.round(side)) : 0,
      top: Number.isFinite(top) ? Math.max(0, Math.round(top)) : 0,
      rear: Number.isFinite(rear) ? Math.max(0, Math.round(rear)) : 0
    };
    return row.side === 0 && row.top === 0 && row.rear === 0 ? null : row;
  }

  function normalizeFeatureList(features) {
    return (Array.isArray(features) ? features : [])
      .map((feature) => String(feature ?? '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 6);
  }

  function normalizeFitSummary(summary) {
    const raw = summary && typeof summary === 'object' ? summary : {};
    const tightest = Number(raw.tightestGapMm ?? raw.gapMm);
    return {
      status: String(raw.status ?? '').replace(/\s+/g, ' ').trim() || null,
      bindingAxis: String(raw.bindingAxis ?? '').replace(/\s+/g, ' ').trim() || null,
      tightestGapMm: Number.isFinite(tightest) ? Math.round(tightest) : null
    };
  }

  function normalizeDelivery(delivery) {
    if (!delivery || typeof delivery !== 'object') return null;
    const doorway = Number(delivery.doorwayClearanceMm);
    const turn = Number(delivery.turnClearanceMm);
    return {
      doorwayClearanceMm: Number.isFinite(doorway) ? Math.round(doorway) : null,
      turnClearanceMm: Number.isFinite(turn) ? Math.round(turn) : null
    };
  }

  function normalizeComparisonMode(value) {
    return String(value ?? '').trim() === 'replacement' ? 'replacement' : 'cavity';
  }

  function normalizeReplacementMatch(match) {
    if (!match || typeof match !== 'object' || Array.isArray(match)) return null;
    const deltas = Object.fromEntries(['width', 'height', 'depth'].map((axis) => {
      const value = Number(match?.deltasMm?.[axis]);
      return [axis, Number.isFinite(value) ? Math.round(value) : null];
    }));
    if (Object.values(deltas).some((value) => value === null)) return null;
    const maxAbsoluteDeltaMm = Number(match.maxAbsoluteDeltaMm);
    const totalAbsoluteDeltaMm = Number(match.totalAbsoluteDeltaMm);
    const normalizedDistance = Number(match.normalizedDistance);
    if (![maxAbsoluteDeltaMm, totalAbsoluteDeltaMm, normalizedDistance].every(Number.isFinite)) return null;
    const rawRange = match?.candidateHeightRangeMm;
    const range = rawRange && typeof rawRange === 'object' && !Array.isArray(rawRange)
      ? {
        minimum: Number(rawRange.minimum),
        maximum: Number(rawRange.maximum),
        selected: Number(rawRange.selected)
      }
      : null;
    const validRange = range
      && Object.values(range).every(Number.isFinite)
      && range.minimum > 0
      && range.minimum < range.maximum
      && range.selected >= range.minimum
      && range.selected <= range.maximum;
    const dimensionSource = ['geometry_v2', 'catalog'].includes(String(match.candidateDimensionSource ?? ''))
      ? String(match.candidateDimensionSource)
      : null;
    return {
      deltasMm: deltas,
      maxAbsoluteDeltaMm: Math.max(0, Math.round(maxAbsoluteDeltaMm)),
      totalAbsoluteDeltaMm: Math.max(0, Math.round(totalAbsoluteDeltaMm)),
      normalizedDistance: Math.max(0, normalizedDistance),
      relation: String(match.relation ?? '').replace(/\s+/g, ' ').trim() || null,
      ...(dimensionSource ? { candidateDimensionSource: dimensionSource } : {}),
      ...(validRange ? {
        candidateHeightRangeMm: {
          minimum: Math.round(range.minimum),
          maximum: Math.round(range.maximum),
          selected: Math.round(range.selected)
        }
      } : {})
    };
  }

  function normalizeSnapshot(snapshot) {
    const slug = String(snapshot?.slug ?? snapshot?.id ?? '').trim();
    if (!slug) return null;
    const comparisonMode = normalizeComparisonMode(snapshot?.comparisonMode);
    const common = {
      slug,
      displayName: String(snapshot?.displayName ?? snapshot?.name ?? snapshot?.model ?? 'Appliance').replace(/\s+/g, ' ').trim(),
      brand: String(snapshot?.brand ?? '').replace(/\s+/g, ' ').trim(),
      model: String(snapshot?.model ?? '').replace(/\s+/g, ' ').trim(),
      cat: String(snapshot?.cat ?? '').replace(/\s+/g, ' ').trim(),
      w: Number.isFinite(Number(snapshot?.w)) ? Math.round(Number(snapshot.w)) : null,
      h: Number.isFinite(Number(snapshot?.h)) ? Math.round(Number(snapshot.h)) : null,
      d: Number.isFinite(Number(snapshot?.d)) ? Math.round(Number(snapshot.d)) : null,
      features: normalizeFeatureList(snapshot?.features),
      retailers: normalizeRetailers(snapshot?.retailers),
      stars: Number.isFinite(Number(snapshot?.stars)) ? Number(snapshot.stars) : null
    };
    if (comparisonMode === 'replacement') {
      const replacementMatch = normalizeReplacementMatch(snapshot?.replacementMatch);
      return replacementMatch ? {
        ...common,
        comparisonMode,
        replacementMatch
      } : null;
    }
    return {
      ...common,
      comparisonMode,
      practicalClearance: normalizeClearance(snapshot?.practicalClearance ?? snapshot?.clearance),
      manufacturerClearance: normalizeClearance(snapshot?.manufacturerClearance),
      fitSummary: normalizeFitSummary(snapshot?.fitSummary),
      delivery: normalizeDelivery(snapshot?.delivery)
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
        if (memory.some((entry) => entry.snapshot.comparisonMode !== normalized.comparisonMode)) {
          return { ok: false, reason: 'mode_mismatch' };
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
