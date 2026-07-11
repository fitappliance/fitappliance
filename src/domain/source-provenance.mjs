const RETAILER_HOST_SUFFIXES = Object.freeze([
  'appliancesonline.com.au', 'thegoodguys.com.au', 'harveynorman.com.au',
  'binglee.com.au', 'jbhifi.com.au',
]);
const MANUFACTURER_HOST_SUFFIXES = Object.freeze([
  'electrolux.com.au', 'fisherpaykel.com', 'samsung.com', 'lg.com', 'lge.com',
  'hisense.com', 'haier.com', 'haier.com.au', 'chiq.com.au', 'midea.com',
  'miele.com.au', 'kogan.com', 'liebherr.com', 'robinhood.com.au',
  'robinhood.co.nz', 'omegaappliances.com.au', 'subzero-wolf.com',
  'artusi.com.au', 'beko.com', 'inalto.house', 'vogue-appliances.com',
  'bosch-home.com', 'smeg.com.au',
]);

function matches(host, suffix) {
  return host === suffix || host.endsWith(`.${suffix}`);
}

export function classifyTransportHost(sourceUrl) {
  let host;
  try { host = new URL(String(sourceUrl ?? '')).hostname.toLowerCase(); } catch { return 'unknown'; }
  if (RETAILER_HOST_SUFFIXES.some((suffix) => matches(host, suffix))) return 'retailer';
  if (MANUFACTURER_HOST_SUFFIXES.some((suffix) => matches(host, suffix))) return 'manufacturer';
  return 'unknown';
}
