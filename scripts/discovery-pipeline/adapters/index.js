const appliancesOnline = require('./appliances-online.js');
const bingLee = require('./bing-lee.js');
const harveyNorman = require('./harvey-norman.js');
const jbHiFi = require('./jb-hi-fi.js');
const theGoodGuys = require('./the-good-guys.js');

const adapters = {
  [appliancesOnline.retailer]: appliancesOnline,
  appliancesonline: appliancesOnline,
  'appliances-online': appliancesOnline,
  [bingLee.retailer]: bingLee,
  binglee: bingLee,
  bl: bingLee,
  [harveyNorman.retailer]: harveyNorman,
  harveynorman: harveyNorman,
  hn: harveyNorman,
  [jbHiFi.retailer]: jbHiFi,
  jbhifi: jbHiFi,
  jb: jbHiFi,
  [theGoodGuys.retailer]: theGoodGuys,
  thegoodguys: theGoodGuys,
  tgg: theGoodGuys,
};

function getAdapter(retailer) {
  const adapter = adapters[String(retailer || '').toLowerCase()];
  if (!adapter) {
    throw new Error(`Unsupported retailer "${retailer}". Available: ${Object.keys(adapters).sort().join(', ')}`);
  }
  return adapter;
}

module.exports = {
  adapters,
  getAdapter,
};
