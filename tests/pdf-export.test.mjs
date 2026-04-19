import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptPath = path.join(repoRoot, 'public', 'scripts', 'pdf-export.js');
const require = createRequire(import.meta.url);
const pdfExport = require(scriptPath);

test('phase 29 pdf: script stays below 30KB gzip', () => {
  const source = fs.readFileSync(scriptPath, 'utf8');
  const gzipped = zlib.gzipSync(source);
  assert.ok(gzipped.length < 30 * 1024, `expected <30KB gzip, got ${gzipped.length} bytes`);
});

test('phase 29 pdf: script does not use outbound fetch or XMLHttpRequest', () => {
  const source = fs.readFileSync(scriptPath, 'utf8');
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /XMLHttpRequest/);
});

test('phase 29 pdf: download button click generates blob and object URL', async () => {
  const dom = new JSDOM(`<!doctype html><html><body>
    <main>
      <h1>Fridges that fit a 600mm cavity</h1>
      <p id="quick-answer">Sample shortlist text.</p>
      <section id="measure">
        <details open><summary>1. Step</summary><p>Measure width.</p></details>
      </section>
      <button class="btn-pdf-export" data-cavity-slug="600mm-fridge" data-cavity-width="600" data-cavity-height="1800" data-cavity-depth="700">Download PDF</button>
    </main>
  </body></html>`, { url: 'https://fitappliance.com.au/cavity/600mm-fridge' });

  let objectUrlCalls = 0;
  dom.window.URL.createObjectURL = () => {
    objectUrlCalls += 1;
    return 'blob:fitappliance-test';
  };
  dom.window.URL.revokeObjectURL = () => {};

  pdfExport.attachPdfButtons({
    documentRef: dom.window.document,
    windowRef: dom.window,
    BlobRef: Blob
  });

  const button = dom.window.document.querySelector('.btn-pdf-export');
  button.click();
  assert.equal(objectUrlCalls, 1);
});

test('phase 29 pdf: download filename is legal and deterministic for cavity slug', () => {
  const filename = pdfExport.buildDownloadFilename('600mm-fridge');
  assert.equal(filename, 'fitappliance-600mm-fridge.pdf');
  assert.match(filename, /^[a-z0-9-]+\.pdf$/);
});

test('phase 29 pdf: all cavity pages include static Download PDF button', () => {
  const cavityRoot = path.join(repoRoot, 'pages', 'cavity');
  const files = fs.readdirSync(cavityRoot).filter((name) => name.endsWith('.html'));
  for (const file of files) {
    const html = fs.readFileSync(path.join(cavityRoot, file), 'utf8');
    assert.match(html, /class="btn-pdf-export"/, `${file} should include static PDF button`);
    assert.match(html, /data-cavity-slug="/, `${file} should include cavity slug data attribute`);
  }
});
