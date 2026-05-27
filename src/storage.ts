import type { Override } from './types';

const STORAGE_KEY = 'linkaDinka_overrides';

export function getOverrides(): Override[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Override[];
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
