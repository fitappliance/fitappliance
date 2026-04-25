import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

const ROOT = process.cwd();
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const dom = new JSDOM(html);
const document = dom.window.document;

const DIMENSION_INPUTS = [
  { id: 'inW', label: 'Width millimeters' },
  { id: 'inH', label: 'Height millimeters' },
  { id: 'inD', label: 'Depth millimeters' }
];

function getAccessibleLabel(input) {
  const ariaLabel = input.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel;
  const explicitLabel = document.querySelector(`label[for="${input.id}"]`);
  return explicitLabel?.textContent?.trim() ?? '';
}

test('phase 43a p2: fit checker dimension inputs expose accessible labels', () => {
  for (const row of DIMENSION_INPUTS) {
    const input = document.getElementById(row.id);
    assert.ok(input, `${row.id} input should exist`);

    const accessibleLabel = getAccessibleLabel(input);
    assert.match(
      accessibleLabel,
      new RegExp(row.label.replace(/\s+/g, '.*'), 'i'),
      `${row.id} should expose ${row.label} to assistive tech`
    );
  }
});

test('phase 43a p2: fit checker dimension labels are explicitly associated with inputs', () => {
  for (const row of DIMENSION_INPUTS) {
    const input = document.getElementById(row.id);
    const label = document.querySelector(`label[for="${row.id}"]`);

    assert.ok(input, `${row.id} input should exist`);
    assert.ok(label, `${row.id} should have an explicit label[for] association`);
  }
});
