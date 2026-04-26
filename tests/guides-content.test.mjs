import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const GUIDES_DIR = path.join(ROOT, 'pages', 'guides');
const GUIDE_EXPECTATIONS = {
  'fridge-clearance-requirements.html': 'How much clearance does my fridge actually need? An Australian buyer&#39;s guide',
  'dishwasher-cavity-sizing.html': 'Built-in dishwasher cavity sizing: the 600mm trap',
  'dryer-ventilation-guide.html': 'Vented vs heat pump vs condenser: matching the dryer to your laundry',
  'washing-machine-doorway-access.html': 'Will your new washing machine fit through the doorway?',
  'appliance-fit-sizing-handbook.html': 'The complete handbook to measuring for new appliances'
};

const RED_CLAIM_PHRASES = [
  'State rebates',
  'VEU & ESS rebates calculated',
  'Government Rebates',
  'applicable government rebates',
  'Government rebate eligibility checker',
  'What government rebates are available',
  'Calculates VIC/NSW rebates',
  'ACCC-compliant',
  'GEMS-verified energy ratings',
  'Prices are updated weekly',
  'We update prices weekly'
];

const FILLER_PHRASES = [
  'leverage',
  'synergy',
  'cutting-edge',
  'best-in-class',
  'passionate',
  'dedicated',
  'robust',
  'comprehensive solution'
];

function readGuide(fileName) {
  return fs.readFileSync(path.join(GUIDES_DIR, fileName), 'utf8');
}

function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordCount(html) {
  const text = visibleText(html);
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

function extractJsonLd(html) {
  const blocks = [...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  return blocks.map((match) => JSON.parse(match[1]));
}

function extractSvgs(html) {
  return [...html.matchAll(/<svg\b[\s\S]*?<\/svg>/gi)].map((match) => match[0]);
}

function linkedResourceCount(html) {
  const match = html.match(/<h2 class="section-title-lg section-title-lg--flush">Linked Resources<\/h2>[\s\S]*?<p class="meta">/);
  if (!match) return 0;
  return (match[0].match(/<a\b/g) ?? []).length;
}

test('phase 47 guides: all five guide pages are deep original articles', () => {
  for (const fileName of Object.keys(GUIDE_EXPECTATIONS)) {
    const html = readGuide(fileName);
    const count = wordCount(html);
    assert.ok(count >= 1500, `${fileName} should have >=1500 words; got ${count}`);
    assert.ok(count <= 2500, `${fileName} should stay <=2500 words; got ${count}`);
    assert.ok((html.match(/<h2\b/gi) ?? []).length >= 6, `${fileName} should have at least 6 h2 sections`);
  }
});

test('phase 47 guides: visible h1 copy matches the deeper buyer-guide positioning', () => {
  for (const [fileName, expectedH1] of Object.entries(GUIDE_EXPECTATIONS)) {
    const html = readGuide(fileName);
    assert.match(html, new RegExp(`<h1>${expectedH1}</h1>`), `${fileName} h1 mismatch`);
  }
});

test('phase 47 guides: every guide includes compact inline SVG figures with captions', () => {
  for (const fileName of Object.keys(GUIDE_EXPECTATIONS)) {
    const html = readGuide(fileName);
    const svgs = extractSvgs(html);
    assert.ok(svgs.length >= 1, `${fileName} should include at least one inline SVG`);
    assert.ok((html.match(/<figcaption>/g) ?? []).length >= svgs.length, `${fileName} should caption each SVG`);
    for (const svg of svgs) {
      assert.match(svg, /viewBox="0 0 400 300"/, `${fileName} SVG should use the standard viewBox`);
      assert.ok(Buffer.byteLength(svg, 'utf8') < 800, `${fileName} SVG should stay under 800 bytes`);
    }
  }
});

test('phase 47 guides: Article schema remains valid and records matching wordCount', () => {
  for (const fileName of Object.keys(GUIDE_EXPECTATIONS)) {
    const html = readGuide(fileName);
    const [schema] = extractJsonLd(html);
    assert.equal(schema['@context'], 'https://schema.org', `${fileName} schema context mismatch`);
    assert.equal(schema['@type'], 'Article', `${fileName} schema type mismatch`);
    assert.ok(schema.datePublished, `${fileName} datePublished missing`);
    assert.ok(schema.dateModified, `${fileName} dateModified missing`);
    assert.equal(schema.wordCount, wordCount(html), `${fileName} schema wordCount should match visible text`);
  }
});

test('phase 47 guides: copy avoids red claims and filler phrases', () => {
  for (const fileName of Object.keys(GUIDE_EXPECTATIONS)) {
    const text = visibleText(readGuide(fileName));
    for (const phrase of RED_CLAIM_PHRASES) {
      assert.equal(text.includes(phrase), false, `${fileName} reintroduced red claim: ${phrase}`);
    }
    for (const phrase of FILLER_PHRASES) {
      assert.equal(new RegExp(`\\b${phrase}\\b`, 'i').test(text), false, `${fileName} contains filler phrase: ${phrase}`);
    }
  }
});

test('phase 47 guides: each guide contains concrete numbers and a practical scenario', () => {
  for (const fileName of Object.keys(GUIDE_EXPECTATIONS)) {
    const text = visibleText(readGuide(fileName));
    const numbers = text.match(/\b\d+(?:,\d{3})*(?:\.\d+)?\b/g) ?? [];
    assert.ok(numbers.length >= 3, `${fileName} should include at least three concrete numbers`);
    assert.match(text, /When |If |Imagine |On delivery day|Before you buy/i, `${fileName} needs a practical scenario`);
  }
});

test('phase 47 guides: every guide includes a checklist and a sizing reference table', () => {
  for (const fileName of Object.keys(GUIDE_EXPECTATIONS)) {
    const html = readGuide(fileName);
    assert.match(html, /class="guide-checklist"/, `${fileName} should include a practical checklist`);
    assert.match(html, /class="guide-table"/, `${fileName} should include a sizing reference table`);
  }
});

test('phase 47 guides: fridge guide includes separate cavity and door-swing diagrams', () => {
  const html = readGuide('fridge-clearance-requirements.html');
  assert.ok(extractSvgs(html).length >= 2, 'fridge guide should include at least two SVG diagrams');
  assert.match(html, /cavity clearance/i, 'fridge guide should label the cavity diagram');
  assert.match(html, /door swing/i, 'fridge guide should label the door swing diagram');
});

test('phase 47 guides: guide-specific factual anchors are present', () => {
  const expectations = {
    'fridge-clearance-requirements.html': [/Samsung/i, /100 mm/i, /Haier/i, /25\.4 mm/i],
    'dishwasher-cavity-sizing.html': [/600 mm/i, /450 mm/i, /plumbing/i, /electrical/i],
    'dryer-ventilation-guide.html': [/vented/i, /heat pump/i, /condenser/i, /stacking/i],
    'washing-machine-doorway-access.html': [/doorway/i, /trolley/i, /lift/i, /stair/i],
    'appliance-fit-sizing-handbook.html': [/2,170/i, /four categories/i, /FitAppliance/i, /5 mm/i]
  };

  for (const [fileName, patterns] of Object.entries(expectations)) {
    const text = visibleText(readGuide(fileName));
    for (const pattern of patterns) {
      assert.match(text, pattern, `${fileName} missing factual anchor ${pattern}`);
    }
  }
});

test('phase 47 guides: deep guides keep enough linked resources for discovery', () => {
  for (const fileName of Object.keys(GUIDE_EXPECTATIONS)) {
    const html = readGuide(fileName);
    assert.ok(linkedResourceCount(html) >= 30, `${fileName} should keep at least 30 linked resources`);
  }
});
