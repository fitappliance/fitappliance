import { createHash } from 'node:crypto';
import { load } from 'cheerio';

import { containsExactModel } from './evidence-claim-semantics.mjs';

const CATEGORIES = Object.freeze(['fridge', 'dishwasher', 'washing_machine', 'dryer']);
const CATEGORY_LABELS = Object.freeze({
  fridge: 'Refrigerators',
  dishwasher: 'Dishwashers',
  washing_machine: 'Washing Machines',
  dryer: 'Dryers',
});
const HASH = /^[a-f0-9]{64}$/;
const PATTERN_DESCRIPTIONS = Object.freeze({
  GROUPED_AXIS_SEQUENCE: 'Explicit axis order followed by one three-value sequence.',
  GROUPED_AXIS_SEQUENCE_WITH_VARIANT: 'Explicit three-axis sequence plus a qualified alternative depth.',
  INDIVIDUALLY_LABELLED_AXES: 'Two or more dimensions expressed as separate named axis/value pairs.',
  INDIVIDUAL_LABELLED_AXIS: 'One named axis/value pair; combine only through independently proven model scope.',
  ALTERNATING_AXIS_VALUE_CELLS: 'Diagram table alternating axis tokens and values, including D variants.',
  MODEL_ROW_DIMENSION_MATRIX: 'Models occupy rows and dimension axes occupy columns.',
  MODEL_COLUMN_DIMENSION_MATRIX: 'Models occupy columns and dimension axes occupy rows.',
  DOCUMENT_SCOPED_DIMENSION_MATRIX: 'Dimension axes occupy columns but the exact model identity is elsewhere in the document.',
  LETTERED_EXPLICIT_AXIS_LIST: 'Diagram letters explicitly map to axis names and values.',
  UNLABELLED_DIMENSION_TRIPLE: 'Three values are present without a stated axis order.',
});

function normalizedText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function requiredHash(value, label) {
  const result = normalizedText(value).toLowerCase();
  if (!HASH.test(result)) throw new TypeError(`${label} must be SHA-256`);
  return result;
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

function tableCells(html) {
  if (typeof html !== 'string' || !html.trim()) return [];
  const $ = load(html, null, false);
  const rows = [];
  $('tr').each((_, row) => {
    rows.push($(row).children('th,td').map((__, cell) => normalizedText($(cell).text())).get());
  });
  return rows;
}

function itemText(item) {
  if (item?.type !== 'table') return normalizedText(nestedText(item?.content));
  return normalizedText(tableCells(item?.content?.html).map((cells) => cells.join(' ')).join('\n'));
}

function axisForToken(value) {
  const token = normalizedText(value).toLowerCase();
  if (['w', 'width', 'wide'].includes(token)) return 'width';
  if (['h', 'height', 'high'].includes(token)) return 'height';
  if (['d', 'depth', 'deep'].includes(token)) return 'depth';
  return null;
}

function explicitAxisOrder(value) {
  const token = '(w|width|wide|h|height|high|d|depth|deep)';
  const separator = '(?:x|×|\\*|/|\\bby\\b)';
  const match = new RegExp(`(?:^|[^a-z0-9])${token}\\s*${separator}\\s*${token}\\s*${separator}\\s*${token}(?:$|[^a-z0-9])`, 'i')
    .exec(String(value ?? ''));
  if (!match) return [];
  const axes = match.slice(1, 4).map(axisForToken);
  return axes.every(Boolean) && new Set(axes).size === 3 ? axes : [];
}

function numericValues(value) {
  return (String(value ?? '').match(/(?<![A-Za-z])\d+(?:\.\d+)?/g) ?? []).map(Number);
}

function unitEvidence(label, value, pageContext) {
  const sources = [
    ['label', label],
    ['value', value],
    ['page_context', pageContext],
  ];
  const matches = sources.flatMap(([location, text]) => (
    [...String(text ?? '').matchAll(/(?:mm|millimet(?:re|er)s?|cm|centimet(?:re|er)s?)/gi)]
      .map((match) => ({ location, unit: match[0].toLowerCase().startsWith('c') ? 'cm' : 'mm' }))
  ));
  const units = new Set(matches.map((match) => match.unit));
  if (units.size !== 1) return { unit: null, unitPlacement: units.size > 1 ? 'conflicting' : 'absent' };
  const unit = [...units][0];
  const valueMatches = matches.filter((match) => match.location === 'value');
  const placement = valueMatches.length >= Math.max(2, numericValues(value).length)
    ? 'per_value'
    : matches.find((match) => match.location === 'label')?.location
      ?? valueMatches[0]?.location
      ?? 'page_context';
  return { unit, unitPlacement: placement };
}

function expressionScope(value) {
  const text = normalizedText(value).toLowerCase();
  if (/\b(?:pack(?:ed|aging|age|aged)?|shipping|carton|box(?:ed)?|crate)\b/.test(text)) return 'delivery_package';
  if (/\b(?:cavity|cut[ -]?out|niche|opening)\b/.test(text)) return 'cavity_opening';
  if (/\b(?:doors?\s*open(?:ed)?|open(?:ed)?\s*doors?|lid\s*open)\b/.test(text)) return 'operation_envelope';
  if (/\b(?:without|excluding)\s+(?:the\s+)?(?:door|handle)s?\b|\b(?:cabinet.*(?:width|height|depth)|(?:width|height|depth).*cabinet)\b/.test(text)) {
    return 'product_body';
  }
  if (/\b(?:clearance|air\s*space|ventilation|gap)\b/.test(text)) return 'installation_clearance';
  return 'product_closed_candidate';
}

function scopeDecision(scope, supportedDecision) {
  return scope === 'product_closed_candidate' ? supportedDecision : 'REJECTED_NON_PRODUCT_SCOPE';
}

function exactModelsInText(text, identities) {
  return identities.filter((identity) => containsExactModel(text, identity.model)).map((identity) => identity.model);
}

function fragmentRecord({ item, page, pageText, documentText, pdfSha256, contentSha256, sourceUrls, identities }) {
  const type = normalizedText(item.type);
  const html = type === 'table' ? String(item?.content?.html ?? '') : null;
  const text = itemText(item);
  const bbox = Array.isArray(item.bbox) && item.bbox.length === 4 ? item.bbox.map(Number) : null;
  const fragmentSha256 = sha256(JSON.stringify({ page, type, bbox, html, text }));
  const fragmentModels = exactModelsInText(text, identities);
  const pageModels = fragmentModels.length ? [] : exactModelsInText(pageText, identities);
  const documentModels = fragmentModels.length || pageModels.length
    ? []
    : exactModelsInText(documentText, identities);
  return {
    pdfSha256,
    contentSha256,
    page,
    bbox,
    fragmentSha256,
    sourceUrls: [...sourceUrls],
    identities: identities.map((identity) => ({ ...identity })),
    modelBinding: fragmentModels.length
      ? 'SAME_FRAGMENT_EXACT_MODEL'
      : pageModels.length
        ? 'SAME_PAGE_EXACT_MODEL'
        : documentModels.length
          ? 'SAME_DOCUMENT_EXACT_MODEL'
          : 'DOCUMENT_IDENTITY_ONLY',
    boundModels: fragmentModels.length ? fragmentModels : pageModels.length ? pageModels : documentModels,
  };
}

function observationId(value) {
  return `dimension_expression_${sha256(JSON.stringify(value)).slice(0, 24)}`;
}

function finalizeObservation(base, details) {
  const value = { ...base, ...details };
  if (value.modelBinding === 'DOCUMENT_IDENTITY_ONLY' && /^SUPPORTED_/.test(value.parserDecision)) {
    value.syntaxDecision = value.parserDecision;
    value.parserDecision = 'RESEARCH_MODEL_SCOPE_REQUIRED';
    value.safeAxes = [];
  }
  return Object.freeze({ observationId: observationId(value), ...value });
}

function groupedObservation({ label, value, pageContext, base, depthVariantText = null }) {
  const axisOrder = explicitAxisOrder(label);
  const values = numericValues(value);
  if (axisOrder.length !== 3 || values.length !== 3) return null;
  const { unit, unitPlacement } = unitEvidence(label, value, pageContext);
  const scope = expressionScope(label);
  let decision = !unit
    ? 'RESEARCH_UNIT_MISSING'
    : scopeDecision(scope, 'SUPPORTED_EXPLICIT_GROUPED');
  if (depthVariantText && decision === 'SUPPORTED_EXPLICIT_GROUPED') {
    decision = 'SUPPORTED_PARTIAL_REJECT_QUALIFIED_DEPTH_VARIANT';
  }
  const safeAxes = decision === 'SUPPORTED_EXPLICIT_GROUPED'
    ? [...axisOrder]
    : decision === 'SUPPORTED_PARTIAL_REJECT_QUALIFIED_DEPTH_VARIANT'
      ? axisOrder.filter((axis) => axis !== 'depth')
      : [];
  return finalizeObservation(base, {
    patternKind: depthVariantText ? 'GROUPED_AXIS_SEQUENCE_WITH_VARIANT' : 'GROUPED_AXIS_SEQUENCE',
    sourceLabel: normalizedText(label),
    sourceValue: normalizedText(value),
    sourceQuote: normalizedText(`${label} ${value}`),
    axisOrder,
    safeAxes,
    unit,
    unitPlacement,
    scope,
    depthVariants: depthVariantText ? [normalizedText(depthVariantText)] : [],
    parserDecision: decision,
    semanticInterpretation: `${axisOrder.map((axis, index) => `${index + 1}:${axis}`).join(', ')}${depthVariantText ? '; qualified depth variant not selected' : ''}`,
  });
}

function groupedTextObservations({ text, pageContext, base }) {
  const observations = [];
  const axis = '(W(?:idth|ide)?|H(?:eight|igh)?|D(?:epth|eep)?)';
  const separator = '\\s*(?:x|×|\\*)\\s*';
  const order = new RegExp(
    `\\b((?:net\\s+|product\\s+)?dimensions?(?:\\s+of\\s+(?:the\\s+)?product)?\\s*\\(?\\s*${axis}${separator}${axis}${separator}${axis}\\s*\\)?)`,
    'gi',
  );
  const number = '\\d+(?:\\.\\d+)?';
  const scalar = `${number}\\s*(?:mm|cm)?`;
  const triple = new RegExp(
    `^\\s*(?:\\(\\s*(mm|cm)\\s*\\))?\\s*[:=]?\\s*(${scalar}${separator}${scalar}${separator}${scalar})`,
    'i',
  );
  for (const match of String(text ?? '').matchAll(order)) {
    const remainder = String(text).slice((match.index ?? 0) + match[0].length);
    const values = triple.exec(remainder);
    if (!values) continue;
    const unitContext = values[1] ? ` (${values[1]})` : '';
    const afterValues = remainder.slice(values[0].length);
    const variant = /^\s*\(([^)]*(?:handle|door|open)[^)]*)\)/i.exec(afterValues);
    const observation = groupedObservation({
      label: `${match[1]}${unitContext}`,
      value: values[2],
      pageContext,
      base,
      depthVariantText: variant?.[1] ?? null,
    });
    if (observation) observations.push(observation);
  }
  return observations;
}

function letteredAxisListObservation({ text, pageContext, base }) {
  const rows = [];
  const pattern = /\b([A-Z])\s*\(\s*(width|wide|height|high|depth|deep)\s*\)\s*(\d+(?:\.\d+)?\s*(?:mm|cm)?)/gi;
  for (const match of String(text ?? '').matchAll(pattern)) {
    rows.push({
      letter: match[1].toUpperCase(),
      axis: axisForToken(match[2]),
      label: `${match[1].toUpperCase()} (${match[2]})`,
      value: normalizedText(match[3]),
    });
  }
  if (new Set(rows.map((row) => row.axis)).size < 2) return null;
  const sourceLabel = rows.map((row) => row.label).join(' | ');
  const sourceValue = rows.map((row) => row.value).join(' | ');
  const { unit, unitPlacement } = unitEvidence(sourceLabel, sourceValue, pageContext);
  const axisOrder = rows.map((row) => row.axis);
  const duplicateAxes = [...new Set(axisOrder.filter((axis, index) => axisOrder.indexOf(axis) !== index))];
  return finalizeObservation(base, {
    patternKind: 'LETTERED_EXPLICIT_AXIS_LIST',
    sourceLabel,
    sourceValue,
    sourceQuote: rows.map((row) => `${row.label} ${row.value}`).join(' | '),
    axisOrder,
    safeAxes: unit ? [...new Set(axisOrder.filter((axis) => !duplicateAxes.includes(axis)))] : [],
    unit,
    unitPlacement,
    scope: 'product_closed_candidate',
    depthVariants: duplicateAxes.includes('depth')
      ? rows.filter((row) => row.axis === 'depth').map((row) => row.label)
      : [],
    axisValues: rows.map((row) => ({
      axis: row.axis, label: row.label, value: row.value, valueShape: 'scalar',
    })),
    parserDecision: !unit
      ? 'RESEARCH_UNIT_MISSING'
      : duplicateAxes.length
        ? 'SUPPORTED_PARTIAL_REJECT_AMBIGUOUS_AXIS_COLUMNS'
        : 'SUPPORTED_EXPLICIT_LETTERED_AXES',
    semanticInterpretation: rows.map((row) => `${row.letter}:${row.axis}`).join(', '),
  });
}

function unlabelledDimensionTripleObservations({ text, pageContext, base }) {
  const observations = [];
  const pattern = /\bdimensions?\s+of\s+(?:the\s+)?product\s*[:.]?\s*(\.?\d+(?:\.\d+)?\s*(?:mm|cm)?\s*(?:x|×|\*)\s*\.?\d+(?:\.\d+)?\s*(?:mm|cm)?\s*(?:x|×|\*)\s*\.?\d+(?:\.\d+)?\s*(?:mm|cm)?)/gi;
  for (const match of String(text ?? '').matchAll(pattern)) {
    const sourceValue = normalizedText(match[1]);
    const { unit, unitPlacement } = unitEvidence('Dimensions of the product', sourceValue, pageContext);
    observations.push(finalizeObservation(base, {
      patternKind: 'UNLABELLED_DIMENSION_TRIPLE',
      sourceLabel: 'Dimensions of the product',
      sourceValue,
      sourceQuote: normalizedText(match[0]),
      axisOrder: [],
      safeAxes: [],
      unit,
      unitPlacement,
      scope: 'product_closed_candidate',
      depthVariants: [],
      parserDecision: 'RESEARCH_UNLABELLED_AXIS_ORDER',
      semanticInterpretation: 'Three values are present but the source text does not state their axis order.',
    }));
  }
  return observations;
}

function exactAxisCell(value) {
  const match = /^(W|H|D)(['"′″]?)$/i.exec(normalizedText(value));
  if (!match) return null;
  return { axis: axisForToken(match[1]), sourceAxis: normalizedText(value), qualifier: match[2] };
}

function alternatingObservation({ cells, pageContext, base }) {
  const pairs = [];
  for (const row of cells) {
    if (row.length < 2 || row.length % 2 !== 0) return null;
    for (let index = 0; index < row.length; index += 2) {
      const axis = exactAxisCell(row[index]);
      const sourceValue = normalizedText(row[index + 1]);
      if (!axis && !sourceValue) continue;
      if (!axis || !/^\d+(?:\.\d+)?$/.test(sourceValue)) return null;
      pairs.push({ ...axis, sourceValue });
    }
  }
  if (pairs.length < 2) return null;
  const depthVariants = pairs.filter((pair) => pair.axis === 'depth' && pair.qualifier)
    .map((pair) => pair.sourceAxis);
  const axes = pairs.map((pair) => pair.axis);
  const safeAxes = [...new Set(depthVariants.length ? axes.filter((axis) => axis !== 'depth') : axes)];
  const { unit, unitPlacement } = unitEvidence('', '', pageContext);
  let parserDecision = unit ? 'SUPPORTED_EXPLICIT_ALTERNATING_CELLS' : 'RESEARCH_UNIT_MISSING';
  if (depthVariants.length && unit) parserDecision = 'SUPPORTED_PARTIAL_REJECT_AMBIGUOUS_DEPTH';
  return finalizeObservation(base, {
    patternKind: 'ALTERNATING_AXIS_VALUE_CELLS',
    sourceLabel: pairs.map((pair) => pair.sourceAxis).join(' | '),
    sourceValue: pairs.map((pair) => pair.sourceValue).join(' | '),
    sourceQuote: normalizedText(`${pageContext} ${pairs.map((pair) => `${pair.sourceAxis} ${pair.sourceValue}`).join(' ')}`),
    axisOrder: axes,
    safeAxes,
    unit,
    unitPlacement,
    scope: 'product_closed_candidate',
    depthVariants,
    parserDecision,
    semanticInterpretation: depthVariants.length
      ? 'Width and height are explicit; depth variants remain undefined by text.'
      : axes.map((axis, index) => `${index + 1}:${axis}`).join(', '),
  });
}

function labelledAxis(value) {
  const label = normalizedText(value);
  const parenthesized = /^dimensions?\s+in\s+(?:mm|cm)\s*\((width|height|depth)\)$/i.exec(label);
  if (parenthesized) return axisForToken(parenthesized[1]);
  const direct = /^(?:(?:total|overall|external|product|appliance|cabinet)\s+)?(width|wide|height|high|depth|deep)(?:\s*(?:\([^)]*\)|including\b.*|with\b.*|without\b.*))?$/i.exec(label);
  return direct ? axisForToken(direct[1]) : null;
}

function dimensionValue(value) {
  const text = normalizedText(value);
  if (!/^\d+(?:\.\d+)?(?:\s*[-–—]\s*\d+(?:\.\d+)?)?\s*(?:mm|cm)?$/i.test(text)) return null;
  return {
    value: text,
    valueShape: /[-–—]/.test(text) ? 'range' : 'scalar',
  };
}

function combinedAxisValue(value) {
  const text = normalizedText(value);
  const match = /^(.*?)(\d+(?:\.\d+)?(?:\s*[-–—]\s*\d+(?:\.\d+)?)?\s*(?:mm|cm)?)$/i.exec(text);
  if (!match) return null;
  const label = normalizedText(match[1].replace(/[.:]+$/, ''));
  const axis = labelledAxis(label);
  const parsed = dimensionValue(match[2]);
  return axis && parsed ? { axis, label, ...parsed } : null;
}

function axisEntriesFromCells(cells) {
  const entries = [];
  for (const row of cells) {
    for (let index = 0; index < row.length; index += 1) {
      const combined = combinedAxisValue(row[index]);
      if (combined) entries.push({ ...combined, row: entries.length, sourceCell: index });
      if (index >= row.length - 1) continue;
      const axis = labelledAxis(row[index]);
      const parsed = dimensionValue(row[index + 1]);
      if (axis && parsed) {
        entries.push({
          axis,
          label: normalizedText(row[index]),
          ...parsed,
          row: entries.length,
          sourceCell: index,
        });
      }
    }
  }
  return [...new Map(entries.map((entry) => [
    `${entry.axis}\0${entry.label}\0${entry.value}`,
    entry,
  ])).values()];
}

function labelledObservations({ cells, pageContext, base }) {
  const entries = axisEntriesFromCells(cells);
  const groups = new Map();
  for (const entry of entries) {
    const scope = expressionScope(entry.label);
    const current = groups.get(scope) ?? [];
    current.push(entry);
    groups.set(scope, current);
  }
  const observations = [];
  for (const [scope, rows] of groups) {
    const combinedLabel = rows.map((row) => row.label).join(' | ');
    const combinedValue = rows.map((row) => row.value).join(' | ');
    const { unit, unitPlacement } = unitEvidence(combinedLabel, combinedValue, pageContext);
    const valuesByAxis = new Map();
    for (const row of rows) {
      const current = valuesByAxis.get(row.axis) ?? new Set();
      current.add(row.value);
      valuesByAxis.set(row.axis, current);
    }
    const ambiguousAxes = [...valuesByAxis].filter(([, values]) => values.size > 1).map(([axis]) => axis);
    const rangeAxes = [...new Set(rows.filter((row) => row.valueShape === 'range').map((row) => row.axis))];
    let parserDecision = 'SUPPORTED_EXPLICIT_LABELS';
    if (!unit) parserDecision = 'RESEARCH_UNIT_MISSING';
    else if (scope !== 'product_closed_candidate') parserDecision = 'REJECTED_NON_PRODUCT_SCOPE';
    else if (ambiguousAxes.length) parserDecision = 'RESEARCH_MULTIPLE_VALUES_PER_AXIS';
    else if (rangeAxes.length) parserDecision = 'RESEARCH_ADJUSTABLE_RANGE';
    const axisOrder = rows.map((row) => row.axis);
    const safeAxes = unit && scope === 'product_closed_candidate'
      ? [...new Set(axisOrder.filter((axis) => !ambiguousAxes.includes(axis) && !rangeAxes.includes(axis)))]
      : [];
    observations.push(finalizeObservation(base, {
      patternKind: new Set(axisOrder).size > 1 ? 'INDIVIDUALLY_LABELLED_AXES' : 'INDIVIDUAL_LABELLED_AXIS',
      sourceLabel: combinedLabel,
      sourceValue: combinedValue,
      sourceQuote: rows.map((row) => `${row.label} ${row.value}`).join(' | '),
      axisOrder,
      safeAxes,
      unit,
      unitPlacement,
      scope,
      depthVariants: [],
      axisValues: rows.map(({ axis, label, value, valueShape }) => ({ axis, label, value, valueShape })),
      parserDecision,
      semanticInterpretation: [
        ...rows.map((row, index) => `${index + 1}:${row.axis}(${row.valueShape})`),
        ...(ambiguousAxes.length ? [`ambiguous:${ambiguousAxes.join(',')}`] : []),
        ...(rangeAxes.length ? [`range:${rangeAxes.join(',')}`] : []),
      ].join(', '),
    }));
  }
  return observations;
}

function matrixAxisHeader(value) {
  const label = normalizedText(value);
  const match = /\b(height|high|width|wide|depth|deep)\b/i.exec(label);
  if (!match) return null;
  return {
    axis: axisForToken(match[1]),
    label,
    scope: expressionScope(label),
  };
}

function modelRowMatrixObservations({ cells, pageContext, base }) {
  const observations = [];
  for (let headerIndex = 0; headerIndex < cells.length; headerIndex += 1) {
    const header = cells[headerIndex];
    const columns = header.map((value, index) => ({ index, ...matrixAxisHeader(value) }))
      .filter((column) => column.axis);
    const closedColumns = columns.filter((column) => column.scope === 'product_closed_candidate');
    if (new Set(closedColumns.map((column) => column.axis)).size < 3) continue;
    for (const row of cells.slice(headerIndex + 1)) {
      const values = columns.map((column) => ({ ...column, parsed: dimensionValue(row[column.index]) }));
      if (values.filter((value) => value.parsed).length < 3) continue;
      const modelExpression = normalizedText(row[0]);
      if (!modelExpression || dimensionValue(modelExpression)) continue;
      const exactModels = exactModelsInText(modelExpression, base.identities);
      const sourceValue = values.map((value) => normalizedText(row[value.index])).join(' | ');
      const sourceLabel = columns.map((column) => column.label).join(' | ');
      const { unit, unitPlacement } = unitEvidence(sourceLabel, sourceValue, pageContext);
      const closedAxisCounts = new Map();
      for (const value of values.filter((candidate) => (
        candidate.parsed && candidate.scope === 'product_closed_candidate'
      ))) {
        closedAxisCounts.set(value.axis, (closedAxisCounts.get(value.axis) ?? 0) + 1);
      }
      const ambiguousAxisColumns = [...closedAxisCounts]
        .filter(([, count]) => count > 1)
        .map(([axis]) => axis);
      const safeAxes = exactModels.length && unit
        ? [...new Set(values.filter((value) => (
          value.parsed && value.scope === 'product_closed_candidate'
            && !ambiguousAxisColumns.includes(value.axis)
        )).map((value) => value.axis))]
        : [];
      observations.push(finalizeObservation({
        ...base,
        modelBinding: exactModels.length ? 'SAME_FRAGMENT_EXACT_MODEL' : 'UNRESOLVED_MODEL_EXPRESSION',
        boundModels: exactModels,
      }, {
        patternKind: 'MODEL_ROW_DIMENSION_MATRIX',
        modelExpression,
        sourceLabel,
        sourceValue,
        sourceQuote: `${sourceLabel} | ${modelExpression} | ${sourceValue}`,
        axisOrder: values.filter((value) => value.parsed).map((value) => value.axis),
        safeAxes,
        unit,
        unitPlacement,
        scope: values.some((value) => value.scope !== 'product_closed_candidate')
          ? 'mixed_product_and_operation'
          : 'product_closed_candidate',
        depthVariants: values.filter((value) => (
          value.axis === 'depth' && (
            value.scope !== 'product_closed_candidate'
              || ambiguousAxisColumns.includes('depth')
          )
        )).map((value) => value.label),
        axisValues: values.filter((value) => value.parsed).map((value) => ({
          axis: value.axis,
          label: value.label,
          value: value.parsed.value,
          valueShape: value.parsed.valueShape,
          scope: value.scope,
        })),
        parserDecision: !unit
          ? 'RESEARCH_UNIT_MISSING'
          : exactModels.length
            ? ambiguousAxisColumns.length
              ? 'SUPPORTED_PARTIAL_REJECT_AMBIGUOUS_AXIS_COLUMNS'
              : 'SUPPORTED_EXACT_MODEL_ROW_MATRIX'
            : 'RESEARCH_MODEL_ROW_BINDING_REQUIRED',
        semanticInterpretation: exactModels.length
          ? `Exact model row with closed axes ${safeAxes.join(', ')}.${ambiguousAxisColumns.length ? ` Repeated columns unresolved for ${ambiguousAxisColumns.join(', ')}.` : ''}`
          : 'Axis order is explicit but the row model expression is not an exact target-model binding.',
      }));
    }
    break;
  }
  return observations;
}

function modelColumnMatrixObservations({ cells, pageContext, base }) {
  const observations = [];
  for (let headerIndex = 0; headerIndex < cells.length; headerIndex += 1) {
    const header = cells[headerIndex];
    for (let columnIndex = 1; columnIndex < header.length; columnIndex += 1) {
      const modelExpression = normalizedText(header[columnIndex]);
      const exactModels = exactModelsInText(modelExpression, base.identities);
      if (!exactModels.length) continue;
      const values = [];
      for (const row of cells.slice(headerIndex + 1)) {
        const axisHeader = matrixAxisHeader(row[0]);
        const parsed = dimensionValue(row[columnIndex]);
        if (axisHeader && parsed) values.push({ ...axisHeader, parsed });
      }
      const closedValues = values.filter((value) => value.scope === 'product_closed_candidate');
      if (new Set(closedValues.map((value) => value.axis)).size < 2) continue;
      const sourceLabel = values.map((value) => value.label).join(' | ');
      const sourceValue = values.map((value) => value.parsed.value).join(' | ');
      const { unit, unitPlacement } = unitEvidence(sourceLabel, sourceValue, pageContext);
      const closedAxisCounts = new Map();
      for (const value of closedValues) {
        closedAxisCounts.set(value.axis, (closedAxisCounts.get(value.axis) ?? 0) + 1);
      }
      const ambiguousAxisColumns = [...closedAxisCounts]
        .filter(([, count]) => count > 1)
        .map(([axis]) => axis);
      const safeAxes = unit ? [...new Set(closedValues.filter((value) => (
        !ambiguousAxisColumns.includes(value.axis)
      )).map((value) => value.axis))] : [];
      observations.push(finalizeObservation({
        ...base,
        modelBinding: 'SAME_FRAGMENT_EXACT_MODEL',
        boundModels: exactModels,
      }, {
        patternKind: 'MODEL_COLUMN_DIMENSION_MATRIX',
        modelExpression,
        sourceLabel,
        sourceValue,
        sourceQuote: `${modelExpression} | ${values.map((value) => `${value.label} ${value.parsed.value}`).join(' | ')}`,
        axisOrder: values.map((value) => value.axis),
        safeAxes,
        unit,
        unitPlacement,
        scope: values.some((value) => value.scope !== 'product_closed_candidate')
          ? 'mixed_product_and_operation'
          : 'product_closed_candidate',
        depthVariants: values.filter((value) => (
          value.axis === 'depth' && (
            value.scope !== 'product_closed_candidate'
              || ambiguousAxisColumns.includes('depth')
          )
        )).map((value) => value.label),
        axisValues: values.map((value) => ({
          axis: value.axis,
          label: value.label,
          value: value.parsed.value,
          valueShape: value.parsed.valueShape,
          scope: value.scope,
        })),
        parserDecision: !unit
          ? 'RESEARCH_UNIT_MISSING'
          : ambiguousAxisColumns.length
            ? 'SUPPORTED_PARTIAL_REJECT_AMBIGUOUS_AXIS_COLUMNS'
            : 'SUPPORTED_EXACT_MODEL_COLUMN_MATRIX',
        semanticInterpretation: `Exact model column with closed axes ${safeAxes.join(', ')}.`,
      }));
    }
  }
  return observations;
}

function documentScopedMatrixObservations({ cells, pageContext, base }) {
  const observations = [];
  for (let headerIndex = 0; headerIndex < cells.length; headerIndex += 1) {
    const columns = cells[headerIndex]
      .map((value, index) => ({ index, ...matrixAxisHeader(value) }))
      .filter((column) => column.axis);
    const closedColumns = columns.filter((column) => column.scope === 'product_closed_candidate');
    if (closedColumns.length !== 3
      || new Set(closedColumns.map((column) => column.axis)).size !== 3) continue;
    for (const row of cells.slice(headerIndex + 1)) {
      if (exactModelsInText(row.join(' '), base.identities).length) continue;
      if (!closedColumns.some((column) => column.index === 0)
        && row[0] && !dimensionValue(row[0])) continue;
      const values = closedColumns.map((column) => ({
        ...column,
        parsed: dimensionValue(row[column.index]),
      }));
      if (!values.every((value) => value.parsed)) continue;
      const sourceLabel = values.map((value) => value.label).join(' | ');
      const sourceValue = values.map((value) => value.parsed.value).join(' | ');
      const { unit, unitPlacement } = unitEvidence(sourceLabel, sourceValue, pageContext);
      if (!unit) continue;
      observations.push(finalizeObservation(base, {
        patternKind: 'DOCUMENT_SCOPED_DIMENSION_MATRIX',
        sourceLabel,
        sourceValue,
        sourceQuote: values.map((value) => `${value.label} ${value.parsed.value}`).join(' | '),
        axisOrder: values.map((value) => value.axis),
        safeAxes: [],
        unit,
        unitPlacement,
        scope: 'product_closed_candidate',
        depthVariants: [],
        axisValues: values.map((value) => ({
          axis: value.axis,
          label: value.label,
          value: value.parsed.value,
          valueShape: value.parsed.valueShape,
          scope: value.scope,
        })),
        syntaxDecision: 'SUPPORTED_EXPLICIT_COLUMN_MATRIX',
        parserDecision: 'RESEARCH_DOCUMENT_UNIQUE_SCOPE_REQUIRED',
        semanticInterpretation: 'Axes and values are explicit; exact-model authority must be proven at document scope before parsing.',
      }));
      break;
    }
    if (observations.length) break;
  }
  return observations;
}

function pageDimensionContext(items) {
  return items.map(itemText).find((text) => (
    /\bdimensions?\s*\(\s*(?:mm|cm|millimet(?:re|er)s?|centimet(?:re|er)s?)\s*\)/i.test(text)
      || /\b(?:all\s+)?measurements?\b[^.]{0,80}\b(?:mm|cm|millimet(?:re|er)s?|centimet(?:re|er)s?)\b/i.test(text)
      || /\bproduct\s+dimensions?\b[^.]{0,80}\b(?:mm|cm|millimet(?:re|er)s?|centimet(?:re|er)s?)\b/i.test(text)
  )) ?? '';
}

function dimensionSignal(value) {
  const text = normalizedText(value);
  if (!/\b(?:dimensions?|measurements?)\b/i.test(text)) return false;
  const axes = new Set((text.match(/\b(?:width|wide|height|high|depth|deep|[WHD])\b/gi) ?? [])
    .map(axisForToken)
    .filter(Boolean));
  return axes.size >= 2 || /\b(?:mm|cm|millimet(?:re|er)s?|centimet(?:re|er)s?)\b/i.test(text);
}

function informativeDimensionText(value) {
  const text = normalizedText(value);
  if (!dimensionSignal(text)) return false;
  const axes = new Set((text.match(/\b(?:width|wide|height|high|depth|deep|[WHD])\b/gi) ?? [])
    .map(axisForToken)
    .filter(Boolean));
  return axes.size >= 2 || numericValues(text).length >= 2;
}

function dimensionSnippet(value, maximum = 320) {
  const text = normalizedText(value);
  const match = /\b(?:dimensions?|measurements?)\b/i.exec(text);
  const start = Math.max(0, (match?.index ?? 0) - 60);
  return text.slice(start, start + maximum);
}

function seriesEvidence(contentList, identities, pdfSha256) {
  const result = [];
  contentList.forEach((items, pageIndex) => {
    for (const item of items) {
      const text = itemText(item);
      const seriesNames = [...String(text).matchAll(/\b(?:Series|Serie)\s+(\d{1,4}[A-Za-z]?)\b/gi)]
        .map((match) => `Series ${match[1]}`);
      if (!seriesNames.length) continue;
      for (const identity of identities) {
        if (!containsExactModel(text, identity.model)) continue;
        for (const seriesName of seriesNames) {
          result.push({
            brand: identity.brand,
            model: identity.model,
            category: identity.category,
            seriesName,
            pdfSha256,
            page: pageIndex + 1,
            quote: text,
          });
        }
      }
    }
  });
  const unique = new Map(result.map((row) => [
    `${row.category}\0${row.brand}\0${row.model}\0${row.seriesName}\0${row.page}`,
    row,
  ]));
  return [...unique.values()].sort((left, right) => (
    `${left.category}\0${left.brand}\0${left.model}\0${left.seriesName}`
      .localeCompare(`${right.category}\0${right.brand}\0${right.model}\0${right.seriesName}`)
  ));
}

export function extractDimensionExpressions(input) {
  const pdfSha256 = requiredHash(input?.pdfSha256, 'source PDF');
  const contentSha256 = requiredHash(input?.contentSha256, 'MinerU content');
  if (!Array.isArray(input?.contentList) || !input.contentList.length) {
    throw new TypeError('MinerU content_list_v2 required');
  }
  const sourceUrls = [...new Set((input.sourceUrls ?? []).map(normalizedText).filter(Boolean))].sort();
  const identities = (input.identities ?? []).map((identity) => ({
    brand: normalizedText(identity.brand),
    model: normalizedText(identity.model),
    category: normalizedText(identity.category),
  })).filter((identity) => identity.brand && identity.model && CATEGORIES.includes(identity.category));
  const documentText = normalizedText(input.contentList.flatMap((items) => items.map(itemText)).join(' '));
  const observations = [];
  const researchGaps = [];
  input.contentList.forEach((items, pageIndex) => {
    if (!Array.isArray(items)) throw new TypeError(`MinerU page ${pageIndex + 1} invalid`);
    const pageContext = pageDimensionContext(items);
    const pageText = normalizedText(items.map(itemText).join(' '));
    const pageObservationStart = observations.length;
    for (const item of items) {
      const base = fragmentRecord({
        item, page: pageIndex + 1, pageText, documentText,
        pdfSha256, contentSha256, sourceUrls, identities,
      });
      if (item.type === 'table') {
        const cells = tableCells(item?.content?.html);
        let groupedRows = 0;
        for (const row of cells) {
          if (row.length < 2) continue;
          const grouped = groupedObservation({
            label: row[0], value: row.slice(1).join(' '), pageContext, base,
          });
          if (grouped) {
            observations.push(grouped);
            groupedRows += 1;
          }
        }
        if (!groupedRows) {
          const text = itemText(item);
          observations.push(...groupedTextObservations({ text, pageContext, base }));
          const lettered = letteredAxisListObservation({ text, pageContext, base });
          if (lettered) observations.push(lettered);
          observations.push(...unlabelledDimensionTripleObservations({ text, pageContext, base }));
        }
        const alternating = alternatingObservation({ cells, pageContext, base });
        if (alternating) observations.push(alternating);
        observations.push(...labelledObservations({ cells, pageContext, base }));
        observations.push(...modelRowMatrixObservations({ cells, pageContext, base }));
        observations.push(...modelColumnMatrixObservations({ cells, pageContext, base }));
        observations.push(...documentScopedMatrixObservations({ cells, pageContext, base }));
      } else {
        const text = itemText(item);
        observations.push(...groupedTextObservations({ text, pageContext, base }));
        const lettered = letteredAxisListObservation({ text, pageContext, base });
        if (lettered) observations.push(lettered);
        observations.push(...unlabelledDimensionTripleObservations({ text, pageContext, base }));
        observations.push(...labelledObservations({ cells: [[text]], pageContext, base }));
      }
    }
    if (observations.length === pageObservationStart && dimensionSignal(pageText)) {
      const dimensionItems = items.map((item) => ({ item, text: itemText(item) }))
        .filter((row) => dimensionSignal(row.text));
      const informativeText = dimensionItems.find((row) => (
        row.item.type !== 'image' && informativeDimensionText(row.text)
      ));
      const imageText = dimensionItems.find((row) => row.item.type === 'image');
      const gapType = informativeText
        ? 'UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION'
        : imageText || items.some((item) => item.type === 'image')
          ? 'IMAGE_ONLY_DIMENSION_DIAGRAM'
          : 'UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION';
      researchGaps.push({
        gapType,
        pdfSha256,
        contentSha256,
        page: pageIndex + 1,
        quote: dimensionSnippet(informativeText?.text ?? imageText?.text ?? pageContext ?? pageText),
      });
    }
  });
  const unique = new Map(observations.map((observation) => [observation.observationId, observation]));
  if (!unique.size && !researchGaps.length) {
    researchGaps.push({
      gapType: 'NO_RECOGNIZED_DIMENSION_EXPRESSION',
      pdfSha256,
      contentSha256,
      page: null,
      quote: '',
    });
  }
  return Object.freeze({
    pdfSha256,
    contentSha256,
    sourceUrls: Object.freeze(sourceUrls),
    identities: Object.freeze(identities),
    seriesEvidence: Object.freeze(seriesEvidence(input.contentList, identities, pdfSha256)),
    researchGaps: Object.freeze(researchGaps),
    observations: Object.freeze([...unique.values()].sort((left, right) => (
      left.page - right.page
      || left.fragmentSha256.localeCompare(right.fragmentSha256)
      || left.patternKind.localeCompare(right.patternKind)
      || left.sourceLabel.localeCompare(right.sourceLabel)
    ))),
  });
}

function preferredBrand(values, aliasMap) {
  const aliases = values.map((value) => aliasMap[value] ?? aliasMap[value.toLowerCase()]).filter(Boolean);
  if (new Set(aliases).size === 1) return aliases[0];
  const counts = new Map(values.map((value) => [value, values.filter((candidate) => candidate === value).length]));
  return [...new Set(values)].sort((left, right) => (
    (counts.get(right) - counts.get(left))
    || Number(/^[A-Z\s&/-]+$/.test(left)) - Number(/^[A-Z\s&/-]+$/.test(right))
    || left.localeCompare(right)
  ))[0];
}

function brandGroups(records, aliasMap) {
  const groups = new Map();
  for (const record of records) {
    const raw = normalizedText(record.brand);
    if (!raw) continue;
    const key = raw.toLowerCase();
    const group = groups.get(key) ?? { rawValues: [], records: [] };
    group.rawValues.push(raw);
    group.records.push(record);
    groups.set(key, group);
  }
  return new Map([...groups].map(([key, group]) => [key, {
    canonicalBrand: preferredBrand(group.rawValues, aliasMap),
    rawBrandVariants: [...new Set(group.rawValues)].sort(),
    records: group.records,
  }]));
}

function normalizedGrammarLabel(value) {
  return normalizedText(value)
    .toLowerCase()
    .replace(/\b(?:millimet(?:re|er)s?|centimet(?:re|er)s?|mm|cm)\b/g, '<unit>')
    .replace(/\d+(?:\.\d+)?/g, '<number>')
    .replace(/\s+/g, ' ')
    .trim();
}

function parserProfileForDocument(extracted) {
  if (!extracted.observations.length) return null;
  const expressionShapes = extracted.observations.map((observation) => ({
    patternKind: observation.patternKind,
    syntaxDecision: observation.syntaxDecision ?? observation.parserDecision,
    sourceLabel: normalizedGrammarLabel(observation.sourceLabel),
    axisOrder: [...observation.axisOrder],
    safeAxes: [...observation.safeAxes].sort(),
    scope: observation.scope,
    unit: observation.unit,
    unitPlacement: observation.unitPlacement,
    valueShapes: [...new Set((observation.axisValues ?? []).map((value) => value.valueShape))].sort(),
    depthVariantLabels: (observation.depthVariants ?? []).map(normalizedGrammarLabel).sort(),
  })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const signature = {
    signatureVersion: 1,
    expressionShapes,
    researchGapTypes: [...new Set(extracted.researchGaps.map((gap) => gap.gapType))].sort(),
  };
  return Object.freeze({
    parserProfileId: `pdf_grammar_${sha256(JSON.stringify(signature)).slice(0, 16)}`,
    ...signature,
  });
}

function familyForDocument(document, identity, extracted, parserProfile) {
  const sameIdentitySeries = extracted.seriesEvidence.filter((row) => (
    row.category === identity.category
      && row.brand.toLowerCase() === identity.brand.toLowerCase()
      && row.model.toLowerCase() === identity.model.toLowerCase()
  ));
  const seriesNames = [...new Set(sameIdentitySeries.map((row) => row.seriesName))];
  if (seriesNames.length === 1) {
    return { groupType: 'marketing_series', groupName: seriesNames[0], seriesEvidence: sameIdentitySeries };
  }
  const sameBrandCategory = document.identities.filter((candidate) => (
    candidate.category === identity.category && candidate.brand.toLowerCase() === identity.brand.toLowerCase()
  ));
  if (sameBrandCategory.length > 1) {
    return {
      groupType: 'document_family',
      groupName: `Document family ${document.pdfSha256.slice(0, 12)}`,
      seriesEvidence: [],
    };
  }
  if (parserProfile) {
    return {
      groupType: 'parser_family',
      groupName: `PDF grammar ${parserProfile.parserProfileId}`,
      seriesEvidence: [],
    };
  }
  return { groupType: 'model_specific', groupName: identity.model, seriesEvidence: [] };
}

function stableObservation(observation) {
  return JSON.parse(JSON.stringify(observation));
}

export function buildDimensionExpressionKnowledge(input) {
  const generatedAt = new Date(input?.generatedAt).toISOString();
  const historicalRecords = (input?.historicalRecords ?? []).filter((record) => (
    CATEGORIES.includes(record?.category) && normalizedText(record.brand) && normalizedText(record.model)
  ));
  const documents = (input?.documents ?? []).map((document) => ({
    ...document,
    pdfSha256: requiredHash(document.pdfSha256, 'document PDF'),
    contentSha256: requiredHash(document.contentSha256, 'document MinerU content'),
    sourceUrls: [...new Set((document.sourceUrls ?? []).map(normalizedText).filter(Boolean))].sort(),
    identities: (document.identities ?? []).map((identity) => ({
      brand: normalizedText(identity.brand),
      model: normalizedText(identity.model),
      category: normalizedText(identity.category),
    })).filter((identity) => identity.brand && identity.model && CATEGORIES.includes(identity.category)),
  }));
  const invalidDocuments = (input?.invalidDocuments ?? []).map((document) => ({
    indexFile: normalizedText(document.indexFile),
    pdfSha256: requiredHash(document.pdfSha256, 'invalid document PDF'),
    contentSha256: document.contentSha256
      ? requiredHash(document.contentSha256, 'invalid document MinerU content')
      : null,
    reason: normalizedText(document.reason),
    mappingStatus: normalizedText(document.mappingStatus) || 'UNMAPPED',
    sourceUrls: [...new Set((document.sourceUrls ?? []).map(normalizedText).filter(Boolean))].sort(),
    identities: (document.identities ?? []).map((identity) => ({
      brand: normalizedText(identity.brand),
      model: normalizedText(identity.model),
      category: normalizedText(identity.category),
    })).filter((identity) => identity.brand && identity.model && CATEGORIES.includes(identity.category)),
  })).sort((left, right) => left.pdfSha256.localeCompare(right.pdfSha256));
  if (invalidDocuments.some((document) => !document.indexFile || !document.reason)) {
    throw new TypeError('invalid MinerU documents require indexFile and reason');
  }
  const aliasMap = Object.fromEntries(Object.entries(input?.brandAliasMap ?? {}).flatMap(([key, value]) => [
    [key, value], [key.toLowerCase(), value],
  ]));
  const extractedByHash = new Map(documents.map((document) => [
    document.pdfSha256,
    extractDimensionExpressions(document),
  ]));
  const parserProfileByHash = new Map([...extractedByHash].map(([pdfSha256, extracted]) => [
    pdfSha256,
    parserProfileForDocument(extracted),
  ]));
  const categoryRows = CATEGORIES.map((category) => {
    const categoryRecords = historicalRecords.filter((record) => record.category === category);
    const groups = brandGroups(categoryRecords, aliasMap);
    for (const document of documents) {
      for (const identity of document.identities.filter((candidate) => candidate.category === category)) {
        const key = identity.brand.toLowerCase();
        if (!groups.has(key)) groups.set(key, {
          canonicalBrand: preferredBrand([identity.brand], aliasMap),
          rawBrandVariants: [identity.brand],
          records: [],
        });
      }
    }
    const brands = [...groups.entries()].map(([brandKey, group]) => {
      const matchedDocuments = documents.filter((document) => document.identities.some((identity) => (
        identity.category === category && identity.brand.toLowerCase() === brandKey
      )));
      const families = new Map();
      for (const document of matchedDocuments) {
        const extracted = extractedByHash.get(document.pdfSha256);
        const parserProfile = parserProfileByHash.get(document.pdfSha256);
        const identities = document.identities.filter((identity) => (
          identity.category === category && identity.brand.toLowerCase() === brandKey
        ));
        for (const identity of identities) {
          const family = familyForDocument(document, identity, extracted, parserProfile);
          const key = `${family.groupType}\0${family.groupName}`;
          const current = families.get(key) ?? {
            groupType: family.groupType,
            groupName: family.groupName,
            models: [],
            pdfSha256s: [],
            sourceUrls: [],
            seriesEvidence: [],
            parserProfiles: [],
            expressions: [],
            researchGaps: [],
          };
          current.models.push(identity.model);
          current.pdfSha256s.push(document.pdfSha256);
          current.sourceUrls.push(...document.sourceUrls);
          current.seriesEvidence.push(...family.seriesEvidence);
          if (parserProfile) current.parserProfiles.push(parserProfile);
          current.expressions.push(...extracted.observations);
          current.researchGaps.push(...extracted.researchGaps);
          families.set(key, current);
        }
      }
      const familyRows = [...families.values()].map((family) => {
        const expressions = [...new Map(family.expressions.map((row) => [
          row.observationId, stableObservation(row),
        ])).values()].sort((left, right) => left.observationId.localeCompare(right.observationId));
        const researchGaps = [...new Map(family.researchGaps.map((row) => [
          JSON.stringify(row), stableObservation(row),
        ])).values()].sort((left, right) => (
          String(left.page ?? '').localeCompare(String(right.page ?? ''))
            || left.gapType.localeCompare(right.gapType)
        ));
        let expressionCoverageStatus = 'NO_RECOGNIZED_DIMENSION_EXPRESSION';
        if (expressions.length && researchGaps.length) expressionCoverageStatus = 'OBSERVED_WITH_RESEARCH_GAPS';
        else if (expressions.length) expressionCoverageStatus = 'OBSERVED_DIMENSION_EXPRESSIONS';
        else if (researchGaps.some((row) => row.gapType === 'IMAGE_ONLY_DIMENSION_DIAGRAM')) {
          expressionCoverageStatus = 'IMAGE_ONLY_DIMENSION_DIAGRAM';
        }
        return {
          ...family,
          models: [...new Set(family.models)].sort(),
          pdfSha256s: [...new Set(family.pdfSha256s)].sort(),
          sourceUrls: [...new Set(family.sourceUrls)].sort(),
          seriesEvidence: [...new Map(family.seriesEvidence.map((row) => [JSON.stringify(row), row])).values()],
          parserProfiles: [...new Map(family.parserProfiles.map((profile) => [
            profile.parserProfileId,
            profile,
          ])).values()].sort((left, right) => left.parserProfileId.localeCompare(right.parserProfileId)),
          parserProfileIds: [...new Set(family.parserProfiles.map((profile) => profile.parserProfileId))].sort(),
          expressionCoverageStatus,
          expressions,
          researchGaps,
        };
      }).sort((left, right) => (
        left.groupType.localeCompare(right.groupType) || left.groupName.localeCompare(right.groupName)
      ));
      const marketingSeriesCount = familyRows.filter((family) => family.groupType === 'marketing_series').length;
      const parserProfileCount = new Set(familyRows.flatMap((family) => family.parserProfileIds)).size;
      const expressionCount = familyRows.reduce((sum, family) => sum + family.expressions.length, 0);
      return {
        canonicalBrand: group.canonicalBrand,
        rawBrandVariants: group.rawBrandVariants,
        modelCount: new Set(group.records.map((record) => normalizedText(record.model))).size,
        observedMineruDocuments: matchedDocuments.length,
        observedMarketingSeriesCount: marketingSeriesCount,
        observedDocumentFamilyCount: familyRows.filter((family) => family.groupType === 'document_family').length,
        observedParserProfileCount: parserProfileCount,
        seriesCountStatus: marketingSeriesCount ? 'PROVEN_MINIMUM_ONLY' : 'UNKNOWN',
        coverageStatus: matchedDocuments.length ? 'MINERU_SAMPLE_OBSERVED' : 'NO_MINERU_SAMPLE',
        expressionCoverageStatus: expressionCount
          ? 'DIMENSION_EXPRESSIONS_OBSERVED'
          : matchedDocuments.length
            ? 'NO_RECOGNIZED_DIMENSION_EXPRESSION'
            : 'NO_MINERU_SAMPLE',
        families: familyRows,
      };
    }).sort((left, right) => left.canonicalBrand.localeCompare(right.canonicalBrand));
    return { category, recordCount: categoryRecords.length, brands };
  });
  const unmappedDocuments = documents.filter((document) => !document.identities.length).map((document) => ({
    pdfSha256: document.pdfSha256,
    contentSha256: document.contentSha256,
    sourceUrls: document.sourceUrls,
    mappingStatus: normalizedText(document.mappingStatus) || 'UNMAPPED',
  }));
  const observations = [...extractedByHash.values()].reduce((sum, row) => sum + row.observations.length, 0);
  const documentsWithObservations = [...extractedByHash.values()].filter((row) => row.observations.length).length;
  const researchGaps = [...extractedByHash.values()].reduce((sum, row) => sum + row.researchGaps.length, 0);
  return {
    schemaVersion: 2,
    generatedAt,
    policy: {
      categories: [...CATEGORIES],
      marketingSeriesRequiresOfficialTextWithExactModel: true,
      modelPrefixSeriesInferenceAllowed: false,
      knowledgeBaseCanAuthoriseClaims: false,
      exactModelReceiptStillRequired: true,
    },
    summary: {
      historicalRecords: historicalRecords.length,
      categories: CATEGORIES.length,
      canonicalBrands: categoryRows.reduce((sum, category) => sum + category.brands.length, 0),
      mineruDocuments: documents.length + invalidDocuments.length,
      validMineruDocuments: documents.length,
      invalidMineruDocuments: invalidDocuments.length,
      documentsWithObservations,
      documentsWithoutObservations: documents.length - documentsWithObservations,
      mappedMineruDocuments: documents.length - unmappedDocuments.length,
      unmappedMineruDocuments: unmappedDocuments.length,
      observations,
      researchGaps,
      parserProfiles: new Set([...parserProfileByHash.values()]
        .filter(Boolean)
        .map((profile) => profile.parserProfileId)).size,
    },
    categories: categoryRows,
    unmappedDocuments,
    invalidDocuments,
  };
}

function markdownCell(value) {
  return normalizedText(value).replace(/\|/g, '\\|').replace(/`/g, '\\`');
}

function shortExpression(value, maximum = 180) {
  const text = markdownCell(value);
  return text.length <= maximum ? text : `${text.slice(0, maximum - 3)}...`;
}

export function renderDimensionExpressionKnowledgeMarkdown(knowledge) {
  const uniqueExpressions = new Map();
  for (const category of knowledge.categories) {
    for (const brand of category.brands) {
      for (const family of brand.families) {
        for (const expression of family.expressions) {
          uniqueExpressions.set(expression.observationId, expression);
        }
      }
    }
  }
  const patternCounts = new Map();
  const decisionCounts = new Map();
  for (const expression of uniqueExpressions.values()) {
    patternCounts.set(expression.patternKind, (patternCounts.get(expression.patternKind) ?? 0) + 1);
    decisionCounts.set(expression.parserDecision, (decisionCounts.get(expression.parserDecision) ?? 0) + 1);
  }
  const lines = [
    '# Appliance Dimension Expression Knowledge Base',
    '',
    `Generated: ${knowledge.generatedAt}`,
    '',
    '> This is a non-authoritative research sidecar. Brand, category, series and',
    '> document-family patterns must not authorise model claims, resolve ambiguous',
    '> axes, or bypass exact-model source verification and receipts.',
    '',
    '## Coverage',
    '',
    '| Metric | Count |',
    '| --- | ---: |',
    `| Historical records | ${knowledge.summary.historicalRecords} |`,
    `| Categories | ${knowledge.summary.categories} |`,
    `| Category-brand groups | ${knowledge.summary.canonicalBrands} |`,
    `| MinerU documents | ${knowledge.summary.mineruDocuments} |`,
    `| Valid MinerU documents | ${knowledge.summary.validMineruDocuments} |`,
    `| Invalid or orphaned MinerU documents | ${knowledge.summary.invalidMineruDocuments} |`,
    `| Documents with recognised expressions | ${knowledge.summary.documentsWithObservations} |`,
    `| Documents without recognised expressions | ${knowledge.summary.documentsWithoutObservations} |`,
    `| Mapped MinerU documents | ${knowledge.summary.mappedMineruDocuments} |`,
    `| Unmapped MinerU documents | ${knowledge.summary.unmappedMineruDocuments} |`,
    `| Dimension-expression observations | ${knowledge.summary.observations} |`,
    `| Reusable PDF grammar profiles | ${knowledge.summary.parserProfiles} |`,
    `| Research gaps | ${knowledge.summary.researchGaps} |`,
    '',
    'A marketing-series count is a proven minimum, never an estimate of the',
    'manufacturer\'s complete range. `UNKNOWN` is intentional when official text',
    'does not bind an exact model to a named series.',
    '',
    '## How to Use',
    '',
    '1. Start with the appliance category and canonical brand; retain the listed raw brand variants for matching.',
    '2. Prefer an officially proven marketing series. Otherwise treat a document family or model-specific group only as a research scope.',
    '3. Match the observed pattern, parser decision and model-binding level. Never copy a value from the pattern into product geometry.',
    '4. Re-run exact-model source verification, MinerU hash checks and receipt generation before any claim or publication change.',
    '',
    'A `marketing_series` exists only when official text puts an exact model and an',
    'explicit numeric series name on the same page. A `document_family` is one',
    'official PDF shared by multiple exact models. A `parser_family` groups repeated',
    'PDF syntax only; it is never evidence that models share dimensions or installation',
    'requirements.',
    '',
    'Regenerate explicitly with:',
    '',
    '```sh',
    'node scripts/architecture-v2/build-dimension-expression-knowledge.mjs \\',
    '  --storage-root "$FITAPPLIANCE_STORAGE_ROOT" \\',
    '  --generated-at <ISO-8601 timestamp>',
    '```',
    '',
    'This command is intentionally outside the normal build and publication graph.',
    '',
    '## Brand and PDF Family Index',
    '',
    'The series count is a proven minimum. PDF grammar profiles are syntax reuse only,',
    'and every extracted value still requires exact-model identity and receipt checks.',
    '',
  ];
  for (const category of knowledge.categories) {
    lines.push(`### ${CATEGORY_LABELS[category.category]}`, '');
    lines.push('| Brand | Inventory models | Indexed PDFs | Proven marketing series | PDF grammar profiles | Coverage |',
      '| --- | ---: | ---: | ---: | ---: | --- |');
    for (const brand of category.brands) {
      lines.push(`| ${markdownCell(brand.canonicalBrand)} | ${brand.modelCount} | ${brand.observedMineruDocuments} | ${brand.observedMarketingSeriesCount} | ${brand.observedParserProfileCount} | \`${brand.coverageStatus}\` |`);
    }
    lines.push('');
  }
  lines.push(
    '## Observed Pattern Taxonomy',
    '',
    '| Pattern | Unique observations | Meaning |',
    '| --- | ---: | --- |',
    ...[...patternCounts].sort(([left], [right]) => left.localeCompare(right)).map(([pattern, count]) => (
      `| \`${pattern}\` | ${count} | ${PATTERN_DESCRIPTIONS[pattern] ?? 'Observed parser research pattern.'} |`
    )),
    '',
    '| Parser decision | Unique observations |',
    '| --- | ---: |',
    ...[...decisionCounts].sort(([left], [right]) => left.localeCompare(right)).map(([decision, count]) => (
      `| \`${decision}\` | ${count} |`
    )),
    '',
    'Model binding strength is ordered `SAME_FRAGMENT_EXACT_MODEL` >',
    '`SAME_PAGE_EXACT_MODEL` > `SAME_DOCUMENT_EXACT_MODEL` >',
    '`DOCUMENT_IDENTITY_ONLY`. `UNRESOLVED_MODEL_EXPRESSION` never authorises a',
    'model claim.',
    '',
  );
  for (const category of knowledge.categories) {
    lines.push(`## ${CATEGORY_LABELS[category.category]}`, '');
    lines.push(`Inventory: ${category.recordCount} models across ${category.brands.length} category-brand groups.`, '');
    for (const brand of category.brands) {
      lines.push(`### ${brand.canonicalBrand}`, '');
      lines.push(`- Raw brand variants: ${brand.rawBrandVariants.map((value) => `\`${markdownCell(value)}\``).join(', ') || 'none'}`);
      lines.push(`- Inventory models: ${brand.modelCount}`);
      lines.push(`- Coverage: \`${brand.coverageStatus}\`; MinerU documents: ${brand.observedMineruDocuments}`);
      lines.push(`- Proven marketing series: ${brand.observedMarketingSeriesCount}; total series count: \`${brand.seriesCountStatus}\``);
      lines.push(`- PDF grammar profiles: ${brand.observedParserProfileCount}`);
      if (!brand.families.length) {
        lines.push('', '`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.', '');
        continue;
      }
      for (const family of brand.families) {
        lines.push('', `#### ${family.groupName}`, '');
        lines.push(`- Group type: \`${family.groupType}\``);
        lines.push(`- Expression coverage: \`${family.expressionCoverageStatus}\``);
        lines.push(`- Models observed: ${family.models.map((value) => `\`${markdownCell(value)}\``).join(', ')}`);
        lines.push(`- PDF SHA-256: ${family.pdfSha256s.map((value) => `\`${value}\``).join(', ')}`);
        if (family.parserProfileIds.length) {
          lines.push(`- PDF grammar profiles: ${family.parserProfileIds.map((value) => `\`${value}\``).join(', ')}`);
          lines.push('- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.');
        }
        if (family.sourceUrls.length) lines.push(`- Official/source URLs: ${family.sourceUrls.map((value) => `<${value}>`).join(', ')}`);
        if (family.seriesEvidence.length) {
          lines.push(`- Series evidence: ${family.seriesEvidence.map((row) => (
            `page ${row.page}, \`${shortExpression(row.quote, 140)}\``
          )).join('; ')}`);
        }
        if (family.expressions.length) {
          lines.push('', '| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |',
            '| --- | --- | --- | --- | --- | --- | --- | --- |');
          for (const expression of family.expressions) {
            lines.push(`| \`${expression.parserDecision}\` | \`${expression.patternKind}\` | \`${expression.modelBinding}\` | ${expression.axisOrder.join(' -> ') || 'n/a'} | ${expression.safeAxes.join(', ') || 'none'} | \`${expression.scope}\` | ${shortExpression(expression.sourceQuote)} | p.${expression.page}, \`${expression.fragmentSha256.slice(0, 12)}\` |`);
          }
        } else {
          lines.push('', '`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.');
        }
        if (family.researchGaps.length) {
          lines.push('', 'Research gaps:');
          for (const gap of family.researchGaps) {
            lines.push(`- \`${gap.gapType}\`${gap.page ? ` on page ${gap.page}` : ''}${gap.quote ? `: ${shortExpression(gap.quote, 160)}` : ''}`);
          }
        }
      }
      lines.push('');
    }
  }
  if (knowledge.unmappedDocuments.length) {
    lines.push('## Unmapped MinerU Documents', '',
      'These documents remain in coverage accounting but cannot be assigned to a brand, category or series.', '',
      '| PDF SHA-256 | Mapping status | Sources |', '| --- | --- | --- |');
    for (const document of knowledge.unmappedDocuments) {
      lines.push(`| \`${document.pdfSha256}\` | \`${document.mappingStatus}\` | ${document.sourceUrls.map((url) => `<${url}>`).join(', ') || 'unknown'} |`);
    }
    lines.push('');
  }
  if (knowledge.invalidDocuments.length) {
    lines.push('## Invalid or Orphaned MinerU Documents', '',
      'These indexes remain in total coverage accounting but their derived content is excluded from all expression, brand-family and parser research.', '',
      '| PDF SHA-256 | Reason | Mapping | Intended identities | Sources |',
      '| --- | --- | --- | --- | --- |');
    for (const document of knowledge.invalidDocuments) {
      const identities = document.identities.map((identity) => (
        `${identity.category}: ${identity.brand} ${identity.model}`
      )).join('; ') || 'unknown';
      lines.push(`| \`${document.pdfSha256}\` | \`${document.reason}\` | \`${document.mappingStatus}\` | ${markdownCell(identities)} | ${document.sourceUrls.map((url) => `<${url}>`).join(', ') || 'unknown'} |`);
    }
    lines.push('');
  }
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n')}\n`;
}
