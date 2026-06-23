/**
 * Reduce an `IConfigField.credentialType` (a single slug or an array of slugs)
 * to a normalized, deduplicated `string[]`.
 *
 * The union `string | string[]` exists so node authors can write the common
 * single-type case as a bare string, but every consumer (the editor that
 * lists tenant credential instances, the worker that resolves the chosen
 * instance, the Laravel side) needs a list to iterate. This centralizes the
 * "is it a string or an array?" branch — analogous to {@link normalizeLocalized}
 * for `LocalizedString` — so the rules are defined once:
 *
 * - a single non-empty slug becomes a one-element array;
 * - an array is trimmed of blank entries and deduplicated, preserving order;
 * - `undefined`, an empty string, or an empty/all-blank array yields `[]`, so
 *   the caller can treat "accepts nothing" uniformly.
 */
export function normalizeCredentialType(value: string | string[] | undefined): string[] {
  const raw = value === undefined ? [] : Array.isArray(value) ? value : [value];
  const seen = new Set<string>();
  for (const entry of raw) {
    const trimmed = typeof entry === 'string' ? entry.trim() : '';
    if (trimmed !== '') {
      seen.add(trimmed);
    }
  }
  return [...seen];
}
