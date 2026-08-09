export const WASHING_MACHINE_POLICY_DEFINITION_V4 = Object.freeze({
  category: 'washing_machine',
  recognizedFormFactors: Object.freeze([
    'front_loader', 'top_loader', 'washer_dryer_combo', 'built_in', 'integrated', 'under_bench',
  ]),
  supportedInstallationModes: Object.freeze(['freestanding', 'recessed', 'under_bench', 'stacked', 'side_by_side']),
  selectorDomains: Object.freeze([
    'installationMode', 'hingeSide', 'waterMode', 'drainMode', 'powerMode', 'deliverySelected',
  ]),
  advisories: Object.freeze([
    Object.freeze({
      id: 'washing-machine-confirm-transit-bolts-and-route',
      messageCode: 'CONFIRM_TRANSIT_BOLTS_AND_DRAIN_ROUTE',
      affectsOutcome: false,
    }),
  ]),
});
