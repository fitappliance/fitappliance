'use strict';

(function initPdfExport(globalScope) {
  const BUTTON_SELECTOR = '.btn-pdf-export';
  const FILE_PREFIX = 'fitappliance-';

  function escapePdfText(value) {
    return String(value ?? '')
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/\r?\n/g, ' ')
      .trim();
  }

  function normalizeFilenamePart(value) {
    return String(value ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  }

  function buildDownloadFilename(slug) {
    const safeSlug = normalizeFilenamePart(slug || 'cavity-guide') || 'cavity-guide';
    return `${FILE_PREFIX}${safeSlug}.pdf`;
  }

  function collectPageData(documentRef, button) {
    const heading = documentRef.querySelector('h1')?.textContent?.trim() || 'FitAppliance cavity guide';
    const quickAnswer = documentRef.getElementById('quick-answer')?.textContent?.trim() || '';
    const stepNodes = [...documentRef.querySelectorAll('#measure details')].slice(0, 5);
    const steps = stepNodes.map((node) => {
      const title = node.querySelector('summary')?.textContent?.trim() || 'Step';
      const text = node.querySelector('p')?.textContent?.trim() || '';
      return `${title}: ${text}`.trim();
    });
    const dims = {
      width: button?.getAttribute('data-cavity-width') || '',
      height: button?.getAttribute('data-cavity-height') || '',
      depth: button?.getAttribute('data-cavity-depth') || ''
    };
    const pageUrl = globalScope?.location?.href || 'https://fitappliance.com.au/';
    return { heading, quickAnswer, steps, dims, pageUrl };
  }

  function buildTextLines(payload) {
    const lines = [
      'FitAppliance Installation Guide',
      payload.heading,
      payload.quickAnswer ? `Summary: ${payload.quickAnswer}` : '',
      `Cavity dimensions: W ${payload.dims.width}mm x H ${payload.dims.height}mm x D ${payload.dims.depth}mm`,
      ''
    ].filter(Boolean);

    for (const step of payload.steps) {
      lines.push(step);
    }
    lines.push('');
    lines.push(`Source page: ${payload.pageUrl}`);
    lines.push('Generated locally in your browser. No data was uploaded.');
    return lines;
  }

  function buildPdfBytes(payload) {
    const lines = buildTextLines(payload).map(escapePdfText);
    const commands = ['BT', '/F1 12 Tf'];
    let y = 800;
    for (const line of lines) {
      commands.push(`50 ${y} Td (${line}) Tj`);
      y -= 16;
      commands.push('0 0 Td');
    }
    commands.push('ET');
    const streamBody = commands.join('\n');

    const objects = [];
    objects.push('<< /Type /Catalog /Pages 2 0 R >>');
    objects.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>');
    objects.push(`<< /Length ${Buffer.byteLength(streamBody, 'utf8')} >>\nstream\n${streamBody}\nendstream`);
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    for (let index = 0; index < objects.length; index += 1) {
      offsets.push(Buffer.byteLength(pdf, 'utf8'));
      pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
    }

    const xrefStart = Buffer.byteLength(pdf, 'utf8');
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';
    for (let index = 1; index < offsets.length; index += 1) {
      pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

    return new TextEncoder().encode(pdf);
  }

  function triggerDownload({ bytes, filename, documentRef, windowRef, BlobRef }) {
    const blob = new BlobRef([bytes], { type: 'application/pdf' });
    const objectUrl = windowRef.URL.createObjectURL(blob);
    const anchor = documentRef.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    documentRef.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    windowRef.setTimeout(() => windowRef.URL.revokeObjectURL(objectUrl), 500);
  }

  function handlePdfButtonClick(event, deps) {
    const button = event.currentTarget;
    const payload = collectPageData(deps.documentRef, button);
    const bytes = buildPdfBytes(payload);
    const filename = buildDownloadFilename(button.getAttribute('data-cavity-slug'));
    triggerDownload({
      bytes,
      filename,
      documentRef: deps.documentRef,
      windowRef: deps.windowRef,
      BlobRef: deps.BlobRef
    });
  }

  function attachPdfButtons({
    documentRef = globalScope?.document,
    windowRef = globalScope,
    BlobRef = globalScope?.Blob
  } = {}) {
    if (!documentRef || !windowRef || !BlobRef) return;
    const buttons = documentRef.querySelectorAll(BUTTON_SELECTOR);
    for (const button of buttons) {
      if (button.dataset.pdfBound === '1') continue;
      button.dataset.pdfBound = '1';
      button.addEventListener('click', (event) => {
        event.preventDefault();
        handlePdfButtonClick(event, { documentRef, windowRef, BlobRef });
      });
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      attachPdfButtons,
      buildDownloadFilename,
      buildPdfBytes,
      collectPageData
    };
  }

  if (globalScope?.document) {
    if (globalScope.document.readyState === 'loading') {
      globalScope.document.addEventListener('DOMContentLoaded', () => attachPdfButtons());
    } else {
      attachPdfButtons();
    }
  }
}(typeof window !== 'undefined' ? window : null));
