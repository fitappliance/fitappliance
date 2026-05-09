const { extractDiscoveriesFromUrls, extractDiscoveryFromUrl } = require('./url-discovery.js');

const RETAILER = 'harvey-norman';
const DISPLAY_NAME = 'Harvey Norman';

function extractDiscovery(url) {
  return extractDiscoveryFromUrl(url, {
    displayName: DISPLAY_NAME,
    retailer: RETAILER,
  });
}

function extractDiscoveries(urls) {
  return extractDiscoveriesFromUrls(urls, {
    displayName: DISPLAY_NAME,
    retailer: RETAILER,
  });
}

module.exports = {
  displayName: DISPLAY_NAME,
  extractDiscoveries,
  extractDiscovery,
  retailer: RETAILER,
  // Robots advertises these sitemap URLs, but the live endpoint may return an
  // Incapsula/PX challenge from Node fetch. Keep the adapter deterministic and
  // let the scout report zero candidates when the sitemap is blocked.
  sitemapUrls: [
    'https://www.harveynorman.com.au/media/sitemap-1-1.xml',
    'https://www.harveynorman.com.au/media/sitemap.xml',
  ],
};
