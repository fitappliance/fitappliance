import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const engine = require('../shared/fit-engine.js');

export const evaluateFit = engine.evaluateFit;
