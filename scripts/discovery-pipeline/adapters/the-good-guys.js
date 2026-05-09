const { extractDiscoveriesFromUrls, extractDiscoveryFromUrl } = require('./url-discovery.js');

const RETAILER = 'the-good-guys';
const DISPLAY_NAME = 'The Good Guys';

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
  sitemapUrls: ['https://www.thegoodguys.com.au/sitemap.xml'],
};
