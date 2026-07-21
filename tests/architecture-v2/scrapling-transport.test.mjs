import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import test from 'node:test';

import { fetchViaScraplingDynamic } from '../../src/domain/scrapling-transport.mjs';

test('dynamic Scrapling transport waits for target content without requiring network idle', async () => {
  let invocation = null;
  const html = '<html><a href="/sfc/p/example">Download</a></html>';
  const result = await fetchViaScraplingDynamic('https://support.haier.com.au/article', {
    pythonBinary: '/test/python',
    networkIdle: false,
    waitSelector: 'a[href*="/sfc/p/"]',
    waitMs: 250,
    execFileImpl: async (binary, args) => {
      invocation = { binary, args };
      await writeFile(args[3], html);
      await writeFile(args[4], JSON.stringify({
        status: 200,
        finalUrl: 'https://support.haier.com.au/article',
        contentType: 'text/html',
        byteSize: Buffer.byteLength(html),
      }));
    },
  });

  assert.equal(invocation.binary, '/test/python');
  assert.equal(invocation.args[7], 'false');
  assert.equal(invocation.args[8], 'a[href*="/sfc/p/"]');
  assert.equal(result.bytes.toString('utf8'), html);
});
