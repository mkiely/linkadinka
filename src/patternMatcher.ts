import type { Override } from './types';

/**
 * Test whether a given URL matches a saved override's pattern.
 */
export function matchesPattern(testUrl: string, override: Override): boolean {
  const { sourceUrl, pattern } = override;
  const trimmedTest = testUrl.trim();

  // Case 1: source URL is entirely a handlebars token  e.g. {{myUrl}}
  const fullHbs = sourceUrl.trim().match(/^\{\{([^}]+)\}\}$/);
  if (fullHbs) {
    const seg = pattern.segments[0];
    if (!seg || seg.isWildcard) return true; // wildcard = matches any URL
    return trimmedTest === seg.value;
  }

  // Parse the test URL
  let parsedTest: URL;
  try {
    parsedTest = new URL(trimmedTest);
  } catch {
    return false;
  }

  // Replace handlebars tokens in the source URL with numbered placeholders
  // so we can parse it as a real URL.  Track token names in order.
  const tokenOrder: string[] = [];
  let counter = 0;
  const normalizedSource = sourceUrl.replace(/\{\{([^}]+)\}\}/g, (_, token) => {
    tokenOrder.push(token as string);
    return `HBSTOK${counter++}`;
  });

  let parsedSource: URL;
  try {
    parsedSource = new URL(normalizedSource);
  } catch {
    return false;
  }

  // Protocol + host + port must match
  if (parsedTest.protocol !== parsedSource.protocol) return false;
  if (parsedTest.hostname !== parsedSource.hostname) return false;
  if (parsedTest.port !== parsedSource.port) return false;

  // --- Path matching ---
  const srcParts = parsedSource.pathname.split('/');
  const tstParts = parsedTest.pathname.split('/');
  if (srcParts.length !== tstParts.length) return false;

  let pathHbsIdx = 0;
  for (let i = 0; i < srcParts.length; i++) {
    const srcSeg = decodeURIComponent(srcParts[i]);
    const tstSeg = decodeURIComponent(tstParts[i]);

    if (/^HBSTOK\d+$/.test(srcSeg)) {
      const tokenName = tokenOrder[pathHbsIdx++];
      const seg = pattern.segments.find(s => s.kind === 'handlebars' && s.label === tokenName);
      if (seg && !seg.isWildcard) {
        if (tstSeg !== seg.value) return false;
      }
      // wildcard path segment — any value matches
    } else {
      if (srcSeg !== tstSeg) return false;
    }
  }

  // --- Query param matching ---
  // For each param in the SOURCE template, enforce the pattern setting.
  for (const [key, srcValue] of parsedSource.searchParams.entries()) {
    const seg = pattern.segments.find(s => s.kind === 'queryParam' && s.label === key);
    const testValue = parsedTest.searchParams.get(key);

    if (/^HBSTOK\d+$/.test(srcValue)) {
      // This was a handlebars param in the source template
      if (!parsedTest.searchParams.has(key)) return false; // param must exist
      if (seg && !seg.isWildcard && testValue !== seg.value) return false;
    } else {
      // Static param in source template — seg might have overridden the match value
      if (!parsedTest.searchParams.has(key)) return false;
      if (seg) {
        if (!seg.isWildcard && testValue !== seg.value) return false;
      } else {
        // No segment config — match the original static value
        if (testValue !== srcValue) return false;
      }
    }
  }

  return true;
}

/**
 * Return all overrides whose pattern matches the given test URL.
 */
export function findMatchingOverrides(testUrl: string, overrides: Override[]): Override[] {
  return overrides.filter(o => matchesPattern(testUrl, o));
}
