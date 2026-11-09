import { useEffect, useState, type ReactNode } from 'react';
import {
  LEGAL_COPYRIGHT,
  LEGAL_DOCS,
  LEGAL_OWNER,
  LEGAL_TRADEMARK,
  LEGAL_UPDATED,
  LEGAL_VERSION,
  legalDoc,
  type LegalDocId,
} from '../legal';

function renderMarkdown(text: string): ReactNode[] {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  let key = 0;

  const flush = () => {
    if (list.length === 0) return;
    blocks.push(
      <ul key={`list-${key++}`}>
        {list.map((item, index) => <li key={index}>{item}</li>)}
      </ul>,
    );
    list = [];
  };

  for (const line of text.split('\n')) {
    const value = line.trim();
    if (value.startsWith('- ')) {
      list.push(value.slice(2));
      continue;
    }
    flush();
    if (!value) continue;
    if (value.startsWith('## ')) blocks.push(<h3 key={key++}>{value.slice(3)}</h3>);
    else if (value.startsWith('# ')) blocks.push(<h2 key={key++} className="legal-title">{value.slice(2)}</h2>);
    else blocks.push(<p key={key++}>{value}</p>);
  }
  flush();
  return blocks;
}

export function LegalPage({ initial, onClose }: { initial: LegalDocId; onClose: () => void }) {
  const [docId, setDocId] = useState<LegalDocId>(initial);
  useEffect(() => setDocId(initial), [initial]);
  const doc = legalDoc(docId);

  return (
    <div className="legal-shell">
      <header className="legal-head">
        <div className="brand">
          <div className="brand-mark">FH</div>
          <div className="brand-text">
            <div className="brand-title">FinanceHub™</div>
            <div className="brand-sub">Legal &amp; privacy</div>
          </div>
        </div>
        <div className="legal-head-actions">
          <span className="muted small">{LEGAL_COPYRIGHT}</span>
          <button type="button" className="btn" onClick={onClose}>Back to FinanceHub</button>
        </div>
      </header>

      <main className="legal-body">
        <nav className="legal-tabs" aria-label="Legal documents">
          {LEGAL_DOCS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={`tab ${entry.id === doc.id ? 'active' : ''}`}
              aria-current={entry.id === doc.id ? 'page' : undefined}
              onClick={() => setDocId(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </nav>
        <div className="legal-meta">
          Version {LEGAL_VERSION} · Last updated {LEGAL_UPDATED} · Owner and data controller: {LEGAL_OWNER}
        </div>
        <div className="legal-doc">{renderMarkdown(doc.body)}</div>
        <footer className="legal-foot">
          <span>{LEGAL_TRADEMARK}</span>
          <span>{LEGAL_COPYRIGHT}</span>
        </footer>
      </main>
    </div>
  );
}
