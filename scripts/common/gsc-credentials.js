'use strict';

const MISSING_CREDENTIALS_MESSAGE = 'GSC credentials not configured. Set GSC_SA_EMAIL+GSC_SA_PRIVATE_KEY+GSC_SA_PROJECT_ID (preferred) or legacy GSC_SA_JSON.';

function present(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizePrivateKey(value) {
  return String(value ?? '').replace(/\\n/g, '\n');
}

function compactCredentials(credentials) {
  return {
    client_email: String(credentials.client_email).trim(),
    private_key: normalizePrivateKey(credentials.private_key),
    project_id: String(credentials.project_id).trim()
  };
}

function parseLegacyGscServiceAccountJson(raw) {
  if (!present(raw)) {
    throw new Error(MISSING_CREDENTIALS_MESSAGE);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`GSC_SA_JSON is not valid JSON: ${error.message}`);
  }

  for (const field of ['client_email', 'private_key', 'project_id']) {
    if (!present(parsed?.[field])) {
      throw new Error(`GSC_SA_JSON missing required service account field: ${field}`);
    }
  }

  return compactCredentials(parsed);
}

function hasCompleteSplitCredentials(env) {
  return present(env?.GSC_SA_EMAIL)
    && present(env?.GSC_SA_PRIVATE_KEY)
    && present(env?.GSC_SA_PROJECT_ID);
}

function loadGscCredentials({ env = process.env } = {}) {
  if (hasCompleteSplitCredentials(env)) {
    return compactCredentials({
      client_email: env.GSC_SA_EMAIL,
      private_key: env.GSC_SA_PRIVATE_KEY,
      project_id: env.GSC_SA_PROJECT_ID
    });
  }

  if (present(env?.GSC_SA_JSON)) {
    return parseLegacyGscServiceAccountJson(env.GSC_SA_JSON);
  }

  throw new Error(MISSING_CREDENTIALS_MESSAGE);
}

module.exports = {
  MISSING_CREDENTIALS_MESSAGE,
  loadGscCredentials,
  normalizePrivateKey,
  parseLegacyGscServiceAccountJson
};
