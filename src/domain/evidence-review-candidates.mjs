function uniqueSorted(values) {
  return [...new Set(values)].sort((left, right) => left - right);
}

function exactModelPattern(model) {
  const characters = String(model ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').split('');
  if (!characters.length) throw new TypeError('model required');
  const body = characters.map((character) => character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^A-Z0-9]*');
  return new RegExp(`(^|[^A-Z0-9])${body}([^A-Z0-9]|$)`, 'i');
}

const DIMENSION_PATTERN = /\b(dimensions?|measurements?|overall\s+size|net\s+size|product\s+size|appliance\s+size|width|height|depth|w\s*[x×*]\s*h\s*[x×*]\s*d|h\s*[x×*]\s*w\s*[x×*]\s*d)\b/i;
const SPACE_PATTERN = /\b(clearances?|ventilation|air\s+space|minimum\s+space|installation\s+(?:space|dimensions?)|cavity|door\s+(?:open|opened|opening)|depth\s+with\s+door|lid\s+open|behind\s+(?:the\s+)?appliance|at\s+the\s+sides?|rear\s+(?:space|clearance|service))\b/i;

export function findEvidenceReviewCandidates({ model, text }) {
  const pages = String(text ?? '').split('\f');
  const identityPattern = exactModelPattern(model);
  const identityPages = [];
  const dimensionPages = [];
  const spacePages = [];
  const snippets = [];
  pages.forEach((page, index) => {
    const pageNumber = index + 1;
    if (identityPattern.test(page)) identityPages.push(pageNumber);
    if (DIMENSION_PATTERN.test(page)) dimensionPages.push(pageNumber);
    if (SPACE_PATTERN.test(page)) spacePages.push(pageNumber);
    const relevantLines = page.split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && (identityPattern.test(line) || DIMENSION_PATTERN.test(line) || SPACE_PATTERN.test(line)))
      .slice(0, 20);
    if (relevantLines.length) snippets.push({ page: pageNumber, lines: relevantLines });
  });
  return Object.freeze({
    identityPages: uniqueSorted(identityPages),
    dimensionPages: uniqueSorted(dimensionPages),
    spacePages: uniqueSorted(spacePages),
    reviewPages: uniqueSorted([...identityPages, ...dimensionPages, ...spacePages]),
    snippets,
  });
}
