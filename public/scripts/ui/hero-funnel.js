export function parseHeroSamplePayload(raw) {
  try {
    const parsed = JSON.parse(String(raw ?? '{}'));
    return {
      cat: String(parsed.cat ?? ''),
      w: Number(parsed.w),
      h: Number(parsed.h),
      d: Number(parsed.d),
    };
  } catch {
    return null;
  }
}

export async function applyHeroSampleSearch(button, {
  root = document,
  setCategory = async () => {},
  search = () => {},
  scrollTarget = () => root.getElementById?.('resultsSection'),
  delayMs = 300,
} = {}) {
  const sample = parseHeroSamplePayload(button?.dataset?.sampleSearch);
  if (!sample || !sample.w || !sample.h || !sample.d) return false;

  await setCategory(sample.cat);
  root.getElementById('inW').value = String(sample.w);
  root.getElementById('inH').value = String(sample.h);
  root.getElementById('inD').value = String(sample.d);
  search();

  setTimeout(() => {
    scrollTarget()?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, delayMs);
  return true;
}

export function bindHeroSampleSearches(root = document, options = {}) {
  root.querySelectorAll('[data-sample-search]').forEach((button) => {
    button.addEventListener('click', () => applyHeroSampleSearch(button, { root, ...options }));
  });
}
