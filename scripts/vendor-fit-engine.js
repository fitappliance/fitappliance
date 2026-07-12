'use strict';

const { copyFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
copyFileSync(
  join(root, 'src', 'shared', 'fit-engine.js'),
  join(root, 'public', 'scripts', 'fit-engine.js')
);
