export const DISHWASHER_POLICY_DEFINITION_V4 = Object.freeze({
  category: 'dishwasher',
  recognizedFormFactors: Object.freeze(['built_in', 'freestanding', 'integrated', 'drawer', 'under_bench']),
  supportedInstallationModes: Object.freeze(['freestanding', 'under_bench', 'integrated', 'flush']),
  selectorDomains: Object.freeze([
    'installationMode', 'hingeSide', 'panelMode', 'waterMode', 'drainMode', 'powerMode', 'deliverySelected',
  ]),
  advisories: Object.freeze([
    Object.freeze({
      id: 'dishwasher-confirm-panel-and-toe-kick-selection',
      messageCode: 'CONFIRM_PANEL_AND_TOE_KICK_SELECTION',
      affectsOutcome: false,
    }),
  ]),
});
