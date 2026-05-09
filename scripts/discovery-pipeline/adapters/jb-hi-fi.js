const { extractDiscoveriesFromUrls, extractDiscoveryFromUrl } = require('./url-discovery.js');

const RETAILER = 'jb-hi-fi';
const DISPLAY_NAME = 'JB Hi-Fi';

function extractDiscovery(url) {
  return extractDiscoveryFromUrl(url, {
    displayName: DISPLAY_NAME,
    productSegment: 'products',
    retailer: RETAILER,
  });
}

function extractDiscoveries(urls) {
  return extractDiscoveriesFromUrls(urls, {
    displayName: DISPLAY_NAME,
    productSegment: 'products',
    retailer: RETAILER,
  });
}

module.exports = {
  displayName: DISPLAY_NAME,
  extractDiscoveries,
  extractDiscovery,
  retailer: RETAILER,
  sitemapUrls: ['https://www.jbhifi.com.au/sitemap.xml'],
};
