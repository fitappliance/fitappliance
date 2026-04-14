'use strict';

const { validateProduct } = require('../schema.js');

class CircuitBreakerError extends Error {
  constructor(code, message) {
    super(`[circuit-breaker:${code}] ${message}`);
    this.code = code;
  }
}

const REQUIRED_FIELDS = ['id', 'cat', 'brand', 'model', 'w', 'h', 'd', 'kwh_year', 'stars'];

function runCircuitBreaker(newProducts, existingProducts, deps = {}) {
  const validateProductFn = deps.validateProductFn ?? validateProduct;

  if (newProducts.length > 0) {
    const sampleKeys = Object.keys(newProducts[0]);
    const missingFields = REQUIRED_FIELDS.filter(field => !sampleKeys.includes(field));

    if (missingFields.length > 0) {
      throw new CircuitBreakerError(
        'SCHEMA_MUTATION',
        `External API response is missing required fields: [${missingFields.join(', ')}]. ` +
          'This indicates a breaking schema change upstream. Manual inspection required.'
      );
    }
  }

  if (existingProducts.length > 0) {
    const retentionRate = newProducts.length / existingProducts.length;

    if (retentionRate < 0.8) {
      throw new CircuitBreakerError(
        'DATA_LOSS',
        `New dataset has ${newProducts.length} products vs ${existingProducts.length} existing ` +
          `(retention ${(retentionRate * 100).toFixed(1)}%, threshold 80%). ` +
          'Possible cause: empty API response or upstream data purge.'
      );
    }
  }

  if (newProducts.length > 0) {
    const anomalousProducts = newProducts.filter(product => validateProductFn(product).length > 0);
    const anomalyRate = anomalousProducts.length / newProducts.length;

    if (anomalyRate > 0.3) {
      throw new CircuitBreakerError(
        'HIGH_ANOMALY_RATE',
        `${anomalousProducts.length}/${newProducts.length} products (${(anomalyRate * 100).toFixed(1)}%) ` +
          'have out-of-range fields, exceeding 30% threshold. ' +
          `First anomalous record: ${JSON.stringify(anomalousProducts[0])}`
      );
    }
  }
}

function runCircuitBreakerOrExit(newProducts, existingProducts, options = {}) {
  const exitFn = options.exitFn ?? process.exit;
  const logger = options.logger ?? console;

  try {
    runCircuitBreaker(newProducts, existingProducts, options);
  } catch (error) {
    if (error instanceof CircuitBreakerError) {
      logger.error(error.message);
      exitFn(1);
      return;
    }
    throw error;
  }
}

module.exports = {
  CircuitBreakerError,
  runCircuitBreaker,
  runCircuitBreakerOrExit
};
