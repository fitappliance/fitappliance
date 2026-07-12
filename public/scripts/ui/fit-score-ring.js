import { renderBreakdownHtml } from './score-breakdown.js';
import { renderTooltipHtml } from './tooltips-dictionary.js';

function escHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function normalizeScore(score) {
  const value = Math.round(Number(score));
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export function getFitScoreTier(score) {
  const value = normalizeScore(score);
  if (value >= 90) return 'excellent';
  if (value >= 75) return 'strong';
  if (value >= 60) return 'workable';
  if (value >= 40) return 'tight';
  if (value >= 1) return 'marginal';
  return 'no-fit';
}

export function getFitScoreLabel(score) {
  return {
    excellent: 'Excellent margin',
    strong: 'Strong margin',
    workable: 'Workable margin',
    tight: 'Tight margin',
    marginal: 'Marginal margin',
    'no-fit': 'No dimensional fit'
  }[getFitScoreTier(score)];
}

export function getSizeMarginLabel(score) {
  return getFitScoreLabel(score);
}

export function getFitDecisionLabel(fitDecision) {
  return {
    VERIFIED_FIT: 'Verified fit',
    LIKELY_FIT_ESTIMATED: 'Estimated clearance',
    CONDITIONAL_FIT: 'Conditional fit',
    INSUFFICIENT_DATA: 'Fit data incomplete',
    NO_FIT: 'Does not fit'
  }[String(fitDecision?.outcome ?? '').trim()] ?? 'Fit evidence unavailable';
}

export function renderFitScoreRing(score, options = {}) {
  const value = normalizeScore(score);
  const tier = getFitScoreTier(value);
  const label = getFitScoreLabel(value);
  const radius = 17;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - (value / 100));
  const title = String(options.title ?? `Size margin score ${value} out of 100, ${label}`);

  return `<svg class="fit-score-ring fit-score-ring--${escHtml(tier)}" role="img" aria-label="${escHtml(title)}" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
    <circle class="fit-score-ring-track" cx="20" cy="20" r="${radius}" fill="none" stroke="currentColor" stroke-opacity="0.18" stroke-width="4"></circle>
    <circle class="fit-score-ring-value" cx="20" cy="20" r="${radius}" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-dasharray="${circumference.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}" transform="rotate(-90 20 20)"></circle>
    <text class="fit-score-number" x="20" y="24" text-anchor="middle">${value}</text>
  </svg>`;
}

export function renderFitScoreCardBlock(score, options = {}) {
  if (score === null || score === undefined || score === '') return '';
  const value = normalizeScore(score);
  const hasFitDecision = Object.prototype.hasOwnProperty.call(options, 'fitDecision');
  const outcome = String(options.fitDecision?.outcome ?? '').trim();
  const decisionLabel = hasFitDecision ? getFitDecisionLabel(options.fitDecision) : '';
  if (outcome === 'INSUFFICIENT_DATA') {
    return `<div class="fit-score-block fit-score-block--incomplete" data-fit-outcome="INSUFFICIENT_DATA">
      <span class="fit-score-label">${escHtml(decisionLabel)}</span>
    </div>`;
  }
  const label = hasFitDecision ? getSizeMarginLabel(value) : getFitScoreLabel(value);
  const inlineLabel = options.compact === true ? `${value}` : `${value} — ${label}`;
  const tier = getFitScoreTier(value);
  const decisionHtml = hasFitDecision
    ? `<span class="fit-decision-label">${escHtml(decisionLabel)}</span>`
    : '';
  const ringOptions = hasFitDecision
    ? { ...options, title: `Size margin score ${value} out of 100; ${decisionLabel}` }
    : options;
  const breakdownHtml = options.breakdown
    ? renderBreakdownHtml(options.breakdown, value)
    : '';

  if (!breakdownHtml) {
    return `<div class="fit-score-block" data-fit-score-tier="${escHtml(tier)}"${hasFitDecision ? ` data-fit-outcome="${escHtml(outcome || 'UNKNOWN')}"` : ''}>
      ${renderFitScoreRing(value, ringOptions)}
      <span class="fit-score-copy"><span class="fit-score-label">${escHtml(inlineLabel)}</span>${decisionHtml}</span>
    </div>`;
  }

  return `<details class="fit-score-popover" data-fit-score-tier="${escHtml(tier)}"${hasFitDecision ? ` data-fit-outcome="${escHtml(outcome || 'UNKNOWN')}"` : ''}>
    <summary class="fit-score-summary" aria-label="Show size margin breakdown">
      ${renderFitScoreRing(value, ringOptions)}
      <span class="fit-score-copy"><span class="fit-score-label">${escHtml(inlineLabel)}</span>${decisionHtml}</span>
      ${renderTooltipHtml('fit-score')}
    </summary>
    <div class="fit-score-popover__panel">${breakdownHtml}</div>
  </details>`;
}

export function bindFitScorePopoverEsc(root = globalThis.document) {
  if (!root?.addEventListener || root.__fitScoreEscBound) return;
  root.__fitScoreEscBound = true;
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const openPopover = root.querySelector?.('.fit-score-popover[open]');
    if (openPopover) {
      openPopover.open = false;
      openPopover.querySelector?.('summary')?.focus?.();
    }
  });
}

if (typeof document !== 'undefined') {
  bindFitScorePopoverEsc(document);
}
