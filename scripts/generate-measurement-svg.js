#!/usr/bin/env node
'use strict';

const SCALE_PX_PER_MM = 0.2;
const RIGHT_GUTTER_PX = 88;

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

function buildVerticalDimension({ extentWidth, extentHeight, axis, valueMm }) {
  const arrowX = extentWidth + 48;
  const labelX = extentWidth + 70;
  const labelY = extentHeight / 2 + 20;

  return `<line x1="${arrowX}" y1="20" x2="${arrowX}" y2="${extentHeight + 20}" stroke="#A34F22" stroke-width="2" />
    <polygon points="${arrowX},20 ${arrowX - 4},28 ${arrowX + 4},28" fill="#A34F22" />
    <polygon points="${arrowX},${extentHeight + 20} ${arrowX - 4},${extentHeight + 12} ${arrowX + 4},${extentHeight + 12}" fill="#A34F22" />
    <text class="measurement-label--vertical" x="${labelX}" y="${labelY}" text-anchor="middle" transform="rotate(-90 ${labelX} ${labelY})" font-size="14" fill="#5c5247">${axis} ${escHtml(valueMm)}mm</text>`;
}

function buildViewBoxContent({ widthMm, heightMm, depthMm }) {
  const frontWidth = mmToPx(widthMm);
  const frontHeight = mmToPx(heightMm);
  const sideDepth = mmToPx(depthMm);

  const frontView = `<svg class="measurement-view measurement-view--front" viewBox="0 0 ${frontWidth + RIGHT_GUTTER_PX} ${frontHeight + 90}" role="img" aria-label="Front measurement view">
    <rect x="32" y="20" width="${frontWidth}" height="${frontHeight}" rx="8" fill="#fff" stroke="#b8aa95" stroke-width="2" />
    <line x1="32" y1="${frontHeight + 46}" x2="${frontWidth + 32}" y2="${frontHeight + 46}" stroke="#A34F22" stroke-width="2" />
    <polygon points="32,${frontHeight + 46} 40,${frontHeight + 42} 40,${frontHeight + 50}" fill="#A34F22" />
    <polygon points="${frontWidth + 32},${frontHeight + 46} ${frontWidth + 24},${frontHeight + 42} ${frontWidth + 24},${frontHeight + 50}" fill="#A34F22" />
    ${buildVerticalDimension({ extentWidth: frontWidth, extentHeight: frontHeight, axis: 'H', valueMm: heightMm })}
    <text x="${frontWidth / 2 + 32}" y="${frontHeight + 68}" text-anchor="middle" font-size="14" fill="#5c5247">W ${escHtml(widthMm)}mm</text>
  </svg>`;

  const sideView = `<svg class="measurement-view measurement-view--side" viewBox="0 0 ${sideDepth + RIGHT_GUTTER_PX} ${frontHeight + 90}" role="img" aria-label="Side measurement view">
    <rect x="32" y="20" width="${sideDepth}" height="${frontHeight}" rx="8" fill="#fff" stroke="#b8aa95" stroke-width="2" />
    <line x1="32" y1="${frontHeight + 46}" x2="${sideDepth + 32}" y2="${frontHeight + 46}" stroke="#A34F22" stroke-width="2" />
    <polygon points="32,${frontHeight + 46} 40,${frontHeight + 42} 40,${frontHeight + 50}" fill="#A34F22" />
    <polygon points="${sideDepth + 32},${frontHeight + 46} ${sideDepth + 24},${frontHeight + 42} ${sideDepth + 24},${frontHeight + 50}" fill="#A34F22" />
    ${buildVerticalDimension({ extentWidth: sideDepth, extentHeight: frontHeight, axis: 'H', valueMm: heightMm })}
    <text x="${sideDepth / 2 + 32}" y="${frontHeight + 68}" text-anchor="middle" font-size="14" fill="#5c5247">D ${escHtml(depthMm)}mm</text>
  </svg>`;

  const topView = `<svg class="measurement-view measurement-view--top" viewBox="0 0 ${frontWidth + RIGHT_GUTTER_PX} ${sideDepth + 90}" role="img" aria-label="Top measurement view">
    <rect x="32" y="20" width="${frontWidth}" height="${sideDepth}" rx="8" fill="#fff" stroke="#b8aa95" stroke-width="2" />
    <line x1="32" y1="${sideDepth + 46}" x2="${frontWidth + 32}" y2="${sideDepth + 46}" stroke="#A34F22" stroke-width="2" />
    <polygon points="32,${sideDepth + 46} 40,${sideDepth + 42} 40,${sideDepth + 50}" fill="#A34F22" />
    <polygon points="${frontWidth + 32},${sideDepth + 46} ${frontWidth + 24},${sideDepth + 42} ${frontWidth + 24},${sideDepth + 50}" fill="#A34F22" />
    ${buildVerticalDimension({ extentWidth: frontWidth, extentHeight: sideDepth, axis: 'D', valueMm: depthMm })}
    <text x="${frontWidth / 2 + 32}" y="${sideDepth + 68}" text-anchor="middle" font-size="14" fill="#5c5247">W ${escHtml(widthMm)}mm</text>
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
