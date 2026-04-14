const DAY_MS = 86_400_000;

function parseLocalMidnight(dateText) {
  if (typeof dateText !== 'string') return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(year, monthIndex, day);

  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== monthIndex ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
}

/**
 * Render stale-data banner using local-midnight date comparison.
 * @param {string} lastUpdated - ISO-like date string, e.g. "2026-04-14".
 */
export function renderFreshnessBanner(lastUpdated) {
  const banner = document.getElementById('freshness-banner');
  if (!banner) return;

  const updatedAt = parseLocalMidnight(lastUpdated);
  if (!updatedAt) {
    banner.hidden = true;
    banner.textContent = '';
    return;
  }

  const now = new Date();
  const todayLocalMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysDiff = Math.floor((todayLocalMidnight - updatedAt) / DAY_MS);

  if (daysDiff > 7) {
    banner.textContent = `⚠️ Appliance data was last updated ${daysDiff} days ago — some specifications or availability may have changed.`;
    banner.setAttribute('data-stale-days', String(daysDiff));
    banner.hidden = false;
    return;
  }

  banner.hidden = true;
  banner.textContent = '';
  banner.removeAttribute('data-stale-days');
}
