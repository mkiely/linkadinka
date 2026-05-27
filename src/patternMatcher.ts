import type { Override } from './types';
import { computeUrlHash } from './hashUtils';

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

// ─── Verbose Evaluation Trace ─────────────────────────────────────────────────

export interface EvalStep {
  label: string;
  result: 'match' | 'no-match' | 'skip' | 'info';
  detail: string;
  durationMs: number;
  opsCount: number;
}

export interface OverrideEvalResult {
  override: Override;
  matched: boolean;
  /** How the result was reached */
  path: 'exact-hash' | 'hash-mismatch' | 'pattern-test';
  steps: EvalStep[];
  totalMs: number;
  totalOps: number;
}

export interface EvalTrace {
  testUrl: string;
  testUrlHash: string;
  overridesEvaluated: number;
  exactHashChecks: number;
  patternTests: number;
  matchedCount: number;
  results: OverrideEvalResult[];
  totalMs: number;
  totalOps: number;
  /** Index of the first matched result (-1 if no match) */
  shortCircuitMatchIndex: number;
  /** Ops that would have been spent if evaluation stopped at the first match */
  shortCircuitOps: number;
  /** Time that would have been spent if evaluation stopped at the first match */
  shortCircuitMs: number;
}

/**
 * Evaluate all overrides against testUrl, recording every decision step
 * with individual timings and operation counts.
 *
 * No-wildcard overrides use a fast-path hash comparison (2 ops max).
 * Wildcard overrides fall through to segment-by-segment pattern testing.
 */
export function evaluateWithTrace(testUrl: string, overrides: Override[]): EvalTrace {
  const traceStart = performance.now();
  const testUrlHash = computeUrlHash(testUrl);

  let exactHashChecks = 0;
  let patternTests = 0;
  let matchedCount = 0;
  let totalOps = 0;

  const results: OverrideEvalResult[] = overrides.map(override => {
    const overrideStart = performance.now();
    const steps: EvalStep[] = [];

    if (!override.hasWildcards) {
      // ── Fast path: exact hash comparison ─────────────────────────────────
      exactHashChecks++;

      const t0 = performance.now();
      const urlHash = computeUrlHash(testUrl);
      const hashDuration = performance.now() - t0;

      steps.push({
        label: 'Compute test URL hash',
        result: 'info',
        detail: `djb2(normalize("${testUrl}")) → ${urlHash}`,
        durationMs: hashDuration,
        opsCount: 1,
      });

      const t1 = performance.now();
      const hashMatch = urlHash === override.matcherHash;
      const cmpDuration = performance.now() - t1;

      steps.push({
        label: 'Hash comparison',
        result: hashMatch ? 'match' : 'no-match',
        detail: hashMatch
          ? `${urlHash} === ${override.matcherHash} ✓`
          : `${urlHash} ≠ ${override.matcherHash}`,
        durationMs: cmpDuration,
        opsCount: 1,
      });

      const totalMs = performance.now() - overrideStart;
      const totalOpsThis = 2;
      totalOps += totalOpsThis;
      if (hashMatch) matchedCount++;

      return {
        override,
        matched: hashMatch,
        path: hashMatch ? 'exact-hash' : 'hash-mismatch',
        steps,
        totalMs,
        totalOps: totalOpsThis,
      } satisfies OverrideEvalResult;
    }

    // ── Wildcard path: segment-by-segment pattern test ────────────────────
    patternTests++;

    steps.push({
      label: 'Wildcard matcher — hash comparison not applicable',
      result: 'info',
      detail: `Matcher hash ${override.matcherHash} cannot be directly compared to URL hash ${testUrlHash}. Pattern test required.`,
      durationMs: 0,
      opsCount: 0,
    });

    const { sourceUrl, pattern } = override;
    const trimmedTest = testUrl.trim();
    let opsThis = 0;

    // Case: entire source URL is a handlebars token
    const fullHbs = sourceUrl.trim().match(/^\{\{([^}]+)\}\}$/);
    if (fullHbs) {
      const seg = pattern.segments[0];
      const t = performance.now();
      let matched: boolean;
      if (!seg || seg.isWildcard) {
        matched = true;
        steps.push({
          label: 'Full-template source — wildcard',
          result: 'match',
          detail: 'Source is entirely a wildcard token; matches any URL.',
          durationMs: performance.now() - t,
          opsCount: 1,
        });
      } else {
        matched = trimmedTest === seg.value;
        opsThis++;
        steps.push({
          label: 'Full-template source — exact value check',
          result: matched ? 'match' : 'no-match',
          detail: matched
            ? `"${trimmedTest}" === "${seg.value}" ✓`
            : `"${trimmedTest}" ≠ "${seg.value}"`,
          durationMs: performance.now() - t,
          opsCount: 1,
        });
      }
      const totalMs = performance.now() - overrideStart;
      totalOps += opsThis + 1;
      if (matched) matchedCount++;
      return { override, matched, path: 'pattern-test', steps, totalMs, totalOps: opsThis + 1 };
    }

    // Parse test URL
    let parsedTest: URL;
    {
      const t = performance.now();
      try {
        parsedTest = new URL(trimmedTest);
        opsThis++;
        steps.push({
          label: 'Parse test URL',
          result: 'info',
          detail: `Parsed successfully`,
          durationMs: performance.now() - t,
          opsCount: 1,
        });
      } catch {
        steps.push({
          label: 'Parse test URL',
          result: 'no-match',
          detail: `"${trimmedTest}" is not a valid URL — cannot match`,
          durationMs: performance.now() - t,
          opsCount: 1,
        });
        const totalMs = performance.now() - overrideStart;
        totalOps += 1;
        return { override, matched: false, path: 'pattern-test', steps, totalMs, totalOps: 1 };
      }
    }

    // Normalise source URL (replace handlebars with placeholders)
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
      steps.push({
        label: 'Parse source URL template',
        result: 'no-match',
        detail: 'Could not parse source template as URL',
        durationMs: 0,
        opsCount: 0,
      });
      const totalMs = performance.now() - overrideStart;
      return { override, matched: false, path: 'pattern-test', steps, totalMs, totalOps: opsThis };
    }

    // Protocol
    {
      const t = performance.now();
      const ok = parsedTest.protocol === parsedSource.protocol;
      opsThis++;
      steps.push({
        label: 'Protocol check',
        result: ok ? 'match' : 'no-match',
        detail: ok
          ? `${parsedTest.protocol} === ${parsedSource.protocol} ✓`
          : `${parsedTest.protocol} ≠ ${parsedSource.protocol}`,
        durationMs: performance.now() - t,
        opsCount: 1,
      });
      if (!ok) {
        const totalMs = performance.now() - overrideStart;
        totalOps += opsThis;
        return { override, matched: false, path: 'pattern-test', steps, totalMs, totalOps: opsThis };
      }
    }

    // Host
    {
      const t = performance.now();
      const ok = parsedTest.hostname === parsedSource.hostname;
      opsThis++;
      steps.push({
        label: 'Hostname check',
        result: ok ? 'match' : 'no-match',
        detail: ok
          ? `${parsedTest.hostname} === ${parsedSource.hostname} ✓`
          : `${parsedTest.hostname} ≠ ${parsedSource.hostname}`,
        durationMs: performance.now() - t,
        opsCount: 1,
      });
      if (!ok) {
        const totalMs = performance.now() - overrideStart;
        totalOps += opsThis;
        return { override, matched: false, path: 'pattern-test', steps, totalMs, totalOps: opsThis };
      }
    }

    // Port
    {
      const t = performance.now();
      const ok = parsedTest.port === parsedSource.port;
      opsThis++;
      steps.push({
        label: 'Port check',
        result: ok ? 'match' : 'no-match',
        detail: ok
          ? `(port) "${parsedTest.port || 'default'}" === "${parsedSource.port || 'default'}" ✓`
          : `(port) "${parsedTest.port}" ≠ "${parsedSource.port}"`,
        durationMs: performance.now() - t,
        opsCount: 1,
      });
      if (!ok) {
        const totalMs = performance.now() - overrideStart;
        totalOps += opsThis;
        return { override, matched: false, path: 'pattern-test', steps, totalMs, totalOps: opsThis };
      }
    }

    // Path segments
    const srcParts = parsedSource.pathname.split('/');
    const tstParts = parsedTest.pathname.split('/');

    {
      const t = performance.now();
      opsThis++;
      if (srcParts.length !== tstParts.length) {
        steps.push({
          label: 'Path segment count',
          result: 'no-match',
          detail: `Source has ${srcParts.length} segments, test URL has ${tstParts.length}`,
          durationMs: performance.now() - t,
          opsCount: 1,
        });
        const totalMs = performance.now() - overrideStart;
        totalOps += opsThis;
        return { override, matched: false, path: 'pattern-test', steps, totalMs, totalOps: opsThis };
      }
      steps.push({
        label: 'Path segment count',
        result: 'match',
        detail: `Both have ${srcParts.length} segments ✓`,
        durationMs: performance.now() - t,
        opsCount: 1,
      });
    }

    let pathHbsIdx = 0;
    let pathFailed = false;
    for (let i = 0; i < srcParts.length; i++) {
      const t = performance.now();
      const srcSeg = decodeURIComponent(srcParts[i]);
      const tstSeg = decodeURIComponent(tstParts[i]);
      opsThis++;

      if (/^HBSTOK\d+$/.test(srcSeg)) {
        const tokenName = tokenOrder[pathHbsIdx++];
        const seg = pattern.segments.find(s => s.kind === 'handlebars' && s.label === tokenName);
        if (seg && !seg.isWildcard) {
          const ok = tstSeg === seg.value;
          steps.push({
            label: `Path[${i}] — {{${tokenName}}} pinned value`,
            result: ok ? 'match' : 'no-match',
            detail: ok
              ? `"${tstSeg}" === "${seg.value}" ✓`
              : `"${tstSeg}" ≠ "${seg.value}"`,
            durationMs: performance.now() - t,
            opsCount: 1,
          });
          if (!ok) { pathFailed = true; break; }
        } else {
          steps.push({
            label: `Path[${i}] — {{${tokenName}}} wildcard`,
            result: 'match',
            detail: `"${tstSeg}" accepted (wildcard) ✓`,
            durationMs: performance.now() - t,
            opsCount: 1,
          });
        }
      } else {
        const ok = srcSeg === tstSeg;
        steps.push({
          label: `Path[${i}] — literal`,
          result: ok ? 'match' : 'no-match',
          detail: ok
            ? `"${tstSeg}" === "${srcSeg}" ✓`
            : `"${tstSeg}" ≠ "${srcSeg}"`,
          durationMs: performance.now() - t,
          opsCount: 1,
        });
        if (!ok) { pathFailed = true; break; }
      }
    }

    if (pathFailed) {
      const totalMs = performance.now() - overrideStart;
      totalOps += opsThis;
      return { override, matched: false, path: 'pattern-test', steps, totalMs, totalOps: opsThis };
    }

    // Query params
    let queryFailed = false;
    for (const [key, srcValue] of parsedSource.searchParams.entries()) {
      const t = performance.now();
      const seg = pattern.segments.find(s => s.kind === 'queryParam' && s.label === key);
      const testValue = parsedTest.searchParams.get(key);
      opsThis++;

      if (/^HBSTOK\d+$/.test(srcValue)) {
        if (!parsedTest.searchParams.has(key)) {
          steps.push({
            label: `Query[${key}] — presence check`,
            result: 'no-match',
            detail: `Param "${key}" missing from test URL`,
            durationMs: performance.now() - t,
            opsCount: 1,
          });
          queryFailed = true; break;
        }
        if (seg && !seg.isWildcard && testValue !== seg.value) {
          steps.push({
            label: `Query[${key}] — {{token}} pinned value`,
            result: 'no-match',
            detail: `"${testValue}" ≠ "${seg.value}"`,
            durationMs: performance.now() - t,
            opsCount: 1,
          });
          queryFailed = true; break;
        }
        steps.push({
          label: `Query[${key}] — {{token}} ${seg && !seg.isWildcard ? 'pinned' : 'wildcard'}`,
          result: 'match',
          detail: seg && !seg.isWildcard
            ? `"${testValue}" === "${seg.value}" ✓`
            : `"${testValue}" accepted (wildcard) ✓`,
          durationMs: performance.now() - t,
          opsCount: 1,
        });
      } else {
        if (!parsedTest.searchParams.has(key)) {
          steps.push({
            label: `Query[${key}] — presence check`,
            result: 'no-match',
            detail: `Param "${key}" missing from test URL`,
            durationMs: performance.now() - t,
            opsCount: 1,
          });
          queryFailed = true; break;
        }
        const expected = seg ? (seg.isWildcard ? null : seg.value) : srcValue;
        if (expected !== null && testValue !== expected) {
          steps.push({
            label: `Query[${key}] — static value`,
            result: 'no-match',
            detail: `"${testValue}" ≠ "${expected}"`,
            durationMs: performance.now() - t,
            opsCount: 1,
          });
          queryFailed = true; break;
        }
        steps.push({
          label: `Query[${key}] — ${expected === null ? 'wildcard' : 'static value'}`,
          result: 'match',
          detail: expected === null
            ? `"${testValue}" accepted (wildcard) ✓`
            : `"${testValue}" === "${expected}" ✓`,
          durationMs: performance.now() - t,
          opsCount: 1,
        });
      }
    }

    const matched = !queryFailed;
    if (matched) matchedCount++;
    const totalMs = performance.now() - overrideStart;
    totalOps += opsThis;
    return { override, matched, path: 'pattern-test', steps, totalMs, totalOps: opsThis };
  });

  // Compute short-circuit stats: cost up to and including the first match
  const firstMatchIdx = results.findIndex(r => r.matched);
  const shortCircuitSlice = firstMatchIdx >= 0 ? results.slice(0, firstMatchIdx + 1) : results;
  const shortCircuitOps = shortCircuitSlice.reduce((sum, r) => sum + r.totalOps, 0);
  const shortCircuitMs  = shortCircuitSlice.reduce((sum, r) => sum + r.totalMs,  0);

  return {
    testUrl,
    testUrlHash,
    overridesEvaluated: overrides.length,
    exactHashChecks,
    patternTests,
    matchedCount,
    results,
    totalMs: performance.now() - traceStart,
    totalOps,
    shortCircuitMatchIndex: firstMatchIdx,
    shortCircuitOps,
    shortCircuitMs,
  };
}
