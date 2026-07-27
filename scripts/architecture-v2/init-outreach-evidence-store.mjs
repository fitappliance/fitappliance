#!/usr/bin/env node

import { initializePrivateOutreachStore } from '../../src/domain/outreach-evidence-store.mjs';

const args = process.argv.slice(2);
const rootIndex = args.indexOf('--storage-root');
const storageRoot = rootIndex >= 0 ? args[rootIndex + 1] : process.env.FITAPPLIANCE_STORAGE_ROOT;
const result = await initializePrivateOutreachStore(storageRoot);

process.stdout.write(`${JSON.stringify({
  rootEnv: 'FITAPPLIANCE_STORAGE_ROOT',
  relativeRoot: 'outreach',
  directories: result.directories,
})}\n`);
