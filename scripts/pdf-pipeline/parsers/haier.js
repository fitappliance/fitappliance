function normalizeText(text) {
  return String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\r/g, '')
    .trim();
}

function normalizeSku(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\bSERIES\b/g, '')
    .replace(/[^A-Z0-9]+/g, '');
}

function numberFromToken(value, { prefer = 'min' } = {}) {
  const nums = [...String(value || '').matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
  if (!nums.length) return null;
  return Math.round(prefer === 'max' ? Math.max(...nums) : Math.min(...nums));
}

function parseLabelNumber(text, label, opts = {}) {
  const pattern = new RegExp(`${label}\\s+([0-9]+(?:\\s*-\\s*[0-9]+)?)(?:\\s*mm)?`, 'i');
  const match = normalizeText(text).match(pattern);
  return match ? numberFromToken(match[1], opts) : null;
}

function findModelEvidence(text, target = {}, verifiedAlias = '') {
  const normalizedText = normalizeSku(text);
  const candidates = [
    target.sku,
    target.model,
    target.product?.model,
    verifiedAlias
  ].map(normalizeSku).filter((value) => value.length >= 4);

  return candidates.some((candidate) => normalizedText.includes(candidate));
}

function splitSideClearance(totalWidthClearance) {
  const total = Math.max(0, Number(totalWidthClearance || 0));
  return {
    left: Math.floor(total / 2),
    right: Math.ceil(total / 2)
  };
}

function parseSpecificationGuideDimensions(text) {
  const normalized = normalizeText(text);
  const productHeight = parseLabelNumber(normalized, 'Overall height', { prefer: 'min' });
  const productWidth = parseLabelNumber(normalized, 'Overall width(?: \\(door closed\\))?', { prefer: 'min' });
  const productDepth = parseLabelNumber(normalized, 'Overall depth(?: \\(door closed\\))?', { prefer: 'min' });
  const doorOpenDepth = parseLabelNumber(normalized, 'Overall depth \\(door open\\)', { prefer: 'max' });

  const cavityHeight = parseLabelNumber(normalized, 'Overall height of cavity', { prefer: 'min' });
  const cavityWidth = parseLabelNumber(normalized, 'Overall width of cavity', { prefer: 'min' });
  const cavityDepth = parseLabelNumber(normalized, 'Minimum depth of cavity', { prefer: 'min' });

  if (!productHeight || !productWidth || !productDepth) {
    throw new Error('Haier parser requires explicit Overall height, width, and depth.');
  }
  if (!cavityHeight || !cavityWidth || !cavityDepth) {
    throw new Error('Haier parser requires explicit cavity dimensions before ingest.');
  }
  if (cavityHeight < productHeight || cavityWidth < productWidth || cavityDepth < productDepth) {
    throw new Error('Haier parser rejected cavity dimensions smaller than product dimensions.');
  }

  const side = splitSideClearance(cavityWidth - productWidth);
  return {
    dimensions: {
      height_mm: productHeight,
      width_mm: productWidth,
      depth_mm: productDepth,
      door_open_90_depth_mm: doorOpenDepth
    },
    clearance_requirements: {
      top_mm: cavityHeight - productHeight,
      left_mm: side.left,
      right_mm: side.right,
      rear_mm: cavityDepth - productDepth
    }
  };
}

function parseHaierText(text, {
  target = {},
  sourceUrl = '',
  extractionDate = new Date().toISOString(),
  verifiedAlias = ''
} = {}) {
  const normalized = normalizeText(text);
  if (!findModelEvidence(normalized, target, verifiedAlias)) {
    throw new Error(`Haier parser could not verify SKU ${target.sku || target.model || ''} against document text.`);
  }
  if (!/SPECIFICATION\s+GUIDE/i.test(normalized)) {
    throw new Error('Haier parser requires an official Specification Guide with cavity dimensions.');
  }

  const category = String(target.category || target.cat || target.product?.cat || '').toUpperCase();
  const parsed = parseSpecificationGuideDimensions(normalized);
  const requiresPlumbing = /plumbing|water inlet|cold water/i.test(normalized);
  const reversibleDoor = /reversible door/i.test(normalized) ? true : null;

  return {
    data: {
      brand: 'Haier',
      sku: target.sku || target.model || target.product?.model,
      category,
      ...parsed,
      flags: {
        requires_plumbing: requiresPlumbing,
        ventilation_required: true,
        reversible_door: reversibleDoor
      },
      metadata: {
        source_pdf_url: sourceUrl,
        extraction_date: extractionDate,
        confidence_score: 0.95,
        ...(verifiedAlias ? { verified_alias: verifiedAlias } : {}),
        source_type: 'haier-official-specification_guide'
      }
    }
  };
}

exports.findModelEvidence = findModelEvidence;
exports.normalizeSku = normalizeSku;
exports.parseHaierText = parseHaierText;
exports.parseSpecificationGuideDimensions = parseSpecificationGuideDimensions;
exports.splitSideClearance = splitSideClearance;
