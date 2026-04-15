const HISTORY_KEY = 'fitappliance-searches-v1';
export const MAX_HISTORY = 8;

const CAT_LABELS = {
  fridge: 'Fridge',
  washing_machine: 'Washing Machine',
  dishwasher: 'Dishwasher',
  dryer: 'Dryer'
};

function escHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function safeStorage() {
  return globalThis.localStorage ?? null;
}

function readHistory() {
  try {
    const storage = safeStorage();
    if (!storage) return [];
    const raw = storage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeHistory(entries) {
  const storage = safeStorage();
  if (!storage) return;
  storage.setItem(HISTORY_KEY, JSON.stringify(entries));
}

function normalizeParams(input) {
  const params = {};
  for (const key of ['cat', 'w', 'h', 'd', 'brand', 'door', 'dwelling']) {
    const value = input?.[key];
    if (value === null || value === undefined || value === '') continue;
    params[key] = String(value);
  }
  return params;
}

function buildFingerprint(params) {
  const keys = Object.keys(params).sort();
  const normalized = {};
  for (const key of keys) {
    normalized[key] = params[key];
  }
  return JSON.stringify(normalized);
}

function buildLabel(params) {
  const cat = CAT_LABELS[params.cat] ?? params.cat ?? 'Appliances';
  const w = params.w ? `${params.w}mm` : '-';
  const h = params.h ? `${params.h}mm` : '-';
  const d = params.d ? `${params.d}mm` : '-';
  const brand = params.brand ? ` · ${params.brand}` : '';
  return `${cat} · ${w} × ${h} × ${d}${brand}`;
}

export function recordSearch(inputParams) {
  const params = normalizeParams(inputParams);
  if (!params.cat || !params.w || !params.h || !params.d) return;

  const fingerprint = buildFingerprint(params);
  const entry = {
    params,
    label: buildLabel(params),
    timestamp: Date.now(),
    fingerprint
  };

  const next = [entry, ...readHistory().filter((item) => item?.fingerprint !== fingerprint)]
    .slice(0, MAX_HISTORY);

  writeHistory(next);
}

export function getRecentSearches() {
  return readHistory()
    .filter((entry) => entry && typeof entry === 'object' && entry.params && typeof entry.label === 'string')
    .sort((left, right) => Number(right.timestamp ?? 0) - Number(left.timestamp ?? 0));
}

export function clearSearchHistory() {
  const storage = safeStorage();
  if (!storage) return;
  storage.removeItem(HISTORY_KEY);
}

export function buildSearchHistoryHtml(searches) {
  if (!Array.isArray(searches) || searches.length === 0) return '';

  const chips = searches.map((entry) => {
    const json = JSON.stringify(entry.params)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return `<button class="search-chip" onclick="applySearch(${json})">${escHtml(entry.label)}</button>`;
  }).join('');

  return `<div class="search-history">
    <span class="search-history__label">Recent:</span>
    ${chips}
    <button class="search-history__clear" onclick="clearSearchHistoryUi()" aria-label="Clear history">×</button>
  </div>`;
}
