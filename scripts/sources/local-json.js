'use strict';

const { readdir, readFile } = require('node:fs/promises');
const path = require('node:path');

async function loadSourceDocuments(sourcesDir) {
  let entries;

  try {
    entries = await readdir(sourcesDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const jsonFiles = entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
    .map(entry => entry.name)
    .sort((left, right) => left.localeCompare(right));

  const documents = [];

  for (const filename of jsonFiles) {
    const sourcePath = path.join(sourcesDir, filename);
    const sourceText = await readFile(sourcePath, 'utf8');
    const sourceDocument = JSON.parse(sourceText);

    if (!Array.isArray(sourceDocument.products)) {
      throw new Error(`Source document ${filename} must contain a products array`);
    }

    documents.push({
      filename,
      ...sourceDocument
    });
  }

  return documents;
}

module.exports = {
  loadSourceDocuments
};
