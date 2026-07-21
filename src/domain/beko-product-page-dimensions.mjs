function normalizedText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export const BEKO_AU_PRODUCT_DIMENSIONS_CAPABILITY = 'beko_au_product_html_dimensions_v1';

export function extractBekoAuProductDimensions($, canonicalUrl) {
  if (!(canonicalUrl instanceof URL)
    || (canonicalUrl.hostname !== 'beko.com' && !canonicalUrl.hostname.endsWith('.beko.com'))
    || !canonicalUrl.pathname.startsWith('/au-en/home-appliances/')) return [];

  const containers = $('.MainSpecs__dimensions.MainSpecs__dimensions__single');
  if (containers.length !== 1) return [];
  const container = containers.first();
  const titles = container.find('.MainSpecs__title');
  const items = container.find('.MainSpecs__items > .DimensionsItem__root');
  if (titles.length !== 1 || normalizedText(titles.first().text()) !== 'Dimensions (cm)'
    || items.length !== 3) return [];

  const axes = new Map();
  items.each((_, item) => {
    const labels = $(item).find('.DimensionsItem__title');
    const counters = $(item).find('.DimensionsItem__number[data-counter-to]');
    const name = labels.length === 1 ? normalizedText(labels.first().text()) : '';
    const value = counters.length === 1
      ? normalizedText(counters.first().attr('data-counter-to'))
      : '';
    const millimetres = Number(value) * 10;
    if (!['Height', 'Width', 'Depth'].includes(name)
      || !/^\d+(?:\.\d+)?$/.test(value) || Number(value) <= 0
      || !Number.isInteger(millimetres) || axes.has(name)) return;
    axes.set(name, { name, value: String(millimetres), unitText: 'mm' });
  });
  if (axes.size !== 3) return [];
  return ['Height', 'Width', 'Depth'].map((axis) => axes.get(axis));
}
