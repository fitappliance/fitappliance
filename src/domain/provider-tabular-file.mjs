import { posix } from 'node:path';

import { parse as parseCsv } from 'csv-parse/sync';
import { unzipSync, strFromU8 } from 'fflate';
import { XMLParser } from 'fast-xml-parser';

const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 25 * 1024 * 1024;
const MAX_ARCHIVE_FILES = 1_000;
const MAX_ROWS = 20_000;
const MAX_COLUMNS = 256;
const MAX_CELL_CHARACTERS = 20_000;

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  processEntities: false,
});

function normalizeBytes(bytes) {
  if (Buffer.isBuffer(bytes)) return bytes;
  if (bytes instanceof Uint8Array) return Buffer.from(bytes);
  if (typeof bytes === 'string') return Buffer.from(bytes);
  throw new TypeError('provider response bytes are required');
}

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function assertScalar(value, label) {
  if (value === null || value === undefined) return '';
  if (!['string', 'number', 'boolean'].includes(typeof value)) {
    throw new TypeError(`${label} must be a scalar value`);
  }
  if (typeof value === 'string' && value.length > MAX_CELL_CHARACTERS) {
    throw new TypeError(`${label} exceeds the cell size limit`);
  }
  return value;
}

function assertHeaders(headers) {
  if (!Array.isArray(headers) || headers.length === 0) throw new TypeError('provider file has no header row');
  if (headers.length > MAX_COLUMNS) throw new TypeError('provider file exceeds the column limit');
  const normalized = headers.map((value, index) => {
    const header = String(assertScalar(value, `header ${index + 1}`)).trim();
    if (!header) throw new TypeError(`provider header ${index + 1} is empty`);
    return header;
  });
  if (new Set(normalized).size !== normalized.length) throw new TypeError('provider headers must be unique');
  return normalized;
}

function recordsFromMatrix(matrix, headerRow, { matchSourceRowNumber = false } = {}) {
  if (!Number.isInteger(headerRow) || headerRow < 1 || headerRow > 100) {
    throw new TypeError('provider headerRow must be an integer from 1 to 100');
  }
  const headerIndex = matchSourceRowNumber
    ? matrix.findIndex((row) => row.rowNumber === headerRow)
    : headerRow - 1;
  if (headerIndex < 0 || headerIndex >= matrix.length) throw new TypeError('provider header row is missing');
  const headers = assertHeaders(matrix[headerIndex].cells);
  const rows = [];
  const dataRows = matchSourceRowNumber
    ? matrix.filter((row) => row.rowNumber > headerRow)
    : matrix.slice(headerIndex + 1);
  for (const source of dataRows) {
    if (source.cells.length > headers.length) throw new TypeError(`provider row ${source.rowNumber} has extra columns`);
    const padded = [...source.cells, ...Array(Math.max(0, headers.length - source.cells.length)).fill('')];
    if (padded.every((value) => value === '' || value === null || value === undefined)) continue;
    rows.push({
      rowNumber: source.rowNumber,
      record: Object.fromEntries(headers.map((header, index) => [
        header,
        assertScalar(padded[index], `row ${source.rowNumber} column ${header}`),
      ])),
    });
  }
  if (rows.length > MAX_ROWS) throw new TypeError('provider file exceeds the row limit');
  return { headers, rows };
}

function parseCsvMatrix(bytes) {
  let records;
  try {
    records = parseCsv(bytes, {
      bom: true,
      columns: false,
      info: true,
      skip_empty_lines: true,
      relax_column_count: false,
      relax_quotes: false,
      trim: false,
    });
  } catch (error) {
    throw new TypeError(`provider CSV parse failed: ${error.message}`, { cause: error });
  }
  return records.map(({ record, info }, index) => ({
    rowNumber: Number.isInteger(info?.lines) ? info.lines : index + 1,
    cells: record,
  }));
}

function parseJsonRows(bytes) {
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new TypeError(`provider JSON parse failed: ${error.message}`, { cause: error });
  }
  const rows = Array.isArray(parsed) ? parsed : parsed?.rows;
  if (!Array.isArray(rows)) throw new TypeError('provider JSON must be an array or an object with a rows array');
  if (rows.length > MAX_ROWS) throw new TypeError('provider file exceeds the row limit');
  const headers = [];
  const seen = new Set();
  for (const [index, row] of rows.entries()) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new TypeError(`provider JSON row ${index + 1} must be an object`);
    }
    for (const header of Object.keys(row)) {
      if (!seen.has(header)) {
        seen.add(header);
        headers.push(header);
      }
    }
  }
  const normalizedHeaders = assertHeaders(headers);
  return {
    headers: normalizedHeaders,
    rows: rows.map((record, index) => ({
      rowNumber: index + 1,
      record: Object.fromEntries(normalizedHeaders.map((header) => [
        header,
        assertScalar(record[header] ?? '', `JSON row ${index + 1} field ${header}`),
      ])),
    })),
  };
}

function parseXml(bytes, label) {
  const xml = strFromU8(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new TypeError(`provider XLSX ${label} XML declarations are unsupported`);
  }
  try {
    return xmlParser.parse(xml);
  } catch (error) {
    throw new TypeError(`provider XLSX ${label} XML is invalid: ${error.message}`, { cause: error });
  }
}

function inspectZipCentralDirectory(bytes) {
  const endSignature = 0x06054b50;
  const centralSignature = 0x02014b50;
  const minimumOffset = Math.max(0, bytes.length - 65_557);
  let endOffset = -1;
  for (let offset = bytes.length - 22; offset >= minimumOffset; offset -= 1) {
    if (bytes.readUInt32LE(offset) === endSignature) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) throw new TypeError('provider XLSX ZIP central directory is missing');
  const disk = bytes.readUInt16LE(endOffset + 4);
  const centralDisk = bytes.readUInt16LE(endOffset + 6);
  const diskEntries = bytes.readUInt16LE(endOffset + 8);
  const totalEntries = bytes.readUInt16LE(endOffset + 10);
  const centralSize = bytes.readUInt32LE(endOffset + 12);
  const centralOffset = bytes.readUInt32LE(endOffset + 16);
  if (disk !== 0 || centralDisk !== 0 || diskEntries !== totalEntries) {
    throw new TypeError('provider XLSX split ZIP archives are unsupported');
  }
  if (totalEntries === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new TypeError('provider XLSX ZIP64 archives are unsupported');
  }
  if (totalEntries > MAX_ARCHIVE_FILES) throw new TypeError('provider XLSX exceeds the archive file limit');
  if (centralOffset + centralSize > endOffset) throw new TypeError('provider XLSX ZIP central directory is invalid');
  let cursor = centralOffset;
  let uncompressedBytes = 0;
  const names = new Set();
  for (let index = 0; index < totalEntries; index += 1) {
    if (cursor + 46 > endOffset || bytes.readUInt32LE(cursor) !== centralSignature) {
      throw new TypeError('provider XLSX ZIP central entry is invalid');
    }
    const flags = bytes.readUInt16LE(cursor + 8);
    const uncompressedSize = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const entryEnd = cursor + 46 + nameLength + extraLength + commentLength;
    if (entryEnd > endOffset) throw new TypeError('provider XLSX ZIP central entry is truncated');
    if ((flags & 0x1) !== 0) throw new TypeError('provider XLSX encrypted ZIP entries are unsupported');
    if (uncompressedSize === 0xffffffff) throw new TypeError('provider XLSX ZIP64 entries are unsupported');
    uncompressedBytes += uncompressedSize;
    if (uncompressedBytes > MAX_UNCOMPRESSED_BYTES) {
      throw new TypeError('provider XLSX exceeds the uncompressed size limit');
    }
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    const normalized = name.replaceAll('\\', '/');
    if (!name || normalized.startsWith('/') || normalized.split('/').includes('..') || normalized.includes('\0')) {
      throw new TypeError('provider XLSX contains an unsafe archive path');
    }
    if (names.has(normalized)) throw new TypeError(`provider XLSX contains a duplicate archive entry: ${normalized}`);
    names.add(normalized);
    cursor = entryEnd;
  }
  if (cursor !== centralOffset + centralSize) throw new TypeError('provider XLSX ZIP central directory size mismatch');
}

function resolveWorkbookSheet(files, sheetName) {
  const workbookBytes = files['xl/workbook.xml'];
  const relationshipBytes = files['xl/_rels/workbook.xml.rels'];
  if (!workbookBytes || !relationshipBytes) throw new TypeError('provider XLSX workbook metadata is missing');
  const workbook = parseXml(workbookBytes, 'workbook');
  const relationships = parseXml(relationshipBytes, 'relationships');
  const sheets = asArray(workbook?.workbook?.sheets?.sheet);
  const sheet = sheets.find((item) => item?.name === sheetName);
  if (!sheet) throw new TypeError(`provider XLSX sheet not found: ${sheetName}`);
  if (sheet.state && sheet.state !== 'visible') throw new TypeError(`provider XLSX sheet is not visible: ${sheetName}`);
  const relationship = asArray(relationships?.Relationships?.Relationship)
    .find((item) => item?.Id === sheet.id);
  if (!relationship?.Target || !/\/worksheet$/i.test(relationship.Type ?? '')) {
    throw new TypeError(`provider XLSX worksheet relationship is invalid: ${sheetName}`);
  }
  const target = relationship.Target.startsWith('/')
    ? posix.normalize(relationship.Target.slice(1))
    : posix.normalize(posix.join('xl', relationship.Target));
  if (!target.startsWith('xl/worksheets/') || target.includes('../')) {
    throw new TypeError('provider XLSX worksheet escaped the workbook');
  }
  if (!files[target]) throw new TypeError(`provider XLSX worksheet payload is missing: ${sheetName}`);
  return files[target];
}

function richTextValue(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  if (typeof value.t === 'string') return value.t;
  return asArray(value.r).map((run) => (
    typeof run === 'string' ? run : String(run?.t ?? '')
  )).join('');
}

function sharedStringsFrom(files) {
  if (!files['xl/sharedStrings.xml']) return [];
  const parsed = parseXml(files['xl/sharedStrings.xml'], 'shared strings');
  return asArray(parsed?.sst?.si).map(richTextValue);
}

function columnIndex(reference) {
  const match = /^([A-Z]+)[1-9][0-9]*$/i.exec(reference ?? '');
  if (!match) throw new TypeError(`provider XLSX cell reference is invalid: ${reference}`);
  let result = 0;
  for (const character of match[1].toUpperCase()) result = (result * 26) + character.charCodeAt(0) - 64;
  return result - 1;
}

function xlsxCellValue(cell, sharedStrings, rowNumber) {
  const reference = cell?.r ?? `row ${rowNumber}`;
  if (Object.hasOwn(cell ?? {}, 'f')) throw new TypeError(`provider XLSX formula cells are unsupported: ${reference}`);
  const type = cell?.t ?? 'n';
  if (type === 'inlineStr') return assertScalar(richTextValue(cell.is), `XLSX cell ${reference}`);
  if (type === 's') {
    const index = Number(cell.v);
    if (!Number.isInteger(index) || index < 0 || index >= sharedStrings.length) {
      throw new TypeError(`provider XLSX shared string index is invalid: ${reference}`);
    }
    return assertScalar(sharedStrings[index], `XLSX cell ${reference}`);
  }
  if (type === 'str') return assertScalar(cell.v ?? '', `XLSX cell ${reference}`);
  if (type === 'd') return assertScalar(cell.v ?? '', `XLSX cell ${reference}`);
  if (type === 'b') return String(cell.v) === '1';
  if (type === 'e') throw new TypeError(`provider XLSX error cells are unsupported: ${reference}`);
  if (cell?.v === undefined || cell.v === '') return '';
  const numeric = Number(cell.v);
  if (!Number.isFinite(numeric)) throw new TypeError(`provider XLSX numeric cell is invalid: ${reference}`);
  return numeric;
}

function parseXlsxMatrix(bytes, sheetName) {
  if (typeof sheetName !== 'string' || sheetName.trim() === '') {
    throw new TypeError('provider XLSX sheetName is required');
  }
  inspectZipCentralDirectory(bytes);
  let files;
  try {
    files = unzipSync(new Uint8Array(bytes));
  } catch (error) {
    throw new TypeError(`provider XLSX ZIP is invalid: ${error.message}`, { cause: error });
  }
  const names = Object.keys(files);
  if (names.length > MAX_ARCHIVE_FILES) throw new TypeError('provider XLSX exceeds the archive file limit');
  if (names.some((name) => /(^|\/)vbaProject\.bin$/i.test(name))) {
    throw new TypeError('provider XLSX macro-enabled workbooks are unsupported');
  }
  if (names.some((name) => name.startsWith('xl/externalLinks/') || name.startsWith('xl/embeddings/'))) {
    throw new TypeError('provider XLSX external links and embedded objects are unsupported');
  }
  const uncompressedBytes = Object.values(files).reduce((total, value) => total + value.length, 0);
  if (uncompressedBytes > MAX_UNCOMPRESSED_BYTES) throw new TypeError('provider XLSX exceeds the uncompressed size limit');
  const worksheetBytes = resolveWorkbookSheet(files, sheetName.trim());
  const sharedStrings = sharedStringsFrom(files);
  const worksheet = parseXml(worksheetBytes, 'worksheet');
  const rows = asArray(worksheet?.worksheet?.sheetData?.row);
  if (rows.length > MAX_ROWS + 100) throw new TypeError('provider file exceeds the row limit');
  const seenRows = new Set();
  return rows.map((row, index) => {
    const rowNumber = Number(row?.r ?? index + 1);
    if (!Number.isInteger(rowNumber) || rowNumber < 1) throw new TypeError('provider XLSX row number is invalid');
    if (seenRows.has(rowNumber)) throw new TypeError(`provider XLSX row number is duplicated: ${rowNumber}`);
    seenRows.add(rowNumber);
    const cells = [];
    for (const cell of asArray(row?.c)) {
      const position = columnIndex(cell?.r);
      const cellRow = Number(/([1-9][0-9]*)$/.exec(cell?.r ?? '')?.[1]);
      if (cellRow !== rowNumber) throw new TypeError(`provider XLSX cell row does not match its row: ${cell?.r}`);
      if (position >= MAX_COLUMNS) throw new TypeError('provider XLSX exceeds the column limit');
      cells[position] = xlsxCellValue(cell, sharedStrings, rowNumber);
    }
    return { rowNumber, cells: Array.from({ length: cells.length }, (_, cellIndex) => cells[cellIndex] ?? '') };
  });
}

export function parseProviderTabularFile({ format, bytes, sheetName = null, headerRow = 1 }) {
  const payload = normalizeBytes(bytes);
  if (payload.length === 0) throw new TypeError('provider response file is empty');
  if (payload.length > MAX_SOURCE_BYTES) throw new TypeError('provider response exceeds the source size limit');
  const normalizedFormat = String(format ?? '').trim().toLowerCase();
  if (normalizedFormat === 'json') return parseJsonRows(payload);
  if (normalizedFormat === 'csv') return recordsFromMatrix(parseCsvMatrix(payload), headerRow);
  if (normalizedFormat === 'xlsx') {
    return recordsFromMatrix(parseXlsxMatrix(payload, sheetName), headerRow, { matchSourceRowNumber: true });
  }
  throw new TypeError(`unsupported provider response format: ${format}`);
}

export const PROVIDER_TABULAR_LIMITS = Object.freeze({
  maxSourceBytes: MAX_SOURCE_BYTES,
  maxUncompressedBytes: MAX_UNCOMPRESSED_BYTES,
  maxArchiveFiles: MAX_ARCHIVE_FILES,
  maxRows: MAX_ROWS,
  maxColumns: MAX_COLUMNS,
  maxCellCharacters: MAX_CELL_CHARACTERS,
});
