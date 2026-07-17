import { createHash } from 'node:crypto';
import { load } from 'cheerio';

import {
  claimFromEvidenceFragment,
  claimsFromExplicitDimensionSequence,
  containsExactModel,
  containsExactModelDocumentUrl,
  evidenceFieldRules,
  validateClaimsSemantics,
} from './evidence-claim-semantics.mjs';
import {
  upgradeLegacyDimensionClaim,
  validateDimensionEvidenceClaimsV2,
} from './dimension-evidence-claim.mjs';
import {
  extractSmegAuDishwasherFixedTableSizeRows,
  extractSmegAuDishwasherFixedSuffixPermutationRows,
  extractSmegAuDishwasherSizeRows,
  SMEG_AU_DISHWASHER_SUFFIX_FIXED_GRAMMAR,
  SMEG_AU_DISHWASHER_SUFFIX_PERMUTATION_GRAMMAR,
  SMEG_AU_DISHWASHER_SUFFIX_RANGE_GRAMMAR,
} from './smeg-pdf-dimensions.mjs';

const MAX_JSON_BYTES = 128 * 1024 * 1024;
const MAX_PAGES = 2000;
const HASH_PATTERN = /^[a-f0-9]{64}$/;

function normalizedText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsExplicitModelExpression(text, model) {
  if (containsExactModel(text, model)) return true;
  const target = normalizedText(model).toUpperCase().replace(/[^A-Z0-9]+/g, '');
  if (!target) return false;
  if (new RegExp(
    `(^|[^A-Z0-9])${escapeRegExp(target)}\\s*\\/\\s*[A-Z0-9]{1,4}(?![A-Z0-9])`,
    'i',
  ).test(String(text ?? ''))) return true;
  for (const match of String(text ?? '').toUpperCase().matchAll(
    /(^|[^A-Z0-9])([A-Z][A-Z0-9.-]{4,})\s*\/\s*([A-Z0-9]{1,4})(?![A-Z0-9])/g,
  )) {
    const base = canonicalModel(match[2]);
    const suffix = canonicalModel(match[3]);
    if (!/[A-Z]/.test(suffix) || base.length !== target.length || suffix.length >= base.length) continue;
    if (target.endsWith(suffix) && base.slice(0, -suffix.length) === target.slice(0, -suffix.length)) {
      return true;
    }
  }
  return false;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalJson(value[key])]));
}

function sameCanonicalJson(left, right) {
  return JSON.stringify(canonicalJson(left)) === JSON.stringify(canonicalJson(right));
}

function requiredHash(value, label) {
  const hash = normalizedText(value).toLowerCase();
  if (!HASH_PATTERN.test(hash)) throw new TypeError(`${label} must be SHA-256`);
  return hash;
}

function requiredParserVersion(value) {
  const version = normalizedText(value);
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new TypeError('MinerU parser version required');
  return version;
}

function requiredModelRevision(value) {
  const revision = normalizedText(value).toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new TypeError('MinerU model revision required');
  return revision;
}

function validateBbox(value, label) {
  if (!Array.isArray(value) || value.length !== 4
    || value.some((coordinate) => !Number.isFinite(coordinate) || coordinate < 0 || coordinate > 1000)
    || value[0] >= value[2] || value[1] >= value[3]) {
    throw new TypeError(`${label} bbox invalid`);
  }
  return value.map(Number);
}

function nestedText(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(nestedText).filter(Boolean).join(' ');
  if (!value || typeof value !== 'object') return '';
  const directContent = value.content === undefined ? '' : nestedText(value.content);
  const nested = Object.entries(value)
    .filter(([key]) => !/^(?:type|content|path|image_source)$/i.test(key))
    .map(([, child]) => nestedText(child))
    .filter(Boolean)
    .join(' ');
  return [directContent, nested].filter(Boolean).join(' ');
}

function structuredListEntries(content) {
  if (!Array.isArray(content?.list_items)) return [];
  return content.list_items
    .map((item) => normalizedText(nestedText(item?.item_content ?? [])))
    .filter(Boolean);
}

function isEmptyPageSentinel(item, type) {
  return type === 'paragraph'
    && normalizedText(nestedText(item.content)) === ''
    && Array.isArray(item.bbox)
    && item.bbox.length === 4
    && item.bbox.every((coordinate, index) => coordinate === [0, 0, 1001, 1000][index]);
}

function splitSingleCellMeasurement(value) {
  const cell = normalizedText(value);
  const scalar = /^(.*?\S)\s+(\d+(?:\.\d+)?(?:\s*(?:-|–|—|\bto\b)\s*\d+(?:\.\d+)?)?\s*(?:mm|millimet(?:re|er)s?|cm|centimet(?:re|er)s?))$/i.exec(cell);
  if (scalar) return { label: normalizedText(scalar[1]), value: normalizedText(scalar[2]), quote: cell };
  const sequence = /^(.*?\S)\s+((?:\d+(?:\.\d+)?\s*(?:mm|cm)?\s*[x×*]\s*){2}\d+(?:\.\d+)?\s*(?:mm|millimet(?:re|er)s?|cm|centimet(?:re|er)s?))$/i.exec(cell);
  if (sequence) return { label: normalizedText(sequence[1]), value: normalizedText(sequence[2]), quote: cell };
  const labelUnitSequence = /^(.*?\b(?:dimensions?|size)\b.*?\b(mm|cm)\b\s*[)\]]*)\s+(\d+(?:\.\d+)?\s*[x×*]\s*\d+(?:\.\d+)?\s*[x×*]\s*\d+(?:\.\d+)?)$/i.exec(cell);
  if (!labelUnitSequence) return null;
  const label = normalizedText(labelUnitSequence[1]);
  const values = normalizedText(labelUnitSequence[3]);
  const axes = explicitSequence(label, {
    w: 'width', width: 'width', h: 'height', height: 'height', d: 'depth', depth: 'depth',
  }, 3);
  return axes && measurements(`${values} ${labelUnitSequence[2]}`, 3)
    ? { label, value: values, quote: cell }
    : null;
}

function tableCells(html) {
  if (typeof html !== 'string' || !html.trim()) return [];
  const $ = load(html, null, false);
  const rows = [];
  $('tr').each((_, row) => {
    rows.push($(row).children('th,td').map((__, cell) => normalizedText($(cell).text())).get());
  });
  return rows;
}

function tableRows(html) {
  const rows = [];
  for (const cells of tableCells(html)) {
    const axisWithValue = cells.length === 2
      ? /^(?:product\s+)?(width|height|depth)\s+(\d+(?:\.\d+)?)$/i.exec(cells[0])
      : null;
    if (axisWithValue && /^(?:mm|cm)$/i.test(cells[1])) {
      rows.push({
        label: axisWithValue[1],
        value: `${axisWithValue[2]} ${cells[1]}`,
        quote: `${cells[0]} ${cells[1]}`,
      });
      continue;
    }
    if (cells.length >= 2 && cells.some(Boolean)) {
      rows.push({ label: cells[0], value: cells.slice(1).join(' ') });
    } else if (cells.length === 1) {
      const split = splitSingleCellMeasurement(cells[0]);
      if (split) rows.push(split);
    }
  }
  const reconnected = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const next = rows[index + 1];
    if (row.label && !row.value
      && /\b(?:dimensions?|size)\b/i.test(row.label)
      && explicitSequence(row.label, { w: 'width', width: 'width', h: 'height', height: 'height', d: 'depth', depth: 'depth' }, 3)
      && next && !next.label
      && measurements(next.value, 3)) {
      reconnected.push({ label: row.label, value: next.value, quote: `${row.label} ${next.value}` });
      index += 1;
      continue;
    }
    reconnected.push(row);
  }
  let inDepthVariantSection = false;
  return reconnected.map((row) => {
    if (/^depth$/i.test(row.label) && !row.value) {
      inDepthVariantSection = true;
      return row;
    }
    if (inDepthVariantSection && /^(?:without\s+(?:the\s+)?(?:doors?|handles?)|with\s+(?:the\s+)?handles?|with\s+(?:the\s+)?doors?\s*(?:(?:and|&)\s*(?:the\s+)?handles?|closed|open))$/i.test(row.label)) {
      return { ...row, label: `Depth ${row.label}` };
    }
    inDepthVariantSection = false;
    return row;
  });
}

function parseDocument(jsonBytes) {
  const bytes = Buffer.from(jsonBytes ?? []);
  if (!bytes.length || bytes.length > MAX_JSON_BYTES) throw new TypeError('MinerU JSON size outside limits');
  let pages;
  try {
    pages = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new TypeError('MinerU content_list_v2 JSON invalid');
  }
  if (!Array.isArray(pages) || !pages.length || pages.length > MAX_PAGES) {
    throw new TypeError('MinerU content_list_v2 pages invalid');
  }
  const parsedPages = pages.map((items, pageIndex) => {
    if (!Array.isArray(items)) throw new TypeError(`MinerU page ${pageIndex + 1} must be an array`);
    return items.map((item, itemIndex) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new TypeError(`MinerU item ${pageIndex + 1}:${itemIndex + 1} invalid`);
      }
      const type = normalizedText(item.type);
      if (!type || !item.content || typeof item.content !== 'object' || Array.isArray(item.content)) {
        throw new TypeError(`MinerU item ${pageIndex + 1}:${itemIndex + 1} content invalid`);
      }
      if (isEmptyPageSentinel(item, type)) return null;
      const bbox = validateBbox(item.bbox, `MinerU item ${pageIndex + 1}:${itemIndex + 1}`);
      const html = type === 'table' ? String(item.content.html ?? '') : null;
      const captionText = type === 'table'
        ? normalizedText(nestedText(item.content.table_caption ?? []))
        : '';
      const rawText = type === 'table'
        ? tableRows(html).map((row) => `${row.label} ${row.value}`).join('\n')
        : nestedText(item.content);
      const text = normalizedText(rawText);
      const identityText = type === 'table'
        ? normalizedText(`${captionText} ${text}`)
        : text;
      return {
        type,
        bbox,
        html,
        rawText,
        text: normalizedText(text),
        captionText,
        identityText,
        listEntries: ['list', 'index'].includes(type)
          ? structuredListEntries(item.content)
          : [],
        rows: type === 'table' ? tableRows(html) : [],
        cells: type === 'table' ? tableCells(html) : [],
        fragmentSha256: sha256(JSON.stringify({ page: pageIndex + 1, type, bbox, html, text })),
      };
    }).filter(Boolean);
  });
  return { bytes, pages: parsedPages, pageCount: parsedPages.length };
}

const CLEARANCE_AXIS = Object.freeze({
  side: 'sides', sides: 'sides',
  left: 'left', right: 'right',
  back: 'rear', rear: 'rear', behind: 'rear',
  top: 'top', above: 'top', overhead: 'top',
  front: 'front',
});

function explicitSequence(label, aliases, expectedLength = null) {
  const tokenPattern = Object.keys(aliases).sort((a, b) => b.length - a.length).join('|');
  const separator = '(?:\\s*(?:x|×|/|\\*|,|\\bby\\b)\\s*)';
  const matcher = new RegExp(`\\b(${tokenPattern})\\b${separator}\\b(${tokenPattern})\\b(?:${separator}\\b(${tokenPattern})\\b)?(?:${separator}\\b(${tokenPattern})\\b)?`, 'i');
  const match = matcher.exec(String(label ?? ''));
  if (!match) return null;
  const result = match.slice(1).filter(Boolean).map((token) => aliases[token.toLowerCase()]);
  if ((expectedLength && result.length !== expectedLength) || new Set(result).size !== result.length) return null;
  return result;
}

function measurements(value, expectedLength) {
  const text = String(value ?? '').replace(/×/g, 'x').replace(/\bby\b/gi, 'x');
  const numbers = (text.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  if (numbers.length !== expectedLength || numbers.some((number) => !Number.isFinite(number))) return null;
  const units = [...text.matchAll(/(?<![A-Za-z])(mm|millimet(?:re|er)s?|cm|centimet(?:re|er)s?)\b/gi)]
    .map((match) => match[1].toLowerCase());
  if (!units.length) return null;
  const unitKinds = new Set(units.map((unit) => unit.startsWith('c') ? 'cm' : 'mm'));
  if (unitKinds.size !== 1) return null;
  const sourceUnit = [...unitKinds][0];
  const valuesMm = numbers.map((number) => number * (sourceUnit === 'cm' ? 10 : 1));
  if (valuesMm.some((number) => !Number.isInteger(number))) return null;
  return { sourceUnit, sourceValues: numbers, valuesMm };
}

function groupedClaim(field, value, row, fragment, page, sequence, measure, semanticBasis) {
  return {
    field,
    value,
    unit: 'mm',
    label: row.label,
    quote: normalizedText(row.quote ?? `${row.label} ${row.value}`),
    page,
    bbox: [...fragment.bbox],
    fragmentSha256: fragment.fragmentSha256,
    semanticBasis,
    axisOrder: [...sequence],
    sourceUnit: measure.sourceUnit,
    sourceValues: [...measure.sourceValues],
    sourceValuesMm: [...measure.valuesMm],
  };
}

function dimensionClaims(row, fragment, page, fields, category) {
  return claimsFromExplicitDimensionSequence({
    label: row.label,
    value: row.value,
    quote: normalizedText(row.quote ?? `${row.label} ${row.value}`),
  }, { category }, fields, {
    page,
    bbox: [...fragment.bbox],
    fragmentSha256: fragment.fragmentSha256,
  }).map((claim) => ({
    ...claim,
    ...(row.semanticBasis ? { semanticBasis: row.semanticBasis } : {}),
    ...(row.axisOrder ? { axisOrder: [...row.axisOrder] } : {}),
    ...(row.grammarProfileId ? { grammarProfileId: row.grammarProfileId } : {}),
  }));
}

function clearanceClaims(row, fragment, page, fields) {
  if (!/\b(?:clearance|clearances|space|gap)\b/i.test(row.label)) return [];
  const sequence = explicitSequence(row.label, CLEARANCE_AXIS);
  if (!sequence || sequence.length < 2) return [];
  const measure = measurements(row.value, sequence.length);
  if (!measure) return [];
  const result = [];
  const add = (field, valueIndex) => {
    if (fields.includes(field)) {
      result.push(groupedClaim(
        field, measure.valuesMm[valueIndex], row, fragment, page,
        sequence, measure, 'explicit_named_sequence',
      ));
    }
  };
  sequence.forEach((axis, index) => {
    if (axis === 'sides') {
      add('installation.leftMm', index);
      add('installation.rightMm', index);
    } else if (axis === 'left') add('installation.leftMm', index);
    else if (axis === 'right') add('installation.rightMm', index);
    else if (axis === 'rear') add('installation.rearMm', index);
    else if (axis === 'top') add('installation.topMm', index);
    else if (axis === 'front') add('installation.frontMm', index);
  });
  return result;
}

function handleInclusiveDepthClaim(row, fragment, page, field) {
  if (field !== 'closedEnvelope.depthMm'
    || !/\b(?:depth|deep)\b/i.test(row.label)
    || !/(?:including|with)\s+(?:the\s+)?(?:(?:doors?\s*(?:and|&)\s*)?handles?|doors?\s+handles?)/i.test(row.label)
    || /\b(?:pack(?:ed|age|aging)?|shipping|carton|cavity|cut[ -]?out|cabinet)\b/i.test(row.label)) {
    return null;
  }
  const values = (String(row.value ?? '').match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  const unitMatch = /(?<![A-Za-z])(mm|millimet(?:re|er)s?|cm|centimet(?:re|er)s?)\b/i.exec(String(row.value ?? ''));
  if (values.length !== 1 || !unitMatch) return null;
  const sourceUnit = unitMatch[1].toLowerCase().startsWith('c') ? 'cm' : 'mm';
  const value = values[0] * (sourceUnit === 'cm' ? 10 : 1);
  if (!Number.isInteger(value)) return null;
  return {
    field,
    value,
    unit: 'mm',
    label: row.label,
    quote: normalizedText(`${row.label} ${row.value}`),
    page,
    bbox: [...fragment.bbox],
    fragmentSha256: fragment.fragmentSha256,
    semanticBasis: 'explicit_including_handle',
    axisOrder: ['depth'],
    sourceUnit,
    sourceValues: [values[0]],
    sourceValuesMm: [value],
  };
}

function directClaims(row, fragment, page, fields, category, claimSemanticsVersion) {
  const quote = normalizedText(row.quote ?? `${row.label} ${row.value}`);
  const labelAxes = [...String(row.label ?? '').matchAll(/\b(width|wide|height|high|depth|deep)\b/gi)]
    .map((match) => ({ width: 'width', wide: 'width', height: 'height', high: 'height', depth: 'depth', deep: 'depth' })[match[1].toLowerCase()]);
  if (new Set(labelAxes).size > 1
    || /\d+(?:\.\d+)?\s*(?:mm|millimet(?:re|er)s?|cm|centimet(?:re|er)s?)\b/i.test(row.label)) {
    return [];
  }
  const claims = [];
  for (const field of fields) {
    const rule = evidenceFieldRules[field];
    if (!rule || !rule.label.test(row.label)) continue;
    if (rule.reject && rule.reject.test(row.label)) {
      const scoped = claimSemanticsVersion === 2
        ? handleInclusiveDepthClaim(row, fragment, page, field)
        : null;
      if (scoped) claims.push(scoped);
      continue;
    }
    if (field === 'closedEnvelope.heightMm') {
      const text = String(row.value ?? '');
      const values = (text.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
      const rangeSeparator = /\d\s*(?:-|–|—|\bto\b)\s*\d/i.test(text);
      const unitMatch = /(?<![A-Za-z])(mm|millimet(?:re|er)s?|cm|centimet(?:re|er)s?)\b/i.exec(text);
      if (values.length === 2 && rangeSeparator && unitMatch) {
        const sourceUnit = unitMatch[1].toLowerCase().startsWith('c') ? 'cm' : 'mm';
        const sourceValuesMm = values.map((value) => value * (sourceUnit === 'cm' ? 10 : 1));
        if (sourceValuesMm.every(Number.isInteger) && sourceValuesMm[0] <= sourceValuesMm[1]) {
          claims.push({
            field,
            value: { minimumMm: sourceValuesMm[0], maximumMm: sourceValuesMm[1] },
            unit: 'mm',
            label: row.label,
            quote,
            page,
            bbox: [...fragment.bbox],
            fragmentSha256: fragment.fragmentSha256,
            semanticBasis: row.semanticBasis ?? 'explicit_label_range',
            ...(row.axisOrder ? { axisOrder: [...row.axisOrder] } : {}),
            ...(row.grammarProfileId ? { grammarProfileId: row.grammarProfileId } : {}),
            sourceUnit,
            sourceValues: values,
            sourceValuesMm,
          });
          continue;
        }
      }
    }
    try {
      claims.push({
        ...claimFromEvidenceFragment(field, row.label, quote, { category }),
        page,
        bbox: [...fragment.bbox],
        fragmentSha256: fragment.fragmentSha256,
        semanticBasis: row.semanticBasis ?? (
          ['installation.leftMm', 'installation.rightMm'].includes(field)
            && /\b(?:each|both)\s+sides?\b/i.test(row.label)
            ? 'explicit_each_side_label'
            : 'explicit_label_value'
        ),
        ...(row.axisOrder ? { axisOrder: [...row.axisOrder] } : {}),
        ...(row.grammarProfileId ? { grammarProfileId: row.grammarProfileId } : {}),
      });
    } catch {
      // A row that cannot prove one unambiguous value is not evidence.
    }
  }
  return claims;
}

function identitySignals(document, model) {
  const signals = [];
  document.pages.forEach((items, pageIndex) => {
    for (const item of items) {
      if (!containsExplicitModelExpression(item.identityText ?? item.text, model)) continue;
      if (item.type === 'title') signals.push({ type: 'mineru_title_model', value: `${model}:page:${pageIndex + 1}` });
      if (item.type === 'list') signals.push({ type: 'mineru_list_model', value: `${model}:page:${pageIndex + 1}:${item.fragmentSha256}` });
      if (item.type === 'table') signals.push({ type: 'mineru_table_model', value: `${model}:page:${pageIndex + 1}:${item.fragmentSha256}` });
      if (item.type === 'text') signals.push({ type: 'mineru_text_model', value: `${model}:page:${pageIndex + 1}:${item.fragmentSha256}` });
      if (item.type === 'paragraph') {
        signals.push({ type: 'mineru_body_model', value: `${model}:page:${pageIndex + 1}:${item.fragmentSha256}` });
      }
      if (item.type === 'page_header') {
        signals.push({ type: 'mineru_page_header_model', value: `${model}:page:${pageIndex + 1}:${item.fragmentSha256}` });
      }
    }
  });
  const unique = new Map(signals.map((signal) => [`${signal.type}\0${signal.value}`, signal]));
  const headerSignals = signals.filter((signal) => signal.type === 'mineru_page_header_model');
  if (new Set(headerSignals.map((signal) => signal.value.match(/:page:(\d+)/)?.[1])).size >= 2) {
    unique.set('mineru_repeated_page_header_model\0document', {
      type: 'mineru_repeated_page_header_model', value: `${model}:document:repeated-page-header`,
    });
  }
  const bodySignals = signals.filter((signal) => signal.type === 'mineru_body_model');
  if (new Set(bodySignals.map((signal) => signal.value.match(/:page:(\d+)/)?.[1])).size >= 2) {
    unique.set('mineru_repeated_body_model\0document', {
      type: 'mineru_repeated_body_model', value: `${model}:document:repeated-body-heading`,
    });
  }
  return [...unique.values()].sort((left, right) => left.type.localeCompare(right.type) || left.value.localeCompare(right.value));
}

function boundFamilyIdentitySignal(document, model) {
  const structured = identitySignals(document, model)[0];
  if (structured) return structured;
  const cover = (document.pages[0] ?? []).find((item) => (
    ['title', 'page_header', 'page_footer'].includes(item.type)
      && containsExplicitModelExpression(item.identityText ?? item.text, model)
  ));
  return cover ? {
    type: `mineru_cover_${cover.type}_family`,
    value: `${model}:page:1:${cover.fragmentSha256}`,
  } : null;
}

function boundSeriesIdentitySignal(document, seriesModel) {
  const escaped = seriesModel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const placeholder = new RegExp(`(?:^|[^A-Z0-9])${escaped}X(?:/[1-9]\\d*)+(?:$|[^A-Z0-9])`, 'i');
  const cover = (document.pages[0] ?? []).find((item) => (
    ['title', 'index', 'list', 'page_header', 'page_footer'].includes(item.type)
      && placeholder.test(item.identityText ?? item.text)
  ));
  return cover ? {
    type: `mineru_cover_${cover.type}_series`,
    value: `${seriesModel}:page:1:${cover.fragmentSha256}`,
  } : null;
}

function boundExactCoverIdentitySignal(document, model) {
  const cover = (document.pages[0] ?? []).find((item) => (
    ['title', 'index', 'list', 'paragraph', 'text', 'page_header', 'page_footer'].includes(item.type)
      && containsExplicitModelExpression(item.identityText ?? item.text, model)
  ));
  return cover ? {
    type: `mineru_cover_${cover.type}_exact_model`,
    value: `${model}:page:1:${cover.fragmentSha256}`,
  } : null;
}

export function hasMineruBoundFamilyIdentity(jsonBytes, model) {
  const normalizedModel = normalizedText(model);
  if (!normalizedModel) throw new TypeError('family model required for MinerU identity extraction');
  return Boolean(boundFamilyIdentitySignal(parseDocument(jsonBytes), normalizedModel));
}

export function hasMineruBoundSeriesIdentity(jsonBytes, seriesModel) {
  const normalizedModel = normalizedText(seriesModel);
  if (!/^[WTD]\d{4}$/i.test(normalizedModel)) {
    throw new TypeError('ASKO series model must use W, T, or D followed by four digits');
  }
  return Boolean(boundSeriesIdentitySignal(parseDocument(jsonBytes), normalizedModel));
}

export function hasMineruBoundExactCoverIdentity(jsonBytes, model) {
  const normalizedModel = normalizedText(model);
  if (!normalizedModel) throw new TypeError('exact cover model required for MinerU identity extraction');
  return Boolean(boundExactCoverIdentitySignal(parseDocument(jsonBytes), normalizedModel));
}

export function extractMineruIdentitySignals(jsonBytes, model) {
  const normalizedModel = normalizedText(model);
  if (!normalizedModel) throw new TypeError('model required for MinerU identity extraction');
  return Object.freeze(identitySignals(parseDocument(jsonBytes), normalizedModel)
    .map((signal) => Object.freeze({ ...signal })));
}

export function inspectMineruIdentityScope(jsonBytes, model) {
  const normalizedModel = normalizedText(model);
  if (!normalizedModel) throw new TypeError('model required for MinerU identity scope');
  const document = parseDocument(jsonBytes);
  return Object.freeze({
    identitySignals: Object.freeze(identitySignals(document, normalizedModel)
      .map((signal) => Object.freeze({ ...signal }))),
    siblingModelCandidates: Object.freeze([...new Set(
      siblingModelCandidates(document, normalizedModel),
    )].sort()),
    unresolvedFamily: unresolvedFamilyScope(document, normalizedModel),
  });
}

function explicitInlineDimensionRow(text) {
  const source = String(text ?? '');
  if (/\b(?:pack(?:ed|ing|ag(?:e|ed|ing))?|shipping|carton|box(?:ed)?|crate)\b/i.test(source)) {
    return null;
  }
  const matches = [...source.matchAll(
    /\b(w|width|h|height|d|depth)\b\s*:\s*(\d+(?:\.\d+)?)\s*(mm|millimet(?:re|er)s?|cm|centimet(?:re|er)s?)\b/gi,
  )];
  if (matches.length !== 3 || !matches.some((match) => match[1].length === 1)) return null;
  const aliases = {
    w: 'width', width: 'width', h: 'height', height: 'height', d: 'depth', depth: 'depth',
  };
  const axes = matches.map((match) => aliases[match[1].toLowerCase()]);
  if (new Set(axes).size !== 3
    || !['width', 'height', 'depth'].every((axis) => axes.includes(axis))) return null;
  const prefix = source.slice(0, matches[0].index).replace(/^\s*[-•●]\s*/, '').trim();
  if (prefix && !/^(?:(?:product|overall|external)\s+)?(?:dimensions?|size)\s*:?\s*[-–—]?$/i.test(prefix)) {
    return null;
  }
  for (let index = 0; index < matches.length - 1; index += 1) {
    const between = source.slice(matches[index].index + matches[index][0].length, matches[index + 1].index);
    if (!/^\s*[x×*]\s*$/.test(between)) return null;
  }
  const suffix = source.slice(matches.at(-1).index + matches.at(-1)[0].length);
  if (!/^\s*[.,;]?\s*$/.test(suffix)) return null;
  const units = matches.map((match) => match[3].toLowerCase().startsWith('c') ? 'cm' : 'mm');
  if (new Set(units).size !== 1) return null;
  const axisLabels = { width: 'W', height: 'H', depth: 'D' };
  return {
    label: `Dimensions (${axes.map((axis) => axisLabels[axis]).join(' x ')})`,
    value: matches.map((match) => `${match[2]} ${units[0]}`).join(' x '),
    quote: normalizedText(source),
  };
}

const BOSCH_AU_DISHWASHER_SHORTHAND_HWD_GRAMMAR =
  'bosch-au-dishwasher-shorthand-hwd-inherited-unit-v1';
const BOSCH_AU_DISHWASHER_DIMENSION_SECTION_GRAMMAR =
  'bosch-au-dishwasher-dimensions-section-explicit-axes-v1';
const ASKO_AU_PRODUCT_SHEET_DIMENSION_SECTION_GRAMMAR =
  'asko-au-product-sheet-dimension-section-v1';
const HAIER_AU_EXACT_SPEC_VERTICAL_AXIS_GRAMMAR =
  'haier-au-exact-spec-vertical-axis-values-v1';
const HAIER_AU_TFE3_FINISH_FAMILY_GRAMMAR =
  'haier-au-tfe3-finish-family-product-dimensions-v1';
const HAIER_AU_HBM_TECHNICAL_DATA_FAMILY_GRAMMAR =
  'haier-au-hbm-technical-data-family-v1';

function explicitDimensionRowsWithInheritedUnit(text, {
  requireShorthand = false,
  grammarProfileId,
} = {}) {
  const source = String(text ?? '');
  if (/\b(?:pack(?:ed|ing|ag(?:e|ed|ing))?|shipping|carton|box(?:ed)?|crate|cabinet|cavity|niche|opening|installation)\b|cut[ -]?out/i.test(source)) {
    return null;
  }
  const matches = [...source.matchAll(
    /\b(w|width|wide|h|height|high|d|depth|deep)\b\s*:?\s*(\d+(?:\.\d+)?(?:\s*(?:-|–|—|\bto\b)\s*\d+(?:\.\d+)?)?)\s*(mm|cm)?/gi,
  )];
  if (matches.length !== 3
    || (requireShorthand && !matches.some((match) => match[1].length === 1))) return null;
  if (matches.some((match) => match[1].length === 1 && !/^\s*[whd]\s*:/i.test(match[0]))) {
    return null;
  }
  const aliases = {
    w: 'width', width: 'width', wide: 'width',
    h: 'height', height: 'height', high: 'height',
    d: 'depth', depth: 'depth', deep: 'depth',
  };
  const axes = matches.map((match) => aliases[match[1].toLowerCase()]);
  if (new Set(axes).size !== 3
    || !['width', 'height', 'depth'].every((axis) => axes.includes(axis))) return null;
  const prefix = source.slice(0, matches[0].index).replace(/^\s*[-•●]\s*/, '').trim();
  if (prefix && !/^(?:(?:product|overall|external)\s+)?(?:dimensions?|size)\s*:?\s*[-–—]?$/i.test(prefix)) {
    return null;
  }
  for (let index = 0; index < matches.length - 1; index += 1) {
    const between = source.slice(matches[index].index + matches[index][0].length, matches[index + 1].index);
    if (!/^\s*[x×*]\s*$/i.test(between)) return null;
  }
  const suffix = source.slice(matches.at(-1).index + matches.at(-1)[0].length);
  if (!/^\s*[.,;]?\s*$/.test(suffix)) return null;
  const units = [...new Set(matches.map((match) => match[3]?.toLowerCase()).filter(Boolean))];
  if (units.length !== 1) return null;
  const axisLabels = { width: 'Width', height: 'Height', depth: 'Depth' };
  const rows = [];
  for (let index = 0; index < matches.length; index += 1) {
    const range = [...matches[index][2].matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
    if (!range.length || range.some((value) => !Number.isFinite(value))) return null;
    if (range.length === 2 && (axes[index] !== 'height' || range[0] > range[1])) return null;
    if (range.length > 2) return null;
    const label = axisLabels[axes[index]];
    rows.push({
      label,
      value: `${matches[index][2]} ${matches[index][3]?.toLowerCase() ?? units[0]}`,
      quote: normalizedText(`${label} ${matches[index][2]} ${matches[index][3]?.toLowerCase() ?? units[0]}`),
      ...(grammarProfileId ? { grammarProfileId } : {}),
    });
  }
  return rows;
}

function explicitShorthandDimensionRowsWithInheritedUnit(text) {
  return explicitDimensionRowsWithInheritedUnit(text, {
    requireShorthand: true,
    grammarProfileId: BOSCH_AU_DISHWASHER_SHORTHAND_HWD_GRAMMAR,
  });
}

function paragraphRows(text) {
  const strict = /^([A-Za-z][A-Za-z ()/+.-]{0,80})\s+((?:\d+(?:\.\d+)?)(?:\s*(?:-|–|—|\bto\b)\s*\d+(?:\.\d+)?)?\s*(?:mm|millimet(?:re|er)s?|cm|centimet(?:re|er)s?))$/i.exec(text);
  if (strict) return [{ label: normalizedText(strict[1]), value: normalizedText(strict[2]) }];
  const explicitInline = explicitInlineDimensionRow(text);
  if (explicitInline) return [explicitInline];
  const inheritedShorthand = explicitShorthandDimensionRowsWithInheritedUnit(text);
  if (inheritedShorthand) return inheritedShorthand;
  if (!/\b(?:pack(?:ed|ing|ag(?:e|ed|ing))?|shipping|carton|box(?:ed)?|crate)\b/i.test(text)) {
    const axisMatches = [...String(text).matchAll(/\b(width|wide|height|high|depth|deep)\b\s*:?\s*(\d+(?:\.\d+)?(?:\s*(?:-|–|—|\bto\b)\s*\d+(?:\.\d+)?)?)\s*(mm|millimet(?:re|er)s?|cm|centimet(?:re|er)s?)\b/gi)];
    const axis = { width: 'width', wide: 'width', height: 'height', high: 'height', depth: 'depth', deep: 'depth' };
    const axes = axisMatches.map((match) => axis[match[1].toLowerCase()]);
    const inheritedUnitMatches = [...String(text).matchAll(/\b(width|wide|height|high|depth|deep)\b\s*:?\s*(\d+(?:\.\d+)?(?:\s*(?:-|–|—|\bto\b)\s*\d+(?:\.\d+)?)?)\s*(mm|cm)?(?=\s*(?:[x×*]\s*(?=\b(?:width|wide|height|high|depth|deep)\b)|$))/gi)];
    const inheritedAxes = inheritedUnitMatches.map((match) => axis[match[1].toLowerCase()]);
    const inheritedUnits = [...new Set(inheritedUnitMatches.map((match) => match[3]?.toLowerCase()).filter(Boolean))];
    if (inheritedUnitMatches.length > axisMatches.length
      && inheritedUnitMatches.length >= 2
      && new Set(inheritedAxes).size === inheritedUnitMatches.length
      && inheritedUnits.length === 1) {
      return inheritedUnitMatches.map((match) => ({
        label: match[1],
        value: `${match[2]} ${match[3] ?? inheritedUnits[0]}`,
        quote: normalizedText(`${match[1]} ${match[2]} ${match[3] ?? inheritedUnits[0]}`),
      }));
    }
    if (axisMatches.length >= 2 && new Set(axes).size === axisMatches.length) {
      return axisMatches.map((match) => ({
        label: match[1],
        value: `${match[2]} ${match[3]}`,
        quote: normalizedText(`${match[1]} ${match[2]} ${match[3]}`),
      }));
    }
  }
  const grouped = /^(.*?\b(?:dimension|dimensions|size)\b.*?\([^)]*[whd]\s*[x×/*]\s*[whd]\s*[x×/*]\s*[whd][^)]*\))\s*:?[ \t]*((?:\d+(?:\.\d+)?\s*(?:mm|cm)?\s*[x×*]\s*){2}\d+(?:\.\d+)?\s*(?:mm|cm))/i.exec(text);
  if (grouped) {
    const rows = [{ label: normalizedText(grouped[1]), value: normalizedText(grouped[2]), quote: normalizedText(text) }];
    const after = String(text).slice((grouped.index ?? 0) + grouped[0].length);
    const inclusiveHandle = /^\s*\(\s*(\d+(?:\.\d+)?\s*(?:mm|cm))\s+(?:including|with)\s+(?:the\s+)?(?:door\s+)?handles?\s*\)/i.exec(after);
    if (inclusiveHandle) rows.push({
      label: 'Overall depth including door handle',
      value: normalizedText(inclusiveHandle[1]),
      quote: normalizedText(text),
      semanticBasis: 'explicit_including_handle',
    });
    return rows;
  }
  const suffixed = /^.*?\b(?:dimension|dimensions|size)\b\s*:?[ \t]*(\d+(?:\.\d+)?)\s*(mm|cm)\s*w\s*[x×]\s*(\d+(?:\.\d+)?)\s*\2\s*h\s*[x×]\s*(\d+(?:\.\d+)?)\s*\2\s*d\b/i.exec(text);
  return suffixed ? [{
    label: 'Dimensions (W x H x D)',
    value: `${suffixed[1]} x ${suffixed[3]} x ${suffixed[4]} ${suffixed[2]}`,
    quote: normalizedText(text),
  }] : [];
}

function smegAuDishwasherTableRows(fragment) {
  if (fragment?.type !== 'table' || !Array.isArray(fragment.rows)) return [];
  const matches = fragment.rows
    .map((row) => extractSmegAuDishwasherFixedTableSizeRows(`${row.label} ${row.value}`))
    .filter(Boolean);
  return matches.length === 1 ? matches[0] : [];
}

function joinedGroupedParagraphRow(items, fragmentIndex) {
  const fragment = items[fragmentIndex];
  const next = items[fragmentIndex + 1];
  if (!fragment || !next
    || !['paragraph', 'text'].includes(fragment.type)
    || !['paragraph', 'text'].includes(next.type)
    || !/\b(?:dimensions?|size)\b/i.test(fragment.text)) return null;
  const axisOrder = explicitSequence(fragment.text, {
    w: 'width', width: 'width', h: 'height', height: 'height', d: 'depth', depth: 'depth',
  }, 3);
  if (!axisOrder) return null;
  const matches = [...String(next.text).matchAll(
    /\b(w|width|h|height|d|depth)\b\s*:?\s*(\d+(?:\.\d+)?)\s*(mm|cm)?/gi,
  )];
  if (matches.length !== 3) return null;
  const aliases = { w: 'width', width: 'width', h: 'height', height: 'height', d: 'depth', depth: 'depth' };
  const valueAxes = matches.map((match) => aliases[match[1].toLowerCase()]);
  if (valueAxes.some((axis, index) => axis !== axisOrder[index])) return null;
  for (let index = 0; index < matches.length - 1; index += 1) {
    const between = String(next.text).slice(matches[index].index + matches[index][0].length, matches[index + 1].index);
    if (!/^\s*[x×*]\s*$/i.test(between)) return null;
  }
  const units = matches.map((match) => match[3]?.toLowerCase()).filter(Boolean);
  if (!units.length || new Set(units).size !== 1) return null;
  return {
    label: fragment.text,
    value: `${matches.map((match) => match[2]).join(' x ')} ${units[0]}`,
    quote: normalizedText(`${fragment.text} ${next.text}`),
  };
}

function documentScopedDimensionSectionRows(items, fragmentIndex) {
  const fragment = items[fragmentIndex];
  const heading = items[fragmentIndex - 1];
  if (!fragment || !heading
    || !['paragraph', 'text'].includes(fragment.type)
    || !['title', 'paragraph', 'text'].includes(heading.type)
    || !/^(?:(?:product|overall|external)\s+)?dimensions?\s*:?$/i.test(heading.text)) {
    return null;
  }
  return explicitDimensionRowsWithInheritedUnit(fragment.text, {
    grammarProfileId: BOSCH_AU_DISHWASHER_DIMENSION_SECTION_GRAMMAR,
  });
}

function askoAuProductSheetDimensionScope(document, caseIdentity, boundExactCoverModel) {
  if (canonicalModel(caseIdentity?.brand) !== 'ASKO'
    || !boundExactCoverModel
    || boundExactCoverModel.toUpperCase() !== normalizedText(caseIdentity?.model).toUpperCase()) {
    return null;
  }
  const sections = [];
  document.pages.forEach((items, pageIndex) => {
    items.forEach((heading, headingIndex) => {
      if (!['title', 'paragraph', 'text'].includes(heading.type)
        || !/^dimensions\s*:?$/i.test(heading.text)) return;
      const entries = [];
      for (const fragment of items.slice(headingIndex + 1)) {
        if (fragment.type === 'title') break;
        if (!['paragraph', 'text'].includes(fragment.type)) continue;
        const match = /^[\s•*-]*(width|height|depth)\s*:\s*(\d+)\s*mm\s*$/i.exec(fragment.text);
        if (!match) continue;
        const axis = match[1].toLowerCase();
        entries.push({
          fragment,
          row: {
            label: axis[0].toUpperCase() + axis.slice(1),
            value: `${match[2]} mm`,
            quote: normalizedText(fragment.text),
            semanticBasis: 'asko_product_sheet_dimension_section',
            axisOrder: [axis],
            grammarProfileId: ASKO_AU_PRODUCT_SHEET_DIMENSION_SECTION_GRAMMAR,
          },
        });
      }
      if (entries.length === 3
        && entries.map((entry) => entry.row.axisOrder[0]).join(',') === 'width,height,depth') {
        sections.push({ page: pageIndex + 1, heading, entries });
      }
    });
  });
  return sections.length === 1 ? {
    ...sections[0],
    grammarProfileId: ASKO_AU_PRODUCT_SHEET_DIMENSION_SECTION_GRAMMAR,
  } : null;
}

function normalizedDimensionValue(value) {
  if (Number.isFinite(value)) return { kind: 'fixed', mm: value };
  if (!value || typeof value !== 'object') return null;
  if (value.kind === 'fixed' && Number.isFinite(value.mm)) {
    return { kind: 'fixed', mm: value.mm };
  }
  const minMm = value.kind === 'range' ? value.minMm : value.minimumMm;
  const maxMm = value.kind === 'range' ? value.maxMm : value.maximumMm;
  if (Number.isFinite(minMm) && Number.isFinite(maxMm) && minMm <= maxMm) {
    return { kind: 'range', minMm, maxMm };
  }
  return null;
}

function compatibleWithScopedDimensionValue(candidateValue, scopedValue) {
  const candidate = normalizedDimensionValue(candidateValue);
  const scoped = normalizedDimensionValue(scopedValue);
  if (!candidate || !scoped) return false;
  if (candidate.kind === scoped.kind) {
    return candidate.kind === 'fixed'
      ? candidate.mm === scoped.mm
      : candidate.minMm === scoped.minMm && candidate.maxMm === scoped.maxMm;
  }
  return scoped.kind === 'range'
    && candidate.kind === 'fixed'
    && [scoped.minMm, scoped.maxMm].includes(candidate.mm);
}

function preferCompatibleBoschDimensionSection(fieldCandidates) {
  const scoped = fieldCandidates.filter((claim) => (
    claim.grammarProfileId === BOSCH_AU_DISHWASHER_DIMENSION_SECTION_GRAMMAR
  ));
  if (!scoped.length) return fieldCandidates;
  const scopedValues = new Map(scoped.map((claim) => [JSON.stringify(claim.value), claim.value]));
  if (scopedValues.size !== 1) return fieldCandidates;
  const scopedValue = [...scopedValues.values()][0];
  return fieldCandidates.every((claim) => (
    compatibleWithScopedDimensionValue(claim.value, scopedValue)
  )) ? scoped : fieldCandidates;
}

function joinedAlignedScalarParagraphRow(items, fragmentIndex) {
  const fragment = items[fragmentIndex];
  const next = items[fragmentIndex + 1];
  if (!fragment || !next
    || !['paragraph', 'text'].includes(fragment.type)
    || !['paragraph', 'text'].includes(next.type)) return null;
  const label = /^(?:(?:total|overall|external|product)\s+)?(?:width|wide|height|high|depth|deep)\s*:?$/i
    .exec(fragment.text);
  const value = /^(\d+(?:\.\d+)?(?:\s*(?:-|–|—|\bto\b)\s*\d+(?:\.\d+)?)?)\s*(mm|millimet(?:re|er)s?|cm|centimet(?:re|er)s?)$/i
    .exec(next.text);
  if (!label || !value || next.bbox[0] < fragment.bbox[2]) return null;
  const overlap = Math.min(fragment.bbox[3], next.bbox[3])
    - Math.max(fragment.bbox[1], next.bbox[1]);
  const minimumHeight = Math.min(
    fragment.bbox[3] - fragment.bbox[1],
    next.bbox[3] - next.bbox[1],
  );
  if (overlap < minimumHeight * 0.5 || next.bbox[0] - fragment.bbox[2] > 350) return null;
  return {
    label: fragment.text,
    value: normalizedText(`${value[1]} ${value[2]}`),
    quote: normalizedText(`${fragment.text} ${next.text}`),
    semanticBasis: 'explicit_aligned_label_value',
  };
}

function joinedVerticalScalarParagraphRow(items, fragmentIndex) {
  const fragment = items[fragmentIndex];
  const next = items[fragmentIndex + 1];
  if (!fragment || !next
    || !['paragraph', 'text'].includes(fragment.type)
    || !['paragraph', 'text'].includes(next.type)) return null;
  const label = /^(?:(?:total|overall|external|product)\s+)?(width|wide|height|high|depth|deep)\s*\(\s*(mm|cm)\s*\)\s*:?$/i
    .exec(fragment.text);
  const value = /^(\d+(?:\.\d+)?(?:\s*(?:-|–|—|\bto\b)\s*\d+(?:\.\d+)?)?)$/i.exec(next.text);
  if (!label || !value) return null;
  const verticalGap = next.bbox[1] - fragment.bbox[3];
  if (verticalGap < -2 || verticalGap > 40
    || Math.abs(next.bbox[0] - fragment.bbox[0]) > 40
    || next.bbox[2] > fragment.bbox[2] + 60) return null;
  return {
    label: label[1],
    value: normalizedText(`${value[1]} ${label[2]}`),
    quote: normalizedText(`${fragment.text} ${next.text}`),
    semanticBasis: 'explicit_vertical_label_value',
  };
}

function haierAuExactSpecVerticalScope(document, caseIdentity) {
  if (canonicalModel(caseIdentity?.brand) !== 'HAIER'
    || normalizedText(caseIdentity?.category) !== 'dishwasher'
    || document.pages.length !== 1) return null;
  const model = canonicalModel(caseIdentity?.model);
  const items = document.pages[0];
  const exactModels = items.filter((item) => (
    ['title', 'paragraph', 'text', 'page_header'].includes(item.type)
      && containsExplicitModelExpression(item.text, model)
  ));
  if (exactModels.length !== 1 || siblingModelCandidates(document, model).length) return null;
  const headings = items.filter((item) => item.type === 'title');
  if (headings.filter((item) => /^Dimensions$/i.test(normalizedText(item.text))).length !== 1
    || headings.some((item) => /\b(?:pack(?:ag(?:e|ed|ing))?|box|carton|shipping)\b/i.test(item.text))) {
    return null;
  }
  const disclaimers = items.filter((item) => (
    ['paragraph', 'text'].includes(item.type)
      && /\bproduct dimensions and specifications in this page apply to the specific product and model\b/i
        .test(item.text)
  ));
  if (disclaimers.length !== 1) return null;
  const entries = items.map((fragment, index) => ({
    fragment,
    row: joinedVerticalScalarParagraphRow(items, index),
  })).filter((entry) => entry.row);
  const axis = (label) => ({
    width: 'width', wide: 'width', height: 'height', high: 'height', depth: 'depth', deep: 'depth',
  })[normalizedText(label).toLowerCase()];
  if (entries.length !== 3 || new Set(entries.map((entry) => axis(entry.row.label))).size !== 3
    || entries.some((entry) => !axis(entry.row.label))) return null;
  return {
    page: 1,
    entries: entries.map((entry) => ({
      fragment: entry.fragment,
      row: { ...entry.row, grammarProfileId: HAIER_AU_EXACT_SPEC_VERTICAL_AXIS_GRAMMAR },
    })),
    identityFragmentSha256: exactModels[0].fragmentSha256,
    disclaimerFragmentSha256: disclaimers[0].fragmentSha256,
  };
}

function haierTfe3ProductDimensionRows(fragment) {
  if (fragment.type !== 'table' || !Array.isArray(fragment.cells)) return null;
  const headerIndex = fragment.cells.findIndex((cells) => (
    /^product\s+dimensions?\s*\(\s*mm\s*\)$/i.test(normalizedText(cells.join(' ')))
  ));
  if (headerIndex < 0) return null;
  const rows = new Map();
  for (const cells of fragment.cells.slice(headerIndex + 1)) {
    const joined = normalizedText(cells.join(' '));
    if (/^(?:cabinetry|cabinet|cavity|cut[ -]?out|installation)\s+dimensions?\b/i.test(joined)) break;
    if (cells.length < 3) continue;
    const index = normalizedText(cells[0]).toUpperCase();
    const label = normalizedText(cells.at(-2));
    const value = normalizedText(cells.at(-1));
    if (index === 'A'
      && /\boverall\s+height\s+of\s+product(?=\s|with\b)/i.test(label)
      && /with\s+top\s+panel\s+in\s+place(?=\s|with\b)/i.test(label)
      && /with\s+top\s+panel\s+removed\b/i.test(label)) {
      const values = (value.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
      if (values.length !== 4 || values.some((item) => !Number.isInteger(item))
        || values[0] > values[1] || values[2] > values[3] || values[3] > values[0]) return null;
      rows.set('height', {
        label: 'Overall height of product with top panel in place',
        value: `${values[0]} - ${values[1]} mm`,
        quote: `overall height of product with top panel in place ${values[0]} - ${values[1]} mm`,
        semanticBasis: 'explicit_label_range',
        axisOrder: ['height'],
        grammarProfileId: HAIER_AU_TFE3_FINISH_FAMILY_GRAMMAR,
      });
    } else if (index === 'B' && /^overall\s+width\s+of\s+product$/i.test(label)
      && /^\d+(?:\.\d+)?$/.test(value)) {
      rows.set('width', {
        label,
        value: `${value} mm`,
        quote: `${label} ${value} mm`,
        semanticBasis: 'haier_tfe3_indexed_product_dimension',
        axisOrder: ['width'],
        grammarProfileId: HAIER_AU_TFE3_FINISH_FAMILY_GRAMMAR,
      });
    } else if (index === 'C' && /^overall\s+depth\s+of\s+product$/i.test(label)
      && /^\d+(?:\.\d+)?$/.test(value)) {
      rows.set('depth', {
        label,
        value: `${value} mm`,
        quote: `${label} ${value} mm`,
        semanticBasis: 'haier_tfe3_indexed_product_dimension',
        axisOrder: ['depth'],
        grammarProfileId: HAIER_AU_TFE3_FINISH_FAMILY_GRAMMAR,
      });
    }
  }
  return ['width', 'height', 'depth'].every((axis) => rows.has(axis))
    ? ['width', 'height', 'depth'].map((axis) => rows.get(axis))
    : null;
}

function haierTfe3TechnicalDimensions(fragment) {
  if (fragment.type !== 'table' || !Array.isArray(fragment.cells)) return null;
  const values = new Map();
  for (const cells of fragment.cells) {
    const match = /^(width|height|depth)\s+(\d+(?:\.\d+)?)\s*mm$/i
      .exec(normalizedText(cells.join(' ')));
    if (!match) continue;
    const axis = match[1].toLowerCase();
    if (values.has(axis)) return null;
    values.set(axis, Number(match[2]));
  }
  return ['width', 'height', 'depth'].every((axis) => values.has(axis)) ? values : null;
}

function haierAuTfe3FinishFamilyScope(document, caseIdentity) {
  if (canonicalModel(caseIdentity?.brand) !== 'HAIER'
    || normalizedText(caseIdentity?.category) !== 'dishwasher') return null;
  const model = canonicalModel(caseIdentity?.model);
  const allowedModels = new Set(['HDW9TFE3SS', 'HDW9TFE3WH']);
  if (!allowedModels.has(model)) return null;
  const firstPage = document.pages[0] ?? [];
  if (!firstPage.some((fragment) => (
    ['title', 'paragraph', 'text'].includes(fragment.type)
      && /\bTFE3\s+Series\b/i.test(fragment.text)
  ))) return null;
  const coverFragments = firstPage.filter((fragment) => {
    if (!['title', 'paragraph', 'text', 'page_footer'].includes(fragment.type)) return false;
    const models = new Set((fragment.text.toUpperCase().match(/\bHDW9[-_.\s]*TFE3(?:SS|WH)\b/g) ?? [])
      .map(canonicalModel));
    return models.size === allowedModels.size
      && [...allowedModels].every((candidate) => models.has(candidate));
  });
  if (coverFragments.length !== 1) return null;
  const relatedModels = new Set(document.pages.flat().flatMap((fragment) => (
    fragment.text.toUpperCase().match(/\bHDW9[-_.\s]*TFE3[A-Z0-9]{1,4}\b/g) ?? []
  )).map(canonicalModel));
  if ([...relatedModels].some((candidate) => !allowedModels.has(candidate))) return null;

  const productMatches = [];
  const technicalMatches = [];
  document.pages.forEach((items, pageIndex) => {
    for (const fragment of items) {
      const rows = haierTfe3ProductDimensionRows(fragment);
      if (rows) productMatches.push({ fragment, rows, page: pageIndex + 1 });
      const dimensions = haierTfe3TechnicalDimensions(fragment);
      if (dimensions) technicalMatches.push({ fragment, dimensions, page: pageIndex + 1 });
    }
  });
  if (productMatches.length !== 1 || technicalMatches.length !== 1) return null;
  const product = productMatches[0];
  const technical = technicalMatches[0];
  const rowValues = Object.fromEntries(product.rows.map((row) => [row.axisOrder[0], (
    row.value.match(/\d+(?:\.\d+)?/g) ?? []
  ).map(Number)]));
  if (technical.dimensions.get('width') !== rowValues.width[0]
    || technical.dimensions.get('depth') !== rowValues.depth[0]
    || technical.dimensions.get('height') !== rowValues.height[0]) return null;
  return {
    ...product,
    coverFragment: coverFragments[0],
    technicalFragment: technical.fragment,
    technicalPage: technical.page,
  };
}

const HAIER_HBM_TECHNICAL_FAMILIES = Object.freeze([
  Object.freeze({
    family: 'HBM340',
    models: Object.freeze(['HBM340SA1', 'HBM340WH1']),
    variant: 'column_table',
  }),
  Object.freeze({
    family: 'HBM450',
    models: Object.freeze(['HBM450HSA1', 'HBM450SA1', 'HBM450WH1']),
    variant: 'shared_list',
  }),
]);

function haierHbmModels(text) {
  return [...new Set((String(text ?? '').toUpperCase().match(
    /HBM[0-9A-Z]+?(?=HBM|[^0-9A-Z]|$)/g,
  ) ?? []).map(canonicalModel))];
}

function sameModelSet(actual, expected) {
  const actualSet = new Set(actual);
  return actualSet.size === expected.length
    && expected.every((model) => actualSet.has(model));
}

function haierHbmDimensionRows(label, value) {
  if (!/^dimensions?\s*\(\s*d\s*[x×*]\s*w\s*[x×*]\s*h\s*\)\s*$/i
    .test(normalizedText(label))) return null;
  const measure = measurements(value, 3);
  if (!measure || measure.valuesMm.some((number) => number <= 0)) return null;
  const quote = normalizedText(`${label} ${value}`);
  return [{
    label: normalizedText(label),
    value: normalizedText(value),
    quote,
    semanticBasis: 'explicit_axis_sequence',
    axisOrder: ['depth', 'width', 'height'],
    grammarProfileId: HAIER_AU_HBM_TECHNICAL_DATA_FAMILY_GRAMMAR,
  }];
}

function haierHbmTableTechnicalScope(fragment, family) {
  if (family.variant !== 'column_table' || fragment.type !== 'table'
    || !Array.isArray(fragment.cells)) return null;
  const rows = new Map(fragment.cells.map((cells) => [
    normalizedText(cells[0]).toLowerCase(),
    cells,
  ]));
  const modelCells = rows.get('model no.');
  const categoryCells = rows.get('category of the model');
  const dimensionCells = [...rows.entries()].find(([label]) => /^dimensions?\s*\(/i.test(label))?.[1];
  if (!modelCells || !categoryCells || !dimensionCells
    || !/\btrade\s+mark\s+haier\b/i.test(fragment.text)) return null;
  const matchingColumns = modelCells.map((cell, index) => ({
    index,
    models: haierHbmModels(cell),
  })).filter(({ index, models }) => index > 0 && sameModelSet(models, family.models));
  if (matchingColumns.length !== 1) return null;
  const column = matchingColumns[0].index;
  if (!/^refrigerator$/i.test(normalizedText(categoryCells[column]))) return null;
  const dimensionLabel = normalizedText(dimensionCells[0]);
  const dimensionValue = normalizedText(dimensionCells[column]);
  const dimensionRows = haierHbmDimensionRows(dimensionLabel, dimensionValue);
  return dimensionRows ? { rows: dimensionRows, column } : null;
}

function haierHbmListTechnicalScope(fragment, family) {
  if (family.variant !== 'shared_list' || !['list', 'index'].includes(fragment.type)
    || !Array.isArray(fragment.listEntries)) return null;
  if (!sameModelSet(haierHbmModels(fragment.listEntries.join(' ')), family.models)
    || !fragment.listEntries.some((entry) => /^trade\s+mark\s+haier$/i.test(entry))
    || !fragment.listEntries.some((entry) => (
      /^category\s+of\s+the\s+model\s+refrigerator(?:-freezer)?$/i.test(entry)
    ))) return null;
  const dimensions = fragment.listEntries.map((entry) => (
    /^(dimensions?\s*\([^)]*\))\s+(.+)$/i.exec(entry)
  )).filter(Boolean);
  if (dimensions.length !== 1) return null;
  const rows = haierHbmDimensionRows(dimensions[0][1], dimensions[0][2]);
  return rows ? { rows } : null;
}

function haierAuHbmTechnicalFamilyScope(document, caseIdentity) {
  if (canonicalModel(caseIdentity?.brand) !== 'HAIER'
    || normalizedText(caseIdentity?.category) !== 'fridge') return null;
  const model = canonicalModel(caseIdentity?.model);
  const family = HAIER_HBM_TECHNICAL_FAMILIES.find((candidate) => (
    candidate.models.includes(model)
  ));
  if (!family) return null;
  const matches = [];
  document.pages.forEach((items, pageIndex) => {
    if (!items.some((fragment) => (
      fragment.type === 'title' && /^technical\s+data$/i.test(fragment.text)
    ))) return;
    for (const fragment of items) {
      const scope = family.variant === 'column_table'
        ? haierHbmTableTechnicalScope(fragment, family)
        : haierHbmListTechnicalScope(fragment, family);
      if (scope) matches.push({ ...scope, fragment, page: pageIndex + 1, family });
    }
  });
  return matches.length === 1 ? matches[0] : null;
}

function sectionDimensionUnit(cells, sectionIndex) {
  let hasDimensionHeader = false;
  for (let index = Math.max(0, sectionIndex - 3); index <= sectionIndex; index += 1) {
    const text = normalizedText(cells[index]?.join(' '));
    if (/\bdimensions?\b/i.test(text)) hasDimensionHeader = true;
    if (/\bdimensions?\b/i.test(text) && /\bmm\b/i.test(text)) return 'mm';
    if (/\bdimensions?\b/i.test(text) && /\bcm\b/i.test(text)) return 'cm';
  }
  if (!hasDimensionHeader) return null;
  const units = new Set();
  for (const row of cells.slice(sectionIndex)) {
    const text = normalizedText(row.join(' '));
    if (/\b(?:pack(?:ed|aging|age)?|shipping|carton|box(?:ed)?|crate)\b/i.test(text)) break;
    if (/\bmm\b/i.test(text)) units.add('mm');
    if (/\bcm\b/i.test(text)) units.add('cm');
    if (units.size > 1) return null;
  }
  if (units.size === 1) return [...units][0];
  return null;
}

function netDimensionSectionRows(fragment) {
  if (fragment.type !== 'table' || !Array.isArray(fragment.cells)) return [];
  const sectionIndex = fragment.cells.findIndex((cells) => (
    /^Net(?:\s+With\s+(?:the\s+)?handle)?$/i.test(normalizedText(cells.find(Boolean)))
  ));
  if (sectionIndex < 0) return [];
  const sectionUnit = sectionDimensionUnit(fragment.cells, sectionIndex);
  if (!sectionUnit) return [];
  const sectionLabel = normalizedText(fragment.cells[sectionIndex].find(Boolean));
  const axes = [];
  const values = [];
  for (const cells of fragment.cells.slice(sectionIndex)) {
    const text = normalizedText(cells.join(' '));
    if (/\b(?:pack(?:ed|aging|age)?|shipping|carton|box(?:ed)?|crate)\b/i.test(text)) break;
    const axisCellIndex = cells.findIndex((cell) => /\b(?:width|wide|height|high|depth|deep)\b/i.test(cell));
    const axisCell = cells[axisCellIndex];
    if (!axisCell) continue;
    const rowAxes = [...axisCell.matchAll(/\b(width|wide|height|high|depth|deep)\b/gi)]
      .map((match) => ({ width: 'Width', wide: 'Width', height: 'Height', high: 'Height', depth: 'Depth', deep: 'Depth' })[match[1].toLowerCase()]);
    const rowValues = cells.slice(axisCellIndex + 1)
      .flatMap((cell) => cell.match(/\d+(?:\.\d+)?/g) ?? []);
    if (!rowAxes.length || new Set(rowAxes).size !== rowAxes.length || !rowValues.length) continue;
    axes.push(...rowAxes);
    values.push(...rowValues);
    if (axes.length >= 3 && values.length >= 3) break;
  }
  if (axes.length !== 3 || values.length !== 3 || new Set(axes).size !== 3) return [];
  const axisOrder = axes.map((axis) => axis.toLowerCase());
  const handleQualified = /^Net\s+With/i.test(sectionLabel);
  return axes.map((axis, index) => ({
    label: handleQualified ? `${axis} (${sectionLabel} dimensions)` : axis,
    value: `${values[index]} ${sectionUnit}`,
    quote: handleQualified
      ? `${axis} ${values[index]} ${sectionUnit} (${sectionLabel} dimensions section)`
      : `${axis} ${values[index]} ${sectionUnit}`,
    semanticBasis: handleQualified
      ? 'explicit_net_with_handle_dimension_section'
      : 'explicit_label',
    axisOrder: handleQualified ? axisOrder : [axis.toLowerCase()],
  }));
}

function explicitPageDimensionUnit(items) {
  const matches = items
    .map((item) => (
      /\bdimensions?\s*\(\s*(mm|millimet(?:re|er)s?)\s*\)/i.exec(item.text)
      ?? /\b(?:all\s+measurements?|these\s+dimensions?)\b[^.]{0,120}\b(mm|millimet(?:re|er)s?)\b/i.exec(item.text)
    ))
    .filter(Boolean);
  if (!matches.length) return null;
  return { unit: 'mm', sourceLabel: normalizedText(matches[0][0]) };
}

function dimensionDiagramContext(items, fragment) {
  const tableIndex = items.indexOf(fragment);
  if (tableIndex < 1) return false;
  let headingIndex = -1;
  for (let index = tableIndex - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item.type === 'table') break;
    if (/\bdimensions?\s*\(\s*(?:mm|millimet(?:re|er)s?)\s*\)/i.test(item.text)) {
      headingIndex = index;
      break;
    }
  }
  if (headingIndex < 0) return false;
  return items.slice(headingIndex + 1, tableIndex).some((item) => (
    item.type === 'image'
    && item.bbox[1] >= items[headingIndex].bbox[1]
    && item.bbox[3] <= fragment.bbox[1]
  ));
}

function alternatingAxisRows(fragment, pageUnit, options = {}) {
  if (!pageUnit || pageUnit.unit !== 'mm' || !Array.isArray(fragment.cells)) return [];
  const pairs = [];
  for (const cells of fragment.cells) {
    if (cells.length < 2 || cells.length % 2 !== 0) return [];
    for (let index = 0; index < cells.length; index += 2) {
      const sourceAxis = normalizedText(cells[index]);
      const sourceValue = normalizedText(cells[index + 1]);
      if (!sourceAxis && !sourceValue) continue;
      const axis = /^(W|H|D)(['"′″]?)$/i.exec(sourceAxis);
      if (!axis || !/^\d+(?:\.\d+)?$/.test(sourceValue)) return [];
      pairs.push({
        sourceAxis,
        sourceValue,
        axis: axis[1].toUpperCase(),
        qualifier: axis[2],
      });
    }
  }
  if (pairs.length < 2) return [];
  const depthVariants = pairs.filter((pair) => pair.axis === 'D' && pair.qualifier);
  const plainDepths = pairs.filter((pair) => pair.axis === 'D' && !pair.qualifier);
  const depthIsAmbiguous = depthVariants.length > 0;
  const diagramPrimaryDepth = Boolean(
    options.qualifiedDepthPrimary
    && plainDepths.length === 1
    && depthVariants.length > 0
    && new Set(depthVariants.map((pair) => pair.qualifier)).size === depthVariants.length,
  );
  const labels = { W: 'Width', H: 'Height', D: 'Depth' };
  const unambiguous = pairs.filter((pair) => (
    pair.axis !== 'D'
    || (!pair.qualifier && (!depthIsAmbiguous || diagramPrimaryDepth))
  ));
  if (new Set(unambiguous.map((pair) => pair.axis)).size !== unambiguous.length) return [];
  const axisMap = { W: 'width', H: 'height', D: 'depth' };
  return unambiguous.map((pair) => ({
    label: `${labels[pair.axis]} (${pageUnit.unit})`,
    value: `${pair.sourceValue} ${pageUnit.unit}`,
    quote: `${pair.sourceAxis} ${pair.sourceValue}`,
    axisOrder: [axisMap[pair.axis]],
    ...(pair.axis === 'D' && diagramPrimaryDepth ? {
      semanticBasis: 'explicit_dimension_diagram_primary_axis',
    } : {}),
  }));
}

function exactModelTableScope(items, model) {
  return items.some((item) => item.type === 'table' && item.rows.some((row) => (
    /^models?(?:\s+(?:name|number|no\.?|code))?$/i.test(row.label)
    && containsExplicitModelExpression(row.value, model)
  )));
}

function modelExpressionTokens(value) {
  return normalizedText(value).split(/\s+\/\s+|\s*[,;]\s*/).map(normalizedText).filter(Boolean);
}

function validModelExpressionToken(token) {
  const plain = token.replace(/\*+$/, '');
  return token.length >= 5 && token.length <= 40
    && /^[A-Z0-9][A-Z0-9.-]*\**$/i.test(token)
    && /[A-Z]/i.test(plain)
    && /\d/.test(plain)
    && canonicalModel(plain).length >= 5;
}

function modelExpressionTokenMatches(token, model) {
  if (!validModelExpressionToken(token)) return false;
  const wildcardCount = token.match(/\*+$/)?.[0].length ?? 0;
  const target = canonicalModel(model);
  const prefix = canonicalModel(wildcardCount ? token.slice(0, -wildcardCount) : token);
  if (!wildcardCount) return prefix === target;
  return target.length === prefix.length + wildcardCount
    && target.startsWith(prefix)
    && /^[A-Z0-9]+$/.test(target.slice(prefix.length));
}

function modelRowGroups(items) {
  const rows = [];
  for (const [itemIndex, item] of items.entries()) {
    if (item.type !== 'table') continue;
    for (const cells of item.cells) {
      if (!/^models?(?:\s+(?:name|number|no\.?|code))?$/i.test(normalizedText(cells[0]))) continue;
      const groups = cells.slice(1).map(normalizedText).filter(Boolean).map((source) => ({
        source,
        tokens: modelExpressionTokens(source),
      }));
      rows.push({ itemIndex, groups });
    }
  }
  return rows;
}

function scopedSharedDimensionFragments(items, model, pageUnit) {
  if (!pageUnit) return new Set();
  const rows = modelRowGroups(items);
  if (rows.length !== 1 || !rows[0].groups.length) return new Set();
  const tokens = rows[0].groups.flatMap((group) => group.tokens);
  if (!tokens.length || tokens.length > 12 || tokens.some((token) => !validModelExpressionToken(token))) {
    return new Set();
  }
  const matchingGroups = rows[0].groups.filter((group) => (
    group.tokens.some((token) => modelExpressionTokenMatches(token, model))
  ));
  if (matchingGroups.length !== 1) return new Set();

  const dimensionTables = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.type === 'table' && alternatingAxisRows(item, pageUnit).length >= 2);
  if (dimensionTables.length === 1) return new Set([dimensionTables[0].item]);

  const selected = dimensionTables.filter(({ item, index }, tablePosition) => {
    if (containsExplicitModelExpression(item.captionText, model)) return true;
    if (item.captionText) return false;
    const previousDimensionIndex = tablePosition > 0 ? dimensionTables[tablePosition - 1].index : -1;
    return items.slice(previousDimensionIndex + 1, index).reverse().some((candidate) => (
      ['title', 'paragraph', 'text'].includes(candidate.type)
      && containsExplicitModelExpression(candidate.text, model)
    ));
  });
  return selected.length === 1 ? new Set([selected[0].item]) : new Set();
}

function explicitDocumentModelList(document, model) {
  const target = canonicalModel(model);
  const lists = new Map();
  for (const fragment of document.pages.flat()) {
    if (fragment.type === 'table'
      || !/\b(?:models?|model\s+(?:code\/s|codes?|numbers?|no\.?s?))\s*:/i.test(fragment.text)) continue;
    const tokens = (fragment.text.toUpperCase().match(/\b[A-Z][A-Z0-9.-]{3,}\d[A-Z0-9.-]*\b/g) ?? [])
      .map(canonicalModel)
      .filter((token) => token.length >= 5 && token.length <= 40);
    const unique = [...new Set(tokens)];
    if (unique.length < 2 || unique.length > 24 || !unique.includes(target)) continue;
    const sharedPrefix = Math.min(6, Math.floor(target.length / 2));
    if (unique.some((token) => commonPrefixLength(token, target) < sharedPrefix)) continue;
    lists.set([...unique].sort().join('\0'), unique);
  }
  return lists.size === 1 ? [...lists.values()][0] : [];
}

function uniqueModelSegmentation(value, models) {
  const source = canonicalModel(value);
  if (!source) return null;
  const candidates = [...new Set(models.map(canonicalModel))]
    .filter(Boolean)
    .sort((left, right) => right.length - left.length || left.localeCompare(right));
  const solutions = [];
  const visit = (offset, parts) => {
    if (solutions.length > 1) return;
    if (offset === source.length) {
      solutions.push(parts);
      return;
    }
    for (const candidate of candidates) {
      if (parts.includes(candidate) || !source.startsWith(candidate, offset)) continue;
      visit(offset + candidate.length, [...parts, candidate]);
    }
  };
  visit(0, []);
  return solutions.length === 1 ? solutions[0] : null;
}

function exactModelGroupedColumnRows(fragment, model, documentedModels) {
  if (fragment.type !== 'table' || documentedModels.length < 2) return [];
  const modelRows = fragment.cells
    .map((cells, index) => ({ cells, index }))
    .filter(({ cells }) => /^models?$/i.test(normalizedText(cells[0])));
  if (modelRows.length !== 1) return [];
  const header = modelRows[0];
  const groups = header.cells.slice(1).map((cell) => uniqueModelSegmentation(cell, documentedModels));
  if (!groups.length || groups.some((group) => !group?.length)) return [];
  const flattened = groups.flat();
  if (flattened.length !== new Set(flattened).size
    || flattened.length !== documentedModels.length
    || documentedModels.some((candidate) => !flattened.includes(canonicalModel(candidate)))) return [];
  const target = canonicalModel(model);
  const targetGroups = groups
    .map((group, index) => ({ group, index }))
    .filter(({ group }) => group.includes(target));
  if (targetGroups.length !== 1) return [];

  const rows = [];
  for (const cells of fragment.cells.slice(header.index + 1)) {
    if (cells.length <= groups.length) continue;
    const values = cells.slice(-groups.length);
    const labels = cells.slice(0, -groups.length);
    const axis = [...labels].reverse().find((cell) => /^(?:width|height|depth)$/i.test(normalizedText(cell)));
    if (!axis) continue;
    const value = normalizedText(values[targetGroups[0].index]);
    if (!/^\d+(?:\.\d+)?\s*(?:mm|cm)$/i.test(value)) continue;
    rows.push({
      label: normalizedText(axis),
      value,
      quote: `${normalizedText(axis)} ${value}`,
      semanticBasis: 'exact_model_grouped_column',
    });
  }
  const axisOrder = rows.map((row) => row.label.toLowerCase());
  if (rows.length !== 3 || new Set(axisOrder).size !== 3
    || !['width', 'height', 'depth'].every((axis) => axisOrder.includes(axis))) return [];
  return rows.map((row) => ({ ...row, axisOrder }));
}

const MATRIX_DIMENSION_FIELDS = Object.freeze([
  'closedEnvelope.heightMm',
  'closedEnvelope.widthMm',
  'closedEnvelope.depthMm',
  'operation.doorOpenDepthMm',
]);
const MATRIX_FIELD_AXIS = Object.freeze({
  'closedEnvelope.heightMm': 'height',
  'closedEnvelope.widthMm': 'width',
  'closedEnvelope.depthMm': 'depth',
  'operation.doorOpenDepthMm': 'depth',
});

function matrixHeaderField(value) {
  const label = normalizedText(value);
  for (const field of MATRIX_DIMENSION_FIELDS) {
    const rule = evidenceFieldRules[field];
    if (rule.label.test(label) && !(rule.reject && rule.reject.test(label))) return { field, label };
  }
  return null;
}

function matrixDimensionShape(fragment) {
  if (fragment.type !== 'table') return null;
  for (let headerIndex = 0; headerIndex < fragment.cells.length; headerIndex += 1) {
    const columns = fragment.cells[headerIndex]
      .map((value, index) => ({ index, ...matrixHeaderField(value) }))
      .filter((column) => column.field);
    const closedAxes = new Set(columns
      .filter((column) => column.field.startsWith('closedEnvelope.'))
      .map((column) => column.field));
    if (closedAxes.size >= 2) return { headerIndex, columns };
  }
  return null;
}

function exactModelMatrixRows(fragment, model, pageUnit) {
  const shape = matrixDimensionShape(fragment);
  if (!shape) return [];
  const rows = [];
  const axisOrder = [...new Set(shape.columns.map((column) => MATRIX_FIELD_AXIS[column.field]).filter(Boolean))];
  for (const cells of fragment.cells.slice(shape.headerIndex + 1)) {
    if (cells.every((cell) => !normalizedText(cell))) break;
    const modelExpression = normalizedText(cells[0]);
    if (!modelExpression) break;
    if (!containsExplicitModelExpression(modelExpression, model)) continue;
    for (const column of shape.columns) {
      const rawValue = normalizedText(cells[column.index]);
      if (!/^\d+(?:\.\d+)?(?:\s*(?:-|–|—|\bto\b)\s*\d+(?:\.\d+)?)?(?:\s*(?:mm|cm))?$/i.test(rawValue)) continue;
      const hasUnit = /(?<![A-Za-z])(?:mm|cm)\b/i.test(rawValue);
      if (!hasUnit && !pageUnit) continue;
      const sourceUnit = hasUnit ? /(?<![A-Za-z])cm\b/i.test(rawValue) ? 'cm' : 'mm' : pageUnit.unit;
      rows.push({
        label: column.label,
        value: hasUnit ? rawValue : `${rawValue} ${sourceUnit}`,
        quote: `${column.label} ${rawValue} ${sourceUnit}`,
        semanticBasis: 'exact_model_matrix_row',
        axisOrder,
      });
    }
    if (rows.length) break;
  }
  return rows;
}

function hasExactModelDimensionMatrix(fragment, model) {
  const shape = matrixDimensionShape(fragment);
  return Boolean(shape && fragment.cells.slice(shape.headerIndex + 1)
    .some((cells) => containsExplicitModelExpression(cells[0], model)));
}

function commonPrefixLength(left, right) {
  let index = 0;
  while (index < left.length && index < right.length && left[index] === right[index]) index += 1;
  return index;
}

function unresolvedFamilyScope(document, model) {
  const target = model.toUpperCase().replace(/[^A-Z0-9]/g, '');
  for (const items of document.pages) {
    const familyRows = modelRowGroups(items);
    if (familyRows.some((row) => {
      const tokens = row.groups.flatMap((group) => group.tokens);
      return tokens.length > 1
        && tokens.every(validModelExpressionToken)
        && tokens.some((token) => modelExpressionTokenMatches(token, model));
    })) return true;
  }
  for (const fragment of document.pages.flat()) {
    if (!containsExplicitModelExpression(fragment.text, model)) continue;
    if (hasExactModelDimensionMatrix(fragment, model)) continue;
    const candidates = (fragment.text.toUpperCase().match(/\b[A-Z][A-Z0-9-]{3,}\d[A-Z0-9/-]*\b/g) ?? [])
      .map((value) => value.replace(/[^A-Z0-9]/g, ''))
      .filter((value) => value !== target && value.length >= 5);
    if (candidates.some((value) => commonPrefixLength(value, target) >= Math.min(6, Math.floor(target.length / 2)))) {
      return true;
    }
  }
  return false;
}

function canonicalModel(value) {
  return normalizedText(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function siblingModelCandidates(document, model) {
  const target = canonicalModel(model);
  return document.pages.flat().flatMap((fragment) => (
    fragment.text.toUpperCase().match(/\b[A-Z][A-Z0-9-]{3,}\d[A-Z0-9/-]*\b/g) ?? []
  ))
    .map(canonicalModel)
    .filter((candidate) => (
      candidate !== target
      && candidate.length >= 5
      && commonPrefixLength(candidate, target) >= Math.min(6, Math.floor(target.length / 2))
    ));
}

function exactModelSourceUrl(sourceUrls, model) {
  if (!Array.isArray(sourceUrls)) return null;
  return sourceUrls.find((value) => containsExactModelDocumentUrl(value, model)) ?? null;
}

function exactModelQuerySourceUrl(sourceUrls, model) {
  if (!Array.isArray(sourceUrls)) return null;
  const target = canonicalModel(model);
  return sourceUrls.find((value) => {
    try {
      const url = new URL(value);
      return ['modelNumber', 'modelName', 'model', 'sku'].some((name) => (
        canonicalModel(url.searchParams.get(name)) === target
      ));
    } catch {
      return false;
    }
  }) ?? null;
}

function repeatedExactPageHeaderPages(document, model, sourceUrls) {
  if (!exactModelSourceUrl(sourceUrls, model) && !exactModelQuerySourceUrl(sourceUrls, model)) {
    return new Set();
  }
  const headerDocument = {
    pages: document.pages.map((items) => items.filter((item) => item.type === 'page_header')),
  };
  if (siblingModelCandidates(headerDocument, model).length) return new Set();
  const pages = headerDocument.pages
    .map((items, index) => ({ items, page: index + 1 }))
    .filter(({ items }) => items.some((item) => containsExplicitModelExpression(item.text, model)))
    .map(({ page }) => page);
  return pages.length >= 2 ? new Set(pages) : new Set();
}

function uniqueCoverIdentityScope(document, model, sourceUrls) {
  const coverHasExactModel = document.pages[0]?.some((item) => (
    ['title', 'page_footer', 'paragraph'].includes(item.type)
    && containsExplicitModelExpression(item.text, model)
  ));
  return Boolean(
    coverHasExactModel
    && exactModelSourceUrl(sourceUrls, model)
    && siblingModelCandidates(document, model).length === 0,
  );
}

function boschDishwasherDimensionSectionDocumentScope(document, caseIdentity, sourceUrls) {
  if (canonicalModel(caseIdentity?.brand) !== 'BOSCH'
    || caseIdentity?.category !== 'dishwasher') return null;
  const model = normalizedText(caseIdentity?.model);
  const exactDocumentUrl = exactModelSourceUrl(sourceUrls, model);
  if (!exactDocumentUrl || siblingModelCandidates(document, model).length) return null;
  const titlePages = [...new Set(document.pages.flatMap((items, pageIndex) => (
    items.some((item) => item.type === 'title'
      && containsExplicitModelExpression(item.identityText ?? item.text, model))
      ? [pageIndex + 1]
      : []
  )))];
  if (!uniqueCoverIdentityScope(document, model, sourceUrls) && titlePages.length < 2) return null;
  return { exactDocumentUrl, titlePages };
}

function uniqueCoverFallbackSignals(document, model) {
  return (document.pages[0] ?? [])
    .filter((item) => item.type === 'page_footer' && containsExplicitModelExpression(item.text, model))
    .map((item) => ({
      type: 'mineru_page_footer_model',
      value: `${model}:page:1:${item.fragmentSha256}`,
    }))
    .sort((left, right) => left.value.localeCompare(right.value));
}

function documentScopedDimensionMatrixRows(fragment) {
  const shape = matrixDimensionShape(fragment);
  if (!shape) return [];
  const requiredFields = [
    'closedEnvelope.widthMm',
    'closedEnvelope.heightMm',
    'closedEnvelope.depthMm',
  ];
  const closedColumns = shape.columns.filter((column) => requiredFields.includes(column.field));
  if (closedColumns.length !== requiredFields.length
    || new Set(closedColumns.map((column) => column.field)).size !== requiredFields.length) return [];

  const axisOrder = closedColumns.map((column) => MATRIX_FIELD_AXIS[column.field]);
  for (const cells of fragment.cells.slice(shape.headerIndex + 1)) {
    const values = closedColumns.map((column) => normalizedText(cells[column.index]));
    if (!values.every((value) => /^\d+(?:\.\d+)?\s*(?:mm|cm)$/i.test(value))) continue;
    return closedColumns.map((column, index) => ({
      label: column.label,
      value: values[index],
      quote: `${column.label} ${values[index]}`,
      semanticBasis: 'document_unique_dimension_matrix',
      axisOrder,
    }));
  }
  return [];
}

function documentScopedExplicitAxisRows(fragment) {
  if (fragment.type !== 'table') return [];
  if (fragment.rows.some((row) => /\b(?:pack(?:age|aging|ed)?|carton|shipping)\b/i.test(row.label))) return [];
  const axes = new Map();
  for (const row of fragment.rows) {
    const match = /^(?:product\s+)?(width|height|depth)(?:\s*\(\s*(?:mm|cm)\s*\))?\s*:?$/i.exec(row.label);
    if (!match || !/^\d+(?:\.\d+)?(?:\s*(?:-|–|—|\bto\b)\s*\d+(?:\.\d+)?)?\s*(?:mm|cm)$/i.test(row.value)) continue;
    const axis = match[1].toLowerCase();
    if (axes.has(axis)) return [];
    axes.set(axis, row);
  }
  return ['width', 'height', 'depth'].every((axis) => axes.has(axis))
    ? ['width', 'height', 'depth'].map((axis) => axes.get(axis))
    : [];
}

function indexedProductDimensionRows(fragment) {
  if (fragment.type !== 'table' || !Array.isArray(fragment.cells)) return [];
  const headerIndex = fragment.cells.findIndex((cells) => (
    /^product\s+dimensions?\s*[([]\s*(mm|cm)\s*[)\]]\s*:?$/i
      .test(normalizedText(cells.join(' ')))
  ));
  if (headerIndex < 0) return [];
  const header = normalizedText(fragment.cells[headerIndex].join(' '));
  const unit = /\bcm\b/i.test(header) ? 'cm' : 'mm';
  const rows = new Map();
  for (const cells of fragment.cells.slice(headerIndex + 1)) {
    const joined = normalizedText(cells.join(' '));
    if (/^(?:cabinetry|cabinet|cavity|cut[ -]?out|installation|pack(?:age|aged|aging)?|shipping)\s+dimensions?\b/i.test(joined)) {
      break;
    }
    if (cells.length < 3) continue;
    const label = normalizedText(cells.at(-2));
    const value = normalizedText(cells.at(-1));
    if (!/^\d+(?:\.\d+)?(?:\s*(?:mm|cm))?$/i.test(value)
      || /\b(?:pack(?:age|aged|aging)?|shipping|carton|cavity|cabinet|cut[ -]?out)\b/i.test(label)) {
      continue;
    }
    let field = null;
    let axis = null;
    if (/\b(?:overall|product|external|appliance)\b.*\bheight\b|\bheight\b.*\b(?:overall|product|external|appliance)\b/i.test(label)) {
      field = 'closedEnvelope.heightMm'; axis = 'height';
    } else if (/\b(?:overall|product|external|appliance)\b.*\bwidth\b|\bwidth\b.*\b(?:overall|product|external|appliance)\b/i.test(label)) {
      field = 'closedEnvelope.widthMm'; axis = 'width';
    } else if (/\b(?:overall|product|external|appliance)\b.*\bdepth\b|\bdepth\b.*\b(?:overall|product|external|appliance)\b/i.test(label)
      && !/\b(?:open|opened)\b/i.test(label)) {
      field = 'closedEnvelope.depthMm'; axis = 'depth';
    }
    if (!field) continue;
    if (rows.has(field)) return [];
    rows.set(field, {
      label,
      value: /\b(?:mm|cm)\b/i.test(value) ? value : `${value} ${unit}`,
      quote: `${label} ${value} ${unit}`,
      semanticBasis: 'explicit_indexed_product_dimension_section',
      axisOrder: [axis],
    });
  }
  const required = [
    'closedEnvelope.widthMm',
    'closedEnvelope.heightMm',
    'closedEnvelope.depthMm',
  ];
  if (!required.every((field) => rows.has(field))) return [];
  return required
    .map((field) => rows.get(field))
    .filter(Boolean);
}

function exactChiqAuSpecUrl(sourceUrls, model) {
  if (!Array.isArray(sourceUrls)) return null;
  const target = canonicalModel(model);
  if (!target) return null;
  return sourceUrls.find((value) => {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'chiq.com.au'
        || !url.pathname.toLowerCase().startsWith('/cdn/shop/files/')) return false;
      const filename = decodeURIComponent(url.pathname.split('/').pop() ?? '');
      const match = /^(.+?)_(?:spec|specifications_sheet)\.pdf$/i.exec(filename);
      return Boolean(match && canonicalModel(match[1]) === target);
    } catch {
      return false;
    }
  }) ?? null;
}

function chiqOfficialSpecLikeFragment(fragment) {
  return fragment?.type === 'table' && fragment.cells.some((cells) => (
    cells.some((cell) => /^(?:packing|product)\s+dimensions?(?:\s*\(\s*WHD\s*\)\s*mm)?$/i
      .test(normalizedText(cell)))
  ));
}

function chiqOfficialSpecDimensionRows(fragment) {
  if (fragment?.type !== 'table' || !Array.isArray(fragment.cells)) return [];
  const packingRows = fragment.cells.filter((cells) => (
    /^packing\s+dimensions?\s*\(\s*WHD\s*\)\s*mm$/i.test(normalizedText(cells[0]))
  ));
  const productRows = fragment.cells.filter((cells) => (
    /^product\s+dimensions?(?:\s*\(\s*WHD\s*\)\s*mm)?$/i.test(normalizedText(cells[0]))
  ));
  if (packingRows.length !== 1 || productRows.length !== 1) return [];
  const tuple = (value) => {
    const match = /^(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)$/i
      .exec(normalizedText(value));
    return match ? match.slice(1).map(Number) : null;
  };
  const productHasExplicitContext = /^product\s+dimensions?\s*\(\s*WHD\s*\)\s*mm$/i
    .test(normalizedText(productRows[0][0]));
  if (!productHasExplicitContext && !tuple(packingRows[0][1])) return [];
  const product = tuple(productRows[0][1]);
  if (!product || product.some((value) => !Number.isFinite(value) || value <= 0)) return [];
  const axes = ['width', 'height', 'depth'];
  return axes.map((axis, index) => ({
    label: `Product ${axis[0].toUpperCase()}${axis.slice(1)}`,
    value: `${product[index]} mm`,
    quote: `${normalizedText(productRows[0][0])}: product ${axis} ${product[index]} mm`,
    semanticBasis: 'chiq_official_spec_product_whd',
    axisOrder: axes,
  }));
}

function chiqOfficialSpecScope(document, caseIdentity, sourceUrls) {
  if (canonicalModel(caseIdentity?.brand) !== 'CHIQ'
    || normalizedText(caseIdentity?.category) !== 'fridge') return null;
  const target = canonicalModel(caseIdentity?.model);
  if (!/^[A-Z]{2,}[A-Z0-9]{3,}$/.test(target)) return null;
  const exactDocumentUrl = exactChiqAuSpecUrl(sourceUrls, target);
  if (!exactDocumentUrl) return null;
  const firstPageIdentity = (document.pages[0] ?? []).filter((fragment) => (
    ['title', 'page_header', 'paragraph'].includes(fragment.type)
      && containsExplicitModelExpression(fragment.text, target)
  ));
  if (firstPageIdentity.length !== 1 || siblingModelCandidates(document, target).length) return null;
  const matches = [];
  document.pages.forEach((items, pageIndex) => {
    for (const fragment of items) {
      const rows = chiqOfficialSpecDimensionRows(fragment);
      if (rows.length === 3) matches.push({ fragment, rows, page: pageIndex + 1 });
    }
  });
  if (matches.length !== 1) return null;
  return {
    ...matches[0],
    exactDocumentUrl,
    identityFragmentSha256: firstPageIdentity[0].fragmentSha256,
  };
}

function oneCharacterVariantFamily(models) {
  const normalized = [...new Set(models.map(canonicalModel).filter(Boolean))];
  if (normalized.length < 2 || normalized.length > 8
    || new Set(normalized.map((model) => model.length)).size !== 1) return null;
  const differingIndexes = [];
  for (let index = 0; index < normalized[0].length; index += 1) {
    if (new Set(normalized.map((model) => model[index])).size > 1) differingIndexes.push(index);
  }
  if (differingIndexes.length !== 1) return null;
  const differingIndex = differingIndexes[0];
  const familyModels = new Set(normalized.map((model) => (
    model.slice(0, differingIndex) + model.slice(differingIndex + 1)
  )));
  if (familyModels.size !== 1) return null;
  const familyModel = [...familyModels][0];
  return familyModel.length >= 5 ? { familyModel, models: normalized, differingIndex } : null;
}

function structuredFinishVariantDocumentScope(document, model) {
  const target = canonicalModel(model);
  const candidateTables = [];
  document.pages.forEach((items, pageIndex) => {
    for (const fragment of items) {
      if (fragment.type !== 'table') continue;
      const cells = fragment.cells.flat().map(normalizedText).filter(Boolean);
      const headingIndex = cells.findIndex((cell) => (
        /^(?:available\s+)?(?:finish(?:es)?|colou?r(?:s)?)(?:\s+options?)?\s*:?$/i.test(cell)
      ));
      if (headingIndex < 0) continue;
      const scopedText = normalizedText(cells.slice(headingIndex, headingIndex + 4).join(' '));
      if (!/\b(?:available|offered)\b/i.test(scopedText)
        || !/\b(?:finish|colou?r)\b/i.test(scopedText)
        || !containsExplicitModelExpression(scopedText, model)) continue;
      const modelTokens = [...new Set(
        (scopedText.toUpperCase().match(/\b[A-Z][A-Z0-9.-]{3,}\d[A-Z0-9.-]*\b/g) ?? [])
          .map(canonicalModel)
          .filter((token) => token.length >= 5 && token.length <= 40),
      )];
      const variants = oneCharacterVariantFamily(modelTokens);
      if (!variants || !variants.models.includes(target)) continue;
      candidateTables.push({ fragment, page: pageIndex + 1, ...variants });
    }
  });
  if (candidateTables.length !== 1) return null;
  const candidate = candidateTables[0];
  const familyHeadings = document.pages.flat().filter((fragment) => (
    ['title', 'page_header'].includes(fragment.type)
      && containsExplicitModelExpression(fragment.text, candidate.familyModel)
  ));
  if (!familyHeadings.length) return null;
  const allowedModels = new Set([candidate.familyModel, ...candidate.models]);
  if (siblingModelCandidates(document, model).some((sibling) => !allowedModels.has(sibling))) {
    return null;
  }
  const dimensionFragments = document.pages.flat()
    .map((fragment) => ({ fragment, rows: indexedProductDimensionRows(fragment) }))
    .filter(({ rows }) => rows.length >= 3);
  if (dimensionFragments.length !== 1) return null;
  return {
    ...candidate,
    familyHeadingFragmentSha256s: familyHeadings
      .map((fragment) => fragment.fragmentSha256)
      .sort(),
    dimensionFragment: dimensionFragments[0].fragment,
    dimensionRows: dimensionFragments[0].rows,
  };
}

function fixedWidthModelChunks(value, targetModel) {
  const target = canonicalModel(targetModel);
  if (target.length < 8 || target.length > 24) return [];
  return normalizedText(value).toUpperCase().split(/[^A-Z0-9]+/)
    .flatMap((token) => {
      if (!token || token.length % target.length !== 0) return [];
      const chunks = [];
      for (let offset = 0; offset < token.length; offset += target.length) {
        const chunk = token.slice(offset, offset + target.length);
        if (!/^[A-Z]{2,}[A-Z0-9]*\d[A-Z0-9]*$/.test(chunk)
          || commonPrefixLength(chunk, target) < Math.min(6, Math.floor(target.length / 2))) {
          return [];
        }
        chunks.push(chunk);
      }
      return chunks;
    });
}

function dimensionUnitFromPageTables(items) {
  const units = new Set();
  for (const item of items) {
    if (item.type !== 'table') continue;
    for (const cells of item.cells) {
      const text = normalizedText(cells.join(' '));
      const match = /\bdimensions?\b[^\n]{0,80}\b(mm|cm)\b/i.exec(text);
      if (match) units.add(match[1].toLowerCase());
    }
  }
  return units.size === 1 ? [...units][0] : null;
}

function fisherPaykelDw60InstallationRows(fragment, pageUnit) {
  if (fragment.type !== 'table' || !pageUnit || !Array.isArray(fragment.cells)) return [];
  const headerIndex = fragment.cells.findIndex((cells) => (
    /^product\s+dimensions?$/i.test(normalizedText(cells.find(Boolean)))
  ));
  if (headerIndex < 0) return [];
  const scalar = (value) => {
    const match = /^(\d+(?:\.\d+)?)\s*\**$/i.exec(normalizedText(value));
    return match ? match[1] : null;
  };
  const range = (value) => {
    const matches = [...normalizedText(value).matchAll(
      /(\d+(?:\.\d+)?)\s*(?:\(\s*min(?:imum)?\s*\))?\s*(?:-|–|—|\bto\b)\s*(\d+(?:\.\d+)?)\s*(?:\(\s*max(?:imum)?\s*\))?/gi,
    )];
    return matches.map((match) => `${match[1]} - ${match[2]}`);
  };
  const semanticLabel = (value) => normalizedText(value)
    .replace(/\bproductwith\b/gi, 'product with')
    .replace(/\bplacewith\b/gi, 'place with');
  let height = null;
  let width = null;
  let depth = null;
  const rows = fragment.cells.slice(headerIndex + 1);
  for (let index = 0; index < rows.length; index += 1) {
    const label = semanticLabel(rows[index].slice(0, -1).join(' '));
    const value = normalizedText(rows[index].at(-1));
    if (/\boverall\s+height\s+of\s+product\b/i.test(label)) {
      const directRanges = range(value);
      if (directRanges.length === 1) height = directRanges[0];
      else if (directRanges.length === 2
        && /\bwith\s+top\s+panel\s+in\s+place\b[\s\S]*\bwith\s+top\s+panel\s+removed\b/i.test(label)) {
        [height] = directRanges;
      }
      const nextLabel = semanticLabel(rows[index + 1]?.slice(0, -1).join(' '));
      const nextRanges = range(rows[index + 1]?.at(-1));
      if (!height && /\bwith\s+top\s+panel\s+in\s+place\b/i.test(nextLabel)) {
        if (/\bwith\s+top\s+panel\s+in\s+place\b[\s\S]*\bwith\s+top\s+panel\s+removed\b/i.test(nextLabel)) {
          if (nextRanges.length === 2) [height] = nextRanges;
        } else if (!/\bwith\s+top\s+panel\s+removed\b/i.test(nextLabel)
          && nextRanges.length === 1) {
          [height] = nextRanges;
        }
      }
    } else if (/\boverall\s+width\s+of\s+product\b/i.test(label)) {
      width = scalar(value);
    } else if (/\boverall\s+depth\s+of\s+product\b/i.test(label)
      && !/\b(?:open|opened)\b/i.test(label)) {
      depth = scalar(value);
    }
  }
  if (!height || !width || !depth) return [];
  return [
    {
      label: 'Overall height of product with top panel in place',
      value: `${height} ${pageUnit}`,
      quote: `Overall height of product with top panel in place ${height} ${pageUnit}`,
      semanticBasis: 'explicit_label_range',
      axisOrder: ['height'],
    },
    {
      label: 'Overall width of product',
      value: `${width} ${pageUnit}`,
      quote: `Overall width of product ${width} ${pageUnit}`,
      semanticBasis: 'fisher_paykel_dw60_installation_matrix',
      axisOrder: ['width'],
    },
    {
      label: 'Overall depth of product',
      value: `${depth} ${pageUnit}`,
      quote: `Overall depth of product ${depth} ${pageUnit}`,
      semanticBasis: 'fisher_paykel_dw60_installation_matrix',
      axisOrder: ['depth'],
    },
  ];
}

function exactSamsungAuWasherDownloadUrl(sourceUrls, model) {
  const target = canonicalModel(model);
  if (!Array.isArray(sourceUrls) || !target) return null;
  return sourceUrls.find((value) => {
    try {
      const url = new URL(value);
      return url.hostname.toLowerCase() === 'org.downloadcenter.samsung.com'
        && /^\/downloadfile\/contentsfile\.aspx$/i.test(url.pathname)
        && normalizedText(url.searchParams.get('CDSite')).toUpperCase() === 'UNI_AU'
        && normalizedText(url.searchParams.get('CDCttType')).toUpperCase() === 'UM'
        && canonicalModel(url.searchParams.get('ModelName')) === target;
    } catch {
      return false;
    }
  }) ?? null;
}

function samsungWildcardDefinitionFragments(document) {
  return document.pages.flatMap((items, pageIndex) => items
    .filter((fragment) => (
      ['paragraph', 'text', 'list'].includes(fragment.type)
      && /asterisk\s*\(s\)\s+means?\s+variant\s+model\b/i.test(fragment.text)
      && /\b0\s*-\s*9\b/i.test(fragment.text)
      && /\bA\s*-\s*Z\b/i.test(fragment.text)
    ))
    .map((fragment) => ({ fragment, page: pageIndex + 1 })));
}

function samsungWasherWildcardSpecificationRows(fragment, model) {
  if (fragment.type !== 'table' || !Array.isArray(fragment.cells)) return null;
  if (!fragment.cells.some((cells) => (
    cells.some((cell) => /^type$/i.test(normalizedText(cell)))
      && cells.some((cell) => /^front\s+loading\s+washing\s+machine$/i.test(normalizedText(cell)))
  ))) return null;
  const modelRows = fragment.cells.flatMap((cells, index) => {
    const labelIndex = cells.findIndex((cell) => /^model\s+name$/i.test(normalizedText(cell)));
    if (labelIndex < 0) return [];
    const tokens = normalizedText(cells.slice(labelIndex + 1).join(' '))
      .match(/[A-Z][A-Z0-9.-]{4,}\*+/gi) ?? [];
    return tokens.length === 1 ? [{ index, token: tokens[0] }] : [];
  });
  if (modelRows.length !== 1) return null;
  const [{ index: modelRowIndex, token }] = modelRows;
  const wildcardCount = token.match(/\*+$/)?.[0].length ?? 0;
  if (!wildcardCount || wildcardCount > 12 || !modelExpressionTokenMatches(token, model)) return null;
  const dimensionSectionIndex = fragment.cells.findIndex((cells, index) => (
    index > modelRowIndex && cells.some((cell) => /^dimensions?$/i.test(normalizedText(cell)))
  ));
  if (dimensionSectionIndex < 0) return null;
  const rows = [];
  const axes = new Set();
  for (const cells of fragment.cells.slice(dimensionSectionIndex, dimensionSectionIndex + 4)) {
    const axisIndex = cells.findIndex((cell) => /^(?:width|height|depth)$/i.test(normalizedText(cell)));
    if (axisIndex < 0) continue;
    const axis = normalizedText(cells[axisIndex]).toLowerCase();
    const values = cells.slice(axisIndex + 1)
      .map((cell) => /^(\d+(?:\.\d+)?)\s*(mm|cm)$/i.exec(normalizedText(cell)))
      .filter(Boolean);
    if (values.length !== 1 || axes.has(axis)) return null;
    axes.add(axis);
    rows.push({
      label: axis[0].toUpperCase() + axis.slice(1),
      value: `${values[0][1]} ${values[0][2].toLowerCase()}`,
      quote: `${axis[0].toUpperCase() + axis.slice(1)} ${values[0][1]} ${values[0][2].toLowerCase()}`,
      semanticBasis: 'samsung_wildcard_specification_axis',
      axisOrder: [axis],
    });
  }
  if (rows.length !== 3 || !['width', 'height', 'depth'].every((axis) => axes.has(axis))) return null;
  return { token, rows };
}

function samsungAuWasherWildcardSpecificationScope(document, caseIdentity, sourceUrls) {
  if (canonicalModel(caseIdentity?.brand) !== 'SAMSUNG'
    || normalizedText(caseIdentity?.category) !== 'washing_machine') return null;
  const target = canonicalModel(caseIdentity?.model);
  if (!/^WW[A-Z0-9]{6,20}$/.test(target)) return null;
  const exactDownloadUrl = exactSamsungAuWasherDownloadUrl(sourceUrls, target);
  if (!exactDownloadUrl) return null;
  const variantDefinitions = samsungWildcardDefinitionFragments(document);
  if (!variantDefinitions.length) return null;
  const matches = [];
  document.pages.forEach((items, pageIndex) => {
    for (const fragment of items) {
      const specification = samsungWasherWildcardSpecificationRows(fragment, target);
      if (specification) matches.push({
        fragment,
        page: pageIndex + 1,
        pattern: specification.token,
        rows: specification.rows,
      });
    }
  });
  if (matches.length !== 1) return null;
  return {
    ...matches[0],
    exactDownloadUrl,
    variantDefinitionFragmentSha256s: variantDefinitions
      .map(({ fragment }) => fragment.fragmentSha256).sort(),
  };
}

function exactFisherPaykelDw60DocumentUrl(sourceUrls, model) {
  const target = canonicalModel(model);
  if (!Array.isArray(sourceUrls) || !target) return null;
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `(?:^|[-_.])${escaped}[-_.]+FREESTANDING[-_.]*DISHWASHER`
      + `(?:[-_.]+(?:AU|NZ)){1,3}(?:[-_.]+[A-Z0-9]{4,16})?$`,
    'i',
  );
  return sourceUrls.find((value) => {
    try {
      const url = new URL(value);
      if (url.hostname.toLowerCase() !== 'dam.fisherpaykel.com') return false;
      const filename = decodeURIComponent(url.pathname.split('/').pop() ?? '');
      return pattern.test(filename.replace(/\.pdf$/i, ''));
    } catch {
      return false;
    }
  }) ?? null;
}

function fisherPaykelDw60ApplicabilityScope(document, caseIdentity, sourceUrls) {
  if (normalizedText(caseIdentity?.brand).toLowerCase() !== 'fisher & paykel'
    || normalizedText(caseIdentity?.category) !== 'dishwasher') return null;
  const target = canonicalModel(caseIdentity?.model);
  const exactDocumentUrl = exactModelSourceUrl(sourceUrls, target)
    ?? exactFisherPaykelDw60DocumentUrl(sourceUrls, target);
  if (!/^DW60[A-Z0-9]{4,16}$/.test(target) || !exactDocumentUrl) return null;
  const applicabilityTables = [];
  document.pages.forEach((items, pageIndex) => {
    for (const fragment of items) {
      if (fragment.type !== 'table') continue;
      const models = [...new Set(fragment.cells.flatMap((cells) => (
        cells.flatMap((cell) => fixedWidthModelChunks(cell, target))
      )))];
      if (models.length < 2 || models.length > 12 || !models.includes(target)) continue;
      const familyPrefixes = fragment.cells.flatMap((cells) => cells)
        .filter((cell) => /\bmodels?\b/i.test(normalizedText(cell)))
        .flatMap((cell) => {
          const source = canonicalModel(normalizedText(cell).replace(/\bmodels?\b/gi, ''));
          const matches = [];
          for (let removed = 1; removed <= 4; removed += 1) {
            const prefix = target.slice(0, -removed);
            if (prefix.length >= 6 && /\d$/.test(prefix) && source.includes(prefix)) matches.push(prefix);
          }
          return matches;
        });
      const familyModel = familyPrefixes.sort((left, right) => right.length - left.length)[0];
      if (!familyModel) continue;
      applicabilityTables.push({ fragment, page: pageIndex + 1, familyModel, models });
    }
  });
  if (applicabilityTables.length !== 1) return null;
  const applicability = applicabilityTables[0];
  const dimensions = [];
  document.pages.forEach((items, pageIndex) => {
    const page = pageIndex + 1;
    if (page < applicability.page || page > applicability.page + 2) return;
    const pageUnit = dimensionUnitFromPageTables(items);
    for (const fragment of items) {
      const rows = fisherPaykelDw60InstallationRows(fragment, pageUnit);
      if (rows.length === 3) dimensions.push({ fragment, page, rows });
    }
  });
  if (dimensions.length !== 1) return null;
  return {
    ...applicability,
    exactDocumentUrl,
    dimensionFragment: dimensions[0].fragment,
    dimensionPage: dimensions[0].page,
    dimensionRows: dimensions[0].rows,
  };
}

function fisherPaykelRf610SupportRows(fragment) {
  if (fragment.type !== 'table' || !Array.isArray(fragment.cells)) return null;
  const headerRows = fragment.cells.flatMap((cells, rowIndex) => {
    if (!/^product\s+dimensions?\s*\(\s*mm\s*\)$/i.test(normalizedText(cells[0]))) return [];
    const targetColumns = cells.flatMap((cell, columnIndex) => (
      /^RF610\s*\/\s*RF540A$/i.test(normalizedText(cell)) ? [columnIndex] : []
    ));
    return targetColumns.length === 1 ? [{ rowIndex, columnIndex: targetColumns[0] }] : [];
  });
  if (headerRows.length !== 1) return null;
  const [{ rowIndex, columnIndex }] = headerRows;
  const axes = new Map();
  for (const cells of fragment.cells.slice(rowIndex + 1)) {
    const label = normalizedText(cells[0]);
    if (/^cabinetry\s+dimensions?/i.test(label)) break;
    let axis = null;
    if (/\bA\s*overall\s+height\s+of\s+product\b/i.test(label)) axis = 'height';
    else if (/\bB\s*overall\s+width\s+of\s+product\b/i.test(label)) axis = 'width';
    else if (/\boverall\s+depth\s+of\s+product\b/i.test(label)
      && /\bexcludes?\s+handle\b/i.test(label)
      && /\bincludes?\s*(?:C\s*)?evaporator\b/i.test(label)) axis = 'depth';
    if (!axis) continue;
    const match = /^(\d+(?:\.\d+)?)$/.exec(normalizedText(cells[columnIndex]));
    if (!match || axes.has(axis)) return null;
    axes.set(axis, { label, value: match[1] });
  }
  if (!['width', 'height', 'depth'].every((axis) => axes.has(axis))) return null;
  return ['height', 'width', 'depth'].map((axis) => {
    const row = axes.get(axis);
    return {
      label: row.label,
      value: `${row.value} mm`,
      quote: `${row.label} ${row.value} mm`,
      semanticBasis: 'fisher_paykel_rf610a_support_family_column',
      axisOrder: [axis],
    };
  });
}

function fisherPaykelRf610SupportFamilyScope(document, caseIdentity, boundSupportFamilyModel) {
  if (normalizedText(caseIdentity?.brand).toLowerCase() !== 'fisher & paykel'
    || normalizedText(caseIdentity?.category) !== 'fridge'
    || canonicalModel(boundSupportFamilyModel) !== 'RF610A') return null;
  const target = canonicalModel(caseIdentity?.model);
  if (!/^RF610A[A-Z0-9]{3,12}$/.test(target)) return null;
  const coverFragments = (document.pages[0] ?? []).filter((fragment) => (
    ['paragraph', 'text'].includes(fragment.type)
    && /\bRF522W\b[\s\S]*\bRF522A\b[\s\S]*\bRF610A\s*&\s*RF540A\s+models?\b/i.test(fragment.text)
  ));
  if (coverFragments.length !== 1) return null;
  const matches = [];
  document.pages.forEach((items, pageIndex) => {
    for (const fragment of items) {
      const rows = fisherPaykelRf610SupportRows(fragment);
      if (rows) matches.push({ fragment, page: pageIndex + 1, rows });
    }
  });
  if (matches.length !== 1) return null;
  return {
    ...matches[0],
    coverFragment: coverFragments[0],
  };
}

function fisherPaykelDw60ChSupportFamilyScope(document, caseIdentity, boundSupportFamilyModel) {
  if (canonicalModel(caseIdentity?.brand) !== 'FISHERPAYKEL'
    || normalizedText(caseIdentity?.category) !== 'dishwasher') return null;
  const target = canonicalModel(caseIdentity?.model);
  const family = canonicalModel(boundSupportFamilyModel);
  const familyPatterns = new Map([
    ['DW60CH', /^DW60CH[WX]\d+$/],
    ['DW60CHP', /^DW60CHP[WX]\d+$/],
    ['DW60CK', /^DW60CK[WX]\d+$/],
  ]);
  if (!familyPatterns.get(family)?.test(target)) return null;

  const coverFragments = document.pages.slice(0, 2).flatMap((items, pageIndex) => items
    .filter((fragment) => (
      /\bDW60CH\b[\s,;/]*(?:\bDW60CHP\b)[\s,;/]*(?:and|&)\s*\bDW60CK\b\s+models?\b/i
        .test(fragment.text)
    ))
    .map((fragment) => ({ fragment, page: pageIndex + 1 })));
  const marketFragments = document.pages.slice(0, 2).flatMap((items, pageIndex) => items
    .filter((fragment) => (
      /(?:\bNZ\b[\s,/&-]*\bAU\b|\bAU\b[\s,/&-]*\bNZ\b)/i.test(fragment.text)
    ))
    .map((fragment) => ({ fragment, page: pageIndex + 1 })));
  if (coverFragments.length !== 1 || marketFragments.length !== 1) return null;

  const dimensions = [];
  document.pages.forEach((items, pageIndex) => {
    const pageUnit = dimensionUnitFromPageTables(items);
    for (const fragment of items) {
      const rows = fisherPaykelDw60InstallationRows(fragment, pageUnit);
      if (rows.length === 3) dimensions.push({ fragment, page: pageIndex + 1, rows });
    }
  });
  if (dimensions.length !== 1) return null;
  return {
    familyModel: family,
    coverFragment: coverFragments[0].fragment,
    coverPage: coverFragments[0].page,
    marketFragment: marketFragments[0].fragment,
    marketPage: marketFragments[0].page,
    fragment: dimensions[0].fragment,
    page: dimensions[0].page,
    rows: dimensions[0].rows,
  };
}

function fisherPaykelWa60SupportRows(fragment, variant = 'current') {
  if (fragment.type !== 'table' || !Array.isArray(fragment.cells)) return null;
  const legacy = variant === 'legacy';
  if (legacy) {
    if (normalizedText(fragment.cells[0]?.[0]) !== ''
      || normalizedText(fragment.cells[0]?.[1]) !== "WA⁺'60") return null;
  } else if (!/^WA\*{2}60\*$/i.test(normalizedText(fragment.captionText))) return null;
  const grammarProfileId = legacy
    ? 'fisher-paykel-wa60-legacy-support-family-v1'
    : 'fisher-paykel-wa60-support-family-v1';
  const headerIndex = fragment.cells.findIndex((cells) => (
    /^product\s+dimensions?$/i.test(normalizedText(cells[0]))
      && /^mm$/i.test(normalizedText(cells[1]))
  ));
  const clearanceIndex = fragment.cells.findIndex((cells, index) => (
    index > headerIndex
      && /^minimum\s+clearances?$/i.test(normalizedText(cells[0]))
      && /^mm$/i.test(normalizedText(cells[1]))
  ));
  if (headerIndex < 0 || clearanceIndex < 0) return null;
  const cleanLabel = (value) => normalizedText(value)
    .replace(/^(?:[A-I]|©)\s*/i, '')
    .replace(/\bproduct†\b/i, 'product');
  const scalar = (value) => /^\d+(?:\.\d+)?$/.test(normalizedText(value))
    ? normalizedText(value)
    : null;
  const range = (value) => {
    const match = /^(\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(\d+(?:\.\d+)?)$/i
      .exec(normalizedText(value));
    return match && Number(match[1]) <= Number(match[2]) ? `${match[1]} - ${match[2]}` : null;
  };
  const product = fragment.cells.slice(headerIndex + 1, clearanceIndex);
  const clearances = fragment.cells.slice(clearanceIndex + 1);
  const one = (rows, pattern) => rows.filter((cells) => pattern.test(cleanLabel(cells[0])));
  const heightRows = one(product, /^overall\s+height\s+of\s+product\b/i);
  const widthRows = one(product, /^overall\s+width\s+of\s+product$/i);
  const depthRows = one(product, legacy
    ? /^(?:overall\s+)?depth\s+of\s+product$/i
    : /^overall\s+depth\s+of\s+product$/i);
  const cavityRows = one(clearances, /^minimum\s+cavity\s+width$/i);
  const sideRows = one(clearances, /^minimum\s+clearance\s+to\s+either\s+side\b/i);
  const rearRows = one(clearances, /^minimum\s+clearance\s+at\s+the\s+rear\s+of\s+the\s+product$/i);
  if ([heightRows, widthRows, depthRows, cavityRows, sideRows].some((rows) => rows.length !== 1)
    || rearRows.length > 1) return null;
  const height = range(heightRows[0][1]);
  const width = scalar(widthRows[0][1]);
  const depth = scalar(depthRows[0][1]);
  const cavity = scalar(cavityRows[0][1]);
  const side = scalar(sideRows[0][1]);
  const rear = rearRows.length ? scalar(rearRows[0][1]) : null;
  if (!height || !width || !depth || !cavity || !side
    || Number(cavity) !== Number(width) + (2 * Number(side))
    || (rearRows.length && !rear)) return null;
  const row = (label, value, sourceLabel, semanticBasis, axisOrder = null) => ({
    label,
    value: `${value} mm`,
    quote: `${sourceLabel} ${value} mm`,
    semanticBasis,
    ...(axisOrder ? { axisOrder } : {}),
    grammarProfileId,
  });
  return [
    row('Overall height of product', height, cleanLabel(heightRows[0][0]), 'explicit_label_range', ['height']),
    row('Overall width of product', width, cleanLabel(widthRows[0][0]), 'fisher_paykel_wa60_support_family', ['width']),
    row('Overall depth of product', depth, cleanLabel(depthRows[0][0]), 'fisher_paykel_wa60_support_family', ['depth']),
    row('Minimum clearance to each side', side, cleanLabel(sideRows[0][0]), 'fisher_paykel_wa60_corroborated_side_clearance'),
    ...(rear ? [row(
      'Minimum clearance at the rear of the product', rear, cleanLabel(rearRows[0][0]),
      'fisher_paykel_wa60_explicit_rear_clearance', ['rear'],
    )] : []),
  ];
}

function fisherPaykelWa60SupportFamilyScope(document, caseIdentity, boundSupportFamilyModel) {
  if (canonicalModel(caseIdentity?.brand) !== 'FISHERPAYKEL'
    || normalizedText(caseIdentity?.category) !== 'washing_machine') return null;
  const target = canonicalModel(caseIdentity?.model);
  const family = canonicalModel(boundSupportFamilyModel);
  if (!/^WA\d{4}[A-Z]\d$/.test(target) || family !== target.slice(0, -1)) return null;
  const coverFragments = (document.pages[0] ?? []).filter((fragment) => (
    ['paragraph', 'text', 'list'].includes(fragment.type)
      && containsExplicitModelExpression(fragment.identityText ?? fragment.text, family)
  ));
  const marketFragments = (document.pages[0] ?? []).filter((fragment) => (
    /(?:NZ[\s,/&-]+AU|AU[\s,/&-]+NZ)/i.test(fragment.text)
  ));
  if (coverFragments.length !== 1 || marketFragments.length !== 1) return null;
  const currentTables = [];
  const legacyTables = [];
  const legacyCapacityTables = [];
  const familyStem = target.match(/^(WA\d{4})[A-Z]\d$/)?.[1];
  document.pages.forEach((items, pageIndex) => {
    for (const fragment of items) {
      const currentRows = fisherPaykelWa60SupportRows(fragment);
      if (currentRows) currentTables.push({ fragment, page: pageIndex + 1, rows: currentRows });
      const legacyRows = fisherPaykelWa60SupportRows(fragment, 'legacy');
      if (legacyRows) legacyTables.push({ fragment, page: pageIndex + 1, rows: legacyRows });
      if (fragment.type === 'table' && Array.isArray(fragment.cells)
        && fragment.cells.length === 2
        && normalizedText(fragment.cells[0]?.[0]) === ''
        && fragment.cells[0].some((cell) => normalizedText(cell) === `${familyStem}*`)
        && /^maximum\s+capacity\s*\(kg\)$/i.test(normalizedText(fragment.cells[1]?.[0]))) {
        legacyCapacityTables.push({ fragment, page: pageIndex + 1 });
      }
    }
  });
  let table;
  let grammarProfileId;
  let capacityFragment = null;
  if (currentTables.length === 1 && legacyTables.length === 0) {
    [table] = currentTables;
    grammarProfileId = 'fisher-paykel-wa60-support-family-v1';
  } else if (currentTables.length === 0 && legacyTables.length === 1
    && legacyCapacityTables.length === 1
    && legacyCapacityTables[0].page === legacyTables[0].page) {
    [table] = legacyTables;
    grammarProfileId = 'fisher-paykel-wa60-legacy-support-family-v1';
    capacityFragment = legacyCapacityTables[0].fragment;
  } else return null;
  return {
    familyModel: family,
    coverFragment: coverFragments[0],
    marketFragment: marketFragments[0],
    grammarProfileId,
    ...(capacityFragment ? { capacityFragment } : {}),
    ...table,
  };
}

function ocrShiftedDimensionSectionRows(fragment) {
  if (fragment.type !== 'table' || !Array.isArray(fragment.cells)) return [];
  const axisAliases = {
    width: 'width', wide: 'width', height: 'height', high: 'height', depth: 'depth', deep: 'depth',
  };
  const scalar = (value) => {
    const match = /^(\d+(?:\.\d+)?)\s*(mm|cm)$/i.exec(normalizedText(value));
    return match ? { value: match[1], unit: match[2].toLowerCase() } : null;
  };
  for (let index = 0; index < fragment.cells.length - 2; index += 1) {
    const section = fragment.cells[index];
    const merged = fragment.cells[index + 1];
    if (!/^product dimensions$/i.test(normalizedText(section[0])) || section.length < 2) continue;
    const firstMeasure = scalar(section[1]);
    const secondMeasure = scalar(merged?.[1]);
    const mergedAxes = [...normalizedText(merged?.[0]).matchAll(/\b(width|wide|height|high|depth|deep)\b/gi)]
      .map((match) => axisAliases[match[1].toLowerCase()]);
    if (!firstMeasure || !secondMeasure || mergedAxes.length !== 2
      || new Set(mergedAxes).size !== 2 || firstMeasure.unit !== secondMeasure.unit) continue;
    const reconstructed = [
      { axis: mergedAxes[0], ...firstMeasure },
      { axis: mergedAxes[1], ...secondMeasure },
    ];
    for (const cells of fragment.cells.slice(index + 2)) {
      const label = normalizedText(cells[0]);
      const match = /^(width|wide|height|high|depth|deep)$/i.exec(label);
      const measure = scalar(cells[1]);
      if (!match || !measure || measure.unit !== firstMeasure.unit) break;
      reconstructed.push({ axis: axisAliases[match[1].toLowerCase()], ...measure });
      if (reconstructed.length === 3) break;
    }
    const axisOrder = reconstructed.map((row) => row.axis);
    if (reconstructed.length !== 3 || new Set(axisOrder).size !== 3
      || !['width', 'height', 'depth'].every((axis) => axisOrder.includes(axis))) continue;
    return reconstructed.map((row) => ({
      label: `${row.axis[0].toUpperCase()}${row.axis.slice(1)}`,
      value: `${row.value} ${row.unit}`,
      quote: `${row.axis[0].toUpperCase()}${row.axis.slice(1)} ${row.value} ${row.unit}`,
      semanticBasis: 'explicit_ocr_shifted_axis_section',
      axisOrder,
    }));
  }
  return [];
}

function exactHisenseAuSpecUrl(sourceUrls, model) {
  const target = canonicalModel(model);
  if (!Array.isArray(sourceUrls) || !target) return null;
  const modelPattern = new RegExp(`(?:^|[-_.])${escapeRegExp(target)}(?=$|[-_.])`, 'i');
  return sourceUrls.find((value) => {
    try {
      const url = new URL(value);
      if (url.hostname.toLowerCase() !== 'dtc-aus-api.hisense.com') return false;
      const filename = decodeURIComponent(url.pathname.split('/').pop() ?? '');
      const stem = filename.replace(/\.pdf$/i, '');
      return /\.pdf$/i.test(filename)
        && modelPattern.test(stem)
        && /(?:^|[-_.])spec(?:$|[-_.])/i.test(stem);
    } catch {
      return false;
    }
  }) ?? null;
}

function hisenseExactSpecIdentity(document, caseIdentity, sourceUrls, categories) {
  if (canonicalModel(caseIdentity?.brand) !== 'HISENSE'
    || !categories.includes(normalizedText(caseIdentity?.category))) return null;
  const target = canonicalModel(caseIdentity?.model);
  if (!/^[A-Z]{2,}[A-Z0-9]{3,}$/.test(target)) return null;
  const exactDocumentUrl = exactHisenseAuSpecUrl(sourceUrls, target);
  if (!exactDocumentUrl || siblingModelCandidates(document, target).length) return null;
  const directIdentityFragments = document.pages.flat().filter((fragment) => (
    ['title', 'page_header', 'paragraph', 'table'].includes(fragment.type)
      && containsExplicitModelExpression(fragment.identityText ?? fragment.text, target)
  ));
  const pairedIdentityFragments = document.pages.flatMap((items) => {
    const labels = items.filter((fragment) => (
      ['paragraph', 'text', 'table'].includes(fragment.type)
        && /\bmanufacturer\s+model\b/i.test(fragment.identityText ?? fragment.text)
        && /\bdescription\b/i.test(fragment.identityText ?? fragment.text)
    ));
    const values = items.filter((fragment) => (
      ['list', 'index'].includes(fragment.type)
        && fragment.listEntries.length >= 2
        && canonicalModel(fragment.listEntries[0]) === target
    ));
    return labels.length === 1 && values.length === 1 ? [labels[0], values[0]] : [];
  });
  const identityFragments = [...new Map([
    ...directIdentityFragments,
    ...pairedIdentityFragments,
  ].map((fragment) => [fragment.fragmentSha256, fragment])).values()];
  if (!identityFragments.length) return null;
  return {
    target,
    exactDocumentUrl,
    identityFragmentSha256s: identityFragments
      .map((fragment) => fragment.fragmentSha256).sort(),
  };
}

function hisenseLegacyCandidateFragments(document, caseIdentity, sourceUrls) {
  const identity = hisenseExactSpecIdentity(document, caseIdentity, sourceUrls, ['fridge']);
  if (!identity) return new Set();
  return new Set(document.pages.flat().filter((fragment) => {
    if (fragment.type !== 'table' || !Array.isArray(fragment.cells)) return false;
    const cellText = normalizedText(fragment.cells.flat().join(' '));
    return /\bdimensions?\b/i.test(cellText)
      && /\bnet\s+with\s+handle\b/i.test(cellText)
      && /\bbox\b/i.test(cellText)
      && /\bweight\b/i.test(cellText);
  }));
}

const HISENSE_LEGACY_AXIS_ORDER = Object.freeze(['width', 'depth', 'height']);

function hisenseLegacyAxisEntries(entries) {
  const rows = entries.map((entry) => {
    const match = /^(Width|Depth|Height)\s+mm\s+(\d+(?:\.\d+)?)$/i.exec(normalizedText(entry));
    return match ? {
      axis: match[1].toLowerCase(),
      sourceAxis: match[1][0].toUpperCase() + match[1].slice(1).toLowerCase(),
      value: match[2],
    } : null;
  });
  return rows.every(Boolean) ? rows : [];
}

function hisenseLegacyNetRows(netEntries) {
  if (netEntries.length !== 3
    || netEntries.some((entry) => !Number.isInteger(Number(entry.value)))
    || netEntries.some((entry, index) => entry.axis !== HISENSE_LEGACY_AXIS_ORDER[index])) {
    return [];
  }
  return netEntries.map((entry) => ({
    label: `${entry.sourceAxis} (Net With handle dimensions)`,
    value: `${entry.value} mm`,
    quote: `${entry.sourceAxis} mm ${entry.value} (Net With handle dimensions section)`,
    semanticBasis: 'hisense_legacy_exact_spec_net_with_handle',
    axisOrder: [...HISENSE_LEGACY_AXIS_ORDER],
  }));
}

function hisenseDerivedFragment(grammarProfileId, fragments, rows, type) {
  return {
    type,
    bbox: [
      Math.min(...fragments.map((fragment) => fragment.bbox[0])),
      Math.min(...fragments.map((fragment) => fragment.bbox[1])),
      Math.max(...fragments.map((fragment) => fragment.bbox[2])),
      Math.max(...fragments.map((fragment) => fragment.bbox[3])),
    ],
    fragmentSha256: sha256(JSON.stringify({
      grammarProfileId,
      sourceFragmentSha256s: fragments.map((fragment) => fragment.fragmentSha256),
      rows,
    })),
  };
}

function hisenseLegacyCollapsedTableRows(fragment) {
  if (fragment.type !== 'table' || !Array.isArray(fragment.cells)) return [];
  const sectionIndex = fragment.cells.findIndex((cells) => (
    /^dimensions\s+net$/i.test(normalizedText(cells.join(' ')))
  ));
  if (sectionIndex < 0) return [];
  const netWidthDepth = fragment.cells[sectionIndex + 1] ?? [];
  const netHeight = fragment.cells[sectionIndex + 2] ?? [];
  if (!/^with\s+handle$/i.test(normalizedText(netWidthDepth[0]))
    || normalizedText(netWidthDepth[1]).toLowerCase() !== 'width depth'
    || normalizedText(netWidthDepth[2]).toLowerCase() !== 'mm mm') return [];
  const widthDepthValues = normalizedText(netWidthDepth[3]).match(/^([0-9]+)\s+([0-9]+)$/);
  const heightValue = /^box$/i.test(normalizedText(netHeight[0]))
    && /^height$/i.test(normalizedText(netHeight[1]))
    && /^mm$/i.test(normalizedText(netHeight[2]))
    ? /^([0-9]+)$/.exec(normalizedText(netHeight[3]))
    : null;
  if (!widthDepthValues || !heightValue) return [];

  const tail = fragment.cells.slice(sectionIndex + 3).map((cells) => normalizedText(cells.join(' ')));
  const boxWidth = tail.flatMap((text) => /^depth\s+mm\s+([0-9]+)$/i.exec(text) ?? []).at(1);
  const boxDepth = tail.flatMap((text) => /^height\s+mm\s+([0-9]+)$/i.exec(text) ?? []).at(1);
  const boxHeight = tail.flatMap((text) => /^weight\s+net\s*\/\s*gross\s+mm\s+([0-9]+)$/i.exec(text) ?? []).at(1);
  if (![boxWidth, boxDepth, boxHeight].every(Boolean)
    || Number(boxWidth) < Number(widthDepthValues[1])
    || Number(boxDepth) < Number(widthDepthValues[2])
    || Number(boxHeight) < Number(heightValue[1])) return [];
  return hisenseLegacyNetRows([
    { axis: 'width', sourceAxis: 'Width', value: widthDepthValues[1] },
    { axis: 'depth', sourceAxis: 'Depth', value: widthDepthValues[2] },
    { axis: 'height', sourceAxis: 'Height', value: heightValue[1] },
  ]);
}

function hisenseLegacyStructuredNetBoxRows(fragment) {
  if (fragment.type !== 'table' || !Array.isArray(fragment.cells)) return [];
  const sectionIndexes = fragment.cells.flatMap((cells, index) => (
    /^dimensions$/i.test(normalizedText(cells.join(' '))) ? [index] : []
  ));
  if (sectionIndexes.length !== 1) return [];
  const sectionIndex = sectionIndexes[0];
  const rows = fragment.cells.slice(sectionIndex + 1, sectionIndex + 8);
  if (rows.length !== 7) return [];

  const parseAxis = (cells, scope = null) => {
    const offset = scope == null ? 0 : 1;
    if (cells.length !== 3 + offset
      || (scope != null && !scope.test(normalizedText(cells[0])))) return null;
    const axis = /^(Width|Depth|Height)$/i.exec(normalizedText(cells[offset]));
    const unit = /^mm$/i.test(normalizedText(cells[offset + 1]));
    const value = /^(\d+)$/.exec(normalizedText(cells[offset + 2]));
    return axis && unit && value ? {
      axis: axis[1].toLowerCase(),
      sourceAxis: axis[1][0].toUpperCase() + axis[1].slice(1).toLowerCase(),
      value: value[1],
    } : null;
  };
  const net = [
    parseAxis(rows[0], /^net\s+with\s+handle$/i),
    parseAxis(rows[1]),
    parseAxis(rows[2]),
  ];
  const box = [
    parseAxis(rows[3], /^box$/i),
    parseAxis(rows[4]),
    parseAxis(rows[5]),
  ];
  const weight = rows[6];
  if (net.some((entry) => !entry) || box.some((entry) => !entry)
    || !net.every((entry, index) => entry.axis === HISENSE_LEGACY_AXIS_ORDER[index])
    || !box.every((entry, index) => entry.axis === HISENSE_LEGACY_AXIS_ORDER[index])
    || box.some((entry, index) => Number(entry.value) < Number(net[index].value))
    || weight.length !== 4
    || !/^weight$/i.test(normalizedText(weight[0]))
    || !/^net\s*\/\s*gross$/i.test(normalizedText(weight[1]))
    || !/^kg$/i.test(normalizedText(weight[2]))
    || !/^\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?$/.test(normalizedText(weight[3]))) {
    return [];
  }
  return hisenseLegacyNetRows(net);
}

function hisenseLegacySplitAxisValueRows(fragment) {
  if (fragment.type !== 'table' || !Array.isArray(fragment.cells)) return [];
  const sectionIndexes = fragment.cells.flatMap((cells, index) => (
    /^dimensions$/i.test(normalizedText(cells.join(' '))) ? [index] : []
  ));
  if (sectionIndexes.length !== 1) return [];
  const rows = fragment.cells.slice(sectionIndexes[0] + 1, sectionIndexes[0] + 9);
  if (rows.length !== 8) return [];
  const [netStart, netTail, separator, boxWidth, boxStart, boxDepth, boxHeight, weight] = rows;
  const width = netStart.length === 4
    && /^net\s+with\s+handle$/i.test(normalizedText(netStart[0]))
    && /^width\s+depth$/i.test(normalizedText(netStart[1]))
    && /^mm$/i.test(normalizedText(netStart[2]))
    ? /^(\d+)$/.exec(normalizedText(netStart[3]))
    : null;
  const depthHeight = netTail.length === 4
    && normalizedText(netTail[0]) === ''
    && /^height$/i.test(normalizedText(netTail[1]))
    && /^mm\s+mm$/i.test(normalizedText(netTail[2]))
    ? /^(\d+)\s+(\d+)$/.exec(normalizedText(netTail[3]))
    : null;
  const packagedWidth = boxWidth.length === 3
    && /^width$/i.test(normalizedText(boxWidth[0]))
    && /^mm$/i.test(normalizedText(boxWidth[1]))
    ? /^(\d+)$/.exec(normalizedText(boxWidth[2]))
    : null;
  const packagedDepth = boxStart.length === 4
    && /^box$/i.test(normalizedText(boxStart[0]))
    && /^depth$/i.test(normalizedText(boxStart[1]))
    && normalizedText(boxStart[2]) === ''
    && normalizedText(boxStart[3]) === ''
    && boxDepth.length === 3
    && /^height$/i.test(normalizedText(boxDepth[0]))
    && /^mm$/i.test(normalizedText(boxDepth[1]))
    ? /^(\d+)$/.exec(normalizedText(boxDepth[2]))
    : null;
  const packagedHeight = boxHeight.length === 3
    && normalizedText(boxHeight[0]) === ''
    && /^mm$/i.test(normalizedText(boxHeight[1]))
    ? /^(\d+)$/.exec(normalizedText(boxHeight[2]))
    : null;
  if (!separator.every((cell) => normalizedText(cell) === '')
    || !width || !depthHeight || !packagedWidth || !packagedDepth || !packagedHeight
    || weight.length !== 4
    || !/^weight$/i.test(normalizedText(weight[0]))
    || !/^net\s*\/\s*gross$/i.test(normalizedText(weight[1]))
    || !/^kg$/i.test(normalizedText(weight[2]))
    || !/^\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?$/.test(normalizedText(weight[3]))) {
    return [];
  }
  const net = [Number(width[1]), Number(depthHeight[1]), Number(depthHeight[2])];
  const packaged = [
    Number(packagedWidth[1]), Number(packagedDepth[1]), Number(packagedHeight[1]),
  ];
  if (packaged.some((value, index) => value < net[index])) return [];
  return hisenseLegacyNetRows([
    { axis: 'width', sourceAxis: 'Width', value: String(net[0]) },
    { axis: 'depth', sourceAxis: 'Depth', value: String(net[1]) },
    { axis: 'height', sourceAxis: 'Height', value: String(net[2]) },
  ]);
}

function hisenseLegacyPageDimensions(items) {
  const tableMatches = [];
  for (const fragment of items) {
    const variants = [
      { rows: hisenseLegacyCollapsedTableRows(fragment), preserveSourceFragment: false },
      { rows: hisenseLegacyStructuredNetBoxRows(fragment), preserveSourceFragment: false },
      { rows: hisenseLegacySplitAxisValueRows(fragment), preserveSourceFragment: true },
    ].filter(({ rows }) => rows.length === 3);
    if (variants.length > 1) return null;
    if (variants.length === 1) {
      tableMatches.push({ ...variants[0], sourceFragments: [fragment] });
    }
  }
  if (tableMatches.length > 1) return null;

  const dimensionTitles = items.filter((fragment) => (
    ['title', 'paragraph', 'text'].includes(fragment.type)
      && /^dimensions$/i.test(fragment.text)
  ));
  if (dimensionTitles.length !== 1) return tableMatches[0] ?? null;
  const dimensionTitle = dimensionTitles[0];
  const boxLabels = items.filter((fragment) => (
    ['paragraph', 'text'].includes(fragment.type)
      && /^box$/i.test(fragment.text)
      && fragment.bbox[1] >= dimensionTitle.bbox[1]
      && fragment.bbox[1] - dimensionTitle.bbox[1] <= 250
  ));
  const netLabels = items.filter((fragment) => (
    ['paragraph', 'text'].includes(fragment.type)
      && /^(?:net(?:\s+with\s+handle)?|with\s+handle)$/i.test(fragment.text)
      && fragment.bbox[1] >= dimensionTitle.bbox[1]
      && fragment.bbox[1] - dimensionTitle.bbox[1] <= 200
  ));
  const combinedNetLabel = netLabels.length === 1 && /^net\s+with\s+handle$/i.test(netLabels[0].text);
  const splitNetLabel = netLabels.length === 2
    && netLabels.some((fragment) => /^net$/i.test(fragment.text))
    && netLabels.some((fragment) => /^with\s+handle$/i.test(fragment.text));
  if (boxLabels.length !== 1 || (!combinedNetLabel && !splitNetLabel)) return tableMatches[0] ?? null;

  const axisLists = items.flatMap((fragment) => {
    if (!['list', 'index'].includes(fragment.type)) return [];
    const leadingAxisEntries = [];
    for (const entry of fragment.listEntries) {
      const [parsed] = hisenseLegacyAxisEntries([entry]);
      if (!parsed) break;
      leadingAxisEntries.push(parsed);
    }
    return [3, 6].includes(leadingAxisEntries.length)
      ? [{ fragment, entries: leadingAxisEntries }]
      : [];
  }).sort((left, right) => left.fragment.bbox[1] - right.fragment.bbox[1]);

  let netEntries = null;
  let dimensionFragments = [];
  if (axisLists.length === 1 && axisLists[0].entries.length === 6) {
    const [net, box] = [axisLists[0].entries.slice(0, 3), axisLists[0].entries.slice(3)];
    if (box.every((entry, index) => entry.axis === HISENSE_LEGACY_AXIS_ORDER[index])) {
      netEntries = net;
      dimensionFragments = [axisLists[0].fragment];
    }
  } else if (axisLists.length === 2 && axisLists.every(({ entries }) => entries.length === 3)) {
    if (axisLists[1].entries.every((entry, index) => (
      entry.axis === HISENSE_LEGACY_AXIS_ORDER[index]
    ))) {
      netEntries = axisLists[0].entries;
      dimensionFragments = axisLists.map(({ fragment }) => fragment);
    }
  }

  if (!netEntries) {
    const scalarAxes = items.flatMap((fragment) => {
      if (!['paragraph', 'text'].includes(fragment.type)) return [];
      const [entry] = hisenseLegacyAxisEntries([fragment.text]);
      return entry ? [{ fragment, entry }] : [];
    }).sort((left, right) => (
      left.fragment.bbox[1] - right.fragment.bbox[1]
      || left.fragment.bbox[0] - right.fragment.bbox[0]
    ));
    if (scalarAxes.length === 6
      && scalarAxes.slice(3).every(({ entry }, index) => (
        entry.axis === HISENSE_LEGACY_AXIS_ORDER[index]
      ))) {
      netEntries = scalarAxes.slice(0, 3).map(({ entry }) => entry);
      dimensionFragments = scalarAxes.map(({ fragment }) => fragment);
    }
  }

  const rows = netEntries ? hisenseLegacyNetRows(netEntries) : [];
  const result = rows.length === 3 ? {
    rows,
    sourceFragments: [dimensionTitle, ...netLabels, boxLabels[0], ...dimensionFragments],
  } : null;
  const matches = [...tableMatches, ...(result ? [result] : [])];
  return matches.length === 1 ? matches[0] : null;
}

function hisenseLegacyExactSpecScope(document, caseIdentity, sourceUrls) {
  const identity = hisenseExactSpecIdentity(document, caseIdentity, sourceUrls, ['fridge']);
  if (!identity) return null;
  const matches = document.pages.flatMap((items, pageIndex) => {
    const dimensions = hisenseLegacyPageDimensions(items);
    return dimensions ? [{ ...dimensions, page: pageIndex + 1 }] : [];
  });
  if (matches.length !== 1) return null;
  const match = matches[0];
  return {
    ...identity,
    ...match,
    fragment: match.preserveSourceFragment
      ? match.sourceFragments[0]
      : hisenseDerivedFragment(
        'hisense-au-legacy-spec-net-box-axes-v1',
        match.sourceFragments,
        match.rows,
        'derived_hisense_legacy_net_box_dimensions',
      ),
  };
}

function hisenseNetPackageRows(fragment) {
  if (fragment.type !== 'table' || !Array.isArray(fragment.cells)) return [];
  const tuple = (value) => {
    const match = /^(\d+)\s*[x×]\s*(\d+)\s*[x×]\s*(\d+)\s*\(\s*mm\s*\)$/i
      .exec(normalizedText(value));
    return match ? match.slice(1).map(Number) : null;
  };
  const packaged = fragment.cells.flatMap((cells) => (
    /^dimensions\s*\(\s*packaged\s*\)\s*\(\s*w\s*x\s*h\s*x\s*d\s*\)$/i
      .test(normalizedText(cells[0]))
      ? [tuple(cells[1])]
      : []
  )).filter(Boolean);
  const net = fragment.cells.flatMap((cells) => (
    /^dimensions\s*\(\s*net\s*\)\s*\(\s*w\s*x\s*h\s*x\s*d\s*\)$/i
      .test(normalizedText(cells[0]))
      ? [tuple(cells[1])]
      : []
  )).filter(Boolean);
  if (packaged.length !== 1 || net.length !== 1
    || packaged[0].some((value, index) => value < net[0][index])) return [];
  const axes = ['width', 'height', 'depth'];
  return axes.map((axis, index) => ({
    label: `${axis[0].toUpperCase()}${axis.slice(1)} (Dimensions (Net) W X H X D)`,
    value: `${net[0][index]} mm`,
    quote: `${axis[0].toUpperCase()}${axis.slice(1)} ${net[0][index]} mm from Dimensions (Net) W X H X D`,
    semanticBasis: 'hisense_exact_spec_net_package_whd',
    axisOrder: [...axes],
  }));
}

function hisenseExactNetPackageScope(document, caseIdentity, sourceUrls) {
  const identity = hisenseExactSpecIdentity(
    document,
    caseIdentity,
    sourceUrls,
    ['fridge', 'dishwasher', 'washing_machine', 'dryer'],
  );
  if (!identity) return null;
  const matches = [];
  document.pages.forEach((items, pageIndex) => {
    for (const fragment of items) {
      const rows = hisenseNetPackageRows(fragment);
      if (rows.length === 3) matches.push({ fragment, rows, page: pageIndex + 1 });
    }
  });
  return matches.length === 1 ? { ...identity, ...matches[0] } : null;
}

function lgDryerExactModelSizeScope(document, caseIdentity) {
  if (canonicalModel(caseIdentity?.brand) !== 'LG'
    || normalizedText(caseIdentity?.category) !== 'dryer') return null;
  const model = normalizedText(caseIdentity?.model);
  if (!model) return null;
  const fields = [
    'closedEnvelope.widthMm',
    'closedEnvelope.heightMm',
    'closedEnvelope.depthMm',
  ];
  const matches = [];
  document.pages.forEach((items, pageIndex) => {
    for (const fragment of items.filter((item) => item.type === 'table')) {
      const modelRows = fragment.cells.filter((cells) => (
        /^model$/i.test(normalizedText(cells[0]))
        && (() => {
          const tokens = cells.slice(1).flatMap((cell) => modelExpressionTokens(cell));
          return tokens.length === 1
            && !tokens[0].includes('*')
            && canonicalModel(tokens[0]) === canonicalModel(model);
        })()
      ));
      const sizeRows = fragment.rows.filter((row) => (
        /^size$/i.test(normalizedText(row.label))
        && claimsFromExplicitDimensionSequence(row, { category: 'dryer' }, fields).length === 3
      ));
      if (modelRows.length === 1 && sizeRows.length === 1) {
        matches.push({
          fragment,
          page: pageIndex + 1,
          rows: sizeRows,
          grammarProfileId: 'lg-au-dryer-exact-model-size-wdh-v1',
        });
      }
    }
  });
  return matches.length === 1 ? matches[0] : null;
}

export const mineruGrammarProfiles = Object.freeze({
  [HAIER_AU_HBM_TECHNICAL_DATA_FAMILY_GRAMMAR]: Object.freeze({
    parserProfileId: HAIER_AU_HBM_TECHNICAL_DATA_FAMILY_GRAMMAR,
    grammarFamilyId: 'haier_au_hbm_technical_data_family_v1',
    grammarFamilyName: 'Haier Australia HBM refrigerator technical data',
    variantName: 'Column-bound HBM340 or complete shared HBM450 model family',
    brand: 'Haier',
    category: 'fridge',
    documentType: 'user_manual',
    detectionSummary: 'A Technical Data page must bind either the exact HBM340 finish pair to one model column and its same-column D/W/H tuple, or the complete HBM450 finish trio to one shared D/W/H tuple. The refrigerator category and Haier trade mark must be explicit.',
    semanticBoundary: 'Only the closed product D/W/H tuple is projected. HBM315 columns, incomplete or unknown finish sets, alternative axis orders, cavity values, appliance door-swing width/depth, installation clearances and service requirements are excluded.',
  }),
  [HAIER_AU_TFE3_FINISH_FAMILY_GRAMMAR]: Object.freeze({
    parserProfileId: HAIER_AU_TFE3_FINISH_FAMILY_GRAMMAR,
    grammarFamilyId: 'haier_au_tfe3_finish_family_product_dimensions_v1',
    grammarFamilyName: 'Haier Australia TFE3 finish-family instructions',
    variantName: 'Explicit finish SKUs with indexed product dimensions and technical-data corroboration',
    brand: 'Haier',
    category: 'dishwasher',
    documentType: 'installation_and_user_manual',
    detectionSummary: 'The TFE3 cover must list exactly HDW9-TFE3SS and HDW9-TFE3WH, one Product dimensions(mm) table must provide indexed overall dimensions, and one Technical data table must independently match width, depth, and minimum installed height.',
    semanticBoundary: 'The top-panel-in-place height range, overall width, and overall depth are projected. Top-panel-removed height, cabinetry dimensions, open-door depth, unlisted finish variants, and conflicting technical data are excluded.',
  }),
  [HAIER_AU_EXACT_SPEC_VERTICAL_AXIS_GRAMMAR]: Object.freeze({
    parserProfileId: HAIER_AU_EXACT_SPEC_VERTICAL_AXIS_GRAMMAR,
    grammarFamilyId: 'haier_au_exact_spec_vertical_axis_values_v1',
    grammarFamilyName: 'Haier Australia exact-model product specification',
    variantName: 'Unit-bearing vertical axis labels with aligned scalar values',
    brand: 'Haier',
    category: 'dishwasher',
    documentType: 'product_specification',
    detectionSummary: 'One-page exact-model Haier AU specification with one Dimensions heading, the model-specific product-dimensions disclaimer, and unique Height(mm), Width(mm), and Depth(mm) labels vertically aligned to scalar values.',
    semanticBoundary: 'Only the three closed product dimensions are projected. Packaging, cavity, installation, unitless, duplicate-axis, multi-model and disclaimer-free layouts are excluded.',
  }),
  'chiq-au-exact-spec-product-whd-v1': Object.freeze({
    parserProfileId: 'chiq-au-exact-spec-product-whd-v1',
    grammarFamilyId: 'chiq_au_exact_spec_product_whd_v1',
    grammarFamilyName: 'CHIQ Australia exact-model specification sheet',
    variantName: 'Separate packing and product WHD table rows',
    brand: 'CHIQ',
    category: 'fridge',
    documentType: 'product_specification',
    detectionSummary: 'An exact-model CHIQ Australia CDN URL, one first-page exact model identity, no sibling model, and exactly one table with separate Packing Dimensions (WHD)mm and Product Dimensions rows. The product second cell is a strict tuple; a product row without its own WHD/mm suffix additionally requires a strict packing tuple to establish order and unit.',
    semanticBoundary: 'Only the Product Dimensions tuple is projected as closed width, height and depth in W/H/D order; packing dimensions, unrelated columns, merged OCR rows and installation requirements are excluded.',
  }),
  'fisher-paykel-rf610a-support-family-v1': Object.freeze({
    parserProfileId: 'fisher-paykel-rf610a-support-family-v1',
    grammarFamilyId: 'fisher_paykel_rf610a_support_family_v1',
    grammarFamilyName: 'Fisher & Paykel RF610A support-family product dimensions',
    variantName: 'Exact support API product with RF610A cover family and RF610/RF540A table column',
    brand: 'Fisher & Paykel',
    category: 'fridge',
    documentType: 'installation_manual',
    detectionSummary: 'A hash-bound exact support product, one first-page RF610A and RF540A family statement, and exactly one Product dimensions (mm) table with a unique RF610/RF540A column.',
    semanticBoundary: 'Only overall height, width and handle-excluding evaporator-inclusive closed depth from the shared product column are projected; cabinetry, clearances and door-operation rows remain excluded.',
  }),
  'fisher-paykel-dw60ch-support-family-v1': Object.freeze({
    parserProfileId: 'fisher-paykel-dw60ch-support-family-v1',
    grammarFamilyId: 'fisher_paykel_dw60ch_support_family_v1',
    grammarFamilyName: 'Fisher & Paykel DW60CH support-family product dimensions',
    variantName: 'Exact support API product with DW60CH, DW60CHP and DW60CK AU/NZ cover',
    brand: 'Fisher & Paykel',
    category: 'dishwasher',
    documentType: 'installation_manual',
    detectionSummary: 'A hash-bound exact support product, an installation article, one AU/NZ cover listing DW60CH, DW60CHP and DW60CK model families, and one shared Product Dimensions table.',
    semanticBoundary: 'Only the top-panel-installed product height range, overall width and closed depth are projected; top-panel-removed height, cavity dimensions, open-door depth, plumbing and electrical requirements remain excluded.',
  }),
  'fisher-paykel-wa60-support-family-v1': Object.freeze({
    parserProfileId: 'fisher-paykel-wa60-support-family-v1',
    grammarFamilyId: 'fisher_paykel_wa60_support_family_v1',
    grammarFamilyName: 'Fisher & Paykel WA60 top-loader support-family geometry',
    variantName: 'Exact support API resource with explicit cover base model and WA**60* table',
    brand: 'Fisher & Paykel',
    category: 'washing_machine',
    documentType: 'installation_manual',
    detectionSummary: 'A hash-bound exact support product resource, one first-page list containing the target model without its final generation digit, AU market text, and one hybrid-confirmed WA**60* Product Dimensions table.',
    semanticBoundary: 'Overall width, adjustable console height and closed depth are projected. A 20 mm each-side clearance is accepted only when the 640 mm cavity width independently reconciles with the 600 mm product width. An explicit rear row may be projected; the compound 660 mm depth allowance, lid ranges and standpipe values are not reinterpreted.',
  }),
  'fisher-paykel-wa60-legacy-support-family-v1': Object.freeze({
    parserProfileId: 'fisher-paykel-wa60-legacy-support-family-v1',
    grammarFamilyId: 'fisher_paykel_wa60_legacy_support_family_v1',
    grammarFamilyName: 'Fisher & Paykel legacy WA60 top-loader support-family geometry',
    variantName: 'Exact support installation article with explicit cover base model, WA legacy table and capacity family column',
    brand: 'Fisher & Paykel',
    category: 'washing_machine',
    documentType: 'installation_manual',
    detectionSummary: "A hash-bound exact support product installation article, an AU/NZ cover listing the target base model, one WA⁺'60 Product Dimensions table, and one same-page capacity table containing the target numeric family wildcard.",
    semanticBoundary: 'Only overall width, adjustable console height and closed depth are projected. The 660 mm compound installation depth, lid-open height, standpipe values and narrative rear clearance remain excluded from this grammar.',
  }),
  'samsung-au-washer-wildcard-specification-v1': Object.freeze({
    parserProfileId: 'samsung-au-washer-wildcard-specification-v1',
    grammarFamilyId: 'samsung_au_washer_wildcard_specification_v1',
    grammarFamilyName: 'Samsung AU washer wildcard specification table',
    variantName: 'Explicit alphanumeric wildcard definition and one matching specification table',
    brand: 'Samsung',
    category: 'washing_machine',
    documentType: 'user_manual',
    detectionSummary: 'An exact-model Samsung AU user-manual URL, an explicit asterisk-as-alphanumeric definition, and exactly one matching wildcard model row with same-table W/H/D axes.',
    semanticBoundary: 'Only closed product width, height and depth from the matching specification table are projected; other wildcard families and installation requirements remain separate evidence.',
  }),
  'fisher-paykel-dw60-install-applicability-v1': Object.freeze({
    parserProfileId: 'fisher-paykel-dw60-install-applicability-v1',
    grammarFamilyId: 'fisher_paykel_dw60_installation_v1',
    grammarFamilyName: 'Fisher & Paykel DW60 installation applicability matrix',
    variantName: 'Concatenated exact SKU matrix followed by shared product dimensions',
    brand: 'Fisher & Paykel',
    category: 'dishwasher',
    documentType: 'installation_manual',
    detectionSummary: 'An exact-model official document URL, one fixed-width SKU applicability matrix, one matching family header, and one adjacent product-dimensions table with an unambiguous page unit.',
    semanticBoundary: 'The installed top-panel height range, overall width and closed depth are projected; top-panel-removed height, cavity dimensions and door-open depth are excluded.',
  }),
  'hisense-au-washer-indexed-dimension-diagram-v1': Object.freeze({
    parserProfileId: 'hisense-au-washer-indexed-dimension-diagram-v1',
    grammarFamilyId: 'hisense_au_washer_dimension_diagram_v1',
    grammarFamilyName: 'Hisense AU washer indexed dimension diagram',
    variantName: 'Sibling model table with A-F dimension index',
    brand: 'Hisense',
    category: 'washing_machine',
    documentType: 'user_manual',
    detectionSummary: 'One same-page sibling model row, one complete A-F millimetre table, and explicit E appliance-depth and F door-open labels.',
    semanticBoundary: 'A is width, B is height, E is the closed appliance depth and F is the operational door-open depth; C and D are not projected.',
  }),
  'hisense-au-legacy-spec-net-box-axes-v1': Object.freeze({
    parserProfileId: 'hisense-au-legacy-spec-net-box-axes-v1',
    grammarFamilyId: 'hisense_au_legacy_exact_spec_net_box_axes_v1',
    grammarFamilyName: 'Hisense Australia legacy exact-model specification sheet',
    variantName: 'Net With handle and Box axis sections',
    brand: 'Hisense',
    category: 'fridge',
    documentType: 'product_specification',
    detectionSummary: 'An exact-model Hisense Australia specification PDF URL, exact model in the MinerU body or a same-page Manufacturer Model label/value-list pair, no sibling model, and exactly one Dimensions section separating a complete Net With handle W/D/H triple from a complete Box triple. Proven list, aligned paragraph, split-axis/value table, collapsed-table and high-resolution recovered rowspan-table MinerU variants are supported.',
    semanticBoundary: 'Only the integer Net With handle W/D/H triple is projected as the closed appliance envelope; Box, weight, clearance and decimal values are excluded.',
  }),
  'hisense-au-exact-spec-net-package-whd-v1': Object.freeze({
    parserProfileId: 'hisense-au-exact-spec-net-package-whd-v1',
    grammarFamilyId: 'hisense_au_exact_spec_net_package_whd_v1',
    grammarFamilyName: 'Hisense Australia exact-model specification table',
    variantName: 'Explicit Net and Packaged W x H x D millimetre rows',
    brand: 'Hisense',
    category: 'multi_category',
    documentType: 'product_specification',
    detectionSummary: 'An exact-model Hisense Australia specification PDF URL, exact model in the MinerU body, no sibling model, and exactly one table containing separate integer Dimensions (Net) and Dimensions (Packaged) W x H x D rows with explicit millimetre units.',
    semanticBoundary: 'Only the Net W/H/D tuple is projected as the closed appliance envelope; packaged values and unitless tuples are excluded.',
  }),
  'lg-au-dryer-exact-model-size-wdh-v1': Object.freeze({
    parserProfileId: 'lg-au-dryer-exact-model-size-wdh-v1',
    grammarFamilyId: 'lg_au_dryer_exact_model_size_wdh_v1',
    grammarFamilyName: 'LG Australia dryer exact-model specification table',
    variantName: 'Same-table Model row and Size values with per-value W/D/H labels',
    brand: 'LG',
    category: 'dryer',
    documentType: 'user_manual',
    detectionSummary: 'Exactly one table contains one exact target Model row and one Size row whose three values each carry the same explicit unit plus a unique W, D or H axis label.',
    semanticBoundary: 'Only the three Size values are projected in their written W/D/H order; unitless tuples, packaged or installation sizes, conflicting label orders and tables with multiple matching model or size rows are excluded.',
  }),
  [SMEG_AU_DISHWASHER_SUFFIX_RANGE_GRAMMAR]: Object.freeze({
    parserProfileId: SMEG_AU_DISHWASHER_SUFFIX_RANGE_GRAMMAR,
    grammarFamilyId: 'smeg_au_dishwasher_techspec_dimensions_v1',
    grammarFamilyName: 'Smeg Australia dishwasher technical specification',
    variantName: 'Size values with W/D/H suffixes and an adjustable height range',
    brand: 'Smeg',
    category: 'dishwasher',
    documentType: 'product_specification',
    detectionSummary: 'An exact-model Smeg Australia Techspec PDF contains one anchored Size expression whose positive integer values carry unique mmW, mmD and mmH suffixes in W/D/H order. Only the final height value may be an increasing range, with an optional max suffix.',
    semanticBoundary: 'Closed width and depth remain fixed while the complete adjustable height range is preserved. Packaging, installation, cavity, non-height ranges, duplicate axes, reversed ranges, fixed-height lookalikes and trailing qualification text are excluded.',
  }),
  [SMEG_AU_DISHWASHER_SUFFIX_FIXED_GRAMMAR]: Object.freeze({
    parserProfileId: SMEG_AU_DISHWASHER_SUFFIX_FIXED_GRAMMAR,
    grammarFamilyId: 'smeg_au_dishwasher_techspec_dimensions_v1',
    grammarFamilyName: 'Smeg Australia dishwasher technical specification',
    variantName: 'Two-cell Size row with fixed W/H/D suffixes',
    brand: 'Smeg',
    category: 'dishwasher',
    documentType: 'product_specification',
    detectionSummary: 'An exact-model Smeg Australia Techspec PDF contains exactly one two-cell Size table row whose positive integer values carry unique mmW, mmH and mmD suffixes in W/H/D order.',
    semanticBoundary: 'Only the closed fixed W/H/D envelope is projected. Packaging, installation, cavity, ranges, duplicate axes, multiple matching Size rows and trailing qualification text are excluded.',
  }),
  [SMEG_AU_DISHWASHER_SUFFIX_PERMUTATION_GRAMMAR]: Object.freeze({
    parserProfileId: SMEG_AU_DISHWASHER_SUFFIX_PERMUTATION_GRAMMAR,
    grammarFamilyId: 'smeg_au_dishwasher_techspec_dimensions_v1',
    grammarFamilyName: 'Smeg Australia dishwasher technical specification',
    variantName: 'Fixed dimensions with explicit W/D/H or H/W/D suffix order',
    brand: 'Smeg',
    category: 'dishwasher',
    documentType: 'product_specification',
    detectionSummary: 'An exact-model Smeg Australia Techspec PDF contains one fully anchored Size or dimensions expression whose three positive integer millimetre values carry unique axis suffixes in explicit W/D/H or H/W/D order.',
    semanticBoundary: 'Only the closed fixed envelope is projected. The established W/H/D grammar remains on its existing parser path; packaging, installation, cavity, ranges, duplicate axes, parentheses, qualifiers and trailing text are excluded.',
  }),
  [BOSCH_AU_DISHWASHER_SHORTHAND_HWD_GRAMMAR]: Object.freeze({
    parserProfileId: BOSCH_AU_DISHWASHER_SHORTHAND_HWD_GRAMMAR,
    grammarFamilyId: 'bosch_au_dishwasher_product_dimensions_v1',
    grammarFamilyName: 'Bosch Australia dishwasher product specification',
    variantName: 'Shorthand H/W/D labels with inherited millimetre unit and adjustable height',
    brand: 'Bosch',
    category: 'dishwasher',
    documentType: 'product_specification',
    detectionSummary: 'An exact-model scoped Bosch dishwasher page contains one complete H/W/D inline sequence, unique axes, strict x separators and one consistent explicit unit inherited only by unitless values.',
    semanticBoundary: 'Only closed product H/W/D is projected; a range is accepted only for height. Niche, cavity, installation, opening, packaging, mixed-unit, duplicate-axis and partial sequences are excluded.',
  }),
  [BOSCH_AU_DISHWASHER_DIMENSION_SECTION_GRAMMAR]: Object.freeze({
    parserProfileId: BOSCH_AU_DISHWASHER_DIMENSION_SECTION_GRAMMAR,
    grammarFamilyId: 'bosch_au_dishwasher_product_dimensions_v1',
    grammarFamilyName: 'Bosch Australia dishwasher product specification',
    variantName: 'Document-scoped Dimensions heading followed by explicit H/W/D axes',
    brand: 'Bosch',
    category: 'dishwasher',
    documentType: 'product_specification',
    detectionSummary: 'An exact official PDF URL plus either a unique exact-model cover or repeated structured exact-model titles on at least two pages document-scope one plain product Dimensions heading immediately followed by a complete H/W/D x-separated paragraph with one consistent inherited unit.',
    semanticBoundary: 'Only closed product H/W/D is projected and a range is accepted only for height; contextual headings, sibling-model documents, partial or duplicate axes, mixed units, packaging, cavity, niche and installation dimensions are excluded.',
  }),
  beko_au_dishwasher_product_spec_parallel_lists_v1: Object.freeze({
    parserProfileId: 'beko_au_dishwasher_product_spec_parallel_lists_v1',
    grammarFamilyId: 'beko_au_dishwasher_product_spec_v1',
    grammarFamilyName: 'Beko AU dishwasher product specification',
    variantName: 'Parallel label and value lists',
    brand: 'Beko',
    category: 'dishwasher',
    documentType: 'product_specification',
    detectionSummary: 'Unique structured exact-model title or page header in the document, no sibling model, plus complete Dimensions & Weights label and value lists.',
    semanticBoundary: 'Unpackaged W/D are closed dimensions; base and maximum feet heights form a range; door-open depth is operational; packaged values are excluded.',
  }),
  beko_au_dishwasher_product_spec_inline_pairs_v1: Object.freeze({
    parserProfileId: 'beko_au_dishwasher_product_spec_inline_pairs_v1',
    grammarFamilyId: 'beko_au_dishwasher_product_spec_v1',
    grammarFamilyName: 'Beko AU dishwasher product specification',
    variantName: 'Inline labelled pairs',
    brand: 'Beko',
    category: 'dishwasher',
    documentType: 'product_specification',
    detectionSummary: 'Unique structured exact-model title or page header in the document, no sibling model, plus the complete ordered Dimensions & Weights inline field sequence.',
    semanticBoundary: 'Unpackaged W/D are closed dimensions; base and maximum feet heights form a range; door-open depth is operational; packaged values are excluded.',
  }),
  beko_au_dishwasher_product_spec_split_title_parallel_lists_v1: Object.freeze({
    parserProfileId: 'beko_au_dishwasher_product_spec_split_title_parallel_lists_v1',
    grammarFamilyId: 'beko_au_dishwasher_product_spec_v1',
    grammarFamilyName: 'Beko AU dishwasher product specification',
    variantName: 'Split title, label list and value list',
    brand: 'Beko',
    category: 'dishwasher',
    documentType: 'product_specification',
    detectionSummary: 'Unique structured exact-model title or page header in the document, no sibling model, followed by a Dimensions & Weights title and complete aligned label and value lists.',
    semanticBoundary: 'Unpackaged W/D are closed dimensions; base and maximum feet heights form a range; door-open depth is operational; packaged values are excluded.',
  }),
  beko_au_dishwasher_product_spec_min_height_inline_pairs_v1: Object.freeze({
    parserProfileId: 'beko_au_dishwasher_product_spec_min_height_inline_pairs_v1',
    grammarFamilyId: 'beko_au_dishwasher_product_spec_v1',
    grammarFamilyName: 'Beko AU dishwasher product specification',
    variantName: 'Minimum-height inline closed dimensions with a separate packaged block',
    brand: 'Beko',
    category: 'dishwasher',
    documentType: 'product_specification',
    detectionSummary: 'Unique structured exact-model title or page header in the document, no sibling model, one Dimensions & Weights title, one complete min-height/max-height/W/D paragraph and one complete separate unpackaged-weight plus packaged-dimensions paragraph.',
    semanticBoundary: 'Only unpackaged W/D and the explicit minimum-to-maximum feet-adjustment height range are projected; the separate packaged values are required for envelope separation but excluded, and no door-open claim is inferred.',
  }),
  beko_au_dryer_product_spec_parallel_lists_v1: Object.freeze({
    parserProfileId: 'beko_au_dryer_product_spec_parallel_lists_v1',
    grammarFamilyId: 'beko_au_dryer_product_spec_v1',
    grammarFamilyName: 'Beko AU dryer product specification',
    variantName: 'Aligned unpacked and packed label-value blocks',
    brand: 'Beko',
    category: 'dryer',
    documentType: 'product_specification',
    detectionSummary: 'An exact-model scoped Beko AU dryer page contains one Dimensions & Weights title, the complete ordered unpacked and packed label paragraph, and one vertically aligned eight-value list with explicit mm and kg units.',
    semanticBoundary: 'Only unpacked height, width and depth are projected as the closed envelope. Packed values and the separate W/D/H operation diagram are excluded.',
  }),
  beko_au_fridge_product_spec_mixed_section_list_v1: Object.freeze({
    parserProfileId: 'beko_au_fridge_product_spec_mixed_section_list_v1',
    grammarFamilyId: 'beko_au_fridge_product_spec_v1',
    grammarFamilyName: 'Beko AU fridge product specification',
    variantName: 'Mixed-section value list aligned to complete unpacked and packed labels',
    brand: 'Beko',
    category: 'fridge',
    documentType: 'product_specification',
    detectionSummary: 'An exact-model scoped Beko AU fridge page contains one complete ordered Dimensions & Weights label paragraph and one adjacent mixed-section list with a unique contiguous mm/mm/mm/kg/mm/mm/mm/kg value sequence.',
    semanticBoundary: 'Only unpackaged height, width and depth including doors are projected. Prefix and suffix values, packaged dimensions, weight, cabinet width and dimension diagrams are excluded.',
  }),
});
const HISENSE_AU_WASHER_INDEXED_DIAGRAM_GRAMMAR = mineruGrammarProfiles
  ['hisense-au-washer-indexed-dimension-diagram-v1'].parserProfileId;
const BEKO_AU_DISHWASHER_PARALLEL_GRAMMAR = mineruGrammarProfiles
  .beko_au_dishwasher_product_spec_parallel_lists_v1.parserProfileId;
const BEKO_AU_DISHWASHER_INLINE_GRAMMAR = mineruGrammarProfiles
  .beko_au_dishwasher_product_spec_inline_pairs_v1.parserProfileId;
const BEKO_AU_DISHWASHER_SPLIT_TITLE_GRAMMAR = mineruGrammarProfiles
  .beko_au_dishwasher_product_spec_split_title_parallel_lists_v1.parserProfileId;
const BEKO_AU_DISHWASHER_MIN_HEIGHT_INLINE_GRAMMAR = mineruGrammarProfiles
  .beko_au_dishwasher_product_spec_min_height_inline_pairs_v1.parserProfileId;
const BEKO_AU_DRYER_PARALLEL_GRAMMAR = mineruGrammarProfiles
  .beko_au_dryer_product_spec_parallel_lists_v1.parserProfileId;
const BEKO_AU_FRIDGE_MIXED_SECTION_GRAMMAR = mineruGrammarProfiles
  .beko_au_fridge_product_spec_mixed_section_list_v1.parserProfileId;
const BEKO_AU_SPEC_LABELS = Object.freeze([
  'Unpackaged Height:',
  'Height (max - feet adjustment):',
  'Unpackaged Width:',
  'Unpackaged Depth:',
  'Depth with Door Opened:',
  'Unpackaged Weight:',
  'Packaged Height:',
  'Packaged Width:',
  'Packaged Depth:',
  'Packaged Weight:',
]);

function hisenseAuWasherIndexedDimensionDiagram(items, caseIdentity, pageUnit) {
  if (canonicalModel(caseIdentity?.brand) !== 'HISENSE'
    || caseIdentity?.category !== 'washing_machine' || pageUnit?.unit !== 'mm') return null;
  const modelGroups = modelRowGroups(items);
  if (modelGroups.length !== 1 || !modelGroups[0].groups.length) return null;
  const tokens = modelGroups[0].groups.flatMap((group) => group.tokens);
  if (tokens.length < 2 || tokens.length > 12
    || tokens.some((token) => !validModelExpressionToken(token))) return null;
  if (modelGroups[0].groups.filter((group) => (
    group.tokens.some((token) => modelExpressionTokenMatches(token, caseIdentity.model))
  )).length !== 1) return null;

  const indexTables = items.filter((item) => {
    if (item.type !== 'table' || item.cells.length !== 7) return false;
    if (!/^index$/i.test(normalizedText(item.cells[0]?.[0]))
      || !/^dimensions?\s*\(\s*mm\s*\)$/i.test(normalizedText(item.cells[0]?.[1]))) return false;
    return item.cells.slice(1).every((cells, index) => (
      normalizedText(cells[0]) === String.fromCharCode(65 + index)
      && /^\d+(?:\.\d+)?$/.test(normalizedText(cells[1]))
    ));
  });
  if (indexTables.length !== 1) return null;
  const annotations = items.filter((item) => (
    /\bE\s*=\s*appliance depth\b/i.test(item.text)
    && /\bF\s*=\s*Depth with door open\b/i.test(item.text)
  ));
  if (annotations.length !== 1) return null;
  const values = Object.fromEntries(indexTables[0].cells.slice(1).map((cells) => (
    [normalizedText(cells[0]), normalizedText(cells[1])]
  )));
  const rows = [
    { label: 'Width (diagram A)', value: `${values.A} mm`, quote: `A ${values.A} mm`, axisOrder: ['width'] },
    { label: 'Height (diagram B)', value: `${values.B} mm`, quote: `B ${values.B} mm`, axisOrder: ['height'] },
    { label: 'Appliance depth (diagram E)', value: `${values.E} mm`, quote: `E = appliance depth: ${values.E} mm`, axisOrder: ['depth'] },
    { label: 'Depth with door open (diagram F)', value: `${values.F} mm`, quote: `F = Depth with door open: ${values.F} mm`, axisOrder: ['depth'] },
  ];
  const fragments = [items[modelGroups[0].itemIndex], indexTables[0], annotations[0]];
  return {
    grammarProfileId: HISENSE_AU_WASHER_INDEXED_DIAGRAM_GRAMMAR,
    rows,
    fragment: {
      type: 'derived_hisense_dimension_diagram',
      bbox: [
        Math.min(...fragments.map((fragment) => fragment.bbox[0])),
        Math.min(...fragments.map((fragment) => fragment.bbox[1])),
        Math.max(...fragments.map((fragment) => fragment.bbox[2])),
        Math.max(...fragments.map((fragment) => fragment.bbox[3])),
      ],
      fragmentSha256: sha256(JSON.stringify({
        grammarProfileId: HISENSE_AU_WASHER_INDEXED_DIAGRAM_GRAMMAR,
        sourceFragmentSha256s: fragments.map((fragment) => fragment.fragmentSha256),
        rows,
      })),
    },
  };
}

function bekoSpecResult(values, grammarProfileId, fragments) {
  const millimetres = values.map((value) => Number.parseFloat(value));
  if (millimetres.slice(0, 5).some((value) => !Number.isInteger(value))
    || millimetres[0] > millimetres[1]) return null;
  const rows = [
    {
      label: 'Unpackaged Height (adjustable feet range)',
      value: `${millimetres[0]} - ${millimetres[1]} mm`,
      quote: `Unpackaged Height: ${values[0]} | Height (max - feet adjustment): ${values[1]}`,
      semanticBasis: 'explicit_label_range',
      axisOrder: ['height'],
    },
    {
      label: 'Unpackaged Width', value: values[2],
      quote: `Unpackaged Width: ${values[2]}`,
      axisOrder: ['width'],
    },
    {
      label: 'Unpackaged Depth', value: values[3],
      quote: `Unpackaged Depth: ${values[3]}`,
      axisOrder: ['depth'],
    },
    {
      label: 'Depth with Door Opened', value: values[4],
      quote: `Depth with Door Opened: ${values[4]}`,
      axisOrder: ['depth'],
    },
  ];
  return {
    grammarProfileId,
    rows,
    fragment: {
      type: 'derived_beko_spec',
      bbox: [
        Math.min(...fragments.map((fragment) => fragment.bbox[0])),
        Math.min(...fragments.map((fragment) => fragment.bbox[1])),
        Math.max(...fragments.map((fragment) => fragment.bbox[2])),
        Math.max(...fragments.map((fragment) => fragment.bbox[3])),
      ],
      fragmentSha256: sha256(JSON.stringify({
        grammarProfileId,
        sourceFragmentSha256s: fragments.map((fragment) => fragment.fragmentSha256),
        rows,
      })),
    },
  };
}

function bekoValueListForLabels(items, labelFragment) {
  const valueCandidates = items.filter((item) => (
    ['index', 'list'].includes(item.type)
    && item !== labelFragment
    && item.bbox[0] >= labelFragment.bbox[2]
    && item.bbox[0] - labelFragment.bbox[2] <= 200
    && item.listEntries.length === BEKO_AU_SPEC_LABELS.length
    && item.listEntries.every((value, index) => (
      [5, 9].includes(index)
        ? /^\d+(?:\.\d+)?\s*kg$/i.test(value)
        : /^\d+(?:\.\d+)?\s*mm$/i.test(value)
    ))
  ));
  return valueCandidates.length === 1 ? valueCandidates[0] : null;
}

function bekoParallelSpecResult(items) {
  const labelCandidates = items.filter((item) => {
    if (item.type !== 'list') return false;
    const heading = item.listEntries.indexOf('Dimensions & Weights');
    return heading >= 0
      && JSON.stringify(item.listEntries.slice(heading + 1)) === JSON.stringify(BEKO_AU_SPEC_LABELS);
  });
  if (labelCandidates.length !== 1) return null;
  const labelFragment = labelCandidates[0];
  const valueFragment = bekoValueListForLabels(items, labelFragment);
  if (!valueFragment) return null;
  return bekoSpecResult(
    valueFragment.listEntries,
    BEKO_AU_DISHWASHER_PARALLEL_GRAMMAR,
    [labelFragment, valueFragment],
  );
}

function bekoSplitTitleParallelSpecResult(items) {
  const headings = items.filter((item) => (
    item.type === 'title' && item.text === 'Dimensions & Weights'
  ));
  if (headings.length !== 1) return null;
  const labelCandidates = items.filter((item) => (
    item.type === 'list'
      && JSON.stringify(item.listEntries) === JSON.stringify(BEKO_AU_SPEC_LABELS)
      && item.bbox[1] >= headings[0].bbox[3]
      && item.bbox[1] - headings[0].bbox[3] <= 50
      && Math.abs(item.bbox[0] - headings[0].bbox[0]) <= 100
  ));
  if (labelCandidates.length !== 1) return null;
  const valueFragment = bekoValueListForLabels(items, labelCandidates[0]);
  if (!valueFragment || Math.abs(valueFragment.bbox[1] - labelCandidates[0].bbox[1]) > 50) return null;
  return bekoSpecResult(
    valueFragment.listEntries,
    BEKO_AU_DISHWASHER_SPLIT_TITLE_GRAMMAR,
    [headings[0], labelCandidates[0], valueFragment],
  );
}

function bekoInlineSpecResult(items) {
  const headings = items.filter((item) => (
    item.type === 'title' && item.text === 'Dimensions & Weights'
  ));
  if (headings.length !== 1) return null;
  const expression = /^Unpackaged Height:\s*(\d+(?:\.\d+)?\s*mm)\s+Height \(max - feet adjustment\):\s*(\d+(?:\.\d+)?\s*mm)\s+Unpackaged Width:\s*(\d+(?:\.\d+)?\s*mm)\s+Unpackaged Depth:\s*(\d+(?:\.\d+)?\s*mm)\s+Depth with Door Opened:\s*(\d+(?:\.\d+)?\s*mm)\s+Unpackaged Weight:\s*(\d+(?:\.\d+)?\s*kg)\s+Packaged Height:\s*(\d+(?:\.\d+)?\s*mm)\s+Packaged Width:\s*(\d+(?:\.\d+)?\s*mm)\s+Packaged Depth:\s*(\d+(?:\.\d+)?\s*mm)\s+Packaged Weight:\s*(\d+(?:\.\d+)?\s*kg)$/i;
  const paragraphs = items.map((item) => ({ item, match: expression.exec(item.text) }))
    .filter(({ item, match }) => item.type === 'paragraph' && match);
  if (paragraphs.length !== 1) return null;
  const { item, match } = paragraphs[0];
  if (item.bbox[1] < headings[0].bbox[1]
    || Math.abs(item.bbox[0] - headings[0].bbox[0]) > 100) return null;
  return bekoSpecResult(
    match.slice(1),
    BEKO_AU_DISHWASHER_INLINE_GRAMMAR,
    [headings[0], item],
  );
}

function bekoMinHeightInlineSpecResult(items) {
  const headings = items.filter((item) => (
    item.type === 'title' && item.text === 'Dimensions & Weights'
  ));
  if (headings.length !== 1) return null;
  const closedExpression = /^Unpackaged Height \(min\):\s*(\d+(?:\.\d+)?\s*mm)\s+Height \(max - feet adjustment\):\s*(\d+(?:\.\d+)?\s*mm)\s+Unpackaged Width:\s*(\d+(?:\.\d+)?\s*mm)\s+Unpackaged Depth:\s*(\d+(?:\.\d+)?\s*mm)$/i;
  const packagedExpression = /^Unpackaged Weight:\s*\d+(?:\.\d+)?\s*kg\s+Packaged Height:\s*\d+(?:\.\d+)?\s*mm\s+Packaged Width:\s*\d+(?:\.\d+)?\s*mm\s+Packaged Depth:\s*\d+(?:\.\d+)?\s*mm\s+Packaged Weight:\s*\d+(?:\.\d+)?\s*kg$/i;
  const closedCandidates = items.map((item) => ({ item, match: closedExpression.exec(item.text) }))
    .filter(({ item, match }) => item.type === 'paragraph' && match);
  const packagedCandidates = items.filter((item) => (
    item.type === 'paragraph' && packagedExpression.test(item.text)
  ));
  if (closedCandidates.length !== 1 || packagedCandidates.length !== 1) return null;
  const { item: closed, match } = closedCandidates[0];
  const packaged = packagedCandidates[0];
  if (closed.bbox[1] < headings[0].bbox[3]
    || closed.bbox[1] - headings[0].bbox[3] > 100
    || Math.abs(closed.bbox[0] - headings[0].bbox[0]) > 100
    || packaged.bbox[1] < closed.bbox[3]
    || packaged.bbox[1] - closed.bbox[3] > 100
    || Math.abs(packaged.bbox[0] - closed.bbox[0]) > 100) return null;
  const values = match.slice(1).map((value) => Number.parseFloat(value));
  if (values.some((value) => !Number.isInteger(value)) || values[0] > values[1]) return null;
  const rows = [
    {
      label: 'Unpackaged Height (minimum to maximum feet adjustment)',
      value: `${values[0]} - ${values[1]} mm`,
      quote: `Unpackaged Height (min): ${match[1]} | Height (max - feet adjustment): ${match[2]}`,
      semanticBasis: 'explicit_label_range',
      axisOrder: ['height'],
    },
    {
      label: 'Unpackaged Width', value: match[3],
      quote: `Unpackaged Width: ${match[3]}`,
      axisOrder: ['width'],
    },
    {
      label: 'Unpackaged Depth', value: match[4],
      quote: `Unpackaged Depth: ${match[4]}`,
      axisOrder: ['depth'],
    },
  ];
  const fragments = [headings[0], closed, packaged];
  return {
    grammarProfileId: BEKO_AU_DISHWASHER_MIN_HEIGHT_INLINE_GRAMMAR,
    rows,
    fragment: {
      type: 'derived_beko_spec',
      bbox: [
        Math.min(...fragments.map((fragment) => fragment.bbox[0])),
        Math.min(...fragments.map((fragment) => fragment.bbox[1])),
        Math.max(...fragments.map((fragment) => fragment.bbox[2])),
        Math.max(...fragments.map((fragment) => fragment.bbox[3])),
      ],
      fragmentSha256: sha256(JSON.stringify({
        grammarProfileId: BEKO_AU_DISHWASHER_MIN_HEIGHT_INLINE_GRAMMAR,
        sourceFragmentSha256s: fragments.map((fragment) => fragment.fragmentSha256),
        rows,
      })),
    },
  };
}

function bekoAuDishwasherSpecRows(items, caseIdentity, identityScoped) {
  if (normalizedText(caseIdentity?.brand).toLowerCase() !== 'beko'
    || normalizedText(caseIdentity?.category) !== 'dishwasher') return null;
  if (!identityScoped) return null;
  const matches = [
    bekoParallelSpecResult(items),
    bekoInlineSpecResult(items),
    bekoSplitTitleParallelSpecResult(items),
    bekoMinHeightInlineSpecResult(items),
  ].filter(Boolean);
  return matches.length === 1 ? matches[0] : null;
}

function bekoUniqueStructuredDocumentScope(document, caseIdentity) {
  if (normalizedText(caseIdentity?.brand).toLowerCase() !== 'beko'
    || normalizedText(caseIdentity?.category) !== 'dishwasher') return false;
  const model = normalizedText(caseIdentity?.model);
  if (!model || unresolvedFamilyScope(document, model)
    || siblingModelCandidates(document, model).length > 0) return false;
  return document.pages.flat().some((item) => (
    ['title', 'page_header'].includes(item.type)
      && containsExplicitModelExpression(item.text, model)
  ));
}

const BEKO_AU_DRYER_SPEC_LABELS = Object.freeze([
  'Unpacked Height:',
  'Unpacked Width:',
  'Unpacked Depth:',
  'Unpacked Weight:',
  'Packed Height:',
  'Packed Width:',
  'Packed Depth:',
  'Packed Weight:',
]);

function bekoAuDryerSpecRows(items, caseIdentity, identityScoped) {
  if (normalizedText(caseIdentity?.brand).toLowerCase() !== 'beko'
    || normalizedText(caseIdentity?.category) !== 'dryer' || !identityScoped) return null;
  const headings = items.filter((item) => (
    item.type === 'title' && item.text === 'Dimensions & Weights'
  ));
  if (headings.length !== 1) return null;
  const expectedLabels = BEKO_AU_DRYER_SPEC_LABELS.join(' ');
  const labelCandidates = items.filter((item) => (
    item.type === 'paragraph'
    && normalizedText(item.text) === expectedLabels
    && item.bbox[1] >= headings[0].bbox[3]
    && item.bbox[1] - headings[0].bbox[3] <= 50
    && Math.abs(item.bbox[0] - headings[0].bbox[0]) <= 50
  ));
  if (labelCandidates.length !== 1) return null;
  const labelFragment = labelCandidates[0];
  const valueCandidates = items.filter((item) => (
    ['index', 'list'].includes(item.type)
    && item.listEntries.length === BEKO_AU_DRYER_SPEC_LABELS.length
    && item.bbox[0] >= labelFragment.bbox[2]
    && item.bbox[0] - labelFragment.bbox[2] <= 200
    && Math.abs(item.bbox[1] - labelFragment.bbox[1]) <= 25
    && Math.abs(item.bbox[3] - labelFragment.bbox[3]) <= 25
    && item.listEntries.every((value, index) => (
      [3, 7].includes(index)
        ? /^\d+(?:\.\d+)?\s*kg$/i.test(value)
        : /^\d+(?:\.\d+)?\s*mm$/i.test(value)
    ))
  ));
  if (valueCandidates.length !== 1) return null;
  const valueFragment = valueCandidates[0];
  const dimensions = valueFragment.listEntries.slice(0, 3).map(Number.parseFloat);
  if (dimensions.some((value) => !Number.isInteger(value) || value <= 0)) return null;
  const rows = [
    {
      label: 'Unpacked Height', value: valueFragment.listEntries[0],
      quote: `Unpacked Height: ${valueFragment.listEntries[0]}`,
      semanticBasis: 'explicit_label', axisOrder: ['height'],
      grammarProfileId: BEKO_AU_DRYER_PARALLEL_GRAMMAR,
    },
    {
      label: 'Unpacked Width', value: valueFragment.listEntries[1],
      quote: `Unpacked Width: ${valueFragment.listEntries[1]}`,
      semanticBasis: 'explicit_label', axisOrder: ['width'],
      grammarProfileId: BEKO_AU_DRYER_PARALLEL_GRAMMAR,
    },
    {
      label: 'Unpacked Depth', value: valueFragment.listEntries[2],
      quote: `Unpacked Depth: ${valueFragment.listEntries[2]}`,
      semanticBasis: 'explicit_label', axisOrder: ['depth'],
      grammarProfileId: BEKO_AU_DRYER_PARALLEL_GRAMMAR,
    },
  ];
  const fragments = [headings[0], labelFragment, valueFragment];
  return {
    grammarProfileId: BEKO_AU_DRYER_PARALLEL_GRAMMAR,
    rows,
    fragment: {
      type: 'derived_beko_dryer_spec',
      bbox: [
        Math.min(...fragments.map((fragment) => fragment.bbox[0])),
        Math.min(...fragments.map((fragment) => fragment.bbox[1])),
        Math.max(...fragments.map((fragment) => fragment.bbox[2])),
        Math.max(...fragments.map((fragment) => fragment.bbox[3])),
      ],
      fragmentSha256: sha256(JSON.stringify({
        grammarProfileId: BEKO_AU_DRYER_PARALLEL_GRAMMAR,
        sourceFragmentSha256s: fragments.map((fragment) => fragment.fragmentSha256),
        rows,
      })),
    },
  };
}

const BEKO_AU_FRIDGE_SPEC_LABELS = /^Dimensions\s*&\s*Weights\s+Unpackaged Height:\s+Unpackaged Width:\s+Depth\s*\(\s*incl\.?\s+Doors\s*\):\s+Unpackaged Weight:\s+Packaged Height:\s+Packaged Width:\s+Packaged Depth:\s+Packaged Weight:$/i;

function bekoFridgeDimensionSequence(entries) {
  const measurement = /^\d+(?:\.\d+)?\s*mm$/i;
  const weight = /^\d+(?:\.\d+)?\s*kg$/i;
  const starts = [];
  for (let index = 0; index <= entries.length - 8; index += 1) {
    const values = entries.slice(index, index + 8);
    if (values.every((value, valueIndex) => (
      [3, 7].includes(valueIndex) ? weight.test(value) : measurement.test(value)
    ))) starts.push(index);
  }
  return starts.length === 1 ? entries.slice(starts[0], starts[0] + 8) : null;
}

function bekoAuFridgeSpecRows(items, caseIdentity, identityScoped) {
  if (normalizedText(caseIdentity?.brand).toLowerCase() !== 'beko'
    || normalizedText(caseIdentity?.category) !== 'fridge' || !identityScoped) return null;
  const targetModel = canonicalModel(caseIdentity.model);
  const exactHeaders = items.filter((item) => (
    ['title', 'page_header'].includes(item.type)
      && containsExplicitModelExpression(item.text, caseIdentity.model)
  ));
  if (exactHeaders.length !== 1) return null;
  const headerModels = [...new Set((exactHeaders[0].text.toUpperCase().match(
    /\b[A-Z][A-Z0-9-]{3,}\d[A-Z0-9-]*\b/g,
  ) ?? []).map(canonicalModel))];
  if (headerModels.length !== 1 || headerModels[0] !== targetModel) return null;
  const labelCandidates = items.filter((item) => (
    item.type === 'paragraph' && BEKO_AU_FRIDGE_SPEC_LABELS.test(item.text)
  ));
  if (labelCandidates.length !== 1) return null;
  const labelFragment = labelCandidates[0];
  const valueCandidates = items.map((item) => {
    if (!['index', 'list'].includes(item.type)
      || item.bbox[0] < labelFragment.bbox[2]
      || item.bbox[0] - labelFragment.bbox[2] > 300) return null;
    const verticalGap = Math.max(
      0,
      labelFragment.bbox[1] - item.bbox[3],
      item.bbox[1] - labelFragment.bbox[3],
    );
    if (verticalGap > 50) return null;
    const values = bekoFridgeDimensionSequence(item.listEntries);
    return values ? { item, values } : null;
  }).filter(Boolean);
  if (valueCandidates.length !== 1) return null;
  const { item: valueFragment, values } = valueCandidates[0];
  const dimensions = values.slice(0, 3).map(Number.parseFloat);
  if (dimensions.some((value) => !Number.isInteger(value) || value <= 0)) return null;
  const rows = [
    {
      label: 'Unpackaged Height', value: values[0],
      quote: `Unpackaged Height: ${values[0]}`,
      semanticBasis: 'explicit_aligned_label_value', axisOrder: ['height'],
      grammarProfileId: BEKO_AU_FRIDGE_MIXED_SECTION_GRAMMAR,
    },
    {
      label: 'Unpackaged Width', value: values[1],
      quote: `Unpackaged Width: ${values[1]}`,
      semanticBasis: 'explicit_aligned_label_value', axisOrder: ['width'],
      grammarProfileId: BEKO_AU_FRIDGE_MIXED_SECTION_GRAMMAR,
    },
    {
      label: 'Depth(incl. Doors)', value: values[2],
      quote: `Depth(incl. Doors): ${values[2]}`,
      semanticBasis: 'explicit_aligned_label_value', axisOrder: ['depth'],
      grammarProfileId: BEKO_AU_FRIDGE_MIXED_SECTION_GRAMMAR,
    },
  ];
  const fragments = [labelFragment, valueFragment];
  return {
    grammarProfileId: BEKO_AU_FRIDGE_MIXED_SECTION_GRAMMAR,
    rows,
    fragment: {
      type: 'derived_beko_fridge_spec',
      bbox: [
        Math.min(...fragments.map((fragment) => fragment.bbox[0])),
        Math.min(...fragments.map((fragment) => fragment.bbox[1])),
        Math.max(...fragments.map((fragment) => fragment.bbox[2])),
        Math.max(...fragments.map((fragment) => fragment.bbox[3])),
      ],
      fragmentSha256: sha256(JSON.stringify({
        grammarProfileId: BEKO_AU_FRIDGE_MIXED_SECTION_GRAMMAR,
        sourceFragmentSha256s: fragments.map((fragment) => fragment.fragmentSha256),
        rows,
      })),
    },
  };
}

function bekoUniqueStructuredDryerScope(document, caseIdentity) {
  if (normalizedText(caseIdentity?.brand).toLowerCase() !== 'beko'
    || normalizedText(caseIdentity?.category) !== 'dryer') return false;
  const model = normalizedText(caseIdentity?.model);
  if (!model || unresolvedFamilyScope(document, model)
    || siblingModelCandidates(document, model).length > 0) return false;
  return document.pages.flat().some((item) => (
    ['title', 'page_header'].includes(item.type)
      && containsExplicitModelExpression(item.text, model)
  ));
}

export function parseMineruContentListV2(jsonBytes, options = {}) {
  const pdfSha256 = requiredHash(options.pdfSha256, 'source PDF');
  const parserVersion = requiredParserVersion(options.parserVersion);
  const modelRevision = requiredModelRevision(options.modelRevision);
  const caseIdentity = options.caseIdentity;
  const model = normalizedText(caseIdentity?.model);
  const category = normalizedText(caseIdentity?.category);
  const fields = options.fields;
  const claimSemanticsVersion = options.claimSemanticsVersion ?? 1;
  if (![1, 2].includes(claimSemanticsVersion)) throw new TypeError('supported claim semantics version required');
  if (!model || !category || !Array.isArray(fields) || !fields.length) {
    throw new TypeError('case identity and requested fields required');
  }
  let expectedClaimsByField = null;
  if (options.expectedClaims !== undefined) {
    if (claimSemanticsVersion !== 2) {
      throw new TypeError('expected receipt claims require claim semantics version 2');
    }
    validateDimensionEvidenceClaimsV2(options.expectedClaims);
    const requestedFields = new Set(fields);
    const expectedFields = new Set(options.expectedClaims.map((claim) => claim.field));
    if (requestedFields.size !== fields.length
      || expectedFields.size !== requestedFields.size
      || [...expectedFields].some((field) => !requestedFields.has(field))) {
      throw new TypeError('expected receipt claims must cover the requested fields exactly');
    }
    expectedClaimsByField = new Map(options.expectedClaims.map((claim) => [claim.field, claim]));
  }
  const document = parseDocument(jsonBytes);
  const boundFamilyModel = normalizedText(options.boundFamilyModel);
  const boundSeriesModel = normalizedText(options.boundSeriesModel);
  const boundExactCoverModel = normalizedText(options.boundExactCoverModel);
  const boundSupportFamilyModel = normalizedText(options.boundSupportFamilyModel);
  if ([boundFamilyModel, boundSeriesModel, boundExactCoverModel, boundSupportFamilyModel]
    .filter(Boolean).length > 1) {
    throw new TypeError('only one bound family, series, exact cover, or support family model may be supplied');
  }
  let boundFamilySignals = [];
  if (boundFamilyModel) {
    const escaped = boundFamilyModel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!new RegExp(`^${escaped}[._/-][A-Za-z0-9]{1,4}$`, 'i').test(model)) {
      throw new TypeError('bound family model must be a strict delimited target-model prefix');
    }
    const familySignal = boundFamilyIdentitySignal(document, boundFamilyModel);
    if (!familySignal) throw new Error('bound family model missing from MinerU JSON');
    boundFamilySignals = [{
      type: 'mineru_bound_family_model',
      value: `${model}:family:${boundFamilyModel}:${familySignal.value}`,
    }];
  }
  let boundSeriesSignals = [];
  if (boundSeriesModel) {
    if (!/^[WTD]\d{4}$/i.test(boundSeriesModel)
      || !model.toUpperCase().startsWith(boundSeriesModel.toUpperCase())
      || model.length <= boundSeriesModel.length) {
      throw new TypeError('bound series model must be an ASKO target-model prefix');
    }
    const seriesSignal = boundSeriesIdentitySignal(document, boundSeriesModel);
    if (!seriesSignal) throw new Error('bound series model missing from MinerU JSON');
    boundSeriesSignals = [{
      type: 'mineru_bound_series_model',
      value: `${model}:series:${boundSeriesModel}:${seriesSignal.value}`,
    }];
  }
  let boundExactCoverSignals = [];
  if (boundExactCoverModel) {
    if (boundExactCoverModel.toUpperCase() !== model.toUpperCase()) {
      throw new TypeError('bound exact cover model must equal the target model');
    }
    const coverSignal = boundExactCoverIdentitySignal(document, boundExactCoverModel);
    if (!coverSignal) throw new Error('bound exact cover model missing from MinerU JSON cover');
    boundExactCoverSignals = [{
      type: 'mineru_bound_exact_cover_model',
      value: `${model}:exact-cover:${coverSignal.value}`,
    }];
  }
  const documentedModels = explicitDocumentModelList(document, model);
  const hasIdentityContext = options.identityContextJsonBytes != null
    || options.identityContextContentSha256 != null;
  if (hasIdentityContext
    && (options.identityContextJsonBytes == null || options.identityContextContentSha256 == null)) {
    throw new TypeError('identity context bytes and SHA-256 must be supplied together');
  }
  const identityContextDocument = hasIdentityContext
    ? parseDocument(options.identityContextJsonBytes)
    : null;
  if (identityContextDocument
    && sha256(identityContextDocument.bytes) !== requiredHash(
      options.identityContextContentSha256,
      'identity context content',
    )) {
    throw new Error('identity context content hash mismatch');
  }
  const contextSignals = identityContextDocument
    ? identitySignals(identityContextDocument, model)
    : [];
  const contextUnresolvedFamily = identityContextDocument
    ? unresolvedFamilyScope(identityContextDocument, model)
    : false;
  const structuredFinishVariantScope = claimSemanticsVersion === 2
    ? structuredFinishVariantDocumentScope(document, model)
    : null;
  const haierExactSpecScope = claimSemanticsVersion === 2
    ? haierAuExactSpecVerticalScope(document, caseIdentity)
    : null;
  const haierTfe3Scope = claimSemanticsVersion === 2
    ? haierAuTfe3FinishFamilyScope(document, caseIdentity)
    : null;
  const haierHbmScope = claimSemanticsVersion === 2
    ? haierAuHbmTechnicalFamilyScope(document, caseIdentity)
    : null;
  const structuredFinishVariantSignals = structuredFinishVariantScope ? [
    {
      type: 'mineru_finish_variant_family_heading',
      value: `${structuredFinishVariantScope.familyModel}:${structuredFinishVariantScope.familyHeadingFragmentSha256s.join(',')}`,
    },
    {
      type: 'mineru_finish_variant_exact_model_table',
      value: `${model}:page:${structuredFinishVariantScope.page}:${structuredFinishVariantScope.fragment.fragmentSha256}`,
    },
    {
      type: 'mineru_structured_finish_variant_model',
      value: `${model}:family:${structuredFinishVariantScope.familyModel}:page:${structuredFinishVariantScope.page}:${structuredFinishVariantScope.fragment.fragmentSha256}`,
    },
  ] : [];
  const haierTfe3Signals = haierTfe3Scope ? [{
    type: 'mineru_haier_tfe3_explicit_finish_model',
    value: `${model}:cover:${haierTfe3Scope.coverFragment.fragmentSha256}:product-page:${haierTfe3Scope.page}:technical-page:${haierTfe3Scope.technicalPage}`,
  }] : [];
  const haierHbmSignals = haierHbmScope ? [{
    type: 'mineru_haier_hbm_technical_family_model',
    value: `${model}:family:${haierHbmScope.family.family}:variant:${haierHbmScope.family.variant}:page:${haierHbmScope.page}:${haierHbmScope.fragment.fragmentSha256}`,
  }] : [];
  const chiqSpecScope = claimSemanticsVersion === 2
    ? chiqOfficialSpecScope(document, caseIdentity, options.sourceUrls)
    : null;
  const chiqSpecSignals = chiqSpecScope ? [{
    type: 'mineru_chiq_exact_spec_product_dimensions',
    value: `${model}:page:${chiqSpecScope.page}:${chiqSpecScope.fragment.fragmentSha256}`,
  }, {
    type: 'mineru_chiq_exact_document_url',
    value: `${model}:${chiqSpecScope.exactDocumentUrl}`,
  }, {
    type: 'mineru_chiq_first_page_identity',
    value: `${model}:${chiqSpecScope.identityFragmentSha256}`,
  }] : [];
  const hisenseLegacySpecScope = claimSemanticsVersion === 2
    ? hisenseLegacyExactSpecScope(document, caseIdentity, options.sourceUrls)
    : null;
  const hisenseLegacySpecCandidates = claimSemanticsVersion === 2
    ? hisenseLegacyCandidateFragments(document, caseIdentity, options.sourceUrls)
    : new Set();
  const hisenseLegacySpecSignals = hisenseLegacySpecScope
    && !hisenseLegacySpecScope.preserveSourceFragment ? [{
    type: 'mineru_hisense_legacy_net_box_dimensions',
    value: `${model}:page:${hisenseLegacySpecScope.page}:${hisenseLegacySpecScope.fragment.fragmentSha256}`,
  }, {
    type: 'mineru_hisense_exact_spec_document_url',
    value: `${model}:${hisenseLegacySpecScope.exactDocumentUrl}`,
  }, {
    type: 'mineru_hisense_exact_spec_identity',
    value: `${model}:${hisenseLegacySpecScope.identityFragmentSha256s.join(',')}`,
  }] : [];
  const hisenseNetPackageScope = claimSemanticsVersion === 2
    ? hisenseExactNetPackageScope(document, caseIdentity, options.sourceUrls)
    : null;
  const lgDryerSizeScope = claimSemanticsVersion === 2
    ? lgDryerExactModelSizeScope(document, caseIdentity)
    : null;
  const boschDimensionSectionScope = claimSemanticsVersion === 2
    ? boschDishwasherDimensionSectionDocumentScope(document, caseIdentity, options.sourceUrls)
    : null;
  const askoProductSheetDimensionScope = claimSemanticsVersion === 2
    ? askoAuProductSheetDimensionScope(document, caseIdentity, boundExactCoverModel)
    : null;
  const boschDimensionSectionSignals = boschDimensionSectionScope ? [{
    type: 'mineru_bosch_dimension_section_exact_model',
    value: `${model}:titles:${boschDimensionSectionScope.titlePages.join(',')}:url:${boschDimensionSectionScope.exactDocumentUrl}`,
  }] : [];
  const hisenseNetPackageSignals = hisenseNetPackageScope ? [{
    type: 'mineru_hisense_net_package_dimensions',
    value: `${model}:page:${hisenseNetPackageScope.page}:${hisenseNetPackageScope.fragment.fragmentSha256}`,
  }, {
    type: 'mineru_hisense_exact_spec_document_url',
    value: `${model}:${hisenseNetPackageScope.exactDocumentUrl}`,
  }, {
    type: 'mineru_hisense_exact_spec_identity',
    value: `${model}:${hisenseNetPackageScope.identityFragmentSha256s.join(',')}`,
  }] : [];
  const fisherPaykelDw60Scope = claimSemanticsVersion === 2
    ? fisherPaykelDw60ApplicabilityScope(document, caseIdentity, options.sourceUrls)
    : null;
  const fisherPaykelDw60Signals = fisherPaykelDw60Scope ? [{
    type: 'mineru_fp_dw60_model_applicability',
    value: `${model}:family:${fisherPaykelDw60Scope.familyModel}:page:${fisherPaykelDw60Scope.page}:${fisherPaykelDw60Scope.fragment.fragmentSha256}`,
  }, {
    type: 'mineru_fp_dw60_exact_document_url',
    value: `${model}:${fisherPaykelDw60Scope.exactDocumentUrl}`,
  }] : [];
  const samsungWasherWildcardScope = claimSemanticsVersion === 2
    ? samsungAuWasherWildcardSpecificationScope(document, caseIdentity, options.sourceUrls)
    : null;
  const samsungWasherWildcardSignals = samsungWasherWildcardScope ? [{
    type: 'mineru_samsung_washer_wildcard_specification',
    value: `${model}:pattern:${samsungWasherWildcardScope.pattern}:page:${samsungWasherWildcardScope.page}:${samsungWasherWildcardScope.fragment.fragmentSha256}`,
  }, {
    type: 'mineru_samsung_au_exact_download_url',
    value: `${model}:${samsungWasherWildcardScope.exactDownloadUrl}`,
  }, {
    type: 'mineru_samsung_wildcard_definition',
    value: `${model}:${samsungWasherWildcardScope.variantDefinitionFragmentSha256s.join(',')}`,
  }] : [];
  const fisherPaykelRf610Scope = claimSemanticsVersion === 2
    ? fisherPaykelRf610SupportFamilyScope(document, caseIdentity, boundSupportFamilyModel)
    : null;
  const fisherPaykelDw60ChSupportScope = claimSemanticsVersion === 2
    ? fisherPaykelDw60ChSupportFamilyScope(document, caseIdentity, boundSupportFamilyModel)
    : null;
  const fisherPaykelWa60SupportScope = claimSemanticsVersion === 2
    ? fisherPaykelWa60SupportFamilyScope(document, caseIdentity, boundSupportFamilyModel)
    : null;
  if (boundSupportFamilyModel && !fisherPaykelRf610Scope && !fisherPaykelDw60ChSupportScope
    && !fisherPaykelWa60SupportScope) {
    throw new Error('bound support family is not proven by the MinerU document grammar');
  }
  const fisherPaykelRf610Signals = fisherPaykelRf610Scope ? [{
    type: 'mineru_fp_rf610a_support_family',
    value: `${model}:family:RF610A:cover:${fisherPaykelRf610Scope.coverFragment.fragmentSha256}:page:${fisherPaykelRf610Scope.page}:${fisherPaykelRf610Scope.fragment.fragmentSha256}`,
  }] : [];
  const fisherPaykelDw60ChSupportSignals = fisherPaykelDw60ChSupportScope ? [{
    type: 'mineru_fp_dw60ch_support_family',
    value: `${model}:family:${fisherPaykelDw60ChSupportScope.familyModel}:cover:${fisherPaykelDw60ChSupportScope.coverFragment.fragmentSha256}:market:${fisherPaykelDw60ChSupportScope.marketFragment.fragmentSha256}:page:${fisherPaykelDw60ChSupportScope.page}:${fisherPaykelDw60ChSupportScope.fragment.fragmentSha256}`,
  }] : [];
  const fisherPaykelWa60SupportSignals = fisherPaykelWa60SupportScope ? [{
    type: 'mineru_fp_wa60_support_family',
    value: `${model}:family:${fisherPaykelWa60SupportScope.familyModel}:cover:${fisherPaykelWa60SupportScope.coverFragment.fragmentSha256}:market:${fisherPaykelWa60SupportScope.marketFragment.fragmentSha256}:page:${fisherPaykelWa60SupportScope.page}:${fisherPaykelWa60SupportScope.fragment.fragmentSha256}${fisherPaykelWa60SupportScope.capacityFragment ? `:capacity:${fisherPaykelWa60SupportScope.capacityFragment.fragmentSha256}` : ''}`,
  }] : [];
  const boundFamilyDocumentScope = claimSemanticsVersion === 2
    && (boundFamilySignals.length === 1 || boundSeriesSignals.length === 1
      || boundExactCoverSignals.length === 1);
  const unresolvedFamily = claimSemanticsVersion === 2 && !boundFamilyDocumentScope
    && !structuredFinishVariantScope
    && !haierExactSpecScope
    && !haierTfe3Scope
    && !haierHbmScope
    && !chiqSpecScope
    && !hisenseLegacySpecScope
    && !hisenseNetPackageScope
    && !boschDimensionSectionScope
    && !fisherPaykelDw60Scope
    && !samsungWasherWildcardScope
    && !fisherPaykelRf610Scope
    && !fisherPaykelDw60ChSupportScope
    && !fisherPaykelWa60SupportScope
    && (unresolvedFamilyScope(document, model) || contextUnresolvedFamily);
  const contextDocumentScope = claimSemanticsVersion === 2
    && contextSignals.length > 0
    && !contextUnresolvedFamily
    && siblingModelCandidates(identityContextDocument, model).length === 0;
  const documentUniqueScope = claimSemanticsVersion === 2
    && !unresolvedFamily
    && uniqueCoverIdentityScope(document, model, options.sourceUrls);
  const documentSignals = identitySignals(document, model);
  const repeatedExactHeaderPages = claimSemanticsVersion === 2
    ? repeatedExactPageHeaderPages(document, model, options.sourceUrls)
    : new Set();
  const bekoDocumentScoped = claimSemanticsVersion === 2
    && bekoUniqueStructuredDocumentScope(document, caseIdentity);
  const bekoDryerDocumentScoped = claimSemanticsVersion === 2
    && bekoUniqueStructuredDryerScope(document, caseIdentity);
  let signals = [...new Map([
    ...documentSignals,
    ...contextSignals,
    ...boundFamilySignals,
    ...boundSeriesSignals,
    ...boundExactCoverSignals,
    ...structuredFinishVariantSignals,
    ...haierTfe3Signals,
    ...haierHbmSignals,
    ...chiqSpecSignals,
    ...hisenseLegacySpecSignals,
    ...hisenseNetPackageSignals,
    ...boschDimensionSectionSignals,
    ...fisherPaykelDw60Signals,
    ...samsungWasherWildcardSignals,
    ...fisherPaykelRf610Signals,
    ...fisherPaykelDw60ChSupportSignals,
    ...fisherPaykelWa60SupportSignals,
  ].map((signal) => [`${signal.type}\0${signal.value}`, signal])).values()];
  if (!signals.length && documentUniqueScope) {
    signals = uniqueCoverFallbackSignals(document, model);
  }
  if (documentUniqueScope) {
    signals.push({
      type: 'source_url_exact_model',
      value: `${model}:${exactModelSourceUrl(options.sourceUrls, model)}`,
    });
    signals.sort((left, right) => left.type.localeCompare(right.type) || left.value.localeCompare(right.value));
  }
  if (!signals.length) {
    throw new Error('structured exact-model identity signal required in MinerU JSON');
  }
  const candidates = new Map(fields.map((field) => [field, []]));
  const appliedGrammarProfiles = new Set();
  if (fisherPaykelDw60Scope) {
    appliedGrammarProfiles.add('fisher-paykel-dw60-install-applicability-v1');
  }
  if (chiqSpecScope) {
    appliedGrammarProfiles.add('chiq-au-exact-spec-product-whd-v1');
  }
  if (hisenseLegacySpecScope) {
    appliedGrammarProfiles.add('hisense-au-legacy-spec-net-box-axes-v1');
  }
  if (hisenseNetPackageScope) {
    appliedGrammarProfiles.add('hisense-au-exact-spec-net-package-whd-v1');
  }
  if (samsungWasherWildcardScope) {
    appliedGrammarProfiles.add('samsung-au-washer-wildcard-specification-v1');
  }
  if (fisherPaykelRf610Scope) {
    appliedGrammarProfiles.add('fisher-paykel-rf610a-support-family-v1');
  }
  if (fisherPaykelDw60ChSupportScope) {
    appliedGrammarProfiles.add('fisher-paykel-dw60ch-support-family-v1');
  }
  if (fisherPaykelWa60SupportScope) {
    appliedGrammarProfiles.add(fisherPaykelWa60SupportScope.grammarProfileId);
  }
  if (lgDryerSizeScope) {
    appliedGrammarProfiles.add(lgDryerSizeScope.grammarProfileId);
  }
  if (askoProductSheetDimensionScope) {
    appliedGrammarProfiles.add(askoProductSheetDimensionScope.grammarProfileId);
  }
  if (haierExactSpecScope) {
    appliedGrammarProfiles.add(HAIER_AU_EXACT_SPEC_VERTICAL_AXIS_GRAMMAR);
  }
  if (haierTfe3Scope) {
    appliedGrammarProfiles.add(HAIER_AU_TFE3_FINISH_FAMILY_GRAMMAR);
  }
  if (haierHbmScope) {
    appliedGrammarProfiles.add(HAIER_AU_HBM_TECHNICAL_DATA_FAMILY_GRAMMAR);
  }
  const sharedModelListPages = new Set();
  document.pages.forEach((items, pageIndex) => {
    const pageSignals = documentSignals.filter((signal) => signal.value.includes(`:page:${pageIndex + 1}`));
    const headerScoped = pageSignals.some((signal) => signal.type === 'mineru_page_header_model');
    const repeatedHeaderPageScoped = repeatedExactHeaderPages.has(pageIndex + 1);
    const repeatedBodyScope = signals.some((signal) => signal.type === 'mineru_repeated_body_model');
    const bodyScoped = repeatedBodyScope && pageSignals.some((signal) => signal.type === 'mineru_body_model');
    const pageScoped = pageSignals.length > 0;
    const modelTableScoped = exactModelTableScope(items, model);
    const pageDimensionUnit = explicitPageDimensionUnit(items);
    const hisenseDiagram = claimSemanticsVersion === 2
      ? hisenseAuWasherIndexedDimensionDiagram(items, caseIdentity, pageDimensionUnit)
      : null;
    const sharedDimensionFragments = unresolvedFamily
      ? scopedSharedDimensionFragments(items, model, pageDimensionUnit)
      : new Set();
    const sharedModelListScoped = sharedDimensionFragments.size > 0 || Boolean(hisenseDiagram);
    if (sharedModelListScoped) sharedModelListPages.add(pageIndex + 1);
    const documentScoped = !pageScoped
      && (documentUniqueScope || contextDocumentScope || boundFamilyDocumentScope
        || boschDimensionSectionScope);
    const sectionRowsByFragment = new Map(items
      .filter((item) => item.type === 'table')
      .map((item) => [item, netDimensionSectionRows(item)]));
    const groupedColumnRowsByFragment = new Map(items
      .filter((item) => item.type === 'table')
      .map((item) => [item, exactModelGroupedColumnRows(item, model, documentedModels)]));
    const groupedColumnScoped = [...groupedColumnRowsByFragment.values()].some((rows) => rows.length === 3);
    const structuredFinishVariantPageScoped = items.includes(
      structuredFinishVariantScope?.dimensionFragment,
    );
    const haierTfe3PageScoped = items.includes(haierTfe3Scope?.fragment);
    const haierHbmPageScoped = items.includes(haierHbmScope?.fragment);
    const chiqSpecPageScoped = items.includes(chiqSpecScope?.fragment);
    const hisenseLegacySpecPageScoped = hisenseLegacySpecScope?.page === pageIndex + 1;
    const hisenseNetPackagePageScoped = hisenseNetPackageScope?.page === pageIndex + 1;
    const fisherPaykelDw60PageScoped = items.includes(
      fisherPaykelDw60Scope?.dimensionFragment,
    );
    const samsungWasherWildcardPageScoped = items.includes(
      samsungWasherWildcardScope?.fragment,
    );
    const fisherPaykelRf610PageScoped = items.includes(
      fisherPaykelRf610Scope?.fragment,
    );
    const fisherPaykelDw60ChSupportPageScoped = items.includes(
      fisherPaykelDw60ChSupportScope?.fragment,
    );
    const fisherPaykelWa60SupportPageScoped = items.includes(
      fisherPaykelWa60SupportScope?.fragment,
    );
    const joinedParagraphRowsByFragment = new Map(items
      .map((item, index) => [item, joinedGroupedParagraphRow(items, index)])
      .filter(([, row]) => row));
    const joinedScalarRowsByFragment = new Map(items
      .map((item, index) => [item, joinedAlignedScalarParagraphRow(items, index)])
      .filter(([, row]) => row));
    const documentDimensionSectionRowsByFragment = boschDimensionSectionScope
      ? new Map(items
        .map((item, index) => [item, documentScopedDimensionSectionRows(items, index)])
        .filter(([, rows]) => rows?.length === 3))
      : new Map();
    const askoProductSheetRowsByFragment = new Map(
      askoProductSheetDimensionScope?.page === pageIndex + 1
        ? askoProductSheetDimensionScope.entries.map((entry) => [entry.fragment, [entry.row]])
        : [],
    );
    const haierExactSpecRowsByFragment = new Map(
      haierExactSpecScope?.page === pageIndex + 1
        ? haierExactSpecScope.entries.map((entry) => [entry.fragment, [entry.row]])
        : [],
    );
    const haierHbmRowsByFragment = new Map(
      haierHbmScope?.page === pageIndex + 1
        ? [[haierHbmScope.fragment, haierHbmScope.rows]]
        : [],
    );
    if (!pageScoped && !documentScoped && !bekoDocumentScoped && !bekoDryerDocumentScoped
      && !sharedModelListScoped && !groupedColumnScoped
      && !structuredFinishVariantPageScoped && !fisherPaykelDw60PageScoped
      && !haierTfe3PageScoped && !haierHbmPageScoped
      && !chiqSpecPageScoped && !samsungWasherWildcardPageScoped
      && !fisherPaykelRf610PageScoped && !fisherPaykelDw60ChSupportPageScoped
      && !fisherPaykelWa60SupportPageScoped
      && !hisenseLegacySpecPageScoped
      && !hisenseNetPackagePageScoped && !boschDimensionSectionScope
      && !askoProductSheetRowsByFragment.size && !haierExactSpecRowsByFragment.size
      && !haierHbmRowsByFragment.size) return;
    const bekoPageScoped = items.some((item) => (
      ['title', 'page_header'].includes(item.type)
        && containsExplicitModelExpression(item.text, model)
    ));
    const bekoIdentityScoped = !unresolvedFamily
      && (bekoPageScoped || bekoDocumentScoped || bekoDryerDocumentScoped);
    const bekoSpec = bekoIdentityScoped
      ? (bekoAuDishwasherSpecRows(items, caseIdentity, true)
        ?? bekoAuDryerSpecRows(items, caseIdentity, true)
        ?? bekoAuFridgeSpecRows(items, caseIdentity, true))
      : null;
    for (const scope of [hisenseLegacySpecScope, hisenseNetPackageScope]) {
      if (!scope || scope.page !== pageIndex + 1) continue;
      for (const row of scope.rows) {
        const claims = [
          ...dimensionClaims(row, scope.fragment, pageIndex + 1, fields, category),
          ...directClaims(
            row, scope.fragment, pageIndex + 1, fields, category, claimSemanticsVersion,
          ),
        ];
        for (const claim of claims) candidates.get(claim.field)?.push(claim);
      }
    }
    if (hisenseDiagram) {
      appliedGrammarProfiles.add(hisenseDiagram.grammarProfileId);
      for (const row of hisenseDiagram.rows) {
        const claims = [
          ...dimensionClaims(row, hisenseDiagram.fragment, pageIndex + 1, fields, category),
          ...directClaims(
            row, hisenseDiagram.fragment, pageIndex + 1, fields, category, claimSemanticsVersion,
          ),
        ];
        for (const claim of claims) candidates.get(claim.field)?.push(claim);
      }
    }
    if (bekoSpec) {
      appliedGrammarProfiles.add(bekoSpec.grammarProfileId);
      for (const row of bekoSpec.rows) {
        const claims = [
          ...dimensionClaims(row, bekoSpec.fragment, pageIndex + 1, fields, category),
          ...directClaims(
            row, bekoSpec.fragment, pageIndex + 1, fields, category, claimSemanticsVersion,
          ),
        ];
        for (const claim of claims) candidates.get(claim.field)?.push(claim);
      }
    }
    for (const fragment of items.filter((item) => (
      (item.type === 'table' && (
        headerScoped || bodyScoped || modelTableScoped
        || sharedDimensionFragments.has(item)
        || groupedColumnRowsByFragment.get(item)?.length === 3
        || (canonicalModel(caseIdentity?.brand) === 'SMEG' && category === 'dishwasher'
          && smegAuDishwasherTableRows(item).length === 3)
        || containsExplicitModelExpression(item.identityText ?? item.text, model)
        || structuredFinishVariantScope?.dimensionFragment === item
        || haierTfe3Scope?.fragment === item
        || haierHbmScope?.fragment === item
        || chiqSpecScope?.fragment === item
        || fisherPaykelDw60Scope?.dimensionFragment === item
        || samsungWasherWildcardScope?.fragment === item
        || fisherPaykelRf610Scope?.fragment === item
        || fisherPaykelDw60ChSupportScope?.fragment === item
        || fisherPaykelWa60SupportScope?.fragment === item
        || (documentScoped && (
          documentScopedDimensionMatrixRows(item).length === 3
          || documentScopedExplicitAxisRows(item).length === 3
          || sectionRowsByFragment.get(item)?.length === 3
        ))
      ))
      || (pageScoped && ['paragraph', 'text', 'list', 'index'].includes(item.type))
      || (documentScoped && ['paragraph', 'text'].includes(item.type)
        && paragraphRows(item.text).some((row) => (
          /\b(?:dimensions?|size)\b/i.test(row.label) && (
            explicitSequence(row.label, {
              w: 'width', width: 'width', h: 'height', height: 'height', d: 'depth', depth: 'depth',
            }, 3)
            || (boschDimensionSectionScope && dimensionClaims(
              row, item, pageIndex + 1, fields, category,
            ).length > 0)
          )
        )))
      || joinedParagraphRowsByFragment.has(item)
      || joinedScalarRowsByFragment.has(item)
      || documentDimensionSectionRowsByFragment.has(item)
      || askoProductSheetRowsByFragment.has(item)
      || haierExactSpecRowsByFragment.has(item)
      || haierHbmRowsByFragment.has(item)
    ))) {
      if (chiqSpecScope && fragment !== chiqSpecScope.fragment) continue;
      if (hisenseLegacySpecScope?.sourceFragments.includes(fragment)
        || hisenseNetPackageScope?.fragment === fragment) continue;
      if (hisenseLegacySpecCandidates.has(fragment)) continue;
      let rows;
      if (fragment.type === 'table') {
        const shiftedRows = claimSemanticsVersion === 2
          ? ocrShiftedDimensionSectionRows(fragment)
          : [];
        const smegRows = canonicalModel(caseIdentity?.brand) === 'SMEG'
          && category === 'dishwasher'
          ? smegAuDishwasherTableRows(fragment)
          : [];
        const directRows = [
          ...shiftedRows,
          ...smegRows,
          ...(samsungWasherWildcardScope?.fragment === fragment
            || fisherPaykelRf610Scope?.fragment === fragment
            || fisherPaykelDw60ChSupportScope?.fragment === fragment
            || fisherPaykelWa60SupportScope?.fragment === fragment
            || (canonicalModel(caseIdentity?.brand) === 'CHIQ' && category === 'fridge'
              && chiqOfficialSpecLikeFragment(fragment))
            || shiftedRows.length === 3 || (unresolvedFamily && !repeatedHeaderPageScoped) || documentScoped
            ? []
            : fragment.rows),
          ...(!unresolvedFamily || sharedDimensionFragments.has(fragment)
            ? alternatingAxisRows(fragment, pageDimensionUnit, {
              qualifiedDepthPrimary: dimensionDiagramContext(items, fragment),
            })
            : []),
          ...(claimSemanticsVersion === 2 ? exactModelMatrixRows(fragment, model, pageDimensionUnit) : []),
          ...(claimSemanticsVersion === 2 ? (groupedColumnRowsByFragment.get(fragment) ?? []) : []),
          ...(structuredFinishVariantScope?.dimensionFragment === fragment
            ? structuredFinishVariantScope.dimensionRows
            : []),
          ...(haierTfe3Scope?.fragment === fragment
            ? haierTfe3Scope.rows
            : []),
          ...(haierHbmScope?.fragment === fragment
            ? haierHbmScope.rows
            : []),
          ...(chiqSpecScope?.fragment === fragment
            ? chiqSpecScope.rows
            : []),
          ...(fisherPaykelDw60Scope?.dimensionFragment === fragment
            ? fisherPaykelDw60Scope.dimensionRows
            : []),
          ...(samsungWasherWildcardScope?.fragment === fragment
            ? samsungWasherWildcardScope.rows
            : []),
          ...(fisherPaykelRf610Scope?.fragment === fragment
            ? fisherPaykelRf610Scope.rows
            : []),
          ...(fisherPaykelDw60ChSupportScope?.fragment === fragment
            ? fisherPaykelDw60ChSupportScope.rows
            : []),
          ...(fisherPaykelWa60SupportScope?.fragment === fragment
            ? fisherPaykelWa60SupportScope.rows
            : []),
          ...(documentScoped ? documentScopedDimensionMatrixRows(fragment) : []),
          ...(documentScoped ? documentScopedExplicitAxisRows(fragment) : []),
        ];
        const directDimensionFields = new Set(directRows.flatMap((row) => ([
          ...dimensionClaims(row, fragment, pageIndex + 1, fields, category),
          ...directClaims(row, fragment, pageIndex + 1, fields, category, claimSemanticsVersion),
        ])).map((claim) => claim.field));
        const hasCompleteClosedEnvelope = [
          'closedEnvelope.widthMm',
          'closedEnvelope.heightMm',
          'closedEnvelope.depthMm',
        ].every((field) => directDimensionFields.has(field));
        rows = [
          ...directRows,
          ...(!unresolvedFamily && !hasCompleteClosedEnvelope
            ? (sectionRowsByFragment.get(fragment) ?? [])
            : []),
        ];
      } else if (['list', 'index'].includes(fragment.type)) {
        rows = haierHbmRowsByFragment.has(fragment)
          ? haierHbmRowsByFragment.get(fragment)
          : fragment.listEntries.flatMap((entry) => paragraphRows(entry));
      } else {
        rows = haierExactSpecRowsByFragment.has(fragment)
          ? haierExactSpecRowsByFragment.get(fragment)
          : joinedParagraphRowsByFragment.has(fragment)
          ? [joinedParagraphRowsByFragment.get(fragment)]
          : joinedScalarRowsByFragment.has(fragment)
            ? [joinedScalarRowsByFragment.get(fragment)]
            : askoProductSheetRowsByFragment.has(fragment)
              ? askoProductSheetRowsByFragment.get(fragment)
            : documentDimensionSectionRowsByFragment.has(fragment)
              ? documentDimensionSectionRowsByFragment.get(fragment)
          : canonicalModel(caseIdentity?.brand) === 'SMEG' && category === 'dishwasher'
            ? (extractSmegAuDishwasherSizeRows(fragment.text)
              ?? extractSmegAuDishwasherFixedSuffixPermutationRows(fragment.text)
              ?? paragraphRows(fragment.text))
            : paragraphRows(fragment.text);
      }
      if (canonicalModel(caseIdentity?.brand) === 'BOSCH' && category === 'dishwasher') {
        for (const profileId of [
          BOSCH_AU_DISHWASHER_SHORTHAND_HWD_GRAMMAR,
          BOSCH_AU_DISHWASHER_DIMENSION_SECTION_GRAMMAR,
        ]) {
          if (rows.some((row) => row.grammarProfileId === profileId)) {
            appliedGrammarProfiles.add(profileId);
          }
        }
      }
      if (unresolvedFamily && !sharedModelListScoped && fragment.type !== 'table') continue;
      for (const row of rows) {
        const claims = [
          ...dimensionClaims(row, fragment, pageIndex + 1, fields, category),
          ...clearanceClaims(row, fragment, pageIndex + 1, fields),
          ...directClaims(row, fragment, pageIndex + 1, fields, category, claimSemanticsVersion),
        ];
        if (claims.length > 0 && row.grammarProfileId) {
          appliedGrammarProfiles.add(row.grammarProfileId);
        }
        for (const claim of claims) candidates.get(claim.field)?.push(claim);
      }
    }
  });
  const claims = [];
  for (const field of fields) {
    let fieldCandidates = candidates.get(field) ?? [];
    if (claimSemanticsVersion === 2 && field === 'closedEnvelope.depthMm'
      && fieldCandidates.some((claim) => claim.semanticBasis === 'explicit_including_handle')) {
      fieldCandidates = fieldCandidates.filter((claim) => claim.semanticBasis === 'explicit_including_handle');
    }
    if (claimSemanticsVersion === 2) {
      fieldCandidates = preferCompatibleBoschDimensionSection(fieldCandidates);
    }
    const candidateValues = new Set(fieldCandidates.map((claim) => JSON.stringify(claim.value)));
    if (claimSemanticsVersion === 2 && candidateValues.size === 1) {
      const exactMatrixCandidates = unresolvedFamily ? fieldCandidates.filter((claim) => (
        ['exact_model_matrix_row', 'exact_model_grouped_column'].includes(claim.semanticBasis)
      )) : [];
      if (exactMatrixCandidates.length) {
        fieldCandidates = exactMatrixCandidates;
      } else if (fieldCandidates.some((claim) => claim.semanticBasis === 'explicit_aligned_label_value')
        && fieldCandidates.some((claim) => claim.semanticBasis !== 'explicit_aligned_label_value')) {
        fieldCandidates = fieldCandidates
          .filter((claim) => claim.semanticBasis !== 'explicit_aligned_label_value');
      }
    }
    const unique = new Map(fieldCandidates.map((claim) => [
      `${JSON.stringify(claim.value)}\0${claim.quote}\0${claim.fragmentSha256}`,
      claim,
    ]));
    const values = new Set([...unique.values()].map((claim) => JSON.stringify(claim.value)));
    if (values.size > 1) throw new Error(`ambiguous MinerU values for ${field}`);
    const expectedClaim = expectedClaimsByField?.get(field);
    if (expectedClaim) {
      const matched = [...unique.values()].find((candidate) => (
        sameCanonicalJson(upgradeLegacyDimensionClaim(candidate), expectedClaim)
      ));
      if (!matched) throw new Error(`expected receipt claim for ${field} not rederived from current MinerU candidates`);
      claims.push(matched);
    } else if (unique.size) {
      claims.push([...unique.values()][0]);
    }
  }
  const repeatedExactHeaderScoped = claims.length > 0
    && repeatedExactHeaderPages.size >= 2 && claims.every((claim) => {
    if (!repeatedExactHeaderPages.has(claim.page)) return false;
    const fragment = document.pages[claim.page - 1]
      ?.find((candidate) => candidate.fragmentSha256 === claim.fragmentSha256);
    return fragment && siblingModelCandidates({ pages: [[fragment]] }, model).length === 0;
  });
  if (unresolvedFamily && !claims.some((claim) => (
    ['exact_model_matrix_row', 'exact_model_grouped_column'].includes(claim.semanticBasis)
      || sharedModelListPages.has(claim.page)
  )) && !repeatedExactHeaderScoped) {
    throw new Error('unresolved family manual or multiple models in identity scope');
  }
  if (!claims.length) throw new Error('no exact-model MinerU evidence with explicit axes extracted');
  if (claimSemanticsVersion === 1) {
    validateClaimsSemantics(claims, caseIdentity);
  } else {
    const legacyCompatible = claims.filter((claim) => claim.semanticBasis !== 'explicit_including_handle');
    if (legacyCompatible.length) validateClaimsSemantics(legacyCompatible, caseIdentity);
  }
  const outputClaims = claimSemanticsVersion === 2
    ? claims.map(upgradeLegacyDimensionClaim)
    : claims;
  if (claimSemanticsVersion === 2) validateDimensionEvidenceClaimsV2(outputClaims);
  return {
    schemaVersion: 1,
    format: 'content_list_v2',
    parserName: 'MinerU',
    parserVersion,
    modelRevision,
    sourcePdfSha256: pdfSha256,
    contentSha256: sha256(document.bytes),
    pageCount: document.pageCount,
    identitySignals: signals,
    grammarProfileIds: [...appliedGrammarProfiles].sort(),
    ...(claimSemanticsVersion === 2 ? { claimSemanticsVersion: 2 } : {}),
    claims: outputClaims,
    documentText: normalizedText(document.pages.flat().map((item) => item.text).join(' ')),
  };
}

export function inspectMineruContentListV2(jsonBytes) {
  const document = parseDocument(jsonBytes);
  return Object.freeze({
    schemaVersion: 1,
    format: 'content_list_v2',
    contentSha256: sha256(document.bytes),
    pageCount: document.pageCount,
    pages: document.pages.map((items, pageIndex) => Object.freeze({
      page: pageIndex + 1,
      text: normalizedText(items.map((item) => item.text).join(' ')),
      fragments: items.map((item) => Object.freeze({
        type: item.type,
        bbox: Object.freeze([...item.bbox]),
        fragmentSha256: item.fragmentSha256,
        text: item.text,
        rawText: item.rawText,
      })),
    })),
  });
}

export function findMineruImageOnlyDimensionPages(jsonBytes) {
  const document = parseDocument(jsonBytes);
  const dimensionSignal = /\b(?:dimensions?|installation\s+(?:dimensions?|measurements?)|product\s+size)\b/i;
  const dimensionHeading = /^(?:(?:product|installation|overall|appliance)\s+)?(?:dimensions?|measurements?|product\s+size)(?:\s*\([^)]*\))?\s*:?$/i;
  const modelScopedDimensionDisclaimer = /\bproduct dimensions and specifications in this page apply to the specific product and model\b/i;
  const exactModelQrgHeader = /\bquick reference guide\s*>\s*[a-z0-9][a-z0-9-]{3,}\b/i;
  const explicitAxisValue = /\b(?:width|wide|height|high|depth|deep)\b[^\d]{0,20}\d+(?:\.\d+)?(?:\s*(?:-|–|—|to)\s*\d+(?:\.\d+)?)?\s*(?:mm|cm)\b/i;
  const explicitAxisUnitBeforeValue = /\b(width|wide|height|high|depth|deep)\b\s*(?:mm|cm)\s*\d+(?:\.\d+)?\b/gi;
  const explicitTriple = /\d+(?:\.\d+)?\s*(?:mm|cm)?\s*[x×*]\s*\d+(?:\.\d+)?\s*(?:mm|cm)?\s*[x×*]\s*\d+(?:\.\d+)?\s*(?:mm|cm)\b/i;
  const pages = [];
  document.pages.forEach((items, index) => {
    const text = normalizedText(items.map((item) => item.text).join(' '));
    const imageDimensionSignal = items.some((item) => item.type === 'image' && dimensionSignal.test(item.text));
    const titledDimensionImage = items.some((item) => item.type === 'image')
      && items.some((item) => ['title', 'paragraph', 'text'].includes(item.type)
        && dimensionHeading.test(normalizedText(item.text)));
    const malformedDimensionStructure = modelScopedDimensionDisclaimer.test(text)
      && exactModelQrgHeader.test(text)
      && items.some((item) => ['index', 'list', 'table'].includes(item.type)
        && /^(?:text_list(?:\s+unordered)?)?$/i.test(normalizedText(item.text))
        && (item.bbox[2] - item.bbox[0]) * (item.bbox[3] - item.bbox[1]) >= 20_000);
    const orphanedDimensionGrid = items.some((item) => ['title', 'paragraph', 'text'].includes(item.type)
      && dimensionHeading.test(normalizedText(item.text)))
      && /\bnet\b/i.test(text)
      && /\b(?:box|pack(?:age|aged)?)\b/i.test(text)
      && /\bweight\b/i.test(text);
    const installationRecessFigure = items.some((item) => item.type === 'image')
      && /\bdimensions?\s+of\s+the\s+recess\b/i.test(text)
      && /\bdimensions?\s+in\s+the\s+figure\b/i.test(text);
    const fisherPaykelWaGridMissingFamilyCaption = items.some((item) => (
      item.type === 'table'
        && !/^WA\*{2}60\*$/i.test(item.captionText)
        && /\bPRODUCT\s+DIMENSIONS?\b/i.test(item.text)
        && /\bhighest\s+point\s+on\s+console\b/i.test(item.text)
        && /\b(?:[A-I]\s*)?height\s+of\s+product\s+lid\s+open\b/i.test(item.text)
        && /\bstandpipe\s+height\b/i.test(item.text)
        && /\bminimum\s+cavity\s+width\b/i.test(item.text)
    )) && items.some((item) => item.type === 'image');
    const unitBeforeValueAxes = new Set([...text.matchAll(explicitAxisUnitBeforeValue)]
      .map((match) => ({
        width: 'width', wide: 'width', height: 'height', high: 'height',
        depth: 'depth', deep: 'depth',
      })[match[1].toLowerCase()]));
    const completeUnitBeforeValueAxes = ['width', 'height', 'depth']
      .every((axis) => unitBeforeValueAxes.has(axis));
    if (fisherPaykelWaGridMissingFamilyCaption
      || ((imageDimensionSignal || titledDimensionImage || malformedDimensionStructure
        || orphanedDimensionGrid || installationRecessFigure)
        && !explicitAxisValue.test(text) && !explicitTriple.test(text)
        && !completeUnitBeforeValueAxes)) pages.push(index + 1);
  });
  return Object.freeze(pages);
}

export function buildMineruDerivedArtifact(jsonBytes, options = {}) {
  const document = parseDocument(jsonBytes);
  const pdfSha256 = requiredHash(options.pdfSha256, 'source PDF');
  const parserVersion = requiredParserVersion(options.parserVersion);
  const modelRevision = requiredModelRevision(options.modelRevision);
  if (options.pageCount != null
    && (!Number.isInteger(options.pageCount) || options.pageCount !== document.pageCount)) {
    throw new TypeError('MinerU page count must match content_list_v2');
  }
  const contentSha256 = sha256(document.bytes);
  const profile = options.profile ?? null;
  if (profile && (!/^[a-z0-9][a-z0-9-]*$/.test(String(profile.profileId ?? ''))
    || !['pipeline', 'hybrid-engine'].includes(profile.backend)
    || profile.method !== 'auto')) {
    throw new TypeError('valid MinerU parsing profile required');
  }
  const processedPages = options.processedPages == null
    ? null
    : [...new Set(options.processedPages)].sort((left, right) => left - right);
  if (processedPages && (!Number.isInteger(options.sourcePageCount)
    || options.sourcePageCount !== document.pageCount
    || processedPages.length === 0
    || processedPages.some((page) => !Number.isInteger(page) || page < 1 || page > options.sourcePageCount))) {
    throw new TypeError('valid original PDF page map required');
  }
  const artifact = {
    schemaVersion: 1,
    format: 'content_list_v2',
    parserName: 'MinerU',
    parserVersion,
    modelRevision,
    backend: profile?.backend ?? 'pipeline',
    method: profile?.method ?? 'auto',
    tableEnabled: true,
    formulaEnabled: false,
    sourcePdfSha256: pdfSha256,
    contentSha256,
    objectPath: `evidence/derived/mineru-json/sha256/${contentSha256.slice(0, 2)}/${contentSha256.slice(2, 4)}/${contentSha256}.json`,
    byteSize: document.bytes.length,
    pageCount: document.pageCount,
  };
  if (profile) {
    artifact.profileId = profile.profileId;
    if (profile.effort != null) artifact.effort = profile.effort;
    if (profile.imageAnalysis != null) artifact.imageAnalysis = profile.imageAnalysis;
  }
  if (processedPages) {
    artifact.processedPages = processedPages;
    artifact.sourcePageCount = options.sourcePageCount;
  }
  if (options.fallbackTrigger != null) {
    const trigger = options.fallbackTrigger;
    const triggerPages = [...new Set(trigger.pages ?? [])].sort((left, right) => left - right);
    const pageReasons = trigger.pageReasons == null ? null : trigger.pageReasons.map((entry) => ({
      page: entry?.page,
      reason: entry?.reason,
      ...(entry?.failureCode ? { failureCode: entry.failureCode } : {}),
    })).sort((left, right) => left.page - right.page);
    if (trigger.profileId !== 'pipeline-auto-v1'
      || !/^[a-f0-9]{64}$/.test(String(trigger.contentSha256 ?? ''))
      || !Array.isArray(trigger.pages) || triggerPages.length !== trigger.pages.length
      || triggerPages.length === 0
      || triggerPages.some((page) => !Number.isInteger(page) || page < 1)
      || typeof trigger.objectPath !== 'string'
      || !trigger.objectPath.endsWith(`/${trigger.contentSha256}.json`)) {
      throw new TypeError('valid primary MinerU fallback trigger required');
    }
    if (pageReasons && (!Array.isArray(trigger.pageReasons)
      || pageReasons.length !== triggerPages.length
      || pageReasons.some((entry, index) => entry.page !== triggerPages[index]
        || !['image_dimension_signal', 'operational_page_failure'].includes(entry.reason)
        || (entry.reason === 'operational_page_failure'
          ? entry.failureCode !== 'MINERU_COMMAND_FAILED'
          : entry.failureCode != null)))) {
      throw new TypeError('valid primary MinerU fallback page reasons required');
    }
    artifact.fallbackTrigger = Object.freeze({
      profileId: trigger.profileId,
      contentSha256: trigger.contentSha256,
      objectPath: trigger.objectPath,
      pages: Object.freeze(triggerPages),
      ...(pageReasons ? {
        pageReasons: Object.freeze(pageReasons.map((entry) => Object.freeze(entry))),
      } : {}),
    });
  }
  return Object.freeze(artifact);
}
