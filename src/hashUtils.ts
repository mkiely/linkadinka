/**
 * djb2 hash — pure synchronous JS, 8-char hex output.
 * Fast enough for real-time UI use; no async needed.
 */
export function djb2(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    // hash * 33 XOR charCode, kept as unsigned 32-bit
    hash = (((hash << 5) + hash) ^ str.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Normalize a URL or pattern summary into a canonical string for hashing.
 *
 * Rules applied:
 *  - Lowercase protocol and host
 *  - Sort query params alphabetically (key then value)
 *  - Remove trailing slash from path unless path is exactly "/"
 *  - Wildcard tokens ("*") are preserved as-is (they appear in pattern summaries)
 *
 * Falls back gracefully if the input is not a parseable URL (e.g. a pattern summary
 * with wildcards like "https://example.com/products/{star}/detail").
 */
export function normalizeUrlForHash(url: string): string {
  const trimmed = url.trim();

  // Try to parse as a real URL (wildcards may prevent this)
  try {
    // Replace "*" placeholders temporarily so URL() can parse it
    const WILD = '__WILDCARD__';
    const withPlaceholder = trimmed.replace(/\*/g, WILD);
    const parsed = new URL(withPlaceholder);

    // Sort query params
    const sortedParams = [...parsed.searchParams.entries()]
      .sort(([a], [b]) => a.localeCompare(b));
    parsed.search = '';
    sortedParams.forEach(([k, v]) => parsed.searchParams.append(k, v));

    // Normalize path: strip trailing slash unless root
    let path = parsed.pathname;
    if (path.length > 1 && path.endsWith('/')) {
      path = path.slice(0, -1);
    }

    // Rebuild canonical string (lowercase origin + normalized path + sorted params)
    const origin = `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}`.toLowerCase();
    const search = parsed.search;

    const canonical = `${origin}${path}${search}`;
    // Restore wildcard tokens
    return canonical.replace(new RegExp(WILD, 'g'), '*');
  } catch {
    // Not parseable — normalize what we can (lowercase, trim)
    return trimmed.toLowerCase();
  }
}

/**
 * Compute the hash of an override's pattern summary.
 * This is the value stored as the DynamoDB sort key.
 */
export function computeMatcherHash(patternSummary: string): string {
  return djb2(normalizeUrlForHash(patternSummary));
}

/**
 * Compute the hash of an incoming URL for exact-match fast-path comparison.
 * If this matches an override's matcherHash (and that override has no wildcards),
 * the match is confirmed without any pattern evaluation.
 */
export function computeUrlHash(rawUrl: string): string {
  return djb2(normalizeUrlForHash(rawUrl));
}
