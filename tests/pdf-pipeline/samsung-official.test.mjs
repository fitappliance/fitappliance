import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSamsungSupportModelVariants,
  extractSamsungProductPageUrls,
  extractSamsungPdfResources,
  findSamsungOfficialPdf,
  normalizeSku,
  scoreSamsungResource
} from '../../scripts/pdf-pipeline/samsung-official.js';

test('Samsung official finder normalizes SKU values for support lookup', () => {
  assert.equal(normalizeSku(' ww12bb944dgb/sa '), 'WW12BB944DGBSA');
  assert.deepEqual(buildSamsungSupportModelVariants('DW60BG750FSL'), [
    'DW60BG750FSL',
    'DW60BG750FSLSA'
  ]);
});

test('Samsung official finder extracts manuals from support data-sdf JSON', () => {
  const html = `
    <li data-sdf-prop="modelCode">DW60BG750FSLSA</li>
    <li data-sdf-prop="contents">{&quot;manuals&quot;:[{&quot;description&quot;:&quot;User Manual&quot;,&quot;englishDescription&quot;:&quot;User Manual&quot;,&quot;fileName&quot;:&quot;DW60BG750FSL_SA_DD68-00250K-02_EN.pdf&quot;,&quot;contentsTypeCode&quot;:&quot;UM&quot;,&quot;downloadUrl&quot;:&quot;https://org.downloadcenter.samsung.com/downloadfile/ContentsFile.aspx?CDSite=UNI_AU&amp;ModelName=DW60BG750FSL&amp;CttFileID=9483085&quot;,&quot;languageList&quot;:[{&quot;code&quot;:&quot;EN&quot;,&quot;name&quot;:&quot;ENGLISH&quot;}],&quot;areaList&quot;:[{&quot;code&quot;:&quot;AU&quot;}]}]}</li>
  `;

  const resources = extractSamsungPdfResources(html, 'DW60BG750FSL');

  assert.equal(resources.length, 1);
  assert.equal(resources[0].type, 'user_manual');
  assert.equal(resources[0].language, 'EN');
  assert.equal(
    resources[0].url,
    'https://org.downloadcenter.samsung.com/downloadfile/ContentsFile.aspx?CDSite=UNI_AU&ModelName=DW60BG750FSL&CttFileID=9483085'
  );
});

test('Samsung official finder prefers English/AU PDF resources', () => {
  const englishAu = {
    type: 'user_manual',
    language: 'EN',
    areas: ['AU'],
    url: 'https://org.downloadcenter.samsung.com/downloadfile/ContentsFile.aspx?CDSite=UNI_AU&ModelName=WW12BB944DGB'
  };
  const nonEnglish = {
    type: 'user_manual',
    language: 'KO',
    areas: ['KR'],
    url: 'https://org.downloadcenter.samsung.com/downloadfile/ContentsFile.aspx?CDSite=UNI_KR&ModelName=WW12BB944DGB'
  };

  assert.ok(scoreSamsungResource(englishAu) > scoreSamsungResource(nonEnglish));
});

test('Samsung official finder extracts direct images.samsung.com PDF assets from page state', () => {
  const html = `
    <script>
      window.__STATE__ = {"brochure":"https://images.samsung.com/is/content/samsung/assets/nz/ha/guides/fridge/SRF5300BD.pdf"};
    </script>
  `;

  const resources = extractSamsungPdfResources(html, 'SRF5300BD');

  assert.equal(resources[0].type, 'specification_sheet');
  assert.equal(resources[0].url, 'https://images.samsung.com/is/content/samsung/assets/nz/ha/guides/fridge/SRF5300BD.pdf');
});

test('Samsung official finder selects only exact-SKU Australian product pages from the appliance sitemap', () => {
  const sitemap = `
    <urlset>
      <url><loc>https://www.samsung.com/au/washers-and-dryers/washing-machines/example-ww90dg6u3albsa/</loc></url>
      <url><loc>https://www.samsung.com/au/washers-and-dryers/washing-machines/marketing-alias-ww90dg6u34lbsa/</loc></url>
      <url><loc>https://www.samsung.com/nz/washers-and-dryers/washing-machines/example-ww90dg6u3albsa/</loc></url>
    </urlset>
  `;

  assert.deepEqual(extractSamsungProductPageUrls(sitemap, 'WW90DG6U3ALB'), [
    'https://www.samsung.com/au/washers-and-dryers/washing-machines/example-ww90dg6u3albsa/',
  ]);
});

test('Samsung official finder retries the AU support model suffix and returns the best PDF', async () => {
  const calls = [];
  const result = await findSamsungOfficialPdf({ sku: 'DV90BB9440GB' }, {
    fetchImpl: async (url) => {
      calls.push(String(url));
      if (String(url).includes('DV90BB9440GBSA')) {
        return new Response(`
          <li data-sdf-prop="contents">{"manuals":[{"description":"User Manual","englishDescription":"User Manual","fileName":"DC68-04400M-00_IB_B-PJT_DV9400B_SimpleUX_EN_pdf.pdf","contentsTypeCode":"UM","downloadUrl":"https://org.downloadcenter.samsung.com/downloadfile/ContentsFile.aspx?CDSite=UNI_AU&ModelName=DV90BB9440GB&CttFileID=9157242","languageList":[{"code":"EN","name":"ENGLISH"}],"areaList":[{"code":"AU"}]}]}</li>
        `, { status: 200 });
      }
      if (String(url).endsWith('/au/da-sitemap.xml')) {
        return new Response(`
          <urlset><url><loc>https://www.samsung.com/au/washers-and-dryers/dryers/example-dv90bb9440gbsa/</loc></url></urlset>
        `, { status: 200 });
      }
      return new Response('', { status: 404 });
    }
  });

  assert.equal(calls.length, 3);
  assert.equal(result.matchedSku, 'DV90BB9440GBSA');
  assert.equal(result.source, 'samsung-official-user_manual');
  assert.match(result.sourceUrl, /ModelName=DV90BB9440GB/);
  assert.deepEqual(result.productUrls, [
    'https://www.samsung.com/au/washers-and-dryers/dryers/example-dv90bb9440gbsa/',
  ]);
});

test('Samsung finder binds exact AU product-page manuals to stored schema-v2 source lanes', async () => {
  const productUrl = 'https://www.samsung.com/au/refrigerators/french-door/example-srf7500bb-rf59a7670b1-sa/';
  const manualUrl = 'https://org.downloadcenter.samsung.com/downloadfile/ContentsFile.aspx?CDSite=UNI_AU&ModelName=SRF7500BB&CttFileID=11398843&CDCttType=UM&VPath=UM%2FSRF7500BB_EN.pdf';
  const genericTermsUrl = 'https://images.samsung.com/is/content/samsung/assets/in/info/installation/Delivery-Service-TnC.pdf';
  const sitemap = `<urlset><url><loc>${productUrl}</loc></url></urlset>`;
  const productHtml = `<!doctype html><html><head>
    <title>648L French Door Refrigerator SRF7500BB | Samsung AU</title>
    <link rel="canonical" href="${productUrl}">
  </head><body><h1>SRF7500BB</h1>
    <a href="${manualUrl}">User manual</a>
    <a href="${genericTermsUrl}">Delivery service terms</a>
  </body></html>`;
  const writes = [];
  const result = await findSamsungOfficialPdf({
    brand: 'Samsung', sku: 'SRF7500BB', category: 'fridge',
  }, {
    fetchImpl: async (url) => {
      if (String(url).endsWith('/au/da-sitemap.xml')) return new Response(sitemap, { status: 200 });
      if (String(url).startsWith('https://esapi.samsung.com/support/search/suggestdetail/v6')) {
        return new Response(JSON.stringify({
          response: { statusCode: 200, resultData: { resultList: [{ contentList: [] }] } },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (String(url) === productUrl) return new Response(productHtml, { status: 200 });
      return new Response('', { status: 404 });
    },
    writeObject: async (path, bytes) => writes.push([path, Buffer.from(bytes)]),
  });

  assert.equal(result.sourceUrl, manualUrl);
  assert.deepEqual(result.resources.map((resource) => [
    resource.resourceType, resource.sourceLaneId, resource.sourceModelHint,
  ]), [
    ['user_manual', 'official_document_cdn', 'SRF7500BB'],
    ['product_page', 'official_product_detail', 'SRF7500BB'],
  ]);
  assert.equal(result.resources.some((resource) => resource.url === genericTermsUrl), false);
  assert.deepEqual(result.sourceLanes.map((lane) => [
    lane.laneId, lane.required, lane.supported, lane.status, lane.candidateCount,
  ]), [
    ['current_product', true, true, 'complete', 0],
    ['discontinued_archive', false, false, 'unsupported', 0],
    ['support_search_api', true, true, 'complete', 0],
    ['official_document_cdn', true, true, 'complete', 1],
    ['official_product_detail', true, true, 'complete', 1],
  ]);
  assert.equal(result.resources.every((resource) => (
    resource.discoveryProvenance.requestedModel === 'SRF7500BB'
      && resource.discoveryProvenance.matchedModel === 'SRF7500BB'
  )), true);
  assert.equal(writes.length, 3);
  assert.equal(result.sourceLanes.flatMap((lane) => lane.provenance).every((provenance) => (
    writes.some(([path]) => path === provenance.objectPath)
  )), true);
});

test('Samsung finder follows the official support search alias to an archived exact product page', async () => {
  const model = 'SRF7900BFH';
  const modelCode = 'RF59A7F10B1/SA';
  const supportUrl = `https://www.samsung.com/au/support/model/${modelCode}/`;
  const bridgeUrl = `https://www.samsung.com/au/c/p/${modelCode}/`;
  const productUrl = 'https://www.samsung.com/au/refrigerators/french-door/rf7000ac-family-hub-640l-black-rf59a7f10b1-sa/';
  const manualUrl = `https://org.downloadcenter.samsung.com/downloadfile/ContentsFile.aspx?CDSite=UNI_AU&ModelName=${model}&CttFileID=11398848&CDCttType=UM`;
  const searchPayload = {
    response: {
      statusCode: 200,
      resultData: {
        resultList: [{
          contentList: [{ modelCode, modelName: model, linkUrl: `/au/support/model/${modelCode}` }],
        }],
      },
    },
  };
  const supportHtml = `<li data-sdf-prop="modelCode">${modelCode}</li>
    <li data-sdf-prop="modelName">${model}</li>
    <a href="/au/c/p/${modelCode}/#specs">Spec</a>`;
  const productHtml = `<!doctype html><html><head><title>${model}</title>
    <link rel="canonical" href="${productUrl}"></head><body>
    <input id="modelCode" value="${modelCode}"><input id="modelName" value="${model}">
    <a href="${manualUrl}">User Manual</a></body></html>`;
  const writes = [];
  const result = await findSamsungOfficialPdf({ brand: 'Samsung', model, category: 'fridge' }, {
    fetchImpl: async (url) => {
      const value = String(url);
      if (value.endsWith('/au/da-sitemap.xml')) {
        return new Response('<urlset></urlset>', { status: 200 });
      }
      if (value.startsWith('https://esapi.samsung.com/support/search/suggestdetail/v6')) {
        return new Response(JSON.stringify(searchPayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (value === supportUrl) return new Response(supportHtml, { status: 200 });
      if (value === bridgeUrl) {
        return {
          ok: true,
          status: 200,
          url: productUrl,
          arrayBuffer: async () => Buffer.from(productHtml),
        };
      }
      return new Response('', { status: 404 });
    },
    writeObject: async (path, bytes) => writes.push([path, Buffer.from(bytes)]),
  });

  assert.equal(result.sourceUrl, manualUrl);
  assert.deepEqual(result.productUrls, [productUrl]);
  assert.deepEqual(result.resources.map((resource) => resource.sourceLaneId), [
    'official_document_cdn',
    'official_product_detail',
  ]);
  assert.deepEqual(result.sourceLanes.filter((lane) => lane.required).map((lane) => [
    lane.laneId, lane.supported, lane.status,
  ]), [
    ['current_product', true, 'complete'],
    ['support_search_api', true, 'complete'],
    ['official_document_cdn', true, 'complete'],
    ['official_product_detail', true, 'complete'],
  ]);
  assert.equal(writes.length, 4);
});

test('Samsung finder materializes exact support-page manuals without requiring a product-page bridge', async () => {
  const model = 'SRF9700BFH';
  const modelCode = 'RF71A9770B1/SA';
  const supportUrl = `https://www.samsung.com/au/support/model/${modelCode}/`;
  const manualUrl = `https://org.downloadcenter.samsung.com/downloadfile/ContentsFile.aspx?CDSite=UNI_AU&ModelName=${model}&CttFileID=8134461&CDCttType=UM&VPath=UM%2F${model}_EN.pdf`;
  const searchPayload = {
    response: {
      statusCode: 200,
      resultData: {
        resultList: [{
          contentList: [{ modelCode, modelName: model, linkUrl: `/au/support/model/${modelCode}` }],
        }],
      },
    },
  };
  const supportHtml = `<html><head><title>${model} | Samsung Support Australia</title></head><body>
    <li data-sdf-prop="modelCode">${modelCode}</li>
    <li data-sdf-prop="modelName">${model}</li>
    <li data-sdf-prop="contents">${JSON.stringify({
      manuals: [{
        description: 'User Manual',
        englishDescription: 'User Manual',
        fileName: `${model}_EN.pdf`,
        contentsTypeCode: 'UM',
        downloadUrl: manualUrl,
        languageList: [{ code: 'EN', name: 'ENGLISH' }],
        areaList: [{ code: 'AU' }],
      }],
    })}</li>
  </body></html>`;
  const writes = [];
  const result = await findSamsungOfficialPdf({ brand: 'Samsung', model, category: 'fridge' }, {
    fetchImpl: async (url) => {
      const value = String(url);
      if (value.endsWith('/au/da-sitemap.xml')) return new Response('<urlset></urlset>', { status: 200 });
      if (value.startsWith('https://esapi.samsung.com/support/search/suggestdetail/v6')) {
        return new Response(JSON.stringify(searchPayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (value === supportUrl) return new Response(supportHtml, { status: 200 });
      return new Response('', { status: 404 });
    },
    writeObject: async (path, bytes) => writes.push([path, Buffer.from(bytes)]),
  });

  assert.equal(result.sourceUrl, manualUrl);
  assert.deepEqual(result.productUrls, []);
  assert.deepEqual(result.resources.map((resource) => [
    resource.sourceLaneId, resource.resourceType, resource.sourceModelHint,
  ]), [['official_document_cdn', 'user_manual', model]]);
  assert.deepEqual(result.sourceLanes.filter((lane) => lane.required).map((lane) => [
    lane.laneId, lane.status, lane.candidateCount,
  ]), [
    ['current_product', 'complete', 0],
    ['support_search_api', 'complete', 0],
    ['official_document_cdn', 'complete', 1],
    ['official_product_detail', 'complete', 0],
  ]);
  assert.equal(result.resources[0].discoveryProvenance.discoveryUrl, supportUrl);
  assert.equal(writes.length, 3);
});

test('Samsung finder records exhaustive current-site zero without inventing an AU suffix alias', async () => {
  const sitemap = '<urlset><url><loc>https://www.samsung.com/au/refrigerators/example-srf7500bbsa2/</loc></url></urlset>';
  const writes = [];
  const result = await findSamsungOfficialPdf({ sku: 'SRF7500BB' }, {
    fetchImpl: async (url) => {
      if (String(url).endsWith('/au/da-sitemap.xml')) return new Response(sitemap, { status: 200 });
      if (String(url).startsWith('https://esapi.samsung.com/support/search/suggestdetail/v6')) {
        return new Response(JSON.stringify({
          response: { statusCode: 200, resultData: { resultList: [{ contentList: [] }] } },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('', { status: 404 });
    },
    writeObject: async (path, bytes) => writes.push([path, Buffer.from(bytes)]),
  });

  assert.equal(result.sourceUrl, null);
  assert.deepEqual(result.resources, []);
  assert.deepEqual(result.productUrls, []);
  assert.equal(result.matchedSku, 'SRF7500BB');
  assert.equal(result.sourceLanes
    .filter((lane) => lane.required)
    .every((lane) => lane.status === 'complete'), true);
  assert.equal(writes.length, 2);
});
