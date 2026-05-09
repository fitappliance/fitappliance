const appliancesOnline = require('./appliances-online.js');

const adapters = {
  [appliancesOnline.retailer]: appliancesOnline,
  appliancesonline: appliancesOnline,
  'appliances-online': appliancesOnline,
};

function getAdapter(retailer) {
  const adapter = adapters[String(retailer || '').toLowerCase()];
  if (!adapter) {
    throw new Error(`Unsupported retailer "${retailer}". Available: appliancesonline`);
  }
  return adapter;
}

module.exports = {
  adapters,
  getAdapter,
};
