import test from 'node:test';
import assert from 'node:assert/strict';

import {
  boschProductPageUrl,
  extractBoschDocumentResources,
  findBoschOfficialPdf,
} from '../../scripts/pdf-pipeline/bosch-official.js';

function productHtml(model, documents) {
  const payload = JSON.stringify({ technicalDocuments: documents }).replaceAll('"', '\\"');
  return `<!doctype html><html><head>
    <title>${model} free-standing dishwasher | Bosch Home Appliances</title>
    <meta name="description" content="BOSCH ${model} Series 6 free-standing dishwasher">
    <link rel="canonical" href="https://www.bosch-home.com.au/en/mkt-product/${model}">
  </head><body><h1>${model}</h1><script>self.__next_f.push([1,"${payload}"])</script></body></html>`;
}

const relevantDocuments = Object.freeze([
  {
    id: 'user-1', titleKey: 'user-manuals', type: 'IU', filename: '9001069073_D.pdf',
    url: 'https://media3.bsh-group.com/Documents/9001069073_D.pdf',
  },
  {
    id: 'spec-1', titleKey: 'product-specification', type: 'spec', filename: 'SMS68M38AU.pdf',
    url: 'https://media3.bsh-group.com/Documents/specsheet/en-AU/SMS68M38AU.pdf',
  },
  {
    id: 'install-1', titleKey: 'installation-instruction', type: 'II', filename: '9000521334_L.pdf',
    url: 'https://media3.bsh-group.com/Documents/9000521334_L.pdf',
  },
]);

test('Bosch finder extracts only dimension-relevant documents from the exact AU product manifest', async () => {
  const model = 'SMS68M38AU';
  const html = productHtml(model, [
    ...relevantDocuments,
    {
      id: 'source-1', titleKey: 'open-source', type: 'OSS', filename: 'source.pdf',
      url: 'https://media3.bsh-group.com/Documents/source.pdf',
    },
    {
      id: 'supplement-1', titleKey: 'supplement', type: 'SUP', filename: 'supplement.pdf',
      url: 'https://media3.bsh-group.com/Documents/supplement.pdf',
    },
    {
      id: 'warranty-1', titleKey: 'warranty', type: 'WAR', filename: 'warranty.pdf',
      url: 'https://media3.bsh-group.com/Documents/warranty.pdf',
    },
  ]);
  const writes = [];
  const result = await findBoschOfficialPdf(
    { brand: 'Bosch', model, sku: model, category: 'dishwasher' },
    {
      fetchImpl: async (url) => ({
        ok: true,
        status: 200,
        url,
        headers: { get: (name) => name.toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null },
        arrayBuffer: async () => Buffer.from(html),
      }),
      writeObject: async (path, bytes) => writes.push({ path, bytes: Buffer.from(bytes) }),
    },
  );

  assert.equal(result.productPageUrl, boschProductPageUrl(model));
  assert.equal(result.sourceUrl, relevantDocuments[1].url);
  assert.deepEqual(result.resources.map((row) => [row.resourceType, row.url]), [
    ['specification_sheet', relevantDocuments[1].url],
    ['user_manual', relevantDocuments[0].url],
    ['installation_guide', relevantDocuments[2].url],
  ]);
  assert.equal(result.resources.every((row) => row.requiredAttempt), true);
  assert.equal(result.resources.every((row) => row.discoveryProvenance.requestedModel === model), true);
  assert.equal(result.resources.every((row) => row.discoveryProvenance.matchedModel === model), true);
  assert.equal(result.resources.every((row) => row.discoveryProvenance.artifactUrl === row.url), true);
  assert.equal(result.resources.every((row) => (
    row.discoveryProvenance.discoveryRecordType === 'serialized_technical_document_manifest'
      && row.discoveryProvenance.documentId === row.id
      && row.discoveryProvenance.documentTitleKey === row.titleKey
      && row.discoveryProvenance.originalFileName === row.filename
  )), true);
  assert.equal(writes.length, 1);
  assert.match(writes[0].path, /^evidence\/web\/sha256\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{64}\.html$/);
  assert.equal(writes[0].bytes.toString(), html);
});

test('Bosch manifest parser rejects unapproved document hosts and malformed rows', () => {
  const html = productHtml('SMS68M38AU', [
    ...relevantDocuments,
    {
      id: 'evil-1', titleKey: 'product-specification', type: 'spec', filename: 'SMS68M38AU.pdf',
      url: 'https://example.com/SMS68M38AU.pdf',
    },
    {
      id: 'not-pdf', titleKey: 'user-manuals', type: 'IU', filename: 'manual.html',
      url: 'https://media3.bsh-group.com/Documents/manual.html',
    },
  ]);
  assert.deepEqual(extractBoschDocumentResources(html).map((row) => row.url), [
    relevantDocuments[1].url,
    relevantDocuments[0].url,
    relevantDocuments[2].url,
  ]);
});

test('Bosch finder fails closed for a sibling product page and without content-addressed storage', async () => {
  const target = { brand: 'Bosch', model: 'SMS68M38AU', sku: 'SMS68M38AU', category: 'dishwasher' };
  const siblingHtml = productHtml('SMS68M38AU2', relevantDocuments);
  const response = (html) => async (url) => ({
    ok: true,
    status: 200,
    url,
    headers: { get: () => 'text/html; charset=utf-8' },
    arrayBuffer: async () => Buffer.from(html),
  });

  await assert.rejects(() => findBoschOfficialPdf(target, {
    fetchImpl: response(siblingHtml),
    writeObject: async () => assert.fail('sibling pages must not be stored'),
  }), /exact.*model/i);
  await assert.rejects(() => findBoschOfficialPdf(target, {
    fetchImpl: response(productHtml(target.model, relevantDocuments)),
  }), /object writer/i);
});

test('Bosch finder rejects wildcard model identities before network access', async () => {
  let calls = 0;
  await assert.rejects(() => findBoschOfficialPdf({ brand: 'Bosch', model: 'SMS68*' }, {
    fetchImpl: async () => { calls += 1; },
    writeObject: async () => {},
  }), /wildcard/i);
  assert.equal(calls, 0);
});
