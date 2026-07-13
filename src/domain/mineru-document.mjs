import { createHash } from 'node:crypto';
import { load } from 'cheerio';

import {
  claimFromEvidenceFragment,
  claimsFromExplicitDimensionSequence,
  containsExactModel,
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

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
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
  if (typeof value.content === 'string') return value.content;
  return Object.entries(value)
    .filter(([key]) => !/^(?:path|image_source)$/i.test(key))
    .map(([, child]) => nestedText(child))
    .filter(Boolean)
    .join(' ');
}

function splitSingleCellMeasurement(value) {
  const cell = normalizedText(value);
  const scalar = /^(.*?\S)\s+(\d+(?:\.\d+)?(?:\s*(?:-|–|—|\bto\b)\s*\d+(?:\.\d+)?)?\s*(?:mm|millimet(?:re|er)s?|cm|centimet(?:re|er)s?))$/i.exec(cell);
  if (scalar) return { label: normalizedText(scalar[1]), value: normalizedText(scalar[2]), quote: cell };
  const sequence = /^(.*?\S)\s+((?:\d+(?:\.\d+)?\s*(?:mm|cm)?\s*[x×*]\s*){2}\d+(?:\.\d+)?\s*(?:mm|millimet(?:re|er)s?|cm|centimet(?:re|er)s?))$/i.exec(cell);
  return sequence
    ? { label: normalizedText(sequence[1]), value: normalizedText(sequence[2]), quote: cell }
    : null;
}

function tableRows(html) {
  if (typeof html !== 'string' || !html.trim()) return [];
  const $ = load(html, null, false);
  const rows = [];
  $('tr').each((_, row) => {
    const cells = $(row).children('th,td').map((__, cell) => normalizedText($(cell).text())).get();
    if (cells.length >= 2 && cells.some(Boolean)) {
      rows.push({ label: cells[0], value: cells.slice(1).join(' ') });
    } else if (cells.length === 1) {
      const split = splitSingleCellMeasurement(cells[0]);
      if (split) rows.push(split);
    }
  });
  return rows.map((row, index) => {
    if (/^with\s+(?:the\s+)?door\s+(?:closed|open)$/i.test(row.label)
      && /^depth$/i.test(rows[index - 1]?.label ?? '') && !rows[index - 1]?.value) {
      return { ...row, label: `Depth ${row.label}` };
    }
    if (/^with\s+(?:the\s+)?door\s+(?:closed|open)$/i.test(row.label)
      && /^with\s+(?:the\s+)?door\s+(?:closed|open)$/i.test(rows[index - 1]?.label ?? '')
      && /^depth$/i.test(rows[index - 2]?.label ?? '') && !rows[index - 2]?.value) {
      return { ...row, label: `Depth ${row.label}` };
    }
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
      const bbox = validateBbox(item.bbox, `MinerU item ${pageIndex + 1}:${itemIndex + 1}`);
      const html = type === 'table' ? String(item.content.html ?? '') : null;
      const rawText = type === 'table'
        ? tableRows(html).map((row) => `${row.label} ${row.value}`).join('\n')
        : nestedText(item.content);
      const text = normalizedText(rawText);
      return {
        type,
        bbox,
        html,
        rawText,
        text: normalizedText(text),
        rows: type === 'table' ? tableRows(html) : [],
        fragmentSha256: sha256(JSON.stringify({ page: pageIndex + 1, type, bbox, html, text })),
      };
    });
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
  const units = [...text.matchAll(/\b(mm|millimet(?:re|er)s?|cm|centimet(?:re|er)s?)\b/gi)]
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
    || !/(?:including|with)\s+(?:the\s+)?handles?/i.test(row.label)
    || /\b(?:pack(?:ed|age|aging)?|shipping|carton|cavity|cut[ -]?out|cabinet)\b/i.test(row.label)) {
    return null;
  }
  const values = (String(row.value ?? '').match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  const unitMatch = /\b(mm|millimet(?:re|er)s?|cm|centimet(?:re|er)s?)\b/i.exec(String(row.value ?? ''));
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
  const quote = normalizedText(`${row.label} ${row.value}`);
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
      const unitMatch = /\b(mm|millimet(?:re|er)s?|cm|centimet(?:re|er)s?)\b/i.exec(text);
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
            semanticBasis: 'explicit_label_range',
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
        semanticBasis: ['installation.leftMm', 'installation.rightMm'].includes(field)
          && /\b(?:each|both)\s+sides?\b/i.test(row.label)
          ? 'explicit_each_side_label'
          : 'explicit_label_value',
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
      if (!containsExactModel(item.text, model)) continue;
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

function paragraphRows(text) {
  const strict = /^([A-Za-z][A-Za-z ()/+.-]{0,80})\s+((?:\d+(?:\.\d+)?)(?:\s*(?:-|–|—|\bto\b)\s*\d+(?:\.\d+)?)?\s*(?:mm|millimet(?:re|er)s?|cm|centimet(?:re|er)s?))$/i.exec(text);
  if (strict) return [{ label: normalizedText(strict[1]), value: normalizedText(strict[2]) }];
  if (!/\b(?:pack(?:ed|ing|ag(?:e|ed|ing))?|shipping|carton|box(?:ed)?|crate)\b/i.test(text)) {
    const axisMatches = [...String(text).matchAll(/\b(width|wide|height|high|depth|deep)\b\s*:?\s*(\d+(?:\.\d+)?)\s*(mm|millimet(?:re|er)s?|cm|centimet(?:re|er)s?)\b/gi)];
    const axis = { width: 'width', wide: 'width', height: 'height', high: 'height', depth: 'depth', deep: 'depth' };
    const axes = axisMatches.map((match) => axis[match[1].toLowerCase()]);
    if (axisMatches.length >= 2 && new Set(axes).size === axisMatches.length) {
      return axisMatches.map((match) => ({
        label: match[1],
        value: `${match[2]} ${match[3]}`,
        quote: normalizedText(text),
      }));
    }
  }
  const grouped = /^(.*?\b(?:dimension|dimensions|size)\b.*?\([^)]*[whd]\s*[x×/*]\s*[whd]\s*[x×/*]\s*[whd][^)]*\))\s*:?[ \t]*((?:\d+(?:\.\d+)?\s*(?:mm|cm)?\s*[x×*]\s*){2}\d+(?:\.\d+)?\s*(?:mm|cm))/i.exec(text);
  if (grouped) return [{ label: normalizedText(grouped[1]), value: normalizedText(grouped[2]), quote: normalizedText(text) }];
  const suffixed = /^.*?\b(?:dimension|dimensions|size)\b\s*:?[ \t]*(\d+(?:\.\d+)?)\s*(mm|cm)\s*w\s*[x×]\s*(\d+(?:\.\d+)?)\s*\2\s*h\s*[x×]\s*(\d+(?:\.\d+)?)\s*\2\s*d\b/i.exec(text);
  return suffixed ? [{
    label: 'Dimensions (W x H x D)',
    value: `${suffixed[1]} x ${suffixed[3]} x ${suffixed[4]} ${suffixed[2]}`,
    quote: normalizedText(text),
  }] : [];
}

function commonPrefixLength(left, right) {
  let index = 0;
  while (index < left.length && index < right.length && left[index] === right[index]) index += 1;
  return index;
}

function unresolvedFamilyScope(document, model) {
  const target = model.toUpperCase().replace(/[^A-Z0-9]/g, '');
  for (const fragment of document.pages.flat()) {
    if (!containsExactModel(fragment.text, model)) continue;
    const candidates = (fragment.text.toUpperCase().match(/\b[A-Z][A-Z0-9-]{3,}\d[A-Z0-9/-]*\b/g) ?? [])
      .map((value) => value.replace(/[^A-Z0-9]/g, ''))
      .filter((value) => value !== target && value.length >= 5);
    if (candidates.some((value) => commonPrefixLength(value, target) >= Math.min(6, Math.floor(target.length / 2)))) {
      return true;
    }
  }
  return false;
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
  const document = parseDocument(jsonBytes);
  const signals = identitySignals(document, model);
  if (!signals.length) {
    throw new Error('structured exact model identity signal required in MinerU JSON');
  }
  if (claimSemanticsVersion === 2 && unresolvedFamilyScope(document, model)) {
    throw new Error('unresolved family manual or multiple models in identity scope');
  }
  const candidates = new Map(fields.map((field) => [field, []]));
  document.pages.forEach((items, pageIndex) => {
    const pageSignals = signals.filter((signal) => signal.value.includes(`:page:${pageIndex + 1}`));
    const headerScoped = pageSignals.some((signal) => signal.type === 'mineru_page_header_model');
    const repeatedBodyScope = signals.some((signal) => signal.type === 'mineru_repeated_body_model');
    const bodyScoped = repeatedBodyScope && pageSignals.some((signal) => signal.type === 'mineru_body_model');
    const pageScoped = pageSignals.length > 0;
    if (!pageScoped) return;
    for (const fragment of items.filter((item) => (
      (item.type === 'table' && (headerScoped || bodyScoped || containsExactModel(item.text, model)))
      || (pageScoped && ['paragraph', 'text'].includes(item.type))
    ))) {
      const rows = fragment.type === 'table'
        ? fragment.rows
        : paragraphRows(fragment.text);
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
    const unique = new Map(fieldCandidates.map((claim) => [
      `${JSON.stringify(claim.value)}\0${claim.quote}\0${claim.fragmentSha256}`,
      claim,
    ]));
    const values = new Set([...unique.values()].map((claim) => JSON.stringify(claim.value)));
    if (values.size > 1) throw new Error(`ambiguous MinerU values for ${field}`);
    if (unique.size) claims.push([...unique.values()][0]);
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
  return Object.freeze({
    schemaVersion: 1,
    format: 'content_list_v2',
    parserName: 'MinerU',
    parserVersion,
    modelRevision,
    backend: 'pipeline',
    method: 'auto',
    tableEnabled: true,
    formulaEnabled: false,
    sourcePdfSha256: pdfSha256,
    contentSha256,
    objectPath: `evidence/derived/mineru-json/sha256/${contentSha256.slice(0, 2)}/${contentSha256.slice(2, 4)}/${contentSha256}.json`,
    byteSize: document.bytes.length,
    pageCount: document.pageCount,
  });
}
