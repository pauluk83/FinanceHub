/**
 * Which dataset a build compiles in.
 *
 * The private workbook is gitignored; CI and contributors build with the blank
 * public seed. This decision lives in a pure function so a test can prove the
 * distributable build never picks up a personal budget.
 */
export interface SeedPaths {
  /** Blank committed seed used by public builds. */
  webSeed: string;
  /** Private canonical workbook when present on this machine. */
  privateWorkbook: string;
}

export function workbookAlias(hasPrivateWorkbook: boolean, paths: SeedPaths): { find: string; replacement: string } {
  return {
    find: '@workbook',
    replacement: hasPrivateWorkbook ? paths.privateWorkbook : paths.webSeed,
  };
}
