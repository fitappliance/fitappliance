const {
  BROWSER_USER_AGENT,
  extractDiscoveriesFromUrls,
  extractDiscoveryFromUrl,
} = require('./url-discovery.js');

const RETAILER = 'bing-lee';
const DISPLAY_NAME = 'Bing Lee';

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
  sitemapUrls: ['https://binglee.com.au/sitemap.xml'],
  userAgent: BROWSER_USER_AGENT,
};
