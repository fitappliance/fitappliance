import {
  requireV3Semantics,
  V3SemanticsValidationError,
} from './semantics.mjs';

const WITNESS_APPLICABILITY = new Set(['conditional', 'unconditional']);

export class V3EngineeringContextValidationError extends TypeError {
  constructor(code, message) {
    super(message);
    this.name = 'V3EngineeringContextValidationError';
    this.code = code;
  }
}

function invalid(code, message) {
  throw new V3EngineeringContextValidationError(code, message);
}

function plainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    invalid('INVALID_OBJECT', `${label} must be a plain object`);
  }
  return value;
}

function exactKeys(value, label, required, optional = []) {
  plainObject(value, label);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) invalid('UNKNOWN_KEY', `${label} unknown key: ${key}`);
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) invalid('MISSING_KEY', `${label} missing key: ${key}`);
  }
  return value;
}

function requiredText(value, label) {
  if (typeof value !== 'string' || value.trim() === '') invalid('INVALID_TEXT', `${label} required`);
  return value.trim();
}

function sameConditions(left, right) {
  return left.length === right.length && left.every((condition, index) => (
    condition.parameter === right[index].parameter
      && condition.operator === right[index].operator
      && condition.value === right[index].value
  ));
}

function includesRequiredConditions(conditions, requiredConditions) {
  const values = new Map(conditions.map((condition) => [condition.parameter, condition.value]));
  return requiredConditions.every((condition) => values.get(condition.parameter) === condition.value);
}

function normalizedConditions(rawConditions, contextPolicy, label) {
  if (!Array.isArray(rawConditions)) invalid('CONDITIONS', `${label} conditions must be an array`);
  const normalized = [];
  const valuesByParameter = new Map();
  for (const rawCondition of rawConditions) {
    exactKeys(rawCondition, `${label} condition`, ['parameter', 'operator', 'value']);
    const parameter = requiredText(rawCondition.parameter, `${label} condition parameter`);
    if (rawCondition.operator !== 'eq') {
      invalid('CONDITION_OPERATOR', `${label} conditions support eq only`);
    }
    const parameterPolicy = contextPolicy.parameters[parameter];
    if (!parameterPolicy || parameterPolicy.type !== 'string'
      || !Array.isArray(parameterPolicy.values)
      || typeof rawCondition.value !== 'string'
      || !parameterPolicy.values.includes(rawCondition.value)) {
      invalid('CONDITION_VALUE', `${label} condition is not allowlisted: ${parameter}`);
    }
    const prior = valuesByParameter.get(parameter);
    if (prior !== undefined && prior !== rawCondition.value) {
      invalid('CONTRADICTORY_CONDITIONS', `${label} has contradictory ${parameter} conditions`);
    }
    if (prior !== undefined) invalid('DUPLICATE_CONDITION', `${label} repeats ${parameter}`);
    valuesByParameter.set(parameter, rawCondition.value);
    normalized.push({ parameter, operator: 'eq', value: rawCondition.value });
  }
  return normalized.sort((left, right) => (
    left.parameter < right.parameter ? -1 : left.parameter > right.parameter ? 1 : 0
  ));
}

function normalizedConfiguration(configurationKey, conditions, contextPolicy, label) {
  if (configurationKey === null) return { configurationKey: null, conditions };
  const key = requiredText(configurationKey, `${label} configurationKey`);
  if (key === 'unconditional' && conditions.length !== 0) {
    invalid('CONFIGURATION_CONDITIONS', `${label} unconditional configuration cannot have conditions`);
  }
  const expectedRawConditions = contextPolicy.configurationConditions[key];
  if (!expectedRawConditions) invalid('CONFIGURATION_KEY', `${label} configuration key unsupported`);
  const expectedConditions = normalizedConditions(
    expectedRawConditions,
    contextPolicy,
    `${label} configuration key`,
  );
  if (!includesRequiredConditions(conditions, expectedConditions)) {
    invalid('CONFIGURATION_CONDITIONS', `${label} conditions omit a configuration key predicate`);
  }
  return { configurationKey: key, conditions };
}

function normalizedOperatingState(rawOperatingState, contextPolicy, label) {
  exactKeys(rawOperatingState, `${label} operatingState`, ['kind', 'angleDegrees']);
  const kind = requiredText(rawOperatingState.kind, `${label} operating state`);
  const statePolicy = contextPolicy.operatingStates[kind];
  if (!statePolicy) invalid('OPERATING_STATE', `${label} operating state unsupported`);
  const angleDegrees = rawOperatingState.angleDegrees;
  if (statePolicy.angleDegrees === 'required') {
    if (typeof angleDegrees !== 'number' || !Number.isFinite(angleDegrees)
      || angleDegrees < 0 || angleDegrees > 360) {
      invalid('OPERATING_ANGLE', `${label} operating state requires a finite 0-360 degree angle`);
    }
  } else if (statePolicy.angleDegrees === 'forbidden') {
    if (angleDegrees !== null) invalid('OPERATING_ANGLE', `${label} operating state forbids an angle`);
  } else {
    invalid('OPERATING_STATE', `${label} operating state policy invalid`);
  }
  return { kind, angleDegrees };
}

function freezeContext(context) {
  const conditions = Object.freeze(context.conditions.map((condition) => Object.freeze(condition)));
  const operatingState = Object.freeze(context.operatingState);
  return Object.freeze({ ...context, conditions, operatingState });
}

function assertOpeningStateConsistency(conditions, operatingState, label) {
  const openingState = conditions.find((condition) => condition.parameter === 'openingState');
  if (openingState && openingState.value !== operatingState.kind) {
    invalid('OPERATING_STATE', `${label} openingState must match operatingState.kind`);
  }
}

function normalizeContextWithPolicy(rawContext, contextPolicy, label) {
  exactKeys(rawContext, label, [
    'configurationKey', 'conditions', 'referenceDatum', 'operatingState',
  ]);
  const conditions = normalizedConditions(rawContext.conditions, contextPolicy, label);
  const configuration = normalizedConfiguration(
    rawContext.configurationKey,
    conditions,
    contextPolicy,
    label,
  );
  const referenceDatum = requiredText(rawContext.referenceDatum, `${label} reference datum`);
  if (!contextPolicy.referenceDatums.includes(referenceDatum)) {
    invalid('REFERENCE_DATUM', `${label} reference datum unsupported`);
  }
  const operatingState = normalizedOperatingState(rawContext.operatingState, contextPolicy, label);
  assertOpeningStateConsistency(conditions, operatingState, label);
  return freezeContext({
    ...configuration,
    referenceDatum,
    operatingState,
  });
}

function normalizeProduct(rawProduct) {
  exactKeys(rawProduct, 'evaluation product', ['canonicalProductId', 'market']);
  return Object.freeze({
    canonicalProductId: requiredText(rawProduct.canonicalProductId, 'evaluation product canonicalProductId'),
    market: requiredText(rawProduct.market, 'evaluation product market'),
  });
}

function normalizeWitness(rawWitness, contextPolicy) {
  exactKeys(rawWitness, 'configuration witness', [
    'canonicalProductId', 'market', 'configurationKey', 'conditions', 'applicability', 'membership',
  ]);
  if (rawWitness.membership !== 'exact_product_market') {
    invalid('WITNESS_MEMBERSHIP', 'configuration witness must have exact product-market membership');
  }
  if (!WITNESS_APPLICABILITY.has(rawWitness.applicability)) {
    invalid('WITNESS_APPLICABILITY', 'configuration witness applicability unsupported');
  }
  const conditions = normalizedConditions(rawWitness.conditions, contextPolicy, 'configuration witness');
  const configuration = normalizedConfiguration(
    rawWitness.configurationKey,
    conditions,
    contextPolicy,
    'configuration witness',
  );
  if (configuration.configurationKey === null) {
    invalid('WITNESS_CONFIGURATION', 'configuration witness must name a configuration key');
  }
  const unconditional = configuration.configurationKey === 'unconditional';
  if ((unconditional && rawWitness.applicability !== 'unconditional')
    || (!unconditional && rawWitness.applicability !== 'conditional')) {
    invalid('WITNESS_APPLICABILITY', 'configuration witness applicability does not match its key');
  }
  return Object.freeze({
    canonicalProductId: requiredText(rawWitness.canonicalProductId, 'configuration witness canonicalProductId'),
    market: requiredText(rawWitness.market, 'configuration witness market'),
    ...configuration,
    applicability: rawWitness.applicability,
    membership: rawWitness.membership,
  });
}

function candidatePredicateStatus(candidateConditions, requestedConditions) {
  const requestedValues = new Map(
    requestedConditions.map((condition) => [condition.parameter, condition.value]),
  );
  let missing = false;
  for (const condition of candidateConditions) {
    if (!requestedValues.has(condition.parameter)) {
      missing = true;
    } else if (requestedValues.get(condition.parameter) !== condition.value) {
      return 'inapplicable';
    }
  }
  return missing ? 'unknown' : 'applicable';
}

function compatibleContext(candidateContext, requestedContext) {
  let unknown = false;
  const predicateStatus = candidatePredicateStatus(
    candidateContext.conditions,
    requestedContext.conditions,
  );
  if (predicateStatus === 'inapplicable') return 'inapplicable';
  if (predicateStatus === 'unknown') unknown = true;
  if (candidateContext.configurationKey === null || requestedContext.configurationKey === null) {
    unknown = true;
  } else if (candidateContext.configurationKey !== 'unconditional'
    && candidateContext.configurationKey !== requestedContext.configurationKey) {
    unknown = true;
  }
  if (candidateContext.referenceDatum === 'unknown' || requestedContext.referenceDatum === 'unknown') {
    unknown = true;
  } else if (candidateContext.referenceDatum !== requestedContext.referenceDatum) {
    unknown = true;
  }
  const candidateState = candidateContext.operatingState;
  const requestedState = requestedContext.operatingState;
  if (candidateState.kind === 'unknown' || requestedState.kind === 'unknown') {
    unknown = true;
  } else if (candidateState.kind !== requestedState.kind
    || candidateState.angleDegrees !== requestedState.angleDegrees) {
    return 'inapplicable';
  }
  return unknown ? 'unknown' : 'applicable';
}

function witnessedForProductAndContext(witness, product, context) {
  return witness.canonicalProductId === product.canonicalProductId
    && witness.market === product.market
    && witness.configurationKey === context.configurationKey
    && sameConditions(witness.conditions, context.conditions);
}

/**
 * Validates one closed engineering context and its structured configuration assertions.
 */
function validatedEngineeringContext(input) {
  exactKeys(input, 'engineering context validation input', [
    'context', 'semantics', 'witnessedConditions',
  ], ['product']);
  const semanticPolicy = requireV3Semantics(input.semantics);
  if (!Array.isArray(input.witnessedConditions)) {
    invalid('WITNESS_COLLECTION', 'witnessedConditions must be an array');
  }
  const context = normalizeContextWithPolicy(input.context, semanticPolicy.context, 'engineering context');
  const witnessedConditions = Object.freeze(input.witnessedConditions.map((witness) => (
    normalizeWitness(witness, semanticPolicy.context)
  )));
  if (Object.hasOwn(input, 'product')) {
    const product = normalizeProduct(input.product);
    if (context.configurationKey !== null && !witnessedConditions.some((witness) => (
      witnessedForProductAndContext(witness, product, context)
    ))) {
      invalid('CONFIGURATION_WITNESS', 'named engineering context requires an exact product-market configuration witness');
    }
  }
  return Object.freeze({ context, witnessedConditions });
}

/** Optional product binds named configurations structurally; it does not assert applicability. */
export function validateEngineeringContext(input) {
  return validatedEngineeringContext(input).context;
}

/**
 * Resolves applicability only when the product-market configuration has an exact witness.
 */
export function resolveEvaluationContext(input) {
  try {
    exactKeys(input, 'evaluation context input', [
      'candidateContext', 'requestedContext', 'product', 'witnessedConditions', 'semantics',
    ]);
    const validatedCandidate = validatedEngineeringContext({
      context: input.candidateContext,
      semantics: input.semantics,
      witnessedConditions: input.witnessedConditions,
    });
    const semanticPolicy = requireV3Semantics(input.semantics);
    const candidateContext = validatedCandidate.context;
    const requestedContext = normalizeContextWithPolicy(
      input.requestedContext,
      semanticPolicy.context,
      'requested context',
    );
    const product = normalizeProduct(input.product);
    const witnesses = validatedCandidate.witnessedConditions;
    if (!witnesses.some((witness) => (
      witnessedForProductAndContext(witness, product, candidateContext)
    ))) {
      return 'unknown';
    }
    const contextStatus = compatibleContext(candidateContext, requestedContext);
    if (contextStatus !== 'applicable') return contextStatus;
    return 'applicable';
  } catch (error) {
    if (error instanceof V3EngineeringContextValidationError
      || error instanceof V3SemanticsValidationError) {
      return 'invalid';
    }
    throw error;
  }
}
