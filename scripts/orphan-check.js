#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { mkdir, readFile, writeFile } = require('node:fs/promises');

async function checkOrphanReport({
  repoRoot = path.resolve(__dirname, '..'),
  reportPath = path.join(repoRoot, 'reports', 'link-graph.json'),
  outputPath = path.join(repoRoot, 'reports', 'orphan-check.json'),
  logger = console
} = {}) {
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  const orphanPages = Number(report?.summary?.orphanPages ?? 0);
  const details = {
    generatedAt: new Date().toISOString(),
    sourceReport: path.relative(repoRoot, reportPath).replace(/\\/g, '/'),
    orphanPages,
    averageInlinks: Number(report?.summary?.averageInlinks ?? 0),
    pass: orphanPages === 0
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(details, null, 2)}\n`, 'utf8');

  logger.log(`[orphan-check] orphanPages=${orphanPages} output=${outputPath}`);
  return {
    ...details,
    exitCode: orphanPages === 0 ? 0 : 1
  };
}

if (require.main === module) {
  checkOrphanReport()
    .then((result) => {
      if (result.exitCode !== 0) process.exitCode = result.exitCode;
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

module.exports = {
  checkOrphanReport
};
