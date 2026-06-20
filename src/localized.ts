import type { LocalizedString } from './types.js';

/**
 * Reduce a {@link LocalizedString} to a single plain string.
 *
 * Every consumer (worker, UI, the Laravel side) repeats the same "is it a
 * string or a localized map?" branch to render a name/label; this centralizes
 * it so the rules are defined once:
 *
 * - a plain string is trimmed and returned (or `undefined` if blank);
 * - a localized map prefers `fallbackLang` (default `en`), then the first
 *   non-empty value;
 * - a missing, empty, or blank-only value yields `undefined`, so the caller
 *   can apply its own fallback.
 */
export function normalizeLocalized(
  value: LocalizedString | undefined | null,
  fallbackLang = 'en',
): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  }

  if (value && typeof value === 'object') {
    const preferred = value[fallbackLang];
    if (typeof preferred === 'string' && preferred.trim() !== '') {
      return preferred.trim();
    }

    for (const candidate of Object.values(value)) {
      if (typeof candidate === 'string' && candidate.trim() !== '') {
        return candidate.trim();
      }
    }
  }

  return undefined;
}
