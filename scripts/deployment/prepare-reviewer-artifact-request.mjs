import {
  buildReviewerArtifactRequest,
  deriveExpectedReviewerArtifact,
} from '../../src/domain/reviewer-artifact-request-contract.mjs';

export function prepareReviewerArtifactRequest({ issuedAt, expiresAt, ...derivationInputs }) {
  return buildReviewerArtifactRequest({
    derived: deriveExpectedReviewerArtifact(derivationInputs),
    issuedAt,
    expiresAt,
  });
}
