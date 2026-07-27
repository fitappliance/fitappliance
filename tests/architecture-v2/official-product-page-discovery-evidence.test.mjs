import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  verifyOfficialProductPageDiscoveryEvidence,
} from '../../src/domain/official-product-page-discovery-evidence.mjs';

test('official product-page evidence accepts a structured Samsung support manual link', () => {
  const model = 'SRF9700BFH';
  const discoveryUrl = 'https://www.samsung.com/au/support/model/RF71A9770B1/SA/';
  const artifactUrl = `https://org.downloadcenter.samsung.com/downloadfile/ContentsFile.aspx?CDSite=UNI_AU&ModelName=${model}&CttFileID=8134461&CDCttType=UM`;
  const bytes = Buffer.from(`<html><head><title>${model} | Samsung Support Australia</title></head><body>
    <li data-sdf-prop="contents">${JSON.stringify({
      manuals: [{ description: 'User Manual', downloadUrl: artifactUrl }],
    })}</li>
  </body></html>`);
  const contentSha256 = createHash('sha256').update(bytes).digest('hex');

  assert.deepEqual(verifyOfficialProductPageDiscoveryEvidence({
    schemaVersion: 1,
    method: 'official_product_page',
    market: 'AU',
    discoveryUrl,
    requestedModel: model,
    matchedModel: model,
    artifactUrl,
    artifactLinkUrl: artifactUrl,
    discoveryContentSha256: contentSha256,
    discoveryObjectPath: `evidence/web/sha256/${contentSha256.slice(0, 2)}/${contentSha256.slice(2, 4)}/${contentSha256}.html`,
    discoveryByteSize: bytes.length,
  }, { brand: 'Samsung', model, category: 'fridge' }, bytes), {
    exactModelMatched: true,
  });
});
