import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const {
  findMieleManualEvidencePdf,
  mieleEvidenceModelMatchesTarget
} = require('../../scripts/pdf-pipeline/miele-official.js');

test('Miele manual-evidence finder can use conservative family suffix matches', () => {
  const manualEvidence = {
    products: {
      'ao-g5000-quick': {
        brand: 'Miele',
        category: 'dishwasher',
        model: 'G5000BKBRWS',
        evidence: [
          {
            type: 'spec_sheet',
            status: 'candidate',
            source_url: 'https://www.appliancesonline.com.au/G5000BKBRWS_Miele_Quick_Guide.pdf'
          }
        ]
      },
      'ao-g5000': {
        brand: 'Miele',
        category: 'dishwasher',
        model: 'G5000SCUCLST',
        evidence: [
          {
            type: 'spec_sheet',
            status: 'candidate',
            source_url: 'https://www.appliancesonline.com.au/G5000SCUCLST_Miele_Specifications_Sheet.pdf'
          }
        ]
      }
    }
  };

  const found = findMieleManualEvidencePdf({
    brand: 'Miele',
    sku: 'G 5000',
    category: 'dishwasher'
  }, manualEvidence);

  assert.equal(found.sourceUrl, 'https://www.appliancesonline.com.au/G5000SCUCLST_Miele_Specifications_Sheet.pdf');
  assert.equal(found.source, 'manual-evidence:miele-family-spec_sheet');
  assert.equal(found.verifiedAlias, 'G5000SCUCLST');
});

test('Miele manual-evidence finder rejects cross-category and broad wildcard matches', () => {
  assert.equal(mieleEvidenceModelMatchesTarget({
    evidenceModel: 'G5000BKBRWS',
    targetSku: 'G 5000',
    evidenceCategory: 'dishwasher',
    targetCategory: 'fridge'
  }), false);
  assert.equal(mieleEvidenceModelMatchesTarget({
    evidenceModel: 'G6999SCVIXXL',
    targetSku: 'G 6xxx',
    evidenceCategory: 'dishwasher',
    targetCategory: 'dishwasher'
  }), false);
});
