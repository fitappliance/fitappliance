let evidenceIndexCache = null;

function escHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function isSafeHttpUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return false;
  try {
    const base = typeof window !== 'undefined' && window?.location?.origin
      ? window.location.origin
      : 'https://www.fitappliance.com.au';
    const parsed = new URL(raw, base);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function productIdFor(product = {}) {
  return String(product.id ?? product.slug ?? product.product_id ?? '').trim();
}

function dateStamp(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const direct = raw.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? '';
  if (direct) return direct;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : '';
}

function formatDisplayDate(value) {
  const stamp = dateStamp(value);
  if (!stamp) return '';
  const [year, month, day] = stamp.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(parsed);
}

function sourceLabel(value) {
  const raw = String(value ?? '').trim().replace(/[_-]+/g, ' ');
  if (!raw) return 'Official PDF';
  return raw.replace(/\b\w/g, (char) => char.toUpperCase());
}

export async function loadEvidenceIndex(fetchImpl = fetch, options = {}) {
  if (!options.forceRefresh && evidenceIndexCache) return evidenceIndexCache;
  try {
    const response = await fetchImpl('/data/evidence-index.json');
    if (!response?.ok) {
      evidenceIndexCache = {};
      return evidenceIndexCache;
    }
    const json = await response.json();
    evidenceIndexCache = json && typeof json === 'object' ? json : {};
    return evidenceIndexCache;
  } catch {
    evidenceIndexCache = {};
    return evidenceIndexCache;
  }
}

export function getProductProvenance(productId, indexMap = {}) {
  const key = String(productId ?? '').trim();
  if (!key || !indexMap || typeof indexMap !== 'object') return null;
  const entry = indexMap[key];
  return entry && typeof entry === 'object' ? entry : null;
}

export function renderProvenanceBlock(product = {}, indexMap = {}) {
  const provenance = getProductProvenance(productIdFor(product), indexMap);
  if (!provenance) {
    return `<div class="data-provenance data-provenance--fallback">
      <span class="data-provenance__label">Evidence</span>
      <span class="data-provenance__copy">Retailer or catalog spec. Official PDF verification pending.</span>
    </div>`;
  }

  const extractedAt = formatDisplayDate(provenance.extractedAt);
  const pdfUrl = String(provenance.pdfUrl ?? '').trim();
  const source = sourceLabel(provenance.source);
  const safeLink = provenance.verified === true && isSafeHttpUrl(pdfUrl)
    ? `<a class="data-provenance__link" href="${escHtml(pdfUrl)}" target="_blank" rel="noopener">View ${escHtml(source)}</a>`
    : '';

  if (provenance.verified === true && safeLink) {
    return `<div class="data-provenance data-provenance--verified">
      <span class="data-provenance__label">Verified against official PDF</span>
      ${safeLink}
      ${extractedAt ? `<span class="data-provenance__date">Extracted ${escHtml(extractedAt)}</span>` : ''}
    </div>`;
  }

  return `<div class="data-provenance data-provenance--pending">
    <span class="data-provenance__label">Evidence pending review</span>
    <span class="data-provenance__copy">PDF source captured, but not yet approved for runtime data.</span>
    ${extractedAt ? `<span class="data-provenance__date">Captured ${escHtml(extractedAt)}</span>` : ''}
  </div>`;
}
