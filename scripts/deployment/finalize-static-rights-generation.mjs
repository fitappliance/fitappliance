import { createHash } from 'node:crypto';

import {
  buildRightsReview,
  buildStaticPublicationAuthorization,
  canonicalJson,
  semanticId,
  validateDecisionRegistry,
  validateWithdrawalLog,
  verifyStaticPublicationGate,
} from '../../src/domain/static-publication-rights.mjs';
import {
  REVIEWER_PRODUCTION_DEPENDENCIES,
  canonicalReviewerJson,
  deriveExpectedReviewerArtifact,
} from '../../src/domain/reviewer-artifact-request-contract.mjs';
import {
  OfflineSecureIoError,
  writeAtomicPrivateNoClobber,
} from './offline-owner-secure-io.mjs';

export class StaticRightsFinalizationError extends Error {
  constructor(code, message) { super(message); this.name = 'StaticRightsFinalizationError'; this.code = code; }
}

const fail = (code, message) => { throw new StaticRightsFinalizationError(code, message); };
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function parseCanonical(bytes, label) {
  let value;
  const text = Buffer.from(bytes).toString('utf8');
  try { value = JSON.parse(text); } catch { fail('FINALIZATION_INPUT_INVALID', `${label} must contain JSON`); }
  if (canonicalReviewerJson(value) !== text) fail('FINALIZATION_INPUT_INVALID', `${label} must be canonical`);
  return value;
}

function actualNow(now) {
  const value = now();
  const ms = value instanceof Date ? value.getTime() : NaN;
  if (!Number.isFinite(ms) || value.toISOString() !== new Date(ms).toISOString()) {
    fail('ACCEPTANCE_TIME_INVALID', 'Actual system acceptance time is invalid');
  }
  return { value: value.toISOString(), ms };
}

function translate(error) {
  if (error instanceof OfflineSecureIoError) fail(error.code, error.message);
  if (typeof error?.code === 'string') fail(error.code, error.message);
  throw error;
}

export function acceptWithdrawalGenesis({ envelopeBytes, outputPath, ...derivationInputs }) {
  let derived;
  let envelope;
  try {
    derived = deriveExpectedReviewerArtifact({
      ...derivationInputs,
      artifactType: 'WITHDRAWAL_GENESIS_HEAD',
      currentWithdrawalLogBytes: null,
    });
    envelope = parseCanonical(envelopeBytes, 'Signed genesis envelope');
  } catch (error) { translate(error); }
  if (JSON.stringify(Object.keys(envelope).sort()) !== JSON.stringify(['payload', 'signature', 'withdrawalHeadHash'])
    || envelope.withdrawalHeadHash !== derived.artifactId
    || canonicalReviewerJson(envelope.payload) !== canonicalReviewerJson(derived.payload)) {
    fail('GENESIS_DERIVATION_MISMATCH', 'Signed genesis differs from the owner-accepted candidate derivation');
  }
  const authoritySet = parseCanonical(derivationInputs.authoritySetBytes, 'Authority document');
  const withdrawalLog = { schemaVersion: 1, environment: 'PRODUCTION', events: [], heads: [envelope] };
  try {
    const result = validateWithdrawalLog({ withdrawalLog, authoritySet });
    if (result.sequence !== 0 || result.withdrawalHeadHash !== derived.artifactId) {
      fail('GENESIS_INVALID', 'Accepted genesis is not an immutable zero-event head');
    }
    writeAtomicPrivateNoClobber(outputPath, Buffer.from(canonicalReviewerJson(withdrawalLog)));
  } catch (error) { translate(error); }
  return { status: 'ACCEPTED', withdrawalHeadHash: derived.artifactId };
}

export function finalizeStaticRightsGeneration({
  candidateBytes,
  ownerReceiptBytes,
  ownerTrustRootBytes,
  ownerTrustAnchorBytes,
  authoritySetBytes,
  reviewerMetadataBytes,
  reviewerPublicKeyPem,
  reviewerSignerContractId,
  reviewerSignerContractSha256,
  signedWithdrawalLogBytes,
  decisionEnvelopeBytes,
  inventory,
  classifiedRows,
  generatedProvenance,
  attributionFulfillments,
  routeConfigSha256,
  decisionAsOf,
  outputPath,
  now = () => new Date(),
}) {
  if (!Array.isArray(decisionEnvelopeBytes)
    || decisionEnvelopeBytes.length !== REVIEWER_PRODUCTION_DEPENDENCIES.length) {
    fail('PRODUCTION_DECISION_SET_INVALID', 'Finalization requires exactly five staged decision envelopes');
  }
  const acceptance = actualNow(now);
  const authoritySet = parseCanonical(authoritySetBytes, 'Authority document');
  const ownerTrustRoot = parseCanonical(ownerTrustRootBytes, 'Owner trust root');
  const withdrawalLog = parseCanonical(signedWithdrawalLogBytes, 'Signed withdrawal log');
  let withdrawal;
  try { withdrawal = validateWithdrawalLog({ withdrawalLog, authoritySet }); }
  catch (error) { translate(error); }
  if (withdrawal.sequence !== 0) fail('WITHDRAWAL_STATE_INVALID', 'Initial generation requires the accepted genesis head');
  const envelopes = decisionEnvelopeBytes.map((bytes, index) => parseCanonical(bytes, `Decision envelope ${index}`));
  const byDependency = new Map();
  let decisionSetId;
  let decisionWindow;
  for (const envelope of envelopes) {
    const dependencyId = envelope?.payload?.dependencyId;
    if (byDependency.has(dependencyId)) fail('PRODUCTION_DECISION_SET_INVALID', 'Decision dependencies must be unique');
    let derived;
    try {
      derived = deriveExpectedReviewerArtifact({
        artifactType: 'STATIC_RIGHTS_DECISION',
        candidateBytes,
        ownerReceiptBytes,
        ownerTrustRootBytes,
        ownerTrustAnchorBytes,
        authoritySetBytes,
        reviewerMetadataBytes,
        reviewerPublicKeyPem,
        reviewerSignerContractId,
        reviewerSignerContractSha256,
        currentWithdrawalLogBytes: signedWithdrawalLogBytes,
        dependencyId,
        decisionAsOf,
        validFrom: envelope?.payload?.validFrom,
        validThrough: envelope?.payload?.validThrough,
        reviewBy: envelope?.payload?.reviewBy,
      });
    } catch (error) { translate(error); }
    if (envelope.decisionId !== derived.artifactId
      || canonicalReviewerJson(envelope.payload) !== canonicalReviewerJson(derived.payload)) {
      fail('DECISION_DERIVATION_MISMATCH', `Decision differs from candidate derivation: ${String(dependencyId)}`);
    }
    if (decisionSetId !== undefined && decisionSetId !== derived.decisionSetId) {
      fail('DECISION_SET_MISMATCH', 'Decisions do not bind one candidate-derived descriptor set');
    }
    decisionSetId = derived.decisionSetId;
    const currentWindow = canonicalReviewerJson({
      decisionAsOf: envelope.payload.decisionAsOf,
      validFrom: envelope.payload.validFrom,
      validThrough: envelope.payload.validThrough,
      reviewBy: envelope.payload.reviewBy,
    });
    if (decisionWindow !== undefined && decisionWindow !== currentWindow) {
      fail('DECISION_CLOCK_MISMATCH', 'All five decisions must share one frozen clock and validity window');
    }
    decisionWindow = currentWindow;
    if (acceptance.ms < Date.parse(envelope.payload.validFrom)
      || acceptance.ms >= Date.parse(envelope.payload.validThrough)
      || acceptance.ms > Date.parse(envelope.payload.reviewBy)) {
      fail('DECISION_EXPIRED', `Decision is not valid at actual acceptance: ${dependencyId}`);
    }
    byDependency.set(dependencyId, envelope);
  }
  if (JSON.stringify([...byDependency.keys()].sort()) !== JSON.stringify(REVIEWER_PRODUCTION_DEPENDENCIES)) {
    fail('PRODUCTION_DECISION_SET_INVALID', 'Decision envelopes must cover the exact production dependencies');
  }
  const candidate = parseCanonical(candidateBytes, 'B1 base candidate');
  if (canonicalReviewerJson(candidate.attributionFulfillments) !== canonicalReviewerJson(attributionFulfillments)) {
    fail('ATTRIBUTION_UNMET', 'Finalization attribution differs from the candidate');
  }
  const registry = {
    schemaVersion: 1,
    decisionAsOf,
    withdrawalHeadHash: withdrawal.withdrawalHeadHash,
    attributionFulfillments,
    decisions: [...byDependency.values()].sort((left, right) => Buffer.compare(Buffer.from(left.decisionId), Buffer.from(right.decisionId))),
  };
  let verified;
  try {
    verified = validateDecisionRegistry({
      registry,
      authoritySet,
      inventoryId: inventory.staticSourceInventoryId,
      decisionAsOf,
      withdrawalHeadHash: withdrawal.withdrawalHeadHash,
      attributionFulfillments,
      routeConfigSha256,
      publicationRows: inventory.rows,
      trustRoot: ownerTrustRoot,
      expectedDependencyDescriptors: candidate.dependencies,
      expectedDecisionSetId: decisionSetId,
    });
  } catch (error) { translate(error); }
  const review = buildRightsReview({
    inventory,
    classifiedRows,
    verifiedDecisions: verified.decisions,
    decisionAsOf,
    withdrawalHeadHash: withdrawal.withdrawalHeadHash,
  });
  if (review.status !== 'APPROVED' || review.sourceManifest.status !== 'APPROVED') {
    fail('STATIC_RIGHTS_GATE_BLOCKED', 'Derived review and schema-2 manifest are not approved');
  }
  const authorization = buildStaticPublicationAuthorization({
    inventory,
    generatedProvenance,
    authoritySet,
    registry,
    review,
    manifest: review.sourceManifest,
    attributionFulfillments,
    decisionAsOf,
    withdrawalHeadHash: withdrawal.withdrawalHeadHash,
  });
  try {
    verifyStaticPublicationGate({
      inventory,
      generatedProvenance,
      authoritySet,
      withdrawalLog,
      registry,
      review,
      manifest: review.sourceManifest,
      authorization,
      attributionFulfillments,
      routeConfigSha256,
      currentDecisionAsOf: decisionAsOf,
      currentWithdrawalHeadHash: withdrawal.withdrawalHeadHash,
      trustRoot: ownerTrustRoot,
      expectedDependencyDescriptors: candidate.dependencies,
      expectedDecisionSetId: decisionSetId,
    });
  } catch (error) { translate(error); }
  const packetPayload = {
    schemaVersion: 1,
    state: 'STATIC_RIGHTS_GENERATION_FINALIZED',
    b1BaseCandidateId: candidate.candidateId,
    b1BaseCandidateSha256: sha256(candidateBytes),
    ownerAcceptanceId: candidate.ownerAcceptance.acceptanceId,
    ownerAcceptanceSha256: sha256(ownerReceiptBytes),
    authoritySetId: candidate.authoritySetId,
    authorityDocumentSha256: sha256(authoritySetBytes),
    decisionSetId,
    decisionAsOf,
    acceptanceNow: acceptance.value,
    withdrawalLog,
    registry,
    review: { ...review, sourceManifest: undefined },
    manifest: review.sourceManifest,
    authorization,
  };
  delete packetPayload.review.sourceManifest;
  const packet = {
    ...packetPayload,
    generationPacketId: semanticId('fitappliance.static-rights-generation-packet', 1, packetPayload, {
      sortedArrays: ['attributionFulfillments', 'blockers', 'decisions', 'rows'],
    }),
  };
  try {
    writeAtomicPrivateNoClobber(outputPath, Buffer.from(canonicalJson(packet, {
      sortedArrays: ['attributionFulfillments', 'blockers', 'decisions', 'rows'],
    })), {
      beforeCommit: () => {
        const commitNow = actualNow(now);
        if (commitNow.ms < acceptance.ms) {
          fail('SYSTEM_CLOCK_ROLLBACK', 'System clock moved backwards during generation finalization');
        }
        validateWithdrawalLog({ withdrawalLog, authoritySet });
        validateDecisionRegistry({
          registry,
          authoritySet,
          inventoryId: inventory.staticSourceInventoryId,
          decisionAsOf,
          withdrawalHeadHash: withdrawal.withdrawalHeadHash,
          attributionFulfillments,
          routeConfigSha256,
          publicationRows: inventory.rows,
          trustRoot: ownerTrustRoot,
          expectedDependencyDescriptors: candidate.dependencies,
          expectedDecisionSetId: decisionSetId,
        });
        for (const envelope of registry.decisions) {
          if (commitNow.ms < Date.parse(envelope.payload.validFrom)
            || commitNow.ms >= Date.parse(envelope.payload.validThrough)
            || commitNow.ms > Date.parse(envelope.payload.reviewBy)) {
            fail('DECISION_EXPIRED', 'Decision expired immediately before generation commit');
          }
        }
      },
    });
  } catch (error) { translate(error); }
  return { status: 'FINALIZED', generationPacketId: packet.generationPacketId };
}
