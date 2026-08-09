export const DRYER_POLICY_DEFINITION_V4 = Object.freeze({
  category: 'dryer',
  recognizedFormFactors: Object.freeze(['front_loader', 'built_in', 'integrated', 'under_bench']),
  supportedInstallationModes: Object.freeze(['freestanding', 'recessed', 'under_bench', 'integrated', 'stacked', 'side_by_side']),
  selectorDomains: Object.freeze([
    'installationMode', 'hingeSide', 'dryerTechnology', 'drainMode', 'powerMode', 'deliverySelected',
  ]),
  advisories: Object.freeze([
    Object.freeze({
      id: 'dryer-confirm-technology-specific-service-path',
      messageCode: 'CONFIRM_DRYER_DUCT_OR_CONDENSATE_PATH',
      affectsOutcome: false,
    }),
  ]),
});
