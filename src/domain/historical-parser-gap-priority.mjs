import { canonicalJsonSha256 } from './historical-evidence-recovery-contract.mjs';

const HASH = /^[a-f0-9]{64}$/;
const LANES = Object.freeze([
  'REPAIR_READY',
  'IDENTITY_BLOCKED',
  'MINERU_BLOCKED',
  'IMAGE_SEMANTICS_REQUIRED',
  'AMBIGUITY_RESEARCH',
  'COMPLETE_DIAGNOSTIC_ONLY',
]);
const EXACT_PROOF_LEVELS = new Set(['EXACT_MODEL_PROVEN', 'MODEL_LIST_PROVEN']);
const EXACT_BINDINGS = new Set([
  'SAME_FRAGMENT_EXACT_MODEL',
  'SAME_PAGE_EXACT_MODEL',
  'SAME_DOCUMENT_EXACT_MODEL',
]);
const AXES = new Set(['width', 'height', 'depth']);
const SOURCE_AUTHORITY_POINTS = Object.freeze({
  OFFICIAL: 100,
  MIXED: 60,
  REFERENCE: 20,
  NONE: 0,
});
const LIFECYCLE_POINTS = Object.freeze({
  CURRENT_RETAIL: 200,
  CATALOG_ARCHIVED: 100,
  REGISTRY_ONLY: 50,
});
const POLICY = Object.freeze({
  rankingVersion: 1,
  affectedExactModelPoints: 1000,
  incompleteDocumentPoints: 50,
  additionalFamilyModelPoints: 25,
  validMineruDocumentPoints: 10,
  qualifiedVariantRiskPenalty: 50,
  scoringCannotOverrideLaneGate: true,
  familyMembershipCanAuthoriseIdentity: false,
  officialLookingUrlCanAuthoriseSource: false,
  completeReplayDiagnosticsCanEnterRepair: false,
});

function normalizedText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function requiredHash(value, label) {
  const result = normalizedText(value).toLowerCase();
  if (!HASH.test(result)) throw new TypeError(`${label} must be SHA-256`);
  return result;
}

function requiredArray(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return value;
}

function requiredObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function uniqueMap(values, key, label) {
  const result = new Map();
  for (const value of values) {
    const id = normalizedText(value?.[key]);
    if (!id) throw new TypeError(`${label} ${key} required`);
    if (result.has(id)) throw new Error(`duplicate ${label} ${key}: ${id}`);
    result.set(id, value);
  }
  return result;
}

function normalizedBrand(value) {
  return normalizedText(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizedModel(value) {
  return normalizedText(value).toUpperCase();
}

function identityKey(category, brand, model) {
  return `${normalizedText(category)}\0${normalizedBrand(brand)}\0${normalizedModel(model)}`;
}

function familyKey(category, brand, groupType, groupName) {
  return [
    normalizedText(category),
    normalizedBrand(brand),
    normalizedText(groupType),
    normalizedText(groupName),
  ].join('\0');
}

function sortedUnique(values) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function countBy(values, selector) {
  const result = {};
  for (const value of values) {
    const key = selector(value);
    result[key] = (result[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

function fixtureCase(value, profileId) {
  const row = requiredObject(value, `${profileId} fixture case`);
  const caseId = normalizedText(row.caseId);
  if (!caseId) throw new TypeError(`${profileId} fixture case ID required`);
  if (!['ACCEPT', 'REJECT'].includes(row.expectation)) {
    throw new TypeError(`${profileId}/${caseId} expectation must be ACCEPT or REJECT`);
  }
  if (!['SOURCE_FRAGMENT', 'ADVERSARIAL_MUTATION'].includes(row.derivation)) {
    throw new TypeError(`${profileId}/${caseId} derivation invalid`);
  }
  const source = requiredObject(row.source, `${profileId}/${caseId} source`);
  requiredHash(source.pdfSha256, `${profileId}/${caseId} source PDF`);
  requiredHash(source.contentSha256, `${profileId}/${caseId} MinerU content`);
  requiredHash(source.fragmentSha256, `${profileId}/${caseId} fragment`);
  if (!Number.isInteger(source.page) || source.page < 1) {
    throw new TypeError(`${profileId}/${caseId} source page required`);
  }
  if (!normalizedText(source.fragmentType)) {
    throw new TypeError(`${profileId}/${caseId} fragment type required`);
  }
  if (!Array.isArray(source.bbox) || source.bbox.length !== 4
    || source.bbox.some((coordinate) => !Number.isFinite(coordinate))) {
    throw new TypeError(`${profileId}/${caseId} source bbox required`);
  }
  const identity = requiredObject(row.identity, `${profileId}/${caseId} identity`);
  if (!normalizedText(identity.category) || !normalizedText(identity.brand)
    || !normalizedText(identity.model)) {
    throw new TypeError(`${profileId}/${caseId} exact model identity required`);
  }
  const context = requiredObject(row.semanticContext, `${profileId}/${caseId} semantic context`);
  if (!Array.isArray(context.axisOrder) || !context.axisOrder.length
    || context.axisOrder.some((axis) => !AXES.has(axis))) {
    throw new TypeError(`${profileId}/${caseId} axis order required`);
  }
  if (!['mm', 'cm'].includes(context.unit)) {
    throw new TypeError(`${profileId}/${caseId} unit required`);
  }
  if (!normalizedText(context.scope) || !normalizedText(context.modelBinding)) {
    throw new TypeError(`${profileId}/${caseId} scope and model binding required`);
  }
  if (!Array.isArray(row.contentList) || !row.contentList.length) {
    throw new TypeError(`${profileId}/${caseId} MinerU content_list_v2 required`);
  }
  if (!Array.isArray(row.expectedClaims) || !Array.isArray(row.rejectedSemantics)) {
    throw new TypeError(`${profileId}/${caseId} expected claims and rejected semantics required`);
  }
  if (row.expectation === 'ACCEPT' && !row.expectedClaims.length) {
    throw new TypeError(`${profileId}/${caseId} positive expected claims required`);
  }
  if (row.expectation === 'REJECT' && !row.rejectedSemantics.length) {
    throw new TypeError(`${profileId}/${caseId} negative rejected semantics required`);
  }
  return row;
}

export function validateHistoricalParserFixtureCorpus(value, label = 'historical parser fixture corpus') {
  const corpus = requiredObject(value, label);
  if (corpus.schemaVersion !== 1) throw new TypeError(`${label} schemaVersion 1 required`);
  const profilesById = uniqueMap(requiredArray(corpus.profiles, `${label} profiles`), 'parserProfileId', 'fixture profile');
  const profilesByFamilyId = new Map();
  const profilesBySourcePdfSet = new Map();
  for (const [profileId, profile] of profilesById) {
    const familyId = normalizedText(profile.familyId);
    if (!familyId) throw new TypeError(`${profileId} family ID required`);
    const cases = requiredArray(profile.cases, `${profileId} cases`).map((row) => fixtureCase(row, profileId));
    uniqueMap(cases, 'caseId', `${profileId} fixture case`);
    const expectations = new Set(cases.map((row) => row.expectation));
    if (!expectations.has('ACCEPT') || !expectations.has('REJECT')) {
      throw new Error(`${profileId} requires positive and negative fixture cases`);
    }
    const current = profilesByFamilyId.get(familyId) ?? [];
    current.push(profile);
    profilesByFamilyId.set(familyId, current);
    const sourcePdfSha256s = sortedUnique(cases.filter((row) => (
      row.expectation === 'ACCEPT' && row.derivation === 'SOURCE_FRAGMENT'
    )).map((row) => row.source.pdfSha256));
    if (!sourcePdfSha256s.length) {
      throw new Error(`${profileId} requires an accepted source-fragment PDF binding`);
    }
    const sourcePdfSetKey = sourcePdfSha256s.join('\0');
    const sourceSetProfiles = profilesBySourcePdfSet.get(sourcePdfSetKey) ?? [];
    sourceSetProfiles.push(profile);
    profilesBySourcePdfSet.set(sourcePdfSetKey, sourceSetProfiles);
  }
  return { corpus, profilesById, profilesByFamilyId, profilesBySourcePdfSet };
}

function validateInputs(input) {
  const knowledge = requiredObject(input?.dimensionKnowledge, 'dimension knowledge');
  const graph = requiredObject(input?.documentGraph, 'document graph');
  const classification = requiredObject(input?.classification, 'historical classification');
  if (knowledge.schemaVersion !== 4 || !Array.isArray(knowledge.indexedDocuments)
    || !Array.isArray(knowledge.categories)) {
    throw new TypeError('dimension knowledge schema v4 required');
  }
  if (graph.schemaVersion !== 1 || !Array.isArray(graph.documents) || !Array.isArray(graph.families)) {
    throw new TypeError('historical document-family graph schema v1 required');
  }
  if (classification.schemaVersion !== 1 || !Array.isArray(classification.records)) {
    throw new TypeError('historical classification schema v1 required');
  }
  const graphSemantic = {
    schemaVersion: graph.schemaVersion,
    policy: graph.policy,
    summary: graph.summary,
    sourceVersions: graph.sourceVersions,
    nonIndexedClassificationLinks: graph.nonIndexedClassificationLinks,
    documents: graph.documents,
    families: graph.families,
  };
  if (canonicalJsonSha256(graphSemantic) !== requiredHash(
    graph.semanticGraphSha256,
    'document graph semantic binding',
  )) {
    throw new Error('document graph semantic SHA-256 mismatch');
  }
  requiredHash(classification.semanticClassificationSha256, 'classification semantic binding');
  const valid = knowledge.indexedDocuments.filter((row) => row.validity === 'VALID').length;
  const invalid = knowledge.indexedDocuments.filter((row) => row.validity === 'INVALID').length;
  if (knowledge.summary?.mineruDocuments !== knowledge.indexedDocuments.length
    || knowledge.summary?.validMineruDocuments !== valid
    || knowledge.summary?.invalidMineruDocuments !== invalid) {
    throw new Error('dimension knowledge MinerU accounting mismatch');
  }
  return validateHistoricalParserFixtureCorpus(input?.fixtureCorpus ?? { schemaVersion: 1, profiles: [] });
}

function knowledgeFamilies(knowledge) {
  const result = new Map();
  for (const category of knowledge.categories) {
    for (const brand of category.brands ?? []) {
      for (const family of brand.families ?? []) {
        const key = familyKey(category.category, brand.canonicalBrand, family.groupType, family.groupName);
        if (result.has(key)) throw new Error(`duplicate dimension knowledge family: ${key}`);
        result.set(key, { category: category.category, brand: brand.canonicalBrand, ...family });
      }
    }
  }
  return result;
}

function riskFlagsFor(family) {
  const flags = new Set();
  const quotes = [
    ...(family.researchGaps ?? []).map((gap) => gap.quote),
    ...(family.expressions ?? []).flatMap((row) => [row.sourceLabel, row.sourceQuote]),
  ].map(normalizedText).filter(Boolean);
  if (quotes.some((quote) => /\b(?:pack(?:ed|age|aged|aging)?|shipping|carton|box(?:ed)?|crate|delivery)\b/i.test(quote))) {
    flags.add('PACKAGE_OR_DELIVERY');
  }
  if (quotes.some((quote) => /\b(?:doors?\s*open(?:ed)?|open(?:ed)?\s*doors?|lid\s*open)\b/i.test(quote))) {
    flags.add('DOOR_OPEN_OR_OPERATION');
  }
  let qualifiedAxisVariant = false;
  for (const expression of family.expressions ?? []) {
    const valuesByAxis = new Map();
    for (const value of expression.axisValues ?? []) {
      const current = valuesByAxis.get(value.axis) ?? [];
      current.push(value);
      valuesByAxis.set(value.axis, current);
    }
    const depthValues = valuesByAxis.get('depth') ?? [];
    const symbolicDepthVariants = depthValues.filter((value) => /^D(?:['"′″])?$/i.test(normalizedText(value.label)));
    if (symbolicDepthVariants.length > 1
      || /(?:^|\|)\s*D\s*\|[^|]*D['"′″]/i.test(normalizedText(expression.sourceLabel))
      || expression.parserDecision === 'SUPPORTED_DIAGRAM_PRIMARY_DEPTH_WITH_VARIANTS') {
      flags.add('UNRESOLVED_DEPTH_VARIANTS');
    }
    if (depthValues.length > 1 && !flags.has('UNRESOLVED_DEPTH_VARIANTS')) {
      const closed = depthValues.filter((value) => (
        /^(?:total|overall|external|product|appliance|unpackaged)\s+depth\b/i.test(normalizedText(value.label))
      ));
      const qualified = depthValues.filter((value) => (
        /\b(?:with\s+hoses?|doors?\s*open|open(?:ed)?\s*doors?|without\s+(?:the\s+)?door|cabinet|pack(?:ed|age|aging)?)\b/i
          .test(normalizedText(value.label))
      ));
      if (closed.length === 1 && closed.length + qualified.length === depthValues.length) {
        qualifiedAxisVariant = true;
      } else {
        flags.add('UNRESOLVED_AXIS_AMBIGUITY');
      }
    }
    for (const value of expression.axisValues ?? []) {
      if (value.valueShape !== 'range') continue;
      if (value.axis !== 'height') flags.add('UNSUPPORTED_AXIS_RANGE');
      const bounds = normalizedText(value.value).match(/(\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(\d+(?:\.\d+)?)/i);
      if (!bounds || Number(bounds[1]) > Number(bounds[2])) flags.add('INVALID_ADJUSTABLE_RANGE');
    }
    if (/RESEARCH_UNSUPPORTED_AXIS_RANGE/.test(expression.parserDecision)) {
      flags.add('UNSUPPORTED_AXIS_RANGE');
    }
  }
  if (qualifiedAxisVariant) flags.add('QUALIFIED_AXIS_VARIANT');
  const reasonCodes = new Set((family.parserReplays ?? []).map((row) => row.reasonCode));
  if (reasonCodes.has('AMBIGUOUS_AXIS_VALUES') && !qualifiedAxisVariant
    && !flags.has('UNRESOLVED_DEPTH_VARIANTS')) {
    flags.add('UNRESOLVED_AXIS_AMBIGUITY');
  }
  return [...flags].sort();
}

function laneFor({ documents, family, incompleteReplays, affectedReferenceIds, riskFlags }) {
  if (documents.some((document) => (
    document.validity !== 'VALID'
      || document.mineruObject?.format !== 'content_list_v2'
      || document.mineruObject?.parserName !== 'MinerU'
      || !document.mineruObject?.contentSha256
  ))) return 'MINERU_BLOCKED';
  if (!incompleteReplays.length) return 'COMPLETE_DIAGNOSTIC_ONLY';
  const exactExpressions = (family.expressions ?? []).filter((row) => EXACT_BINDINGS.has(row.modelBinding));
  const identityOnlyFailure = incompleteReplays.every((row) => (
    ['EXACT_MODEL_IDENTITY_NOT_PROVEN', 'FAMILY_SCOPE_UNRESOLVED'].includes(row.reasonCode)
  ));
  if (!affectedReferenceIds.length || (identityOnlyFailure && !exactExpressions.length)) {
    return 'IDENTITY_BLOCKED';
  }
  const gaps = new Set((family.researchGaps ?? []).map((gap) => gap.gapType));
  if (!family.expressions?.length && gaps.has('IMAGE_ONLY_DIMENSION_DIAGRAM')) {
    return 'IMAGE_SEMANTICS_REQUIRED';
  }
  if (riskFlags.some((flag) => [
    'UNRESOLVED_DEPTH_VARIANTS',
    'UNRESOLVED_AXIS_AMBIGUITY',
    'UNSUPPORTED_AXIS_RANGE',
    'INVALID_ADJUSTABLE_RANGE',
  ].includes(flag))) return 'AMBIGUITY_RESEARCH';
  return 'REPAIR_READY';
}

function scoreFor({ affectedRecords, incompletePdfSha256s, validDocuments, riskFlags }) {
  const affectedExactModels = affectedRecords.length;
  const components = {
    affectedExactModels: affectedExactModels * POLICY.affectedExactModelPoints,
    lifecyclePriority: affectedRecords.reduce((sum, row) => (
      sum + (LIFECYCLE_POINTS[row.lifecycleState] ?? 0)
    ), 0),
    familyReuse: incompletePdfSha256s.length * POLICY.incompleteDocumentPoints
      + Math.max(0, affectedExactModels - 1) * POLICY.additionalFamilyModelPoints,
    sourceAuthority: affectedRecords.reduce((sum, row) => (
      sum + (SOURCE_AUTHORITY_POINTS[row.sourceAuthority] ?? 0)
    ), 0),
    mineruValidity: validDocuments * POLICY.validMineruDocumentPoints,
    ambiguityRisk: riskFlags.includes('QUALIFIED_AXIS_VARIANT')
      ? -POLICY.qualifiedVariantRiskPenalty : 0,
  };
  return {
    components,
    score: Object.values(components).reduce((sum, value) => sum + value, 0),
  };
}

function fixtureCoverageFor(family, fixtureProfiles) {
  const profiles = [
    ...(fixtureProfiles.profilesByFamilyId.get(family.familyId) ?? []),
    ...(fixtureProfiles.profilesBySourcePdfSet.get(
      sortedUnique(family.pdfSha256s ?? []).join('\0'),
    ) ?? []),
  ];
  if (!profiles.length) return { fixtureCoverage: 'NONE', fixtureProfileIds: [] };
  return {
    fixtureCoverage: 'POSITIVE_AND_NEGATIVE',
    fixtureProfileIds: sortedUnique(profiles.map((profile) => profile.parserProfileId)),
  };
}

export function buildHistoricalParserGapPriority(input) {
  const fixtureProfiles = validateInputs(input);
  const generatedAt = new Date(input.generatedAt).toISOString();
  const graph = input.documentGraph;
  const knowledge = input.dimensionKnowledge;
  const classification = input.classification;
  const documentsById = uniqueMap(graph.documents, 'documentId', 'document graph document');
  const classificationById = uniqueMap(classification.records, 'referenceId', 'classification record');
  const classificationByIdentity = new Map();
  for (const row of classification.records) {
    const key = identityKey(row.category, row.canonicalBrand, row.model);
    if (classificationByIdentity.has(key)) throw new Error(`duplicate classification exact identity: ${key}`);
    classificationByIdentity.set(key, row);
  }
  const knowledgeByFamilyKey = knowledgeFamilies(knowledge);
  const rows = [];
  for (const graphFamily of [...graph.families].sort((left, right) => left.familyId.localeCompare(right.familyId))) {
    const key = familyKey(
      graphFamily.category,
      graphFamily.brand,
      graphFamily.groupType,
      graphFamily.groupName,
    );
    const family = knowledgeByFamilyKey.get(key);
    if (!family) throw new Error(`document graph family missing from dimension knowledge: ${graphFamily.familyId}`);
    const documents = graphFamily.documentIds.map((documentId) => {
      const document = documentsById.get(documentId);
      if (!document) throw new Error(`family document missing: ${graphFamily.familyId}/${documentId}`);
      return document;
    });
    const incompleteReplays = (family.parserReplays ?? []).filter((replay) => (
      replay.reasonCode !== 'PARSED_COMPLETE'
    ));
    if (!incompleteReplays.length && !(family.researchGaps ?? []).length) continue;
    const exactReferenceIds = new Set(documents.flatMap((document) => (
      document.modelEdges ?? []
    )).filter((edge) => edge.referenceId && EXACT_PROOF_LEVELS.has(edge.proofLevel))
      .map((edge) => edge.referenceId));
    const affectedReferences = new Map();
    for (const replay of incompleteReplays) {
      const classificationRow = classificationByIdentity.get(identityKey(
        replay.category,
        replay.brand,
        replay.model,
      ));
      if (!classificationRow || !graphFamily.referenceIds.includes(classificationRow.referenceId)
        || !exactReferenceIds.has(classificationRow.referenceId)) continue;
      affectedReferences.set(classificationRow.referenceId, classificationRow);
    }
    const affectedRecords = [...affectedReferences.values()].sort((left, right) => (
      left.referenceId.localeCompare(right.referenceId)
    ));
    const riskFlags = riskFlagsFor(family);
    const lane = laneFor({
      documents,
      family,
      incompleteReplays,
      affectedReferenceIds: [...affectedReferences.keys()],
      riskFlags,
    });
    const incompletePdfSha256s = sortedUnique(incompleteReplays.map((replay) => replay.pdfSha256));
    const score = lane === 'REPAIR_READY'
      ? scoreFor({
        affectedRecords,
        incompletePdfSha256s,
        validDocuments: documents.filter((document) => document.validity === 'VALID').length,
        riskFlags,
      })
      : { components: null, score: null };
    rows.push({
      familyId: graphFamily.familyId,
      category: graphFamily.category,
      brand: graphFamily.brand,
      groupType: graphFamily.groupType,
      groupName: graphFamily.groupName,
      lane,
      rank: null,
      score: score.score,
      scoreComponents: score.components,
      affectedExactModels: affectedRecords.length,
      affectedReferenceIds: affectedRecords.map((row) => row.referenceId),
      affectedModels: affectedRecords.map((row) => row.model),
      incompleteReplayCount: incompleteReplays.length,
      incompletePdfSha256s,
      documentIds: [...graphFamily.documentIds].sort(),
      pdfSha256s: [...graphFamily.pdfSha256s].sort(),
      validMineruDocuments: documents.filter((document) => document.validity === 'VALID').length,
      invalidMineruDocuments: documents.filter((document) => document.validity !== 'VALID').length,
      reasonCodes: sortedUnique(incompleteReplays.map((replay) => replay.reasonCode)),
      researchGapTypes: sortedUnique((family.researchGaps ?? []).map((gap) => gap.gapType)),
      riskFlags,
      lifecycleCounts: countBy(affectedRecords, (row) => row.lifecycleState),
      sourceAuthorityCounts: countBy(affectedRecords, (row) => row.sourceAuthority),
      ...fixtureCoverageFor(graphFamily, fixtureProfiles),
    });
  }
  rows.sort((left, right) => (
    Number(right.lane === 'REPAIR_READY') - Number(left.lane === 'REPAIR_READY')
      || (right.score ?? -1) - (left.score ?? -1)
      || LANES.indexOf(left.lane) - LANES.indexOf(right.lane)
      || left.familyId.localeCompare(right.familyId)
  ));
  let rank = 0;
  for (const row of rows) {
    if (row.lane !== 'REPAIR_READY') continue;
    rank += 1;
    row.rank = rank;
  }
  const byLane = Object.fromEntries(LANES.map((lane) => [
    lane,
    rows.filter((row) => row.lane === lane).length,
  ]));
  const summary = {
    rows: rows.length,
    repairReady: byLane.REPAIR_READY,
    affectedExactModels: rows.reduce((sum, row) => sum + row.affectedExactModels, 0),
    fixtureProfiles: fixtureProfiles.profilesById.size,
    fixtureCoveredFamilies: new Set(rows.filter((row) => (
      row.fixtureCoverage === 'POSITIVE_AND_NEGATIVE'
    )).map((row) => row.familyId)).size,
    byLane,
  };
  const sourceBindings = {
    dimensionKnowledgeSha256: canonicalJsonSha256(knowledge),
    documentGraphSha256: requiredHash(graph.semanticGraphSha256, 'document graph semantic binding'),
    classificationSha256: requiredHash(
      classification.semanticClassificationSha256,
      'classification semantic binding',
    ),
    fixtureCorpusSha256: canonicalJsonSha256(fixtureProfiles.corpus),
  };
  const selectedFamilyId = rows.find((row) => row.lane === 'REPAIR_READY')?.familyId ?? null;
  const semantic = {
    schemaVersion: 1,
    policy: POLICY,
    sourceBindings,
    summary,
    selectedFamilyId,
    rows,
  };
  return {
    ...semantic,
    generatedAt,
    semanticQueueSha256: canonicalJsonSha256(semantic),
  };
}

export function validateHistoricalParserGapPriority(value, label = 'historical parser gap priority') {
  const artifact = requiredObject(value, label);
  if (artifact.schemaVersion !== 1) throw new TypeError(`${label} schemaVersion 1 required`);
  for (const [key, hash] of Object.entries(requiredObject(artifact.sourceBindings, `${label} source bindings`))) {
    requiredHash(hash, `${label} ${key}`);
  }
  const rows = requiredArray(artifact.rows, `${label} rows`);
  uniqueMap(rows, 'familyId', `${label} row`);
  const ready = rows.filter((row) => row.lane === 'REPAIR_READY');
  if (rows.some((row) => !LANES.includes(row.lane))) throw new TypeError(`${label} lane invalid`);
  if (ready.some((row, index) => row.rank !== index + 1 || !Number.isInteger(row.score))) {
    throw new Error(`${label} repair ranks invalid`);
  }
  if (rows.some((row) => row.lane !== 'REPAIR_READY' && (row.rank !== null || row.score !== null))) {
    throw new Error(`${label} blocked rows cannot be ranked`);
  }
  if ((ready[0]?.familyId ?? null) !== (artifact.selectedFamilyId ?? null)) {
    throw new Error(`${label} selected family mismatch`);
  }
  const summary = requiredObject(artifact.summary, `${label} summary`);
  if (summary.rows !== rows.length || summary.repairReady !== ready.length) {
    throw new Error(`${label} summary accounting mismatch`);
  }
  const semantic = {
    schemaVersion: artifact.schemaVersion,
    policy: artifact.policy,
    sourceBindings: artifact.sourceBindings,
    summary: artifact.summary,
    selectedFamilyId: artifact.selectedFamilyId ?? null,
    rows: artifact.rows,
  };
  if (canonicalJsonSha256(semantic) !== requiredHash(
    artifact.semanticQueueSha256,
    `${label} semantic queue SHA-256`,
  )) {
    throw new Error(`${label} semantic queue SHA-256 mismatch`);
  }
  return artifact;
}
