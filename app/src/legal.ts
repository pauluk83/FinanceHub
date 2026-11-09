import privacy from './legal/privacy-policy.md?raw';
import terms from './legal/terms-of-service.md?raw';
import eula from './legal/eula.md?raw';
import { APP_VERSION } from './version';

export type LegalDocId = 'privacy' | 'terms' | 'eula';

export interface LegalDoc {
  id: LegalDocId;
  label: string;
  body: string;
}

export const LEGAL_OWNER = 'Zane Stanton';
export const FINANCEHUB_URL = 'https://financehub.freedev.app/';
export const LEGAL_YEAR = 2026;
export const LEGAL_VERSION = APP_VERSION;
export const LEGAL_UPDATED = '7 November 2026';

export const LEGAL_DOCS: LegalDoc[] = [
  { id: 'privacy', label: 'Privacy Policy', body: privacy },
  { id: 'terms', label: 'Terms of Service', body: terms },
  { id: 'eula', label: 'EULA', body: eula },
];

export function legalDoc(id: LegalDocId): LegalDoc {
  return LEGAL_DOCS.find((doc) => doc.id === id) ?? LEGAL_DOCS[0];
}

export function legalRouteFromHash(): LegalDocId | null {
  const [route, doc] = window.location.hash.replace(/^#/, '').split('/');
  if (route !== 'legal') return null;
  return doc === 'terms' || doc === 'eula' || doc === 'privacy' ? doc : 'privacy';
}

export const LEGAL_COPYRIGHT = `© ${LEGAL_YEAR} ${LEGAL_OWNER}. All rights reserved.`;
export const LEGAL_TRADEMARK = `FinanceHub™ is a trademark of ${LEGAL_OWNER}.`;
