#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { readFile } = require('node:fs/promises');

function escHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

async function loadMeasurementSteps({
  stepsPath = path.join(__dirname, '..', 'data', 'copy', 'measurement-steps.json')
} = {}) {
  const raw = await readFile(stepsPath, 'utf8');
  const parsed = JSON.parse(raw);
  const steps = parsed?.steps ?? [];
  if (!Array.isArray(steps) || steps.length !== 5) {
    throw new Error('measurement-steps.json must contain exactly 5 steps');
  }
  for (const step of steps) {
    if (!step?.name || !step?.text) {
      throw new Error('measurement-steps.json has invalid step entries');
    }
  }
  return steps;
}

function buildMeasurementStepsHtml({ steps, widthMm, heightMm, depthMm }) {
  const dimensionHint = `Target cavity for this page: W ${widthMm} × H ${heightMm} × D ${depthMm} mm.`;
  const details = steps.map((step, index) => `<details class="measure-step"${index === 0 ? ' open' : ''}>
    <summary>${index + 1}. ${escHtml(step.name)}</summary>
    <p>${escHtml(step.text)}</p>
  </details>`).join('\n');

  return `<div class="measurement-steps">
${details}
    <p class="measurement-note">${escHtml(dimensionHint)}</p>
  </div>`;
}

function buildMeasurementHowToJsonLd({
  steps,
  widthMm,
  heightMm,
  depthMm,
  pageUrl
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: `How to measure a fridge cavity (${widthMm}mm width guide)`,
    description: `Five-step cavity measurement checklist for ${widthMm}×${heightMm}×${depthMm}mm target installations.`,
    totalTime: 'PT5M',
    mainEntityOfPage: pageUrl,
    step: steps.map((step, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      name: step.name,
      text: step.text
    }))
  };
}

module.exports = {
  buildMeasurementHowToJsonLd,
  buildMeasurementStepsHtml,
  loadMeasurementSteps
};
