import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  loadGscCredentials
} = require('../scripts/common/gsc-credentials.js');

function makeLegacyJson(overrides = {}) {
  return JSON.stringify({
    client_email: 'legacy-gsc@fitappliance.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----\\nLEGACY\\n-----END PRIVATE KEY-----\\n',
    project_id: 'legacy-project',
    ...overrides
  });
}

test('phase 43a gsc credentials: independent secrets take priority over legacy json', () => {
  const credentials = loadGscCredentials({
    env: {
      GSC_SA_EMAIL: 'split-gsc@fitappliance.iam.gserviceaccount.com',
      GSC_SA_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nSPLIT\\n-----END PRIVATE KEY-----\\n',
      GSC_SA_PROJECT_ID: 'split-project',
      GSC_SA_JSON: makeLegacyJson()
    }
  });

  assert.deepEqual(credentials, {
    client_email: 'split-gsc@fitappliance.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----\nSPLIT\n-----END PRIVATE KEY-----\n',
    project_id: 'split-project'
  });
});

test('phase 43a gsc credentials: incomplete split secrets fall back to legacy json', () => {
  const credentials = loadGscCredentials({
    env: {
      GSC_SA_EMAIL: 'split-gsc@fitappliance.iam.gserviceaccount.com',
      GSC_SA_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nSPLIT\\n-----END PRIVATE KEY-----\\n',
      GSC_SA_JSON: makeLegacyJson()
    }
  });

  assert.equal(credentials.client_email, 'legacy-gsc@fitappliance.iam.gserviceaccount.com');
  assert.equal(credentials.project_id, 'legacy-project');
});

test('phase 43a gsc credentials: missing credentials throw actionable setup guidance', () => {
  assert.throws(
    () => loadGscCredentials({ env: {} }),
    /GSC credentials not configured.*GSC_SA_EMAIL\+GSC_SA_PRIVATE_KEY\+GSC_SA_PROJECT_ID.*GSC_SA_JSON/i
  );
});

test('phase 43a gsc credentials: escaped private key newlines are restored', () => {
  const credentials = loadGscCredentials({
    env: {
      GSC_SA_EMAIL: 'split-gsc@fitappliance.iam.gserviceaccount.com',
      GSC_SA_PRIVATE_KEY: 'line-one\\nline-two\\n',
      GSC_SA_PROJECT_ID: 'split-project'
    }
  });

  assert.equal(credentials.private_key, 'line-one\nline-two\n');
});

test('phase 43a gsc credentials: literal private key newlines are preserved', () => {
  const credentials = loadGscCredentials({
    env: {
      GSC_SA_EMAIL: 'split-gsc@fitappliance.iam.gserviceaccount.com',
      GSC_SA_PRIVATE_KEY: 'line-one\nline-two\n',
      GSC_SA_PROJECT_ID: 'split-project'
    }
  });

  assert.equal(credentials.private_key, 'line-one\nline-two\n');
});

test('phase 43a gsc credentials: empty env values are treated as absent', () => {
  const credentials = loadGscCredentials({
    env: {
      GSC_SA_EMAIL: '   ',
      GSC_SA_PRIVATE_KEY: '',
      GSC_SA_PROJECT_ID: 'split-project',
      GSC_SA_JSON: makeLegacyJson()
    }
  });

  assert.equal(credentials.client_email, 'legacy-gsc@fitappliance.iam.gserviceaccount.com');
});
