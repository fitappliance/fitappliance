function requiredText(value, label) {
  const result = String(value ?? '').trim();
  if (!result) throw new TypeError(`${label} required`);
  return result;
}

function validTime(value) {
  const text = requiredText(value, 'transition time');
  if (!/^\d{4}-\d{2}-\d{2}T/.test(text) || !Number.isFinite(Date.parse(text))) {
    throw new TypeError('valid transition time required');
  }
  return text;
}

export function recordResearchAttempt(caseRecord, result, at) {
  const attempt = Number(caseRecord?.attempt);
  const maxAttempts = Number(caseRecord?.maxAttempts);
  if (!Number.isInteger(attempt) || !Number.isInteger(maxAttempts) || attempt < 1 || attempt > maxAttempts) {
    throw new TypeError('valid case attempt state required');
  }
  const outcome = requiredText(result?.outcome, 'research outcome');
  if (!['verified', 'failed', 'interrupted'].includes(outcome)) throw new TypeError('unsupported research outcome');
  const sources = Array.isArray(caseRecord.sources) ? caseRecord.sources : [];
  if (outcome === 'verified') {
    const source = result?.source;
    const hash = requiredText(source?.contentSha256, 'verified source hash');
    if (sources.some((candidate) => candidate.contentSha256 === hash)) return structuredClone(caseRecord);
  }
  const nextAttempt = Math.min(maxAttempts, attempt + 1);
  const exhausted = outcome !== 'verified' && nextAttempt >= maxAttempts;
  const history = [...(caseRecord.history ?? []), {
    at: validTime(at),
    attempt: nextAttempt,
    outcome,
    candidateUrl: result?.candidateUrl ?? result?.source?.finalUrl ?? null,
    sourceSha256: result?.source?.contentSha256 ?? null,
    reason: result?.reason ?? null,
  }];
  return {
    ...structuredClone(caseRecord),
    attempt: nextAttempt,
    sources: outcome === 'verified' ? [...sources, structuredClone(result.source)] : structuredClone(sources),
    history,
    automationState: exhausted ? 'quarantined' : (outcome === 'verified' ? 'evidence_collected' : 'research_required'),
    terminalReason: exhausted ? 'evidence_search_exhausted' : null,
  };
}
