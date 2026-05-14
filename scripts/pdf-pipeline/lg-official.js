const SUPPORT_API_URL = 'https://www.lg.com/ncms/asia/api/v1/support/proxy/retrieveManualSoftwareList?locale=AU';
const DOWNLOAD_BASE_URL = 'https://gscs-b2c.lge.com/open/downloadFile?fileId=';

function normalizeSku(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
}

function normalizeLookupSku(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\/(?:AU|SA)$/i, '')
    .replace(/[^A-Z0-9-]+/g, '');
}

function collectPotentialLookupText(target = {}) {
  return [
    target.sku,
    target.model,
    target.product?.model,
    target.product?.sku,
    target.product?.displayName,
    target.product?.title,
    target.product?.slug,
    target.product?.discovery?.product_url,
    target.discovery?.product_url,
    target.discovery?.source_discovery_url
  ].filter(Boolean).join(' ');
}

function extractLookupSkusFromText(text) {
  const source = String(text || '').toUpperCase();
  const matches = [...source.matchAll(/\b(?:WWT|WXT|WK|WXLC|WXLS|WXL|WXC|WV|WTX|WTL|WTG|WTR|WTS|WD|DVH|DXH|XD|GF|GT|GB|GS|R)[A-Z0-9-]*\d[A-Z0-9-]*\b/g)]
    .map((match) => normalizeLookupSku(match[0]))
    .filter((sku) => sku.length >= 5);
  return matches;
}

function buildLookupCandidates(target = {}) {
  const original = normalizeLookupSku(target.sku || target.model || target.product?.model);
  const candidates = [
    original,
    ...extractLookupSkusFromText(collectPotentialLookupText(target))
  ].filter(Boolean);
  return [...new Set(candidates)];
}

function buildLgDownloadUrl(fileId) {
  const id = String(fileId || '').trim();
  if (!id) return '';
  return `${DOWNLOAD_BASE_URL}${encodeURIComponent(id)}`;
}

function getManualRows(payload = {}) {
  const manualList = payload.retrieveManualSoftwareList?.manualList || {};
  return [
    ...(Array.isArray(manualList.manualList) ? manualList.manualList : []),
    ...(Array.isArray(manualList.manualAllList) ? manualList.manualAllList : [])
  ];
}

function scoreManualRow(row = {}) {
  if (String(row.fileType || '').toUpperCase() !== 'PDF') return -1;
  if (!row.fileName) return -1;
  let score = 0;
  const haystack = [
    row.manualType,
    row.MANUAL_CODE,
    row.originalFileName,
    row.fileNamePrint
  ].join(' ');
  if (/owner/i.test(haystack)) score += 5;
  if (/manual/i.test(haystack)) score += 4;
  if (/OM|OWM/i.test(haystack)) score += 3;
  if (/english/i.test(haystack)) score += 2;
  if (/web\.pdf|\.pdf$/i.test(row.originalFileName || '')) score += 1;
  return score;
}

function selectBestManualRow(rows = []) {
  return rows
    .map((row, index) => ({ row, index, score: scoreManualRow(row) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)[0]?.row || null;
}

async function findLgOfficialPdf(target = {}, {
  fetchImpl = globalThis.fetch,
  endpoint = SUPPORT_API_URL
} = {}) {
  const lookupCandidates = buildLookupCandidates(target);
  if (!lookupCandidates.length) throw new Error('LG official finder requires a SKU');
  if (!fetchImpl) throw new Error('LG official finder requires fetch');

  const attempted = [];
  for (const lookupSku of lookupCandidates) {
    attempted.push(lookupSku);
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'FitApplianceBot/1.0 (+https://www.fitappliance.com.au/about)',
        'X-Lge-LocaleCode': 'AU'
      },
      body: JSON.stringify({ csSalesCode: lookupSku })
    });
    if (!response.ok) {
      throw new Error(`LG support API failed with HTTP ${response.status}`);
    }
    const payload = await response.json();
    const row = selectBestManualRow(getManualRows(payload));
    if (!row) continue;

    return {
      sourceUrl: buildLgDownloadUrl(row.fileName),
      source: 'lg-official-support-manual',
      resourceType: row.manualType || 'Owner Manual',
      originalFileName: row.originalFileName || '',
      docId: row.docId || '',
      modelName: payload.retrieveManualSoftwareList?.modelList?.modelName || '',
      lookupSku
    };
  }

  throw new Error(`LG official PDF not found for ${attempted.join(', ')}`);
}

exports.buildLookupCandidates = buildLookupCandidates;
exports.buildLgDownloadUrl = buildLgDownloadUrl;
exports.extractLookupSkusFromText = extractLookupSkusFromText;
exports.findLgOfficialPdf = findLgOfficialPdf;
exports.getManualRows = getManualRows;
exports.normalizeLookupSku = normalizeLookupSku;
exports.normalizeSku = normalizeSku;
exports.selectBestManualRow = selectBestManualRow;
