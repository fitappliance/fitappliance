export function initSearchWizard() {
  if (typeof window === 'undefined') return;
  if (window.FitChecker && typeof window.FitChecker.initFitChecker === 'function') {
    window.FitChecker.initFitChecker();
  }
}
