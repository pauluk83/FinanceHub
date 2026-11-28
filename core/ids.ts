/**
 * One random-token source for every stored id.
 *
 * `Math.random` is predictable, so an id that ends up in a sync op, a portal
 * record, an audit entry or a restore point is drawn from the platform CSPRNG
 * instead. Every supported runtime (browsers, Electron and Node 18+) has
 * WebCrypto, so a missing source is a broken environment rather than a reason
 * to fall back to a guessable number.
 */
type RandomSource = {
  randomUUID?: () => string;
  getRandomValues: (array: Uint8Array) => Uint8Array;
};

function randomSource(): RandomSource {
  const api = (globalThis as { crypto?: RandomSource }).crypto;
  if (!api?.getRandomValues) throw new Error('This device has no secure random source');
  return api;
}

/** A UUID when the runtime has one, otherwise 16 hex bytes from the CSPRNG. */
export function randomToken(): string {
  const api = randomSource();
  if (typeof api.randomUUID === 'function') return api.randomUUID();
  const bytes = api.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** `prefix_<token>`: the shape every stored record id uses. */
export function randomId(prefix: string): string {
  return prefix ? `${prefix}_${randomToken()}` : randomToken();
}
