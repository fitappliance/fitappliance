const { extractText } = require('../2-extract-text');

const CATEGORY_MAP = {
  fridge: 'FRIDGE',
  refrigerator: 'FRIDGE',
  dishwasher: 'DISHWASHER',
  dryer: 'DRYER',
  washing_machine: 'WASHING_MACHINE',
  'washing-machine': 'WASHING_MACHINE',
  washer: 'WASHING_MACHINE'
};

function normalizeCategory(category) {
  const key = String(category || '').trim().toLowerCase();
  return CATEGORY_MAP[key] || category;
}

function firstNonBlank(...values) {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
}

function parseMm(value, label) {
  const match = String(value || '').match(/(\d+(?:\.\d+)?)/);
  if (!match) throw new Error(`Unable to parse Samsung ${label} from "${value}"`);
  return Math.round(Number(match[1]));
}

function normalizeWhitespace(text) {
  return String(text || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function patternMatches(source, pattern) {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const matcher = new RegExp(pattern.source, flags);
  return [...source.matchAll(matcher)].map((match) => match.index).filter((index) => index >= 0);
}

function matchCount(source, pattern) {
  return patternMatches(source, pattern).length;
}

function sectionFrom(text, startPatterns, endPatterns = [], scorePattern = /./) {
  const source = String(text || '');
  const starts = startPatterns.flatMap((pattern) => patternMatches(source, pattern)).sort((a, b) => a - b);
  if (!starts.length) return '';
  const candidates = starts.map((start) => {
    const window = source.slice(start, Math.min(source.length, start + 8000));
    const score = matchCount(window, scorePattern);
    return { start, score };
  }).sort((a, b) => b.score - a.score || b.start - a.start);

  const start = candidates[0].start;
  const afterStart = source.slice(start + 1);
  const endOffsets = endPatterns
    .map((pattern) => {
      const match = afterStart.match(pattern);
      return match ? start + 1 + match.index : -1;
    })
    .filter((index) => index > start)
    .sort((a, b) => a - b);
  const end = endOffsets[0] || Math.min(source.length, start + 8000);
  return normalizeWhitespace(source.slice(start, end));
}

function extractSamsungSections(text) {
  const source = normalizeWhitespace(text);
  return {
    installation: sectionFrom(source, [
      /\bInstallation requirements\b/i,
      /\bSTEP\s+1\s+Select a site\b/i,
      /\bAlcove (?:or closet )?installation\b/i
    ], [
      /\bOperations\b/i,
      /\bBefore you start\b/i,
      /\bSpecification(?:s| sheet)?\b/i
    ], /\b(?:Clearance|minimum clearance|Sides\s+Top|Sides\s+\d+(?:\.\d+)?\s*mm|STEP\s+1\s+Select a site|Depth\s+[“"']?A[”"']?)\b/i),
    specification: sectionFrom(source, [
      /\bSpecification sheet\b/i,
      /\bSpecifications\b/i,
      /\bSpecification\b/i
    ], [
      /\bMemo\b/i,
      /\bQUESTIONS OR COMMENTS\b/i,
      /\bFor standard test\b/i
    ], /\b(?:DIMENSIONS|Dimensions|Model name|Width\s+\d+(?:\.\d+)?\s*mm|Dimension\s*\(Width)\b/i)
  };
}

function inferCategoryFromText(text) {
  const head = String(text || '').slice(0, 2500);
  const signals = [
    ['DISHWASHER', /\bDishwasher\b/i],
    ['WASHING_MACHINE', /\bWashing\s+Machine\b|\bFront loading washing machine\b|\bWasher\b/i],
    ['DRYER', /\bHeat\s+Pump\s+Dryer\b|\bTumble\s+Dryer\b|\bFront loading dryer\b|\bDryer\b/i],
    ['FRIDGE', /\bRefrigerator\b|\bFridge\b|\bFreezer\b/i]
  ].map(([category, pattern]) => {
    const match = head.match(pattern);
    return match ? { category, index: match.index } : null;
  }).filter(Boolean);
  signals.sort((a, b) => a.index - b.index);
  return signals[0]?.category || '';
}

function categoriesCompatible(targetCategory, inferredCategory) {
  return !targetCategory || !inferredCategory || targetCategory === inferredCategory;
}

function extractSamsungFridgeDimensions(sections) {
  const text = `${sections.installation}\n${sections.specification}`;
  const depth = text.match(/Depth\s+[“"']?A[”"']?\s+(\d+(?:\.\d+)?)\s*mm/i)?.[1];
  const width = text.match(/Width\s+[“"']?B[”"']?\s+(\d+(?:\.\d+)?)\s*mm/i)?.[1];
  const height = text.match(/Overall\s+Height\s+[“"']?D[”"']?\s+(\d+(?:\.\d+)?)\s*mm/i)?.[1]
    || text.match(/Height\s+[“"']?C[”"']?\s+(\d+(?:\.\d+)?)\s*mm/i)?.[1];
  const specDepth = text.match(/Depth\s+w\.\s*Door\s*\(mm\)\s+(\d+(?:\.\d+)?)/i)?.[1]
    || text.match(/Depth\s*\(mm\)\s+(\d+(?:\.\d+)?)/i)?.[1];
  const specWidth = text.match(/Width\s*\(mm\)\s+(\d+(?:\.\d+)?)/i)?.[1];
  const specHeight = text.match(/Height\s*\(mm\)\s+(\d+(?:\.\d+)?)/i)?.[1];
  if (specHeight && specWidth && specDepth) {
    return {
      height_mm: parseMm(specHeight, 'fridge height'),
      width_mm: parseMm(specWidth, 'fridge width'),
      depth_mm: parseMm(specDepth, 'fridge depth'),
      door_open_90_depth_mm: null
    };
  }
  if (!height || !width || !depth) {
    throw new Error('Samsung fridge parser could not find dimensions inside installation/specification sections.');
  }
  const doorOpen = text.match(/\b03\s+(\d+(?:\.\d+)?)\s*mm/i)?.[1] || null;
  return {
    height_mm: parseMm(height, 'fridge height'),
    width_mm: parseMm(width, 'fridge width'),
    depth_mm: parseMm(depth, 'fridge depth'),
    door_open_90_depth_mm: doorOpen ? parseMm(doorOpen, 'fridge door open depth') : null
  };
}

function extractSamsungFridgeClearance(sections) {
  const text = sections.installation;
  const value = text.match(/\b01\s+(\d+(?:\.\d+)?)\s*mm/i)?.[1]
    || text.match(/\b01\s+more\s+than\s+(\d+(?:\.\d+)?)\s*mm/i)?.[1]
    || text.match(/Allow clearance[^.\n]*(\d+(?:\.\d+)?)\s*mm/i)?.[1];
  if (!value) {
    throw new Error('Samsung fridge parser requires explicit clearance figures in the installation section.');
  }
  const clearance = parseMm(value, 'fridge clearance');
  return { top_mm: clearance, left_mm: clearance, right_mm: clearance, rear_mm: clearance };
}

function extractSamsungDryerDimensions(sections) {
  const text = sections.specification;
  if (!/\bFRONT LOADING DRYER\b|\bDIMENSIONS\b/i.test(text)) {
    throw new Error('Samsung dryer parser could not find a specification dimensions table.');
  }
  const rows = Object.fromEntries([...text.matchAll(/\b([A-E])\s+(\d+(?:\.\d+)?)\s*mm/gi)]
    .map((match) => [match[1].toUpperCase(), parseMm(match[2], `dryer dimension ${match[1]}`)]));
  if (!rows.A || !rows.B || !rows.C) {
    throw new Error('Samsung dryer parser could not find A/B/C dimensions in the specification section.');
  }
  return {
    width_mm: rows.A,
    height_mm: rows.B,
    depth_mm: rows.C,
    door_open_90_depth_mm: rows.E || null
  };
}

function extractSamsungWasherDimensions(sections, sku) {
  const text = sections.specification;
  const netDimensions = text.match(/Net\s+Dimension\s*\(WxHxD\)\s+(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*mm/i);
  if (netDimensions) {
    return {
      width_mm: parseMm(netDimensions[1], 'washer width'),
      height_mm: parseMm(netDimensions[2], 'washer height'),
      depth_mm: parseMm(netDimensions[3], 'washer depth'),
      door_open_90_depth_mm: null
    };
  }
  const family = String(sku || '').toUpperCase().match(/^WW(\d{2})/)?.[1] || '';
  const plainBlocks = [...text.matchAll(/Model name\s+(WW\d{2}[A-Z0-9*]+)[\s\S]*?Dimensions\s+Width\s+(\d+(?:\.\d+)?)\s*mm\s+Height\s+(\d+(?:\.\d+)?)\s*mm\s+Depth\s+(\d+(?:\.\d+)?)\s*mm/gi)]
    .map((match) => ({
      model: match[1],
      width: match[2],
      height: match[3],
      depth: match[4]
    }));
  const labelledBlocks = [...text.matchAll(/Model name\s+(WW\d{2}[A-Z0-9*]+)[\s\S]*?Dimensions\s+A\s*\(Width\)\s+(\d+(?:\.\d+)?)\s*mm\s+B\s*\(Height\)\s+(\d+(?:\.\d+)?)\s*mm\s+C\s*\(Depth\)\s+(\d+(?:\.\d+)?)\s*mm/gi)]
    .map((match) => ({
      model: match[1],
      width: match[2],
      height: match[3],
      depth: match[4]
    }));
  const blocks = [...plainBlocks, ...labelledBlocks];
  const selected = blocks.find((block) => !family || block.model.startsWith(`WW${family}`)) || blocks[0];
  if (!selected) {
    throw new Error('Samsung washing machine parser could not find a model-specific specification dimensions block.');
  }
  return {
    width_mm: parseMm(selected.width, 'washer width'),
    height_mm: parseMm(selected.height, 'washer height'),
    depth_mm: parseMm(selected.depth, 'washer depth'),
    door_open_90_depth_mm: null
  };
}

function extractSamsungDishwasherDimensions(sections) {
  const match = sections.specification.match(/Dimension\s*\(Width\s*x\s*Depth\s*x\s*Height\)\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*mm/i);
  if (!match) {
    throw new Error('Samsung dishwasher parser could not find Width x Depth x Height inside the specification section.');
  }
  return {
    width_mm: parseMm(match[1], 'dishwasher width'),
    depth_mm: parseMm(match[2], 'dishwasher depth'),
    height_mm: parseMm(match[3], 'dishwasher height'),
    door_open_90_depth_mm: null
  };
}

function extractAlcoveClearance(sections, category) {
  const text = sections.installation;
  const table = text.match(/(?:minimum\s+clearance|minimum\s+clearances|minimum clearances)[\s\S]{0,220}?Sides\s+Top\s+Front\s+Rear\s+(\d+(?:\.\d+)?)\s*mm\s+(\d+(?:\.\d+)?)\s*mm\s+(\d+(?:\.\d+)?)\s*mm\s+(\d+(?:\.\d+)?)\s*mm/i);
  if (table) {
    return {
      left_mm: parseMm(table[1], `${category} side clearance`),
      right_mm: parseMm(table[1], `${category} side clearance`),
      top_mm: parseMm(table[2], `${category} top clearance`),
      rear_mm: parseMm(table[4], `${category} rear clearance`)
    };
  }
  const list = {
    side: text.match(/Sides\s+(\d+(?:\.\d+)?)\s*mm/i)?.[1],
    top: text.match(/Top\s+(\d+(?:\.\d+)?)\s*mm/i)?.[1],
    rear: text.match(/Rear\s+(\d+(?:\.\d+)?)\s*mm/i)?.[1]
  };
  if (list.side && list.top && list.rear) {
    return {
      left_mm: parseMm(list.side, `${category} side clearance`),
      right_mm: parseMm(list.side, `${category} side clearance`),
      top_mm: parseMm(list.top, `${category} top clearance`),
      rear_mm: parseMm(list.rear, `${category} rear clearance`)
    };
  }
  throw new Error(`Samsung ${category.toLowerCase()} parser requires explicit clearance figures in an installation section.`);
}

function extractSamsungDimensions(sections, category, sku) {
  if (!sections.specification && category !== 'FRIDGE') {
    throw new Error('Samsung layout-aware parser could not find a specification section.');
  }
  if (category === 'FRIDGE') return extractSamsungFridgeDimensions(sections);
  if (category === 'DRYER') return extractSamsungDryerDimensions(sections);
  if (category === 'WASHING_MACHINE') return extractSamsungWasherDimensions(sections, sku);
  if (category === 'DISHWASHER') return extractSamsungDishwasherDimensions(sections);
  throw new Error(`Unsupported Samsung category: ${category}`);
}

function extractSamsungClearance(sections, category) {
  if (!sections.installation) {
    throw new Error('Samsung layout-aware parser could not find an installation section.');
  }
  if (category === 'FRIDGE') return extractSamsungFridgeClearance(sections);
  return extractAlcoveClearance(sections, category);
}

function inferRequiresPlumbing(text, category) {
  if (category === 'DISHWASHER' || category === 'WASHING_MACHINE') return true;
  if (category === 'FRIDGE') {
    if (/non[-\s]?plumbed/i.test(text)) return false;
    return /plumbed|water\s+line|water\s+connection/i.test(text);
  }
  return /drain\s+hose|water\s+tank/i.test(text) && /direct\s+drain/i.test(text);
}

function inferVentilationRequired(text, category) {
  if (category === 'FRIDGE') return true;
  if (category === 'DRYER') return !/Heat\s+Pump/i.test(text);
  return false;
}

function inferReversibleDoor(text) {
  if (/Door reversal|reversible door/i.test(text)) return true;
  return null;
}

function confidenceFor(category, warnings) {
  if (warnings.length) return 0.84;
  return category === 'FRIDGE' ? 0.9 : 0.88;
}

function parseSamsungText(text, options = {}) {
  const target = options.target || {};
  const targetCategory = normalizeCategory(firstNonBlank(target.category, target.cat, target.product?.cat));
  const inferredCategory = inferCategoryFromText(text);
  if (!categoriesCompatible(targetCategory, inferredCategory)) {
    throw new Error(`Samsung category mismatch: target ${targetCategory} but document text indicates ${inferredCategory}.`);
  }
  const category = normalizeCategory(firstNonBlank(targetCategory, inferredCategory));
  if (!category || !Object.values(CATEGORY_MAP).includes(category)) {
    throw new Error(`Unsupported Samsung category: ${category || 'missing'}`);
  }

  const sku = firstNonBlank(target.sku, target.model, target.product?.model, target.product?.sku);
  const brand = firstNonBlank(target.brand, target.product?.brand, 'Samsung');
  const sourceUrl = firstNonBlank(options.sourceUrl, target.source_url);
  const extractionDate = firstNonBlank(options.extractionDate, new Date().toISOString());
  const verifiedAlias = firstNonBlank(options.verifiedAlias, target.verified_alias);
  if (!sku) throw new Error('Samsung parser requires a SKU/model target.');
  if (!sourceUrl) throw new Error('Samsung parser requires sourceUrl metadata.');

  const sections = extractSamsungSections(text);
  if (!sections.installation && !sections.specification) {
    throw new Error('Samsung layout-aware parser could not locate installation/specification sections.');
  }
  const warnings = [];
  const dimensions = extractSamsungDimensions(sections, category, sku);
  const clearance = extractSamsungClearance(sections, category);

  return {
    data: {
      brand,
      sku,
      category,
      dimensions,
      clearance_requirements: clearance,
      flags: {
        requires_plumbing: inferRequiresPlumbing(text, category),
        ventilation_required: inferVentilationRequired(text, category),
        reversible_door: inferReversibleDoor(text)
      },
      metadata: {
        source_pdf_url: sourceUrl,
        extraction_date: extractionDate,
        confidence_score: confidenceFor(category, warnings),
        ...(verifiedAlias ? { verified_alias: verifiedAlias } : {})
      }
    },
    warnings
  };
}

async function parseSamsungPdf(pdfPath, options = {}) {
  const { text } = await extractText(pdfPath);
  return parseSamsungText(text, options);
}

exports.extractSamsungClearance = extractSamsungClearance;
exports.extractSamsungDimensions = extractSamsungDimensions;
exports.extractSamsungSections = extractSamsungSections;
exports.parseSamsungPdf = parseSamsungPdf;
exports.parseSamsungText = parseSamsungText;
