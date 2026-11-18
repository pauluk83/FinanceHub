import type { Explanation } from '../../core/explain';
import { gbp } from './format';

const SOURCE_LABEL: Record<Explanation['source'], string> = {
  live: 'Live calculation',
  locked: 'Locked snapshot',
  workbook: 'Workbook snapshot',
};

export function ExplainDialog({ explanation, onClose }: { explanation: Explanation | null; onClose: () => void }) {
  if (!explanation) return null;
  const sum = explanation.rows.reduce((total, row) => total + row.amountPence, 0);
  return (
    <div className="explain-backdrop" role="presentation" onClick={onClose}>
      <section
        className="explain-panel"
        role="dialog"
        aria-modal="true"
        aria-label={explanation.title}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="explain-head">
          <div>
            <h2>{explanation.title}</h2>
            {explanation.subtitle && <p>{explanation.subtitle}</p>}
          </div>
          <button className="btn ghost sm" type="button" onClick={onClose} aria-label="Close explanation">✕</button>
        </header>
        <div className="explain-source">
          <span className={`badge ${explanation.source === 'live' ? 'green' : 'amber'}`}>{SOURCE_LABEL[explanation.source]}</span>
          <span className="muted small">Every row below is a component the engine used.</span>
        </div>
        {explanation.rows.length === 0 ? (
          <div className="empty">Nothing to show for this figure.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Component</th><th className="num">Amount</th></tr></thead>
              <tbody>
                {explanation.rows.map((row, index) => (
                  <tr key={`${row.label}-${index}`}>
                    <td>
                      <strong>{row.label}</strong>
                      {row.detail && <div className="muted small">{row.detail}</div>}
                    </td>
                    <td className="num"><span className={`amount ${row.amountPence < 0 ? 'neg' : ''}`}>{gbp(row.amountPence, { sign: row.amountPence < 0 })}</span></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th>Total</th>
                  <th className="num"><span className="amount">{gbp(explanation.totalPence)}</span></th>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {sum !== explanation.totalPence && (
          <div className="notice warn">The listed components do not add up to the figure ({gbp(sum)} vs {gbp(explanation.totalPence)}). Please report this.</div>
        )}
        {explanation.note && <div className="notice info">{explanation.note}</div>}
        <p className="muted small">This panel is read-only. Change the underlying rows in the view it links to.</p>
      </section>
    </div>
  );
}

export function ExplainButton({ onClick, label = 'Explain', title }: { onClick: () => void; label?: string; title?: string }) {
  return (
    <button className="btn ghost sm explain-trigger" type="button" onClick={onClick} title={title ?? 'Show the rows and arithmetic behind this figure'}>
      {label}
    </button>
  );
}
