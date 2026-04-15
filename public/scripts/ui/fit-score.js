export function computeFitScore(product, cavityW, cavityH, cavityD, clearanceRule) {
  const hasAnyCavityInput = [cavityW, cavityH, cavityD].some(
    (value) => Number.isFinite(value) && value > 0
  );

  if (!hasAnyCavityInput) {
    return { score: null, warnings: [], label: 'Enter cavity size to score' };
  }

  const side = clearanceRule?.side ?? 20;
  const rear = clearanceRule?.rear ?? 50;
  const top = clearanceRule?.top ?? 50;

  let score = 100;
  const warnings = [];

  if (Number.isFinite(cavityW) && cavityW > 0) {
    const gap = cavityW - product.w;
    const required = side * 2;
    if (gap < 0) return { score: 0, warnings: ['Does not fit — too wide'], label: '✗ No fit' };
    if (gap < required) {
      score -= Math.min(40, Math.round((required - gap) / required * 40));
      warnings.push(`Side clearance tight (${gap}mm available, ${required}mm recommended)`);
    }
  }

  if (Number.isFinite(cavityH) && cavityH > 0) {
    const gap = cavityH - product.h;
    if (gap < 0) return { score: 0, warnings: ['Does not fit — too tall'], label: '✗ No fit' };
    if (gap < top) {
      score -= Math.min(30, Math.round((top - gap) / top * 30));
      warnings.push(`Top clearance tight (${gap}mm available, ${top}mm recommended)`);
    }
  }

  if (Number.isFinite(cavityD) && cavityD > 0) {
    const gap = cavityD - product.d;
    if (gap < 0) return { score: 0, warnings: ['Does not fit — too deep'], label: '✗ No fit' };
    if (gap < rear) {
      score -= Math.min(30, Math.round((rear - gap) / rear * 30));
      warnings.push(`Rear clearance tight (${gap}mm available, ${rear}mm recommended)`);
    }
  }

  score = Math.max(0, score);
  const label = score >= 80 ? `✓ ${score}/100` : score >= 50 ? `⚠ ${score}/100` : `✗ ${score}/100`;
  return { score, warnings, label };
}
