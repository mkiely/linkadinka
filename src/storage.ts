import type { Override } from './types';
import { computeMatcherHash } from './hashUtils';

const STORAGE_KEY = 'linkaDinka_overrides';

export function getOverrides(): Override[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const overrides = JSON.parse(raw) as Override[];

    // Migration: backfill matcherHash / hasWildcards added in v2
    let dirty = false;
    overrides.forEach(o => {
      if (!o.matcherHash) {
        o.matcherHash = computeMatcherHash(o.pattern.summary);
        o.hasWildcards = o.pattern.segments.some(s => s.isWildcard);
        dirty = true;
      }
    });
    if (dirty) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
    }

    return overrides;
  } catch {
    return [];
  }
}

export function saveOverride(override: Override): void {
  const overrides = getOverrides();
  overrides.push(override);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}

export function deleteOverride(id: string): void {
  const overrides = getOverrides().filter(o => o.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}

export function clearOverrides(): void {
  localStorage.removeItem(STORAGE_KEY);
}
