/**
 * The version shown in the app. Vite replaces __APP_VERSION__ with the
 * package.json version at build time, so the web bundle, the Electron shell
 * (app.getVersion()) and Settings → About cannot drift apart. The fallback keeps
 * the constant usable from plain Node tests, where the define is absent.
 */
declare const __APP_VERSION__: string | undefined;

export const APP_VERSION =
  typeof __APP_VERSION__ === 'string' && __APP_VERSION__ ? __APP_VERSION__ : '2026.11.9';
