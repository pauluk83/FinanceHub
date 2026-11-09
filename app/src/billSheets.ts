import type { BillSheet, Dataset } from '../../core/engine';

export const LINK_SHEET_PROVIDER_KEYS: Record<string, string> = {
  Rent: 'rent',
  Water: 'water',
  Ovo: 'ovo',
  'Park Xmas': 'parkXmas',
  'Pure Cremation': 'pureCremation',
  'Council Tax': 'councilTax',
  O2: 'o2',
  Virgin: 'virgin',
};

const BUILTIN_SHEETS: BillSheet[] = Object.entries(LINK_SHEET_PROVIDER_KEYS).map(([name, providerKey]) => ({ name, providerKey }));

export function providerKeyForSheetName(name: string): string | undefined {
  return LINK_SHEET_PROVIDER_KEYS[name];
}

/** The link-sheet name a provider's bill should carry, so the engine reads its ledger. */
export function sheetNameForProviderKey(key: string): string | undefined {
  return Object.entries(LINK_SHEET_PROVIDER_KEYS).find(([, value]) => value === key)?.[0];
}

/**
 * The configured link-sheet list, with any historical sheet name still used by
 * a bill added back so existing data never becomes unselectable.
 */
export function billSheetsFor(ds: Dataset): BillSheet[] {
  const source = ds.settings.billSheets ?? BUILTIN_SHEETS;
  const byName = new Map<string, BillSheet>();

  for (const sheet of source) {
    const name = sheet.name.trim();
    if (!name) continue;
    byName.set(name, {
      name,
      providerKey: sheet.providerKey ?? providerKeyForSheetName(name),
    });
  }

  for (const bill of ds.bills) {
    const name = bill.linkedSheet?.trim();
    if (!name || byName.has(name)) continue;
    byName.set(name, { name, providerKey: providerKeyForSheetName(name) });
  }

  return Array.from(byName.values());
}
