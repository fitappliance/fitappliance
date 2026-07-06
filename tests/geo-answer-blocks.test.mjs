import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  renderAnswerTarget,
  renderEvidenceBox,
  visibleTextFromGeoBlock
} = require('../scripts/common/geo-answer-blocks.js');

test('geo answer blocks render visible escaped content', () => {
  const html = renderAnswerTarget({
    question: 'Will a 600mm dishwasher fit a 600mm cavity?',
    answer: 'Usually no. Measure the real opening and allow service space.'
  });

  assert.match(html, /class="geo-answer-target"/);
  assert.match(html, /Will a 600mm dishwasher fit/);
  assert.doesNotMatch(html, /display:\s*none|hidden/i);
  assert.equal(
    visibleTextFromGeoBlock(html),
    'Will a 600mm dishwasher fit a 600mm cavity? Usually no. Measure the real opening and allow service space.'
  );
});

test('geo answer blocks escape unsafe text and optional caveat', () => {
  const html = renderAnswerTarget({
    question: 'Can <script>alert(1)</script> fit?',
    answer: 'Use width & depth.',
    caveat: 'Check "finished" opening before purchase.'
  });

  assert.match(html, /Can &lt;script&gt;alert\(1\)&lt;\/script&gt; fit\?/);
  assert.match(html, /Use width &amp; depth\./);
  assert.match(html, /Check &quot;finished&quot; opening/);
  assert.doesNotMatch(html, /<script>alert/);
});

test('geo evidence box links to visible source pages without schema-only claims', () => {
  const html = renderEvidenceBox({
    title: 'Evidence used',
    items: [
      { label: 'FitAppliance guide', href: '/guides/dishwasher-cavity-sizing', detail: 'Visible buyer guide' }
    ]
  });

  assert.match(html, /class="geo-evidence-box"/);
  assert.match(html, /Evidence used/);
  assert.match(html, /href="\/guides\/dishwasher-cavity-sizing"/);
  assert.match(html, /Visible buyer guide/);
  assert.doesNotMatch(html, /application\/ld\+json|display:\s*none|hidden/i);
});

test('geo evidence box drops invalid evidence rows instead of rendering empty links', () => {
  const html = renderEvidenceBox({
    title: 'Evidence used',
    items: [
      { label: 'Missing href' },
      { href: '/guides/fridge-clearance' },
      { label: 'Fridge clearance', href: '/guides/fridge-clearance' }
    ]
  });

  assert.equal((html.match(/<li/g) ?? []).length, 1);
  assert.match(html, /Fridge clearance/);
});
