import { createFragment } from './artifact-lineage.mjs';
import { validateEvidenceAnchors } from './evidence-anchors.mjs';
import { canonicalEvidenceJson } from '../../shared/canonical-evidence-json.mjs';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ALLOWED_ROTATIONS = new Set([0, 90, 180, 270]);
const RAW_KIND_CONTENT_MODES = Object.freeze({
  title: 'structured_text',
  paragraph: 'structured_text',
  page_header: 'structured_text',
  index: 'structured_text',
  image: 'image',
  table: 'table',
});
const REPLAY_INPUT_KEYS = ['schemaVersion', 'nativeObservations', 'mineruDocument', 'pageImageMetadata', 'target'];
const REPLAY_TARGET_KEYS = ['sourceJsonPointer', 'fragmentSha256'];

function isPlainObject(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function strictJsonClone(value) {
  try {
    return JSON.parse(canonicalEvidenceJson(value));
  } catch {
    return null;
  }
}

function exactKeys(value, expectedKeys) {
  if (!isPlainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function allowedKeys(value, allowed) {
  return isPlainObject(value) && Object.keys(value).every((key) => allowed.includes(key));
}

function without(value, keys) {
  const copy = { ...value };
  for (const key of keys) delete copy[key];
  return copy;
}

function sortedUnique(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function validSha256(value) {
  return typeof value === 'string' && SHA256_PATTERN.test(value);
}

function pageFromRawPointer(pointer) {
  if (typeof pointer !== 'string') return null;
  const match = /^\/(0|[1-9]\d*)\/(0|[1-9]\d*)$/.exec(pointer);
  return match ? Number(match[1]) + 1 : null;
}

function validBox(value) {
  return Array.isArray(value)
    && value.length === 4
    && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
    && value[0] >= 0
    && value[1] >= 0
    && value[2] > value[0]
    && value[3] > value[1]
    && value[2] <= 1000
    && value[3] <= 1000;
}

function boxContains(container, subject) {
  return container[0] <= subject[0]
    && container[1] <= subject[1]
    && container[2] >= subject[2]
    && container[3] >= subject[3];
}

function boxesVerticallyOverlap(left, right) {
  return Math.min(left[3], right[3]) > Math.max(left[1], right[1]);
}

function primaryText(rawBlock) {
  if (!isPlainObject(rawBlock) || !isPlainObject(rawBlock.content)) return '';
  const content = rawBlock.content;
  if (typeof content.content === 'string') return content.content;
  const arrays = [content.paragraph_content, content.title_content, content.page_header_content];
  for (const entries of arrays) {
    if (Array.isArray(entries)) {
      return entries
        .filter((entry) => isPlainObject(entry) && typeof entry.content === 'string')
        .map((entry) => entry.content)
        .join(' ');
    }
  }
  if (Array.isArray(content.list_items)) {
    return content.list_items.flatMap((item) => (
      Array.isArray(item?.item_content)
        ? item.item_content.filter((entry) => typeof entry?.content === 'string').map((entry) => entry.content)
        : []
    )).join(' ');
  }
  if (typeof content.html === 'string') return content.html;
  return '';
}

function contextText(rawBlock) {
  if (!isPlainObject(rawBlock) || !isPlainObject(rawBlock.content)) return '';
  const values = [];
  const visit = (value) => {
    if (typeof value === 'string') values.push(value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (isPlainObject(value)) Object.values(value).forEach(visit);
  };
  visit(rawBlock.content);
  return values.join(' ');
}

function contentMode(rawBlock) {
  return typeof rawBlock.type === 'string' && Object.hasOwn(RAW_KIND_CONTENT_MODES, rawBlock.type)
    ? RAW_KIND_CONTENT_MODES[rawBlock.type]
    : 'unsupported';
}

function isDisclaimer(rawBlock) {
  return rawBlock.type === 'paragraph'
    && /guide of product|complete .*instructions|refer to the manual/i.test(primaryText(rawBlock));
}

function pageHasDimensionContext(pageBlocks) {
  return pageBlocks.some((block) => /dimensions?|weights?|total (?:height|width|depth)|\bunit\b/i.test(contextText(block.rawBlock)));
}

function splitColumnParticipants(pageBlocks) {
  const participants = new Set();
  for (let index = 0; index < pageBlocks.length; index += 1) {
    const left = pageBlocks[index];
    if (!validBox(left.rawBlock.bbox) || left.rawBlock.type === 'page_header') continue;
    for (let next = index + 1; next < pageBlocks.length; next += 1) {
      const right = pageBlocks[next];
      if (!validBox(right.rawBlock.bbox) || right.rawBlock.type === 'page_header') continue;
      const horizontalGap = Math.max(right.rawBlock.bbox[0] - left.rawBlock.bbox[2], left.rawBlock.bbox[0] - right.rawBlock.bbox[2]);
      if (horizontalGap > 0 && boxesVerticallyOverlap(left.rawBlock.bbox, right.rawBlock.bbox)) {
        participants.add(left.sourceJsonPointer);
        participants.add(right.sourceJsonPointer);
      }
    }
  }
  return participants;
}

function structuralSignals(block, pageBlocks, splitParticipants) {
  const signals = ['raw_block_identity'];
  const mode = contentMode(block.rawBlock);
  if (mode === 'unsupported') return signals;
  const rawText = primaryText(block.rawBlock);
  const fullText = contextText(block.rawBlock);
  const dimensionContext = pageHasDimensionContext(pageBlocks);
  const hasNumber = /\d/.test(fullText);
  const hasMetricUnit = /\b(?:mm|cm|m)\b/i.test(fullText);

  if (typeof block.rawBlock.type === 'string') signals.push(block.rawBlock.type);
  if (mode === 'image') signals.push('image_region');
  if (mode === 'table') signals.push('table_region');
  if (mode === 'table' && /<tr[ >]/i.test(fullText) && /<td[ >]/i.test(fullText)) signals.push('table_with_headers');
  if (mode === 'image' && rawText === '') signals.push('empty_body_text');
  if (dimensionContext) signals.push('dimension_context');
  if (hasNumber && hasMetricUnit) signals.push('numeric_unit_text');
  if (/\bunpackaged\b/i.test(fullText)) signals.push('unpackaged_context');
  if (splitParticipants.size > 0) signals.push('page_has_split_columns');
  if (splitParticipants.has(block.sourceJsonPointer)) signals.push('split_column_region');
  if (pageBlocks.some((candidate) => candidate.rawBlock.type === 'image')
    && pageBlocks.some((candidate) => isDisclaimer(candidate.rawBlock))) {
    signals.push('page_has_image_and_disclaimer');
  }
  if (mode === 'image' || isDisclaimer(block.rawBlock)) signals.push('image_or_disclaimer_region');
  if (/\bmm\b/i.test(fullText) && /\bcm\b/i.test(fullText)) signals.push('mixed_units');
  return sortedUnique(signals);
}

function hasMissingDimensionUnit(text) {
  for (const match of text.matchAll(/\b(?:height|width|depth)\s*:\s*(\d+(?:\.\d+)?)(?:\s*([a-zA-Z]+))?/gi)) {
    const unit = (match[2] ?? '').toLowerCase();
    if (!['mm', 'cm', 'm'].includes(unit)) return true;
  }
  return false;
}

function routingGaps(block, signals) {
  const gaps = [];
  const text = `${primaryText(block.rawBlock)} ${contextText(block.rawBlock)}`;
  if (hasMissingDimensionUnit(text)) gaps.push('MISSING_UNIT');
  if (signals.includes('mixed_units')) gaps.push('MIXED_UNITS');
  if (/\bcapacity\b/i.test(text)) gaps.push('CAPACITY_ADJACENT_TO_DIMENSIONS');
  if (/\bmodels?\s+[A-Z0-9-]+\s+(?:and|&)\s+[A-Z0-9-]+/i.test(text)) gaps.push('MULTI_MODEL_ROW');
  if (/\b(?:worktop|configuration)\b.*\b(?:removed|without|with)\b/i.test(text)) gaps.push('CONFIGURATION_VARIANT_OBSERVED');
  if (/\b(?:door|lid)\b[^.]{0,48}\b\d+(?:\.\d+)?\s*(?:°|degrees)\b/i.test(text)) gaps.push('OPERATING_ANGLE_OBSERVED');
  if (/\bcontinued(?:\s+from)?\s+(?:the\s+)?(?:previous|next)\s+page\b/i.test(text)) gaps.push('UNWITNESSED_CROSS_PAGE_CONTINUATION');
  if (signals.includes('page_has_split_columns') && block.rawBlock.type === 'index') gaps.push('AXIS_OR_LEGEND_GAP');
  return sortedUnique(gaps);
}

function matchingNativeText(nativeObservations, block, pageNumber) {
  const match = nativeObservations.find((observation) => (
    isPlainObject(observation)
    && observation.sourceJsonPointer === block.sourceJsonPointer
    && observation.pageNumber === pageNumber
    && Array.isArray(observation.bbox)
    && canonicalEvidenceJson(observation.bbox) === canonicalEvidenceJson(block.rawBlock.bbox)
    && typeof observation.rawText === 'string'
    && observation.rawText.length > 0
  ));
  return match ? match.rawText : null;
}

function pageMetadataFor(pageImageMetadata, pageNumber, sourcePdfSha256) {
  const pageEntries = pageImageMetadata.filter((metadata) => (
    isPlainObject(metadata) && metadata.pageNumber === pageNumber
  ));
  if (pageEntries.length === 0) return null;
  return pageEntries.find((metadata) => metadata.sourcePdfSha256 === sourcePdfSha256) ?? pageEntries[0];
}

function sameJson(left, right) {
  try {
    return canonicalEvidenceJson(left) === canonicalEvidenceJson(right);
  } catch {
    return false;
  }
}

function validateImageRepresentation(metadata, rawBlock, sourcePdfSha256, pageNumber) {
  if (!validSha256(sourcePdfSha256)) return 'MISSING_IMAGE_SOURCE_BINDING';
  if (!metadata) return 'MISSING_PAGE_IMAGE_METADATA';
  if (metadata.sourcePdfSha256 !== sourcePdfSha256 || metadata.pageNumber !== pageNumber) {
    return 'PAGE_SOURCE_MISMATCH';
  }
  if (!validSha256(metadata.renderedPageArtifactSha256)
    || !isPlainObject(metadata.renderedPixels)
    || !Number.isInteger(metadata.renderedPixels.width)
    || !Number.isInteger(metadata.renderedPixels.height)
    || metadata.renderedPixels.width <= 0
    || metadata.renderedPixels.height <= 0) {
    return 'INVALID_PAGE_IMAGE_METADATA';
  }
  if (!ALLOWED_ROTATIONS.has(metadata.rotationDegreesClockwise)) return 'UNSUPPORTED_PAGE_ROTATION';
  if (!isPlainObject(metadata.transform)) return 'INVALID_PAGE_TRANSFORM';
  if (!['full_page', 'crop_from_full_page'].includes(metadata.transform.kind)) {
    return 'INVALID_PAGE_TRANSFORM';
  }
  if (!exactKeys(metadata, [
    'sourcePdfSha256', 'pageNumber', 'renderedPageArtifactSha256', 'renderedPixels',
    'rotationDegreesClockwise', 'transform', 'artifactRecords', 'fragments',
  ]) || !Array.isArray(metadata.artifactRecords) || !Array.isArray(metadata.fragments)) {
    return 'INVALID_IMAGE_ANCHORS';
  }
  const candidates = metadata.fragments.filter((fragment) => (
    fragment?.locator?.kind === 'pdf_bbox'
    && fragment.locator.renderedPageArtifactSha256 === metadata.renderedPageArtifactSha256
    && sameJson(fragment.content, rawBlock)
  ));
  if (candidates.length !== 1) return 'IMAGE_LOCATOR_BINDING_MISMATCH';
  const fragment = candidates[0];
  try {
    // G3a owns the strict locator schema, canonical fragment identity and
    // actual source-root ancestry (including crop -> full-page ancestry).
    validateEvidenceAnchors({
      sourceArtifactSha256: sourcePdfSha256,
      artifactRecords: metadata.artifactRecords,
      fragments: metadata.fragments,
      anchors: [{ anchorId: 'region', role: 'value', fragmentSha256: fragment.fragmentSha256 }],
      relations: [],
    });
  } catch {
    return 'INVALID_IMAGE_ANCHORS';
  }
  const locator = fragment.locator;
  if (fragment.parentArtifactSha256 !== sourcePdfSha256
    || locator.pageNumber !== pageNumber
    || !sameJson(locator.renderedPixels, metadata.renderedPixels)
    || locator.rotationDegreesClockwise !== metadata.rotationDegreesClockwise
    || !sameJson(locator.transform, metadata.transform)) {
    return 'IMAGE_LOCATOR_BINDING_MISMATCH';
  }
  const fullPages = locator.transform.kind === 'full_page' ? [fragment] : metadata.fragments.filter((candidate) => (
    candidate.locator.kind === 'pdf_bbox'
    && candidate.locator.transform.kind === 'full_page'
    && candidate.locator.renderedPageArtifactSha256 === locator.transform.fullPageArtifactSha256
    && sameJson(candidate.content, rawBlock)
  ));
  if (fullPages.length !== 1) return 'CROP_FULL_PAGE_MISMATCH';
  const fullPage = fullPages[0];
  const fullLocator = fullPage.locator;
  if (fullPage.parentArtifactSha256 !== sourcePdfSha256
    || fullLocator.pageNumber !== pageNumber
    || fullLocator.rotationDegreesClockwise !== locator.rotationDegreesClockwise
    || !sameJson(fullLocator.rawCoordinates, locator.rawCoordinates)
    || !sameJson(fullLocator.normalizedTopLeftBox, locator.normalizedTopLeftBox)) {
    return 'CROP_FULL_PAGE_MISMATCH';
  }
  // G3a's producer supplies MinerU's already-normalized top-left page box.
  // Crop bounds use that full-page frame and the same recorded rotation above;
  // do not rotate normalized coordinates twice or round their decimal values.
  if (fullLocator.rawCoordinates.coordinateSpace !== 'mineru_normalized_top_left_1000'
    || !sameJson(fullLocator.rawCoordinates.values, rawBlock.bbox)
    || !sameJson(fullLocator.normalizedTopLeftBox, rawBlock.bbox)) {
    return 'IMAGE_RAW_COORDINATE_MISMATCH';
  }
  if (locator.transform.kind === 'crop_from_full_page'
    && !boxContains(locator.transform.normalizedCropBox, fullLocator.normalizedTopLeftBox)) {
    return 'CROP_DOES_NOT_COVER_REGION';
  }
  return null;
}

function incompleteEnvelope(reasons, regions = []) {
  return {
    status: 'incomplete',
    candidateStatus: 'STRUCTURAL_CANDIDATE_ONLY',
    reasons: sortedUnique(reasons),
    regions,
  };
}


/**
 * Inspects supplied raw blocks only. Text/table JSON-pointer observations do
 * not invent page-image lineage; an image or supplied image representation is
 * accepted only with source/page/rotation/transform bindings.
 */
export function inspectExtractionRegions(input = {}) {
  const inspectionInput = strictJsonClone(input);
  if (!allowedKeys(inspectionInput, ['nativeObservations', 'mineruDocument', 'pageImageMetadata'])
    || !Object.hasOwn(inspectionInput ?? {}, 'mineruDocument')) {
    return incompleteEnvelope(['INVALID_MINERU_DOCUMENT']);
  }
  const nativeObservations = inspectionInput.nativeObservations ?? [];
  const pageImageMetadata = inspectionInput.pageImageMetadata ?? [];
  const mineruDocument = inspectionInput.mineruDocument;
  if (!Array.isArray(nativeObservations)
    || !Array.isArray(pageImageMetadata)
    || !isPlainObject(mineruDocument)
    || !validSha256(mineruDocument.contentSha256)
    || !Array.isArray(mineruDocument.blocks)
    || !Number.isInteger(mineruDocument.pageCount)
    || mineruDocument.pageCount <= 0) {
    return incompleteEnvelope(['INVALID_MINERU_DOCUMENT']);
  }

  const sourcePdfSha256 = validSha256(mineruDocument.sourcePdfSha256)
    ? mineruDocument.sourcePdfSha256
    : null;
  const blocksByPage = new Map();
  const normalizedBlocks = [];
  const reasons = [];

  for (const suppliedBlock of mineruDocument.blocks) {
    if (!isPlainObject(suppliedBlock)
      || typeof suppliedBlock.sourceJsonPointer !== 'string'
      || !isPlainObject(suppliedBlock.rawBlock)
      || !validSha256(suppliedBlock.fragmentSha256)) {
      reasons.push('INVALID_RAW_BLOCK');
      continue;
    }
    const pageNumber = pageFromRawPointer(suppliedBlock.sourceJsonPointer);
    if (!pageNumber || pageNumber > mineruDocument.pageCount || !validBox(suppliedBlock.rawBlock.bbox)) {
      reasons.push('INVALID_RAW_BLOCK_POINTER_OR_BOX');
      continue;
    }
    try {
      createFragment({
        fragmentSha256: suppliedBlock.fragmentSha256,
        content: suppliedBlock.rawBlock,
        parentArtifactSha256: mineruDocument.contentSha256,
        locator: { kind: 'json_pointer', pointer: suppliedBlock.sourceJsonPointer },
      });
    } catch {
      reasons.push('RAW_FRAGMENT_IDENTITY_MISMATCH');
      continue;
    }
    const block = {
      sourceJsonPointer: suppliedBlock.sourceJsonPointer,
      pageNumber,
      fragmentSha256: suppliedBlock.fragmentSha256,
      rawBlock: suppliedBlock.rawBlock,
    };
    normalizedBlocks.push(block);
    const pageBlocks = blocksByPage.get(pageNumber) ?? [];
    pageBlocks.push(block);
    blocksByPage.set(pageNumber, pageBlocks);
  }

  if (normalizedBlocks.length === 0) return incompleteEnvelope([...reasons, 'NO_VALID_RAW_BLOCKS']);

  const regions = [];
  for (const block of normalizedBlocks) {
    const mode = contentMode(block.rawBlock);
    const unsupportedKind = mode === 'unsupported';
    // Unsupported regions stay in the output but cannot donate structural
    // signals to a supported neighbour on the page.
    const pageBlocks = (blocksByPage.get(block.pageNumber) ?? []).filter((candidate) => (
      contentMode(candidate.rawBlock) !== 'unsupported'
    ));
    const metadata = pageMetadataFor(pageImageMetadata, block.pageNumber, sourcePdfSha256);
    const usesImageRepresentation = block.rawBlock.type === 'image' || metadata !== null;
    const pageReason = usesImageRepresentation
      ? validateImageRepresentation(metadata, block.rawBlock, sourcePdfSha256, block.pageNumber)
      : null;
    const signals = structuralSignals(block, pageBlocks, splitColumnParticipants(pageBlocks));
    const regionReasons = unsupportedKind ? ['UNSUPPORTED_RAW_KIND'] : [...routingGaps(block, signals)];
    if (unsupportedKind) reasons.push('UNSUPPORTED_RAW_KIND');
    if (pageReason) {
      regionReasons.push(pageReason);
      reasons.push(pageReason);
    }
    regions.push({
      status: pageReason || unsupportedKind ? 'incomplete' : 'inspected',
      regionId: `region_${block.fragmentSha256}`,
      sourceJsonPointer: block.sourceJsonPointer,
      pageNumber: block.pageNumber,
      sourcePdfSha256: sourcePdfSha256 ?? metadata?.sourcePdfSha256 ?? null,
      fragmentSha256: block.fragmentSha256,
      rawBlockIdentity: {
        fragmentSha256: block.fragmentSha256,
        parentArtifactSha256: mineruDocument.contentSha256,
        locator: { kind: 'json_pointer', pointer: block.sourceJsonPointer },
      },
      rawBlock: block.rawBlock,
      bbox: block.rawBlock.bbox,
      pageImageMetadata: metadata,
      contentMode: mode,
      mineruText: primaryText(block.rawBlock),
      nativeText: matchingNativeText(nativeObservations, block, block.pageNumber),
      structuralSignals: signals,
      routingGaps: sortedUnique(regionReasons),
      replayInput: {
        schemaVersion: 1,
        nativeObservations,
        mineruDocument,
        pageImageMetadata,
        target: {
          sourceJsonPointer: block.sourceJsonPointer,
          fragmentSha256: block.fragmentSha256,
        },
      },
    });
  }

  return reasons.length > 0
    ? incompleteEnvelope(reasons, regions)
    : {
      status: 'inspected',
      candidateStatus: 'STRUCTURAL_CANDIDATE_ONLY',
      reasons: [],
      regions,
    };
}

/**
 * Rebuilds one region from its serializable raw input and rejects any copied
 * status, text, signal, route, or identity field that differs from that replay.
 */
export function replayInspectedRegion(untrustedRegionObservation) {
  const submitted = strictJsonClone(untrustedRegionObservation);
  if (!isPlainObject(submitted) || !isPlainObject(submitted.replayInput)
    || !exactKeys(submitted.replayInput, REPLAY_INPUT_KEYS)
    || submitted.replayInput.schemaVersion !== 1
    || !Array.isArray(submitted.replayInput.nativeObservations)
    || !isPlainObject(submitted.replayInput.mineruDocument)
    || !Array.isArray(submitted.replayInput.pageImageMetadata)
    || !exactKeys(submitted.replayInput.target, REPLAY_TARGET_KEYS)) {
    return { ok: false, reason: 'INVALID_REGION_REPLAY' };
  }
  const replay = submitted.replayInput;
  const inspection = inspectExtractionRegions({
    nativeObservations: replay.nativeObservations,
    mineruDocument: replay.mineruDocument,
    pageImageMetadata: replay.pageImageMetadata,
  });
  const region = inspection.regions.find((candidate) => (
    candidate.sourceJsonPointer === replay.target.sourceJsonPointer
    && candidate.fragmentSha256 === replay.target.fragmentSha256
  ));
  if (!region) return { ok: false, reason: 'INVALID_REGION_REPLAY' };
  const submittedCore = without(submitted, ['replayInput']);
  const replayedCore = without(region, ['replayInput']);
  if (canonicalEvidenceJson(submittedCore) !== canonicalEvidenceJson(replayedCore)) {
    return { ok: false, reason: 'REGION_REPLAY_MISMATCH' };
  }
  return { ok: true, region };
}
