import { useEffect, useRef, useState } from 'react';
import { t, type MessageKey } from './i18n';

/**
 * The first-run tour: five short cards explaining where things live, shown
 * once per workspace. It is keyboard operable (Esc skips, arrows move), keeps
 * focus inside the card, and never touches the budget.
 */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const STEPS: { title: MessageKey; body: MessageKey }[] = [
  { title: 'tour.welcome.title', body: 'tour.welcome.body' },
  { title: 'tour.nav.title', body: 'tour.nav.body' },
  { title: 'tour.entry.title', body: 'tour.entry.body' },
  { title: 'tour.bills.title', body: 'tour.bills.body' },
  { title: 'tour.ready.title', body: 'tour.ready.body' },
];

export function FirstRunTour({ onDone, onOpenSample }: { onDone: () => void; onOpenSample?: () => void }) {
  const [step, setStep] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const last = step === STEPS.length - 1;
  const current = STEPS[step];

  useEffect(() => {
    cardRef.current?.focus();
  }, [step]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onDone(); return; }
      // The card is modal, so Tab has to cycle inside it rather than walking
      // the page behind.
      if (event.key === 'Tab') {
        const root = cardRef.current;
        if (!root) return;
        const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
        if (items.length === 0) { event.preventDefault(); root.focus(); return; }
        const first = items[0];
        const lastItem = items[items.length - 1];
        const current = document.activeElement as HTMLElement | null;
        const inside = !!current && root.contains(current);
        if (!event.shiftKey && (!inside || current === lastItem)) { event.preventDefault(); first.focus(); }
        else if (event.shiftKey && (!inside || current === first)) { event.preventDefault(); lastItem.focus(); }
        return;
      }
      if (event.key === 'ArrowRight' && !last) { event.preventDefault(); setStep((s) => s + 1); }
      if (event.key === 'ArrowLeft' && step > 0) { event.preventDefault(); setStep((s) => s - 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [last, step, onDone]);

  return (
    <div className="tour-backdrop">
      <div
        className="tour-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        tabIndex={-1}
        ref={cardRef}
      >
        <div className="tour-step">{t('tour.progress', { step: step + 1, total: STEPS.length })}</div>
        <h2 id="tour-title" className="tour-title">{t(current.title)}</h2>
        <p id="tour-body" className="tour-body">{t(current.body)}</p>
        <div className="tour-actions">
          <button className="btn ghost sm" type="button" onClick={onDone}>{t('tour.skip')}</button>
          {last && onOpenSample && (
            <button
              className="btn ghost sm"
              type="button"
              onClick={() => { onDone(); onOpenSample(); }}
            >
              {t('tour.sample')}
            </button>
          )}
          <span className="tour-spacer" />
          {step > 0 && (
            <button className="btn sm" type="button" onClick={() => setStep((s) => s - 1)}>{t('tour.back')}</button>
          )}
          <button
            className="btn primary sm"
            type="button"
            onClick={() => (last ? onDone() : setStep((s) => s + 1))}
          >
            {last ? t('tour.done') : t('tour.next')}
          </button>
        </div>
      </div>
    </div>
  );
}
