#!/usr/bin/env node
'use strict';

const { auditIndexabilityPolicy } = require('./common/indexability-policy.js');

auditIndexabilityPolicy()
  .then((result) => {
    if (!result.ok) {
      process.exitCode = 1;
    }
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
