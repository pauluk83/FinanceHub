/**
 * A-08: the seed may fill a gap but must never overwrite a saved value.
 *
 * Older builds copied every scalar from the bundled seed into the saved
 * provider on load, so an edit could be silently reverted. This keeps the saved
 * value whenever one exists and only supplies what is missing.
 */
export function mergeProviderSeed(
  current: Record<string, any>,
  seedProvider: Record<string, any>,
  preserved: ReadonlySet<string> = new Set(),
): { next: Record<string, any>; changed: boolean } {
  const next: Record<string, any> = { ...current };
  let changed = false;

  for (const [field, value] of Object.entries(seedProvider)) {
    if (field === 'contract' || Array.isArray(value) || (value !== null && typeof value === 'object')) continue;
    if (preserved.has(field)) continue;
    const existing = next[field];
    const missing = existing === undefined || existing === null || existing === '';
    if (missing && value !== undefined) {
      next[field] = value;
      changed = true;
    }
  }

  // A contract block is seed guidance, not an edit target; fill it only when the
  // provider has none, and never after the provider was recalculated.
  if (!current.contract && seedProvider.contract) {
    next.contract = structuredClone(seedProvider.contract);
    changed = true;
  }

  return { next, changed };
}
