const ADSENSE_CLIENT = 'ca-pub-7257149597818537';
const ADSENSE_SCRIPT_ID = 'fitappliance-adsense-js';
const ADSENSE_SCRIPT_SRC = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;

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

export function loadAdSenseScript(doc = globalThis.document) {
  if (!doc?.createElement) return Promise.resolve();
  const existing = doc.getElementById(ADSENSE_SCRIPT_ID);
  if (existing?.dataset.loaded === 'true') return Promise.resolve(existing);
  if (existing?.dataset.loading === 'true') {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(existing), { once: true });
      existing.addEventListener('error', reject, { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = doc.createElement('script');
    script.id = ADSENSE_SCRIPT_ID;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.src = ADSENSE_SCRIPT_SRC;
    script.dataset.loading = 'true';
    script.addEventListener('load', () => {
      script.dataset.loading = 'false';
      script.dataset.loaded = 'true';
      resolve(script);
    }, { once: true });
    script.addEventListener('error', reject, { once: true });
    doc.head.appendChild(script);
  });
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
  const doc = scope.ownerDocument ?? scope;
  const ads = Array.from(scope.querySelectorAll('ins.adsbygoogle:not([data-adsense-loaded="true"]):not([data-adsense-observed="true"])'));
  const requestAd = async (ad) => {
    const slot = ad.getAttribute('data-ad-slot');
    const wrapper = ad.closest?.('[data-adsense-unit]');
    if (!isConfiguredSlotId(slot)) {
      wrapper?.setAttribute('data-ad-status', 'pending-slot-id');
      return;
    }
    try {
      await loadAdSenseScript(doc);
      win.adsbygoogle = win.adsbygoogle || [];
      win.adsbygoogle.push({});
      ad.setAttribute('data-adsense-loaded', 'true');
      wrapper?.setAttribute('data-ad-status', 'requested');
    } catch (error) {
      wrapper?.setAttribute('data-ad-status', 'request-failed');
      wrapper?.setAttribute('data-ad-error', String(error?.message ?? error));
    }
  };

  const scheduleIdleRequest = (ad) => {
    const callback = () => requestAd(ad);
    if (typeof win.requestIdleCallback === 'function') {
      win.requestIdleCallback(callback, { timeout: 4000 });
      return;
    }
    win.setTimeout?.(callback, 3000);
  };

  if (typeof win.IntersectionObserver !== 'function') {
    for (const ad of ads) scheduleIdleRequest(ad);
    return;
  }

  const observer = new win.IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      const ad = entry.target.querySelector?.('ins.adsbygoogle') ?? entry.target;
      requestAd(ad);
    }
  }, { rootMargin: '600px 0px' });

  for (const ad of ads) {
    const wrapper = ad.closest?.('[data-adsense-unit]') ?? ad;
    ad.setAttribute('data-adsense-observed', 'true');
    wrapper?.setAttribute('data-ad-status', 'waiting-for-viewport');
    observer.observe(wrapper);
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
