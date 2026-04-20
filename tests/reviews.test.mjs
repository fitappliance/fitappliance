import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  validateAndFilterReviews,
  buildYouTubeWatchUrl
} = require('../scripts/validate-reviews.js');
const {
  buildReviewVideoSection,
  selectDisclaimerTemplate
} = require('../scripts/common/review-video-renderer.js');
const {
  auditReviewContentHtml
} = require('../scripts/audit-review-content.js');
const {
  buildBrandPageHtml
} = require('../scripts/generate-brand-pages.js');
const {
  buildPageHtml
} = require('../scripts/generate-cavity-pages.js');

function makeWhitelist() {
  return {
    creators: [
      {
        id: 'choice-au',
        displayName: 'CHOICE Australia',
        channelId: 'UCCHOICEAU01',
        channelUrl: 'https://www.youtube.com/@choiceaustralia',
        trustTier: 'A'
      },
      {
        id: 'appliances-online',
        displayName: 'Appliances Online',
        channelId: 'UCAOONLINE01',
        channelUrl: 'https://www.youtube.com/@appliancesonline',
        trustTier: 'B'
      },
      {
        id: 'samsung-au',
        displayName: 'Samsung Australia',
        channelId: 'UCSAMSUNGAU1',
        channelUrl: 'https://www.youtube.com/@samsungaustralia',
        trustTier: 'M'
      }
    ]
  };
}

function makeDisclaimerCopy() {
  return {
    tierA: 'Third-party review by {creator}. FitAppliance did not produce or endorse this video. Clearance figures on this page come from the manufacturer install manual.',
    tierB: 'Review by {creator}, a retailer. FitAppliance does not receive payment for this embed. Clearance figures remain independent.',
    tierM: 'This is a {creator} brand video, not an independent review. Use it for feature orientation only; clearance data below comes from the install manual.'
  };
}

function makeReview(overrides = {}) {
  return {
    modelSlug: 'samsung-srf7500wfh',
    youtubeId: 'dQw4w9WgXcQ',
    creatorId: 'choice-au',
    title: 'CHOICE review: Samsung SRF7500WFH',
    publishedAt: '2025-08-10',
    durationSec: 487,
    timestamps: [
      { t: 42, label: 'Dimensions and fit' },
      { t: 180, label: 'Noise test' },
      { t: 310, label: 'Energy score' }
    ],
    ...overrides
  };
}

test('phase 41 reviews: embed-disabled oEmbed responses do not produce validatedAt entries', async () => {
  const result = await validateAndFilterReviews({
    reviewEntries: [makeReview()],
    whitelistDocument: makeWhitelist(),
    now: new Date('2026-04-20T00:00:00.000Z'),
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        title: 'CHOICE review: Samsung SRF7500WFH',
        author_name: 'CHOICE Australia',
        author_url: 'https://www.youtube.com/@choiceaustralia',
        thumbnail_url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
        provider_name: 'YouTube'
      })
    })
  });

  assert.equal(result.valid.length, 0);
  assert.equal(result.invalid.length, 1);
  assert.match(result.invalid[0].reason, /embed/i);
});

test('phase 41 reviews: whitelist mismatch rejects the review entry', async () => {
  const result = await validateAndFilterReviews({
    reviewEntries: [makeReview({ creatorId: 'appliances-online' })],
    whitelistDocument: makeWhitelist(),
    now: new Date('2026-04-20T00:00:00.000Z'),
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        title: 'CHOICE review: Samsung SRF7500WFH',
        author_name: 'Completely Different Creator',
        author_url: 'https://www.youtube.com/@differentcreator',
        thumbnail_url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
        provider_name: 'YouTube',
        html: '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>'
      })
    })
  });

  assert.equal(result.valid.length, 0);
  assert.equal(result.invalid.length, 1);
  assert.match(result.invalid[0].reason, /author_name|whitelist|creator/i);
});

test('phase 41 reviews: non-pilot model slug does not render the review section', () => {
  const html = buildReviewVideoSection({
    modelSlug: 'hisense-hr6bmff573sw',
    reviews: [makeReview()],
    whitelistDocument: makeWhitelist(),
    disclaimerCopy: makeDisclaimerCopy(),
    pilotSlugs: ['samsung-srf7500wfh']
  });

  assert.equal(html, '');
});

test('phase 41 reviews: pages under 300 original words fail the review content audit', () => {
  const html = `
    <main>
      <h1>Samsung Fridge Clearance Requirements</h1>
      <p>This page mentions 50mm side clearance and 50mm rear clearance.</p>
      <p>Fit summary: this cavity works for the featured model.</p>
      <section id="review-videos"><h2>Independent reviews</h2></section>
    </main>
  `;

  const result = auditReviewContentHtml({
    html,
    pagePath: 'pages/brands/samsung-fridge-clearance.html',
    expectedClearance: { side: 50, rear: 50, top: 100 }
  });

  assert.equal(result.passed, false);
  assert.ok(result.wordCount < 300);
  assert.match(result.issues.join(' '), /300|word/i);
});

test('phase 41 reviews: disclaimer templates map correctly to trust tiers A, B, and M', () => {
  const whitelist = makeWhitelist();
  const copy = makeDisclaimerCopy();

  assert.match(selectDisclaimerTemplate({
    creator: whitelist.creators[0],
    disclaimerCopy: copy
  }), /Third-party review by CHOICE Australia/);

  assert.match(selectDisclaimerTemplate({
    creator: whitelist.creators[1],
    disclaimerCopy: copy
  }), /retailer/i);

  assert.match(selectDisclaimerTemplate({
    creator: whitelist.creators[2],
    disclaimerCopy: copy
  }), /brand video/i);
});

test('phase 41 reviews: VideoObject schema includes contentUrl, thumbnailUrl, duration, and nocookie embed', () => {
  const html = buildReviewVideoSection({
    modelSlug: 'samsung-srf7500wfh',
    reviews: [
      {
        ...makeReview(),
        validatedAt: '2026-04-20',
        oembed: {
          title: 'CHOICE review: Samsung SRF7500WFH',
          author_name: 'CHOICE Australia',
          author_url: 'https://www.youtube.com/@choiceaustralia',
          thumbnail_url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
          provider_name: 'YouTube',
          html: '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>'
        }
      }
    ],
    whitelistDocument: makeWhitelist(),
    disclaimerCopy: makeDisclaimerCopy(),
    pilotSlugs: ['samsung-srf7500wfh']
  });

  assert.match(html, /"@type":"VideoObject"/);
  assert.match(html, /"contentUrl":"https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ"/);
  assert.match(html, /"thumbnailUrl":"https:\/\/i\.ytimg\.com\/vi\/dQw4w9WgXcQ\/hqdefault\.jpg"/);
  assert.match(html, /"duration":"PT8M7S"/);
  assert.match(html, /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
  assert.match(html, /data-youtube-id="dQw4w9WgXcQ"/);
});

test('phase 41 reviews: buildYouTubeWatchUrl converts an id to a canonical watch URL', () => {
  assert.equal(
    buildYouTubeWatchUrl('dQw4w9WgXcQ'),
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
  );
});

test('phase 41 reviews: brand pages stay byte-stable when no pilot review section is rendered', () => {
  const html = buildBrandPageHtml({
    brand: 'Bosch',
    brandRaw: 'Bosch',
    category: 'fridge',
    count: 4,
    side: 20,
    rear: 50,
    top: 20,
    slug: 'bosch-fridge-clearance',
    defaultSide: 20,
    defaultRear: 50,
    defaultTop: 20,
    modelSamples: [
      { model: 'KGN396LBAS', w: 600, h: 1860, d: 665 }
    ],
    itemListProducts: [
      { model: 'KGN396LBAS', w: 600, h: 1860, d: 665 }
    ],
    relatedCompares: [],
    sameBrandAlternatives: [],
    introText: 'Bosch fridge intro.',
    installTipsCopy: {
      defaults: { fridge: ['Check the cavity once before delivery.'] },
      overrides: {}
    },
    organizationJsonLd: '{}',
    modifiedTime: '2026-04-20T00:00:00.000Z'
  });

  assert.doesNotMatch(html, /<\/section>\n\s*\n\s*\n\s*<a class="cta"/);
});

test('phase 41 reviews: cavity pages stay byte-stable when no pilot review section is rendered', () => {
  const html = buildPageHtml({
    width: 650,
    cavityHeightMm: 1800,
    cavityDepthMm: 700,
    resultCount: 2,
    introText: 'Two fridges fit this 650mm cavity.',
    featured: [
      { brand: 'Bosch', model: 'KGN396LBAS', w: 600, h: 1860, d: 665, stars: 4, kwh_year: 250 }
    ],
    adjacentWidths: { previous: 640, next: 660 },
    relatedWidths: [640, 660],
    topBrands: [{ brand: 'Bosch', count: 2 }],
    compareLinks: [],
    modifiedTime: '2026-04-20T00:00:00.000Z',
    measurementSvgHtml: '<div class="measurement-svg"></div>',
    measurementStepsHtml: '<div class="measurement-steps"></div>',
    howToJsonLd: { '@context': 'https://schema.org', '@type': 'HowTo', step: [] }
  });

  assert.match(html, /<\/div>\n\s*\n\s*<section id="measure">/);
  assert.doesNotMatch(html, /<\/div>\n\s*\n\s*\n\s*<section id="measure">/);
});
