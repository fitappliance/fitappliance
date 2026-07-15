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
  });
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

function paragraphRows(text) {
  const strict = /^([A-Za-z][A-Za-z ()/+.-]{0,80})\s+((?:\d+(?:\.\d+)?)(?:\s*(?:-|–|—|\bto\b)\s*\d+(?:\.\d+)?)?\s*(?:mm|millimet(?:re|er)s?|cm|centimet(?:re|er)s?))$/i.exec(text);
  if (strict) return [{ label: normalizedText(strict[1]), value: normalizedText(strict[2]) }];
  const explicitInline = explicitInlineDimensionRow(text);
  if (explicitInline) return [explicitInline];
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
    const matches = [...normalizedText(value).matchAll(/(\d+(?:\.\d+)?)\s*(?:-|–|—|\bto\b)\s*(\d+(?:\.\d+)?)/gi)];
    return matches.map((match) => `${match[1]} - ${match[2]}`);
  };
  let height = null;
  let width = null;
  let depth = null;
  const rows = fragment.cells.slice(headerIndex + 1);
  for (let index = 0; index < rows.length; index += 1) {
    const label = normalizedText(rows[index].slice(0, -1).join(' '));
    const value = normalizedText(rows[index].at(-1));
    if (/\boverall\s+height\s+of\s+product\b/i.test(label)) {
      const directRanges = range(value);
      if (directRanges.length === 1) height = directRanges[0];
      const nextLabel = normalizedText(rows[index + 1]?.slice(0, -1).join(' '));
      const nextRanges = range(rows[index + 1]?.at(-1));
      if (!height && /\bwith\s+top\s+panel\s+in\s+place\b/i.test(nextLabel)) {
        if (/\bwith\s+top\s+panel\s+removed\b/i.test(nextLabel)) {
          if (nextRanges.length === 2) [height] = nextRanges;
        } else if (nextRanges.length === 1) {
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

export const mineruGrammarProfiles = Object.freeze({
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
});
const HISENSE_AU_WASHER_INDEXED_DIAGRAM_GRAMMAR = mineruGrammarProfiles
  ['hisense-au-washer-indexed-dimension-diagram-v1'].parserProfileId;
const BEKO_AU_DISHWASHER_PARALLEL_GRAMMAR = mineruGrammarProfiles
  .beko_au_dishwasher_product_spec_parallel_lists_v1.parserProfileId;
const BEKO_AU_DISHWASHER_INLINE_GRAMMAR = mineruGrammarProfiles
  .beko_au_dishwasher_product_spec_inline_pairs_v1.parserProfileId;
const BEKO_AU_DISHWASHER_SPLIT_TITLE_GRAMMAR = mineruGrammarProfiles
  .beko_au_dishwasher_product_spec_split_title_parallel_lists_v1.parserProfileId;
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

function bekoAuDishwasherSpecRows(items, caseIdentity, identityScoped) {
  if (normalizedText(caseIdentity?.brand).toLowerCase() !== 'beko'
    || normalizedText(caseIdentity?.category) !== 'dishwasher') return null;
  if (!identityScoped) return null;
  const matches = [
    bekoParallelSpecResult(items),
    bekoInlineSpecResult(items),
    bekoSplitTitleParallelSpecResult(items),
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
  if ([boundFamilyModel, boundSeriesModel, boundExactCoverModel].filter(Boolean).length > 1) {
    throw new TypeError('only one bound family, series, or exact cover model may be supplied');
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
  const boundFamilyDocumentScope = claimSemanticsVersion === 2
    && (boundFamilySignals.length === 1 || boundSeriesSignals.length === 1
      || boundExactCoverSignals.length === 1);
  const unresolvedFamily = claimSemanticsVersion === 2 && !boundFamilyDocumentScope
    && !structuredFinishVariantScope
    && !fisherPaykelDw60Scope
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
  let signals = [...new Map([
    ...documentSignals,
    ...contextSignals,
    ...boundFamilySignals,
    ...boundSeriesSignals,
    ...boundExactCoverSignals,
    ...structuredFinishVariantSignals,
    ...fisherPaykelDw60Signals,
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
      && (documentUniqueScope || contextDocumentScope || boundFamilyDocumentScope);
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
    const fisherPaykelDw60PageScoped = items.includes(
      fisherPaykelDw60Scope?.dimensionFragment,
    );
    const joinedParagraphRowsByFragment = new Map(items
      .map((item, index) => [item, joinedGroupedParagraphRow(items, index)])
      .filter(([, row]) => row));
    const joinedScalarRowsByFragment = new Map(items
      .map((item, index) => [item, joinedAlignedScalarParagraphRow(items, index)])
      .filter(([, row]) => row));
    if (!pageScoped && !documentScoped && !bekoDocumentScoped
      && !sharedModelListScoped && !groupedColumnScoped
      && !structuredFinishVariantPageScoped && !fisherPaykelDw60PageScoped) return;
    const bekoPageScoped = items.some((item) => (
      ['title', 'page_header'].includes(item.type)
        && containsExplicitModelExpression(item.text, model)
    ));
    const bekoSpec = bekoPageScoped || bekoDocumentScoped
      ? bekoAuDishwasherSpecRows(items, caseIdentity, true)
      : null;
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
        || containsExplicitModelExpression(item.identityText ?? item.text, model)
        || structuredFinishVariantScope?.dimensionFragment === item
        || fisherPaykelDw60Scope?.dimensionFragment === item
        || (documentScoped && (
          documentScopedDimensionMatrixRows(item).length === 3
          || documentScopedExplicitAxisRows(item).length === 3
          || sectionRowsByFragment.get(item)?.length === 3
        ))
      ))
      || (pageScoped && ['paragraph', 'text', 'list', 'index'].includes(item.type))
      || (documentScoped && ['paragraph', 'text'].includes(item.type)
        && paragraphRows(item.text).some((row) => (
          /\b(?:dimensions?|size)\b/i.test(row.label)
          && explicitSequence(row.label, {
            w: 'width', width: 'width', h: 'height', height: 'height', d: 'depth', depth: 'depth',
          }, 3)
        )))
      || joinedParagraphRowsByFragment.has(item)
      || joinedScalarRowsByFragment.has(item)
    ))) {
      let rows;
      if (fragment.type === 'table') {
        const shiftedRows = claimSemanticsVersion === 2
          ? ocrShiftedDimensionSectionRows(fragment)
          : [];
        const directRows = [
          ...shiftedRows,
          ...(shiftedRows.length === 3 || (unresolvedFamily && !repeatedHeaderPageScoped) || documentScoped
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
          ...(fisherPaykelDw60Scope?.dimensionFragment === fragment
            ? fisherPaykelDw60Scope.dimensionRows
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
        rows = fragment.listEntries.flatMap((entry) => paragraphRows(entry));
      } else {
        rows = joinedParagraphRowsByFragment.has(fragment)
          ? [joinedParagraphRowsByFragment.get(fragment)]
          : joinedScalarRowsByFragment.has(fragment)
            ? [joinedScalarRowsByFragment.get(fragment)]
          : paragraphRows(fragment.text);
      }
      if (unresolvedFamily && !sharedModelListScoped && fragment.type !== 'table') continue;
      for (const row of rows) {
        const claims = [
          ...dimensionClaims(row, fragment, pageIndex + 1, fields, category),
          ...clearanceClaims(row, fragment, pageIndex + 1, fields),
          ...directClaims(row, fragment, pageIndex + 1, fields, category, claimSemanticsVersion),
        ];
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
    if ((imageDimensionSignal || titledDimensionImage || malformedDimensionStructure)
      && !explicitAxisValue.test(text) && !explicitTriple.test(text)) pages.push(index + 1);
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
