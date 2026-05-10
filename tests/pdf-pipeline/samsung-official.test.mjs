import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSamsungSupportModelVariants,
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
      return new Response('', { status: 404 });
    }
  });

  assert.equal(calls.length, 2);
  assert.equal(result.matchedSku, 'DV90BB9440GBSA');
  assert.equal(result.source, 'samsung-official-user_manual');
  assert.match(result.sourceUrl, /ModelName=DV90BB9440GB/);
});
