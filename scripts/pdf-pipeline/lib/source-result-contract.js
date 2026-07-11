'use strict';

const RETAILER_HOSTS = new Set([
  'www.appliancesonline.com.au', 'appliancesonline.com.au',
  'www.thegoodguys.com.au', 'thegoodguys.com.au',
  'www.harveynorman.com.au', 'harveynorman.com.au',
  'www.binglee.com.au', 'binglee.com.au',
  'www.jbhifi.com.au', 'jbhifi.com.au'
]);

const MANUFACTURER_HOST_SUFFIXES = [
  'electrolux.com.au', 'fisherpaykel.com', 'samsung.com', 'lg.com', 'lge.com', 'hisense.com',
  'haier.com', 'haier.com.au', 'chiq.com.au', 'midea.com', 'miele.com.au', 'kogan.com', 'liebherr.com',
  'robinhood.com.au', 'robinhood.co.nz', 'omegaappliances.com.au', 'subzero-wolf.com',
  'artusi.com.au', 'beko.com', 'inalto.house', 'vogue-appliances.com'
];

function hostMatches(host, suffix) {
  return host === suffix || host.endsWith(`.${suffix}`);
}

function validateSourceResult({ sourceUrl, source, target }) {
  let url;
  try { url = new URL(String(sourceUrl || '')); } catch { throw new TypeError('PDF source result requires a valid URL'); }
  if (url.protocol !== 'https:') throw new TypeError('PDF source result requires HTTPS');
  const sourceLabel = String(source || '').trim();
  if (!sourceLabel) throw new TypeError('PDF source result requires source label');
  const host = url.hostname.toLowerCase();
  const retailer = RETAILER_HOSTS.has(host);
  const manufacturer = MANUFACTURER_HOST_SUFFIXES.some((suffix) => hostMatches(host, suffix));
  const officialLabel = /(?:^|-)official(?:-|$)/i.test(sourceLabel);
  return Object.freeze({
    sourceUrl: url.toString(), source: sourceLabel,
    targetBrand: String(target?.brand || '').trim(), targetSku: String(target?.sku || '').trim(),
    transportHostType: retailer ? 'retailer' : manufacturer ? 'manufacturer' : 'unknown',
    documentAuthorType: officialLabel && manufacturer && !retailer ? 'manufacturer' : 'unknown',
    approvableTransport: officialLabel && manufacturer && !retailer
  });
}

module.exports = { validateSourceResult };
