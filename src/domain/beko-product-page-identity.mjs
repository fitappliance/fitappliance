export const BEKO_AU_PRODUCT_IDENTITY_CAPABILITY = 'beko_au_product_html_identity_v1';

function identifier(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function bekoAuProductUrl(value) {
  let url;
  try { url = value instanceof URL ? value : new URL(value); } catch { return null; }
  if ((url.hostname !== 'beko.com' && !url.hostname.endsWith('.beko.com'))
    || !url.pathname.startsWith('/au-en/home-appliances/')) return null;
  return url;
}

export function extractBekoAuProductIdentity($, canonicalUrl, expectedModel) {
  const url = bekoAuProductUrl(canonicalUrl);
  const target = identifier(expectedModel);
  if (!url || !target || !url.pathname.split('/').some((segment) => identifier(segment).endsWith(target))) {
    return null;
  }
  const elements = $('.ProductInfo__header .JS-wishlist-button[data-code][data-gtm-data]');
  if (elements.length < 1) return null;
  const identities = [];
  let invalid = false;
  elements.each((_, element) => {
    const dataCode = String($(element).attr('data-code') ?? '').trim();
    let payload;
    try { payload = JSON.parse(String($(element).attr('data-gtm-data') ?? '')); } catch {
      invalid = true;
      return;
    }
    const item = Array.isArray(payload?.items) && payload.items.length === 1
      ? payload.items[0]
      : null;
    const itemId = String(item?.item_id ?? '').trim();
    const marketingCode = String(item?.item_MarketingCode ?? '').trim();
    const itemName = String(item?.item_name ?? '').trim();
    if (payload?.event !== 'add_to_wishlist' || !/^\d{6,14}$/.test(dataCode)
      || itemId !== dataCode || marketingCode !== dataCode
      || identifier(itemName) !== target || !String(item?.item_category1 ?? '').trim()) {
      invalid = true;
      return;
    }
    identities.push({ model: itemName, productId: dataCode });
  });
  if (invalid || identities.length !== elements.length) return null;
  const unique = new Map(identities.map((identity) => [
    `${identifier(identity.model)}\0${identity.productId}`,
    identity,
  ]));
  return unique.size === 1 ? [...unique.values()][0] : null;
}
