export const REFRIGERATOR_POLICY_DEFINITION_V4 = Object.freeze({
  category: 'refrigerator',
  recognizedFormFactors: Object.freeze(['upright', 'chest', 'built_in', 'integrated', 'under_bench']),
  supportedInstallationModes: Object.freeze(['freestanding', 'recessed', 'integrated', 'flush', 'proud']),
  selectorDomains: Object.freeze([
    'installationMode', 'hingeSide', 'panelMode', 'waterMode', 'powerMode', 'deliverySelected',
  ]),
  advisories: Object.freeze([
    Object.freeze({
      id: 'refrigerator-measure-door-and-removal-path',
      messageCode: 'MEASURE_OPERATION_AND_COMPONENT_REMOVAL_PATH',
      affectsOutcome: false,
    }),
  ]),
});
