'use strict';

const { rename, writeFile } = require('node:fs/promises');

async function writeJsonAtomically(filePath, document) {
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tempPath, `${JSON.stringify(document, null, 2)}\n`);
  await rename(tempPath, filePath);
}

module.exports = {
  writeJsonAtomically
};
