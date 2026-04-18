#!/usr/bin/env node
'use strict';

const SCALE_PX_PER_MM = 0.2;

function escHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function mmToPx(valueMm) {
  const safe = Number.isFinite(valueMm) ? valueMm : 0;
  return Number((safe * SCALE_PX_PER_MM).toFixed(2));
}

function buildViewBoxContent({ widthMm, heightMm, depthMm }) {
  const frontWidth = mmToPx(widthMm);
  const frontHeight = mmToPx(heightMm);
  const sideDepth = mmToPx(depthMm);

  const frontView = `<svg class="measurement-view measurement-view--front" viewBox="0 0 ${frontWidth + 64} ${frontHeight + 90}" role="img" aria-label="Front measurement view">
    <rect x="32" y="20" width="${frontWidth}" height="${frontHeight}" rx="8" fill="#fff" stroke="#b8aa95" stroke-width="2" />
    <line x1="32" y1="${frontHeight + 46}" x2="${frontWidth + 32}" y2="${frontHeight + 46}" stroke="#b55a2c" stroke-width="2" />
    <polygon points="32,${frontHeight + 46} 40,${frontHeight + 42} 40,${frontHeight + 50}" fill="#b55a2c" />
    <polygon points="${frontWidth + 32},${frontHeight + 46} ${frontWidth + 24},${frontHeight + 42} ${frontWidth + 24},${frontHeight + 50}" fill="#b55a2c" />
    <line x1="${frontWidth + 48}" y1="20" x2="${frontWidth + 48}" y2="${frontHeight + 20}" stroke="#b55a2c" stroke-width="2" />
    <polygon points="${frontWidth + 48},20 ${frontWidth + 44},28 ${frontWidth + 52},28" fill="#b55a2c" />
    <polygon points="${frontWidth + 48},${frontHeight + 20} ${frontWidth + 44},${frontHeight + 12} ${frontWidth + 52},${frontHeight + 12}" fill="#b55a2c" />
    <text x="${frontWidth / 2 + 32}" y="${frontHeight + 68}" text-anchor="middle" font-size="14" fill="#5c5247">W ${escHtml(widthMm)}mm</text>
    <text x="${frontWidth + 54}" y="${frontHeight / 2 + 22}" text-anchor="start" font-size="14" fill="#5c5247">H ${escHtml(heightMm)}mm</text>
  </svg>`;

  const sideView = `<svg class="measurement-view measurement-view--side" viewBox="0 0 ${sideDepth + 64} ${frontHeight + 90}" role="img" aria-label="Side measurement view">
    <rect x="32" y="20" width="${sideDepth}" height="${frontHeight}" rx="8" fill="#fff" stroke="#b8aa95" stroke-width="2" />
    <line x1="32" y1="${frontHeight + 46}" x2="${sideDepth + 32}" y2="${frontHeight + 46}" stroke="#b55a2c" stroke-width="2" />
    <polygon points="32,${frontHeight + 46} 40,${frontHeight + 42} 40,${frontHeight + 50}" fill="#b55a2c" />
    <polygon points="${sideDepth + 32},${frontHeight + 46} ${sideDepth + 24},${frontHeight + 42} ${sideDepth + 24},${frontHeight + 50}" fill="#b55a2c" />
    <text x="${sideDepth / 2 + 32}" y="${frontHeight + 68}" text-anchor="middle" font-size="14" fill="#5c5247">D ${escHtml(depthMm)}mm</text>
    <text x="${sideDepth + 50}" y="${frontHeight / 2 + 22}" text-anchor="start" font-size="14" fill="#5c5247">H ${escHtml(heightMm)}mm</text>
  </svg>`;

  const topView = `<svg class="measurement-view measurement-view--top" viewBox="0 0 ${frontWidth + 64} ${sideDepth + 90}" role="img" aria-label="Top measurement view">
    <rect x="32" y="20" width="${frontWidth}" height="${sideDepth}" rx="8" fill="#fff" stroke="#b8aa95" stroke-width="2" />
    <line x1="32" y1="${sideDepth + 46}" x2="${frontWidth + 32}" y2="${sideDepth + 46}" stroke="#b55a2c" stroke-width="2" />
    <polygon points="32,${sideDepth + 46} 40,${sideDepth + 42} 40,${sideDepth + 50}" fill="#b55a2c" />
    <polygon points="${frontWidth + 32},${sideDepth + 46} ${frontWidth + 24},${sideDepth + 42} ${frontWidth + 24},${sideDepth + 50}" fill="#b55a2c" />
    <line x1="${frontWidth + 48}" y1="20" x2="${frontWidth + 48}" y2="${sideDepth + 20}" stroke="#b55a2c" stroke-width="2" />
    <polygon points="${frontWidth + 48},20 ${frontWidth + 44},28 ${frontWidth + 52},28" fill="#b55a2c" />
    <polygon points="${frontWidth + 48},${sideDepth + 20} ${frontWidth + 44},${sideDepth + 12} ${frontWidth + 52},${sideDepth + 12}" fill="#b55a2c" />
    <text x="${frontWidth / 2 + 32}" y="${sideDepth + 68}" text-anchor="middle" font-size="14" fill="#5c5247">W ${escHtml(widthMm)}mm</text>
    <text x="${frontWidth + 54}" y="${sideDepth / 2 + 22}" text-anchor="start" font-size="14" fill="#5c5247">D ${escHtml(depthMm)}mm</text>
  </svg>`;

  return `${frontView}${sideView}${topView}`;
}

function generateMeasurementSvg({ widthMm, heightMm, depthMm }) {
  return `<div class="measurement-svg">${buildViewBoxContent({ widthMm, heightMm, depthMm })}</div>`;
}

if (require.main === module) {
  const html = generateMeasurementSvg({ widthMm: 600, heightMm: 1800, depthMm: 700 });
  process.stdout.write(`${html}\n`);
}

module.exports = {
  SCALE_PX_PER_MM,
  generateMeasurementSvg,
  mmToPx
};
