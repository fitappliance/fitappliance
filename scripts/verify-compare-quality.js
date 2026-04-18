'use strict';

const { auditCompareLinks } = require('./audit-compare-links.js');
const { auditLinkQuality } = require('./audit-link-quality.js');

function evaluateCompareQuality({
  compareSummary,
  qualitySummary,
  maxSearchOnlyPages = 0,
  maxNoBuyPages = 0
}) {
  const failures = [];

  if (!compareSummary || !qualitySummary) {
    failures.push('Missing audit summary inputs.');
    return { ok: false, failures };
  }

  if (compareSummary.totalPages !== qualitySummary.totalPages) {
    failures.push(
      `Total pages mismatch: compare=${compareSummary.totalPages}, quality=${qualitySummary.totalPages}`
    );
  }

  if (compareSummary.pagesWithoutBuyLinks !== qualitySummary.noBuyPages) {
    failures.push(
      `No-buy mismatch: compare=${compareSummary.pagesWithoutBuyLinks}, quality=${qualitySummary.noBuyPages}`
    );
  }

  if (qualitySummary.searchOnlyPages > maxSearchOnlyPages) {
    failures.push(
      `searchOnlyPages ${qualitySummary.searchOnlyPages} exceeds threshold ${maxSearchOnlyPages}`
    );
  }

  if (qualitySummary.noBuyPages > maxNoBuyPages) {
    failures.push(
      `noBuyPages ${qualitySummary.noBuyPages} exceeds threshold ${maxNoBuyPages}`
    );
  }

  return {
    ok: failures.length === 0,
    failures
  };
}

async function verifyCompareQuality(options = {}) {
  const maxSearchOnlyPages = Number.isInteger(options.maxSearchOnlyPages)
    ? options.maxSearchOnlyPages
    : 0;
  const maxNoBuyPages = Number.isInteger(options.maxNoBuyPages)
    ? options.maxNoBuyPages
    : 0;

  const [{ summary: compareSummary }, { summary: qualitySummary }] = await Promise.all([
    auditCompareLinks({ repoRoot: options.repoRoot }),
    auditLinkQuality({ repoRoot: options.repoRoot })
  ]);

  const evaluation = evaluateCompareQuality({
    compareSummary,
    qualitySummary,
    maxSearchOnlyPages,
    maxNoBuyPages
  });

  return {
    compareSummary,
    qualitySummary,
    ...evaluation
  };
}

if (require.main === module) {
  verifyCompareQuality()
    .then((result) => {
      console.log(JSON.stringify({
        compareSummary: result.compareSummary,
        qualitySummary: result.qualitySummary,
        ok: result.ok,
        failures: result.failures
      }, null, 2));
      if (!result.ok) {
        process.exitCode = 1;
      }
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

module.exports = {
  evaluateCompareQuality,
  verifyCompareQuality
};
