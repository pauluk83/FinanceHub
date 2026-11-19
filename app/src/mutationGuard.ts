/**
 * A double tap on a phone must not post the same entry twice.
 *
 * React state updates asynchronously, so a second tap can reach the submit
 * handler before the form closes. This guard accepts the first call inside the
 * window and refuses the rest; it is deliberately short so two genuine,
 * separate entries are still possible.
 */
export function createTapGuard(windowMs = 800) {
  let lastAcceptedAt = 0;
  return (now = Date.now()): boolean => {
    if (now - lastAcceptedAt < windowMs) return false;
    lastAcceptedAt = now;
    return true;
  };
}
