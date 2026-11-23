import { useState } from 'react';
import type { ViewProps } from '../../types';
import { Badge, Empty, Field, Section } from '../../components';
import { dateUk, todayIso } from '../../format';
import { withoutAppUpdatePlaceholders, withoutAutomaticBudgetChanges } from '../../budgetChangelog';

export function ChangelogView({ ds, update, notify }: ViewProps) {
  const [q, setQ] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState({ date: todayIso(), title: '', description: '' });
  // App-generated placeholders from older builds carry no money detail; new
  // automatic entries name the section they changed, so history stays meaningful.
  const all = withoutAutomaticBudgetChanges(withoutAppUpdatePlaceholders(ds.changelog ?? []));
  const entries = all.filter((c: any) => {
    const details = Array.isArray(c.details) ? c.details.join(' ') : '';
    return !q || `${c.date} ${c.sheetCell} ${c.description} ${details}`.toLowerCase().includes(q.toLowerCase());
  });

  const addCustom = () => {
    const title = custom.title.trim() || 'Custom change';
    const description = custom.description.trim() || title;
    update((d) => {
      d.changelog = [{
        date: custom.date || todayIso(),
        sheetCell: title,
        description,
        custom: true,
        at: new Date().toISOString(),
      }, ...(d.changelog ?? [])];
    });
    setCustom({ date: todayIso(), title: '', description: '' });
    setCustomOpen(false);
    notify('Custom change added to the changelog');
  };

  return (
    <Section
      title="Budget changelog"
      sub={`${entries.length} of ${all.length} budget changes, newest first — app releases are in Application changelog`}
      actions={<button className="btn primary" onClick={() => setCustomOpen((open) => !open)}>{customOpen ? 'Cancel' : 'Add custom change'}</button>}
    >
      <div className="notice info" style={{ margin: 12 }}>
        This history contains budget data only. Editing a preference such as the menu layout creates no entry,
        and app release notes are kept separately in <strong>Application changelog</strong>.
      </div>
      <div className="toolbar">
        <input className="input" placeholder="Search changes…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {customOpen && (
        <div className="inline-form" style={{ alignItems: 'flex-end' }}>
          <Field label="Date"><input className="input" aria-label="Custom change date" type="date" value={custom.date} onChange={(e) => setCustom({ ...custom, date: e.target.value })} /></Field>
          <Field label="Title"><input className="input" aria-label="Custom change title" placeholder="e.g. Reconciled October" value={custom.title} onChange={(e) => setCustom({ ...custom, title: e.target.value })} /></Field>
          <Field label="Details"><input className="input" aria-label="Custom change details" placeholder="What changed?" value={custom.description} onChange={(e) => setCustom({ ...custom, description: e.target.value })} /></Field>
          <button className="btn primary" onClick={addCustom}>Add change</button>
        </div>
      )}
      <div className="list">
        {entries.map((c: any, i: number) => (
          <div className="list-row" key={i}>
            <div style={{ minWidth: 0 }}>
              <div className="title">{c.sheetCell || 'Workbook'} {c.auto ? <Badge tone="blue">Auto</Badge> : c.custom ? <Badge tone="neutral">Custom</Badge> : null}</div>
              <div className="sub">{c.description}</div>
              {Array.isArray(c.details) && c.details.length > 0 && (
                <div className="sub" style={{ marginTop: 4, display: 'grid', gap: 2 }}>
                  {c.details.map((line: string, detailIndex: number) => <span key={detailIndex}>{line}</span>)}
                </div>
              )}
            </div>
            <span className="muted small nowrap">{dateUk(c.date) !== '—' ? dateUk(c.date) : c.date}</span>
          </div>
        ))}
      </div>
      {entries.length === 0 && <Empty>No entries match that search.</Empty>}
    </Section>
  );
}
