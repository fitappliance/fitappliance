'use strict';

const { escHtml } = require('./html-head.js');

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function renderAnswerTarget({ question, answer, caveat = '' } = {}) {
  const safeQuestion = normalizeText(question);
  const safeAnswer = normalizeText(answer);
  const safeCaveat = normalizeText(caveat);

  if (!safeQuestion || !safeAnswer) return '';

  return `<section class="geo-answer-target" aria-labelledby="geo-answer-target-heading">
    <h2 id="geo-answer-target-heading">${escHtml(safeQuestion)}</h2>
    <p>${escHtml(safeAnswer)}</p>
    ${safeCaveat ? `<p class="geo-answer-caveat">${escHtml(safeCaveat)}</p>` : ''}
  </section>`;
}

function isRenderableEvidenceItem(item) {
  return normalizeText(item?.label) && normalizeText(item?.href);
}

function renderEvidenceItem(item) {
  const detail = normalizeText(item.detail);
  return `<li>
      <a href="${escHtml(item.href)}">${escHtml(item.label)}</a>
      ${detail ? `<span>${escHtml(detail)}</span>` : ''}
    </li>`;
}

function renderEvidenceBox({ title = 'Evidence used', items = [] } = {}) {
  const rows = [...(Array.isArray(items) ? items : [])]
    .filter(isRenderableEvidenceItem)
    .map(renderEvidenceItem);

  if (rows.length === 0) return '';

  return `<section class="geo-evidence-box" aria-labelledby="geo-evidence-box-heading">
    <h2 id="geo-evidence-box-heading">${escHtml(normalizeText(title) || 'Evidence used')}</h2>
    <ul>
      ${rows.join('\n')}
    </ul>
  </section>`;
}

function visibleTextFromGeoBlock(html) {
  return normalizeText(String(html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&'));
}

module.exports = {
  renderAnswerTarget,
  renderEvidenceBox,
  visibleTextFromGeoBlock
};
