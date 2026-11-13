/**
 * Print a generated report through the browser/Electron print dialog. The user
 * can choose "Save as PDF"; nothing is sent to a server.
 */
export function printHtml(html: string): boolean {
  if (typeof document === 'undefined') return false;
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) {
    frame.remove();
    return false;
  }
  doc.open();
  doc.write(html);
  doc.close();
  window.setTimeout(() => {
    try {
      win.focus();
      win.print();
    } finally {
      window.setTimeout(() => frame.remove(), 60_000);
    }
  }, 100);
  return true;
}
