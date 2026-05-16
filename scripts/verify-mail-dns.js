'use strict';

const dns = require('node:dns').promises;

function flattenTxt(records) {
  return records.map((chunks) => chunks.join(''));
}

function hasRecord(records, pattern) {
  return records.some((record) => pattern.test(record));
}

async function resolveSafely(fn, name) {
  try {
    return { records: await fn(name), error: null };
  } catch (error) {
    return { records: [], error: error?.code || error?.message || 'DNS lookup failed' };
  }
}

async function verifyMailDns({ domain = 'fitappliance.com.au', resolver = dns } = {}) {
  const dmarcHost = `_dmarc.${domain}`;
  const [mxResult, txtResult, dmarcResult] = await Promise.all([
    resolveSafely((name) => resolver.resolveMx(name), domain),
    resolveSafely((name) => resolver.resolveTxt(name), domain),
    resolveSafely((name) => resolver.resolveTxt(name), dmarcHost),
  ]);

  const mxRecords = [...mxResult.records].sort((left, right) => left.priority - right.priority);
  const txtRecords = flattenTxt(txtResult.records);
  const dmarcRecords = flattenTxt(dmarcResult.records);
  const spfRecords = txtRecords.filter((record) => /^v=spf1\b/i.test(record));
  const validMx = mxRecords.some((row) => /improvmx\.com\.?$/i.test(row.exchange));
  const validSpf = hasRecord(spfRecords, /include:spf\.improvmx\.com/i);
  const validDmarc = hasRecord(dmarcRecords, /^v=DMARC1\b/i);

  const checks = {
    mx: {
      ok: validMx,
      expected: 'ImprovMX MX records',
      records: mxRecords.map((row) => `${row.priority} ${row.exchange}`),
      error: mxResult.error,
    },
    spf: {
      ok: validSpf,
      expected: 'v=spf1 include:spf.improvmx.com',
      records: spfRecords,
      error: txtResult.error,
    },
    dmarc: {
      ok: validDmarc,
      expected: `${dmarcHost} TXT v=DMARC1`,
      records: dmarcRecords,
      error: dmarcResult.error,
    },
  };

  return {
    domain,
    checked_at: new Date().toISOString(),
    ok: checks.mx.ok && checks.spf.ok && checks.dmarc.ok,
    checks,
  };
}

async function main() {
  const domain = process.argv.find((arg) => arg.startsWith('--domain='))?.slice('--domain='.length)
    || 'fitappliance.com.au';
  const strict = process.argv.includes('--strict');
  const result = await verifyMailDns({ domain });
  console.log(JSON.stringify(result, null, 2));
  if (strict && !result.ok) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  flattenTxt,
  verifyMailDns,
};
