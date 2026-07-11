#!/usr/bin/env node
'use strict';

const { copyFileSync, mkdirSync } = require('node:fs');
const path = require('node:path');

const source = path.join(path.dirname(require.resolve('web-vitals/attribution')), 'web-vitals.attribution.js');
const destination = path.resolve(__dirname, '../public/scripts/vendor/web-vitals.js');

mkdirSync(path.dirname(destination), { recursive: true });
copyFileSync(source, destination);
console.log(`[vendor-web-vitals] wrote ${destination}`);
