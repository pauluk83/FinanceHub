/** True only for the static site build served at the domain root. */
export const HOSTED_WEB = import.meta.env.VITE_HOSTED_WEB === '1';

/** True only for the Microsoft Store (AppX) renderer build. */
export const STORE_BUILD = import.meta.env.VITE_STORE_BUILD === '1';
