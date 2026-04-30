function escHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function getPositivePrice(value) {
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? price : null;
}

function normalizePricedRetailers(retailers) {
  if (!Array.isArray(retailers)) return [];
  return retailers
    .filter((retailer) => retailer && getPositivePrice(retailer.p) !== null)
    .map((retailer) => ({
      ...retailer,
      n: String(retailer?.n ?? retailer?.name ?? '').trim(),
      url: String(retailer?.url ?? retailer?.href ?? '').trim(),
      p: getPositivePrice(retailer.p)
    }))
    .filter((retailer) => retailer.n && isRetailerProductPageUrl(retailer.url));
}

function normalizeLinkedRetailers(retailers) {
  if (!Array.isArray(retailers)) return [];
  return retailers
    .map((retailer) => ({
      ...retailer,
      n: String(retailer?.n ?? retailer?.name ?? '').trim(),
      url: String(retailer?.url ?? retailer?.href ?? '').trim(),
      p: getPositivePrice(retailer?.p)
    }))
    .filter((retailer) => retailer.n && isRetailerProductPageUrl(retailer.url));
}

export function isRetailerProductPageUrl(url) {
  let parsed;
  try {
    parsed = new URL(String(url ?? '').trim());
  } catch {
    return false;
  }
  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
  const pathname = parsed.pathname.replace(/\/+$/, '').toLowerCase();
  if (!['http:', 'https:'].includes(parsed.protocol)) return false;
  if (!host || pathname === '' || pathname === '/') return false;
  if (['q', 'query', 'searchterm', 'text', 'keyword'].some((key) => parsed.searchParams.has(key))) return false;
  if (/\/(search|searchdisplay|catalogsearch|collections?|category|categories|cart|checkout)(\/|$)/i.test(pathname)) {
    return false;
  }

  if (host.endsWith('jbhifi.com.au')) return /^\/products\//.test(pathname);
  if (host.endsWith('appliancesonline.com.au') || host.endsWith('appliances-online.com.au')) return /^\/product\//.test(pathname);
  if (host.endsWith('binglee.com.au')) return /^\/products\//.test(pathname);
  if (host.endsWith('harveynorman.com.au')) return /\.html$/.test(pathname);
  if (host.endsWith('thegoodguys.com.au')) return /^\/[^/]+-[^/]+$/.test(pathname);

  return true;
}

function modelTitle(model) {
  const tokens = String(model ?? '').trim().split(/\s+/).filter(Boolean);
  return tokens.slice(0, 3).join(' ');
}

function isSearchLikeHref(href) {
  if (typeof href !== 'string') return false;
  return /\/search(?:\/|[?#]|$)/i.test(href) || /[?&](q|query|text|search|keyword)=/i.test(href);
}

function retailerInitials(name) {
  const normalized = String(name ?? '').trim();
  const known = {
    'jb hi-fi': 'JB',
    'jb hifi': 'JB',
    'appliances online': 'AO',
    'harvey norman': 'HN',
    'the good guys': 'TGG',
    'bing lee': 'BL'
  };
  const key = normalized.toLowerCase().replace(/\s+/g, ' ');
  if (known[key]) return known[key];
  const parts = normalized.split(/[\s\-&]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function safeRetailerDisplayName(name) {
  const value = String(name ?? '').trim();
  if (/[<>]/.test(value) || /\bon\w+\s*=/i.test(value)) return 'Retailer';
  return value || 'Retailer';
}

function buildRetailerLinkAttributes(product, retailer, targetUrl) {
  return `data-buy-click="1"
      data-product-id="${escHtml(product?.id ?? '')}"
      data-brand="${escHtml(product?.brand ?? '')}"
      data-model="${escHtml(product?.model ?? '')}"
      data-retailer="${escHtml(safeRetailerDisplayName(retailer.n))}"
      data-price="${retailer.p ?? 0}"`;
}

export function buildRetailerLogoLinks(product, { resolveRetailerUrl = (retailer) => retailer.url } = {}) {
  const linked = normalizeLinkedRetailers(product?.retailers);
  if (linked.length === 0) return '';
  const seen = new Set();
  const items = linked.filter((retailer) => {
    const key = retailer.n.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (items.length >= 5) {
    const dots = items.map((retailer) => {
      const targetUrl = resolveRetailerUrl(retailer, product) ?? retailer.url ?? '#';
      const displayName = safeRetailerDisplayName(retailer.n);
      return `<a class="retailer-logo-dot" href="${escHtml(targetUrl)}" target="_blank" rel="sponsored nofollow noopener"
        aria-label="Open ${escHtml(displayName)} product page"
        title="${escHtml(displayName)}"
        ${buildRetailerLinkAttributes(product, retailer, targetUrl)}
      ><span>${escHtml(retailerInitials(displayName))}</span></a>`;
    }).join('');

    return `<div class="retailer-logo-panel retailer-logo-panel--dense">
      <span class="retailer-logo-label">Available at ${items.length} stores</span>
      <div class="retailer-logo-rail" aria-label="Retailer product links">${dots}</div>
      <span class="retailer-option-hint">Choose a retailer</span>
    </div>`;
  }

  const links = items.map((retailer) => {
    const targetUrl = resolveRetailerUrl(retailer, product) ?? retailer.url ?? '#';
    const displayName = safeRetailerDisplayName(retailer.n);
    return `<a class="retailer-logo-link" href="${escHtml(targetUrl)}" target="_blank" rel="sponsored nofollow noopener"
      aria-label="Open ${escHtml(displayName)} product page"
      title="${escHtml(displayName)}"
      ${buildRetailerLinkAttributes(product, retailer, targetUrl)}
    ><span class="retailer-logo-mark">${escHtml(retailerInitials(displayName))}</span><span class="retailer-logo-name">${escHtml(displayName)}</span></a>`;
  }).join('');

  return `<div class="retailer-logo-panel">
    <span class="retailer-logo-label">Available at</span>
    <div class="retailer-logo-links" aria-label="Retailer product links">${links}</div>
  </div>`;
}

export function shouldShowRetailerModal(product) {
  return normalizePricedRetailers(product?.retailers).length >= 2;
}

export function buildSearchOnlineButton(
  product,
  {
    buildSearchOnlineUrl,
    buildNoRetailerUrl = () => '#'
  } = {}
) {
  const targetUrl = typeof buildSearchOnlineUrl === 'function'
    ? buildSearchOnlineUrl(product)
    : buildNoRetailerUrl(product);
  return `<a class="btn-search-online" href="${escHtml(targetUrl)}" target="_blank" rel="sponsored nofollow noopener">Search this model online<span class="btn-search-note">retailer info not available</span></a>`;
}

export function buildRetailerModalHtml(product, { resolveRetailerUrl = (retailer) => retailer.url } = {}) {
  if (!shouldShowRetailerModal(product)) return '';
  const sorted = [...normalizePricedRetailers(product?.retailers)].sort((left, right) => left.p - right.p);
  if (sorted.length < 2) return '';

  const cheapest = sorted[0];
  const title = `${product?.brand ?? ''} ${modelTitle(product?.model ?? '')}`.trim();
  const modalId = `rm-${product.id}`;

  const itemsHtml = sorted.map((retailer, index) => {
    const isLowest = index === 0;
    const diff = retailer.p - cheapest.p;
    const targetUrl = resolveRetailerUrl(retailer, product) ?? '#';
    const actionLabel = isSearchLikeHref(targetUrl) ? 'Search' : 'Buy';
    const delta = isLowest
      ? '<span class="retailer-badge">Lowest</span>'
      : `<span class="retailer-diff">+$${diff.toLocaleString()}</span>`;
    return `<li class="retailer-item${isLowest ? ' retailer-item--best' : ''}">
      <span class="retailer-name">${escHtml(retailer.n)}</span>
      <span class="retailer-price">$${retailer.p.toLocaleString()}</span>
      ${delta}
      <a class="btn-buy retailer-buy" href="${escHtml(targetUrl)}" target="_blank" rel="noopener sponsored"
        data-buy-click="1"
        data-product-id="${escHtml(product?.id ?? '')}"
        data-brand="${escHtml(product?.brand ?? '')}"
        data-model="${escHtml(product?.model ?? '')}"
        data-retailer="${escHtml(retailer.n)}"
        data-price="${retailer.p ?? 0}"
      >${actionLabel}</a>
    </li>`;
  }).join('');

  return `<div class="retailer-modal" id="${escHtml(modalId)}" hidden role="dialog" aria-modal="true" aria-labelledby="rm-title-${escHtml(product.id)}">
    <div class="retailer-modal-backdrop" onclick="closeRetailerModal('${escHtml(product.id)}')"></div>
    <div class="retailer-modal-sheet">
      <div class="retailer-modal-header">
        <h3 id="rm-title-${escHtml(product.id)}">Where to Buy — ${escHtml(title)}</h3>
        <button class="retailer-modal-close" onclick="closeRetailerModal('${escHtml(product.id)}')" aria-label="Close">×</button>
      </div>
      <p class="retailer-modal-sub">Best price: <strong>$${cheapest.p.toLocaleString()}</strong> at ${escHtml(cheapest.n)}</p>
      <ul class="retailer-list">${itemsHtml}</ul>
      <p class="retailer-disclosure"><a href="/affiliate-disclosure">Affiliate disclosure</a></p>
    </div>
  </div>`;
}

export function buildRetailerTriggerButton(
  product,
  {
    resolveRetailerUrl = (retailer) => retailer.url,
    buildNoRetailerUrl = () => '#',
    buildSearchOnlineUrl
  } = {}
) {
  const pricedRetailers = normalizePricedRetailers(product?.retailers);

  if (pricedRetailers.length >= 2) {
    return `<button class="btn-buy" type="button" onclick="openRetailerModal('${escHtml(product.id)}')">Compare ${pricedRetailers.length} Retailers</button>`;
  }

  if (normalizeLinkedRetailers(product?.retailers).length > 0) {
    return buildRetailerLogoLinks(product, { resolveRetailerUrl });
  }

  return buildSearchOnlineButton(product, { buildSearchOnlineUrl, buildNoRetailerUrl });
}
