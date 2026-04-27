function escHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function normalizeRetailers(retailers) {
  if (!Array.isArray(retailers)) return [];
  return retailers
    .filter((retailer) => retailer && Number.isFinite(retailer.p) && retailer.p > 0)
    .map((retailer) => ({
      ...retailer,
      p: Number(retailer.p)
    }));
}

function modelTitle(model) {
  const tokens = String(model ?? '').trim().split(/\s+/).filter(Boolean);
  return tokens.slice(0, 3).join(' ');
}

function isSearchLikeHref(href) {
  if (typeof href !== 'string') return false;
  return /\/search(?:\/|[?#]|$)/i.test(href) || /[?&](q|query|text|search|keyword)=/i.test(href);
}

export function shouldShowRetailerModal(product) {
  return Array.isArray(product?.retailers) && product.retailers.length >= 2;
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
  const sorted = [...normalizeRetailers(product.retailers)].sort((left, right) => left.p - right.p);
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
        data-price="${Number.isFinite(retailer.p) ? retailer.p : 0}"
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
  const retailers = normalizeRetailers(product?.retailers);

  if (retailers.length === 0) {
    return buildSearchOnlineButton(product, { buildSearchOnlineUrl, buildNoRetailerUrl });
  }

  if (retailers.length === 1) {
    const retailer = retailers[0];
    const targetUrl = resolveRetailerUrl(retailer, product) ?? '#';
    const actionLabel = isSearchLikeHref(targetUrl) ? 'Search' : 'Buy';
    return `<a class="btn-buy" href="${escHtml(targetUrl)}" target="_blank" rel="noopener sponsored"
      data-buy-click="1"
      data-product-id="${escHtml(product?.id ?? '')}"
      data-brand="${escHtml(product?.brand ?? '')}"
      data-model="${escHtml(product?.model ?? '')}"
      data-retailer="${escHtml(retailer.n)}"
      data-price="${Number.isFinite(retailer.p) ? retailer.p : 0}"
    >${actionLabel} at ${escHtml(retailer.n)}</a>`;
  }

  return `<button class="btn-buy" type="button" onclick="openRetailerModal('${escHtml(product.id)}')">Compare ${retailers.length} Retailers</button>`;
}
