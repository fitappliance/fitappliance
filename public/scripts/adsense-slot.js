const ADSENSE_CLIENT = 'ca-pub-7257149597818537';

const MANUAL_SLOT_IDS = Object.freeze({
  'footer-top': '7748816473',
  'zero-results': '3809571463',
  'guide-content': '7780228766',
  'about-content': '7780228766',
  'methodology-content': '7780228766'
});

function escAttr(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function isConfiguredSlotId(value) {
  return /^\d{6,}$/.test(String(value ?? '').trim());
}

export function getManualAdSlotId(placement) {
  return MANUAL_SLOT_IDS[placement] ?? '';
}

export function buildAdSlotHtml({
  placement,
  slot = getManualAdSlotId(placement),
  format = 'auto',
  minHeight = 280,
  label = 'Advertisement',
  className = ''
} = {}) {
  const normalizedPlacement = String(placement ?? 'manual').trim() || 'manual';
  const classes = ['ad-unit', `ad-unit--${normalizedPlacement}`, className].filter(Boolean).join(' ');
  const status = isConfiguredSlotId(slot) ? 'ready' : 'pending-slot-id';
  return `<section class="${escAttr(classes)}" data-adsense-unit data-adsense-placement="${escAttr(normalizedPlacement)}" data-ad-status="${status}" style="--ad-unit-min-height:${Number(minHeight) || 280}px" aria-label="${escAttr(label)}">
    <div class="ad-unit__label">${escAttr(label)}</div>
    <ins class="adsbygoogle"
      style="display:block"
      data-ad-client="${ADSENSE_CLIENT}"
      data-ad-slot="${escAttr(slot)}"
      data-ad-format="${escAttr(format)}"
      data-full-width-responsive="true"></ins>
  </section>`;
}

export function hydrateAdSlots(root = globalThis.document) {
  const scope = root?.querySelectorAll ? root : globalThis.document;
  if (!scope?.querySelectorAll) return;
  const win = scope.defaultView ?? globalThis.window ?? globalThis;
  const ads = Array.from(scope.querySelectorAll('ins.adsbygoogle:not([data-adsense-loaded="true"])'));
  for (const ad of ads) {
    const slot = ad.getAttribute('data-ad-slot');
    const wrapper = ad.closest?.('[data-adsense-unit]');
    if (!isConfiguredSlotId(slot)) {
      wrapper?.setAttribute('data-ad-status', 'pending-slot-id');
      continue;
    }
    try {
      win.adsbygoogle = win.adsbygoogle || [];
      win.adsbygoogle.push({});
      ad.setAttribute('data-adsense-loaded', 'true');
      wrapper?.setAttribute('data-ad-status', 'requested');
    } catch (error) {
      wrapper?.setAttribute('data-ad-status', 'request-failed');
      wrapper?.setAttribute('data-ad-error', String(error?.message ?? error));
    }
  }
}

export function mountAdSlot(container, options) {
  if (!container) return;
  container.innerHTML = buildAdSlotHtml(options);
  hydrateAdSlots(container);
}

globalThis.FitAdsense = Object.freeze({
  ADSENSE_CLIENT,
  MANUAL_SLOT_IDS,
  buildAdSlotHtml,
  getManualAdSlotId,
  hydrateAdSlots,
  mountAdSlot
});

if (globalThis.document?.readyState === 'loading') {
  globalThis.document.addEventListener('DOMContentLoaded', () => hydrateAdSlots(globalThis.document), { once: true });
} else {
  hydrateAdSlots(globalThis.document);
}
