#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { readFile } = require('node:fs/promises');

const PRODUCT_PLACEHOLDERS = new Set(['asin', 'sku']);
const PROVIDER_FIELD_MAP = {
  'amazon-au': ['amazonAU', 'asin'],
  'appliances-online': ['appliancesOnline', 'sku'],
  'the-good-guys': ['theGoodGuys', 'sku']
};

function escHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    '\'': '&#39;'
  }[char]));
}

function getProductPlaceholderValue(product, providerSlug, token) {
  const providerField = PROVIDER_FIELD_MAP[providerSlug];
  if (!providerField) return null;
  const [providerKey, idKey] = providerField;
  if (token !== idKey) return null;
  const value = product?.affiliate?.[providerKey]?.[idKey];
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.trim();
}

function buildAffiliateUrl({ provider, product, env = process.env } = {}) {
  if (!provider || typeof provider.linkTemplate !== 'string') return null;
  const template = provider.linkTemplate;
  const placeholders = [...template.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((row) => row[1]);
  if (placeholders.length === 0) return template;

  let url = template;
  for (const key of placeholders) {
    let value = null;
    if (PRODUCT_PLACEHOLDERS.has(key)) {
      value = getProductPlaceholderValue(product, provider.slug, key);
    } else {
      const envValue = env?.[key];
      value = typeof envValue === 'string' ? envValue.trim() : '';
      if (!value) value = null;
    }

    if (!value) return null;
    url = url.replaceAll(`{${key}}`, encodeURIComponent(value));
  }

  if (!/^https?:\/\//i.test(url)) return null;
  return url;
}

function resolveAffiliateLinkForProduct(product, { providers = [], env = process.env } = {}) {
  for (const provider of providers) {
    const url = buildAffiliateUrl({ provider, product, env });
    if (!url) continue;
    return {
      providerSlug: provider.slug,
      providerName: provider.name,
      url,
      disclosureText: provider.disclosureText
    };
  }
  return null;
}

function renderAffiliateCta(
  product,
  {
    providers = [],
    env = process.env,
    className = 'affiliate-cta',
    buttonClassName = 'affiliate-buy-link',
    disclosureClassName = 'affiliate-disclosure'
  } = {}
) {
  const row = resolveAffiliateLinkForProduct(product, { providers, env });
  if (!row) return '';

  const disclosure = row.disclosureText
    ? `${escHtml(row.disclosureText)} <a href="/affiliate-disclosure">Affiliate disclosure</a>`
    : '<a href="/affiliate-disclosure">Affiliate disclosure</a>';

  return `<div class="${escHtml(className)}">
  <a class="${escHtml(buttonClassName)}" href="${escHtml(row.url)}" target="_blank" rel="sponsored nofollow noopener">Buy at ${escHtml(row.providerName)} ↗</a>
  <p class="${escHtml(disclosureClassName)}">${disclosure}</p>
</div>`;
}

async function loadProvidersFromFile(
  filePath = path.join(path.resolve(__dirname, '..'), 'data', 'affiliates', 'providers.json')
) {
  const raw = await readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  const rows = Array.isArray(parsed?.providers) ? parsed.providers : [];
  return rows.filter((row) => row && typeof row.slug === 'string' && typeof row.linkTemplate === 'string');
}

module.exports = {
  buildAffiliateUrl,
  loadProvidersFromFile,
  renderAffiliateCta,
  resolveAffiliateLinkForProduct
};
