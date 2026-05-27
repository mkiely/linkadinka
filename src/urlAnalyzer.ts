import type { UrlSegment } from './types';

/**
 * Decompose a URL template into its configurable dynamic segments.
 * Returns segments for: path handlebars tokens + all query params.
 * Static path/host/protocol parts are not returned (they always match literally).
 */
export function analyzeUrl(rawUrl: string): UrlSegment[] {
  const trimmed = rawUrl.trim();

  // Case 1: entire URL is a handlebars token e.g. {{myUrl}}
  const fullHbs = trimmed.match(/^\{\{([^}]+)\}\}$/);
  if (fullHbs) {
    return [{
      kind: 'handlebars',
      label: fullHbs[1],
      isWildcard: true,
      value: '',
    }];
  }

  const segments: UrlSegment[] = [];

  // Extract handlebars tokens from path (before the query string)
  const [pathPart] = trimmed.split('?');
  const pathHbsRe = /\{\{([^}]+)\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = pathHbsRe.exec(pathPart)) !== null) {
    segments.push({
      kind: 'handlebars',
      label: m[1],
      isWildcard: true,
      value: '',
    });
  }

  // Extract query params — replace handlebars with placeholder so URL parses cleanly
  const PLACEHOLDER_PREFIX = 'HBSANALYZERTOK';
  let counter = 0;
  const tokenMap = new Map<string, string>(); // placeholder → original token

  const normalized = trimmed.replace(/\{\{([^}]+)\}\}/g, (_, token) => {
    const ph = `${PLACEHOLDER_PREFIX}${counter++}`;
    tokenMap.set(ph, token);
    return ph;
  });

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    // Not a parseable URL even after normalization — return what we have
    return segments;
  }

  for (const [key, value] of parsed.searchParams.entries()) {
    const originalValue = tokenMap.get(value) != null
      ? `{{${tokenMap.get(value)}}}`
      : value;
    const isHbs = /^\{\{[^}]+\}\}$/.test(originalValue);

    segments.push({
      kind: 'queryParam',
      label: key,
      isWildcard: isHbs, // default: handlebars params start as wildcard
      value: isHbs ? '' : originalValue,
    });
  }

  return segments;
}

/**
 * Build a human-readable summary of the pattern for display in the overrides table.
 * Substitutes segment settings back into the URL template.
 */
export function buildPatternSummary(sourceUrl: string, segments: UrlSegment[]): string {
  const trimmed = sourceUrl.trim();

  if (/^\{\{[^}]+\}\}$/.test(trimmed)) {
    const seg = segments[0];
    if (!seg || seg.isWildcard) return '[any URL]';
    return seg.value || '[any URL]';
  }

  let summary = trimmed;

  // Replace path handlebars
  segments
    .filter(s => s.kind === 'handlebars')
    .forEach(seg => {
      const token = `{{${seg.label}}}`;
      summary = summary.replace(token, seg.isWildcard ? `*` : (seg.value || `*`));
    });

  // Replace query param values
  segments
    .filter(s => s.kind === 'queryParam')
    .forEach(seg => {
      // Replace the value after key= (handles {{token}} or literal values)
      const escapedKey = seg.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      summary = summary.replace(
        new RegExp(`(${escapedKey}=)[^&]*`),
        `$1${seg.isWildcard ? '*' : (seg.value || '*')}`,
      );
    });

  return summary;
}
