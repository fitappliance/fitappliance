import { createHash } from 'node:crypto';

import { isOfficialBrandUrl, isReleasableQuarantineReason } from './evidence-source-verifier.mjs';

function key(value) {
  return String(value ?? '').trim().toLowerCase();
}

function slug(value) {
  return key(value).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function inferredConflictFields(reason) {
  const fields = new Set();
  const text = key(reason);
  if (/plumb|water/.test(text)) fields.add('flags.requiresPlumbing');
  if (/clearance|space/.test(text)) {
    for (const field of ['installation.leftMm', 'installation.rearMm', 'installation.rightMm', 'installation.topMm']) fields.add(field);
  }
  if (/operation|door/.test(text)) fields.add('operation.doorOpenDepthMm');
  return [...fields].sort();
}

function deterministicCaseId(product, reason) {
  const hash = createHash('sha256').update(`${key(product.id)}\0${key(reason)}`).digest('hex').slice(0, 10);
  return `resolution_${slug(product.brand)}_${slug(product.model)}_${hash}_v1`;
}

export function assertResolutionCaseCoverage(document, publicationQuarantine) {
  const covered = new Set((document?.cases ?? []).map((row) => key(row.legacyRuntimeId)));
  for (const row of publicationQuarantine?.products ?? []) {
    if (isReleasableQuarantineReason(row.reason) && !covered.has(key(row.legacyRuntimeId))) {
      throw new Error(`missing automated resolution case for ${row.legacyRuntimeId}`);
    }
  }
  return true;
}

export function buildResolutionSeedDocument(document, context) {
  if (document?.schemaVersion !== 1 || !Array.isArray(document.cases)) throw new TypeError('resolution case document required');
  const products = new Map((context?.catalog?.products ?? []).map((row) => [key(row.id), row]));
  const dispositions = new Map((context?.phase1Disposition?.products ?? []).map((row) => [key(row.legacyId), row]));
  const cases = document.cases.map((resolutionCase) => structuredClone(resolutionCase));
  const covered = new Set(cases.map((row) => key(row.legacyRuntimeId)));
  for (const hold of context?.publicationQuarantine?.products ?? []) {
    const legacyRuntimeId = key(hold.legacyRuntimeId);
    if (!isReleasableQuarantineReason(hold.reason) || covered.has(legacyRuntimeId)) continue;
    const product = products.get(legacyRuntimeId);
    if (!product) throw new Error(`resolution seed product missing from catalog: ${hold.legacyRuntimeId}`);
    const reasons = [key(hold.reason)];
    const disposition = dispositions.get(legacyRuntimeId);
    const dispositionReason = disposition ? `phase1_${key(disposition.disposition)}` : null;
    if (dispositionReason && isReleasableQuarantineReason(dispositionReason)) reasons.push(dispositionReason);
    const candidateUrls = [];
    const sourceUrl = product?.evidence?.source_url;
    if (sourceUrl && isOfficialBrandUrl(sourceUrl, product.brand)) candidateUrls.push(new URL(sourceUrl).toString());
    cases.push({
      id: deterministicCaseId(product, hold.reason),
      legacyRuntimeId,
      brand: String(product.brand).trim(),
      model: String(product.model).trim(),
      category: String(product.cat).trim(),
      releasableQuarantineReasons: [...new Set(reasons)].sort(),
      initialFailure: {
        code: 'publication_evidence_hold',
        conflictingFields: inferredConflictFields(hold.reason),
        detail: String(hold.reason),
      },
      attempt: 1,
      maxAttempts: 3,
      candidateUrls: [...new Set(candidateUrls)].sort(),
      sources: [],
      history: [],
      automationState: 'research_required',
      terminalReason: null,
    });
    covered.add(legacyRuntimeId);
  }
  const result = { ...structuredClone(document), cases: cases.sort((left, right) => key(left.legacyRuntimeId).localeCompare(key(right.legacyRuntimeId))) };
  assertResolutionCaseCoverage(result, context.publicationQuarantine);
  return result;
}
