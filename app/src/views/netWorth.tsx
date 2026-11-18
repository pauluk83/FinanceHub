import { useMemo, useState } from 'react';
import type { ViewProps } from '../types';
import { Badge, Empty, Field, Section, Table } from '../components';
import { gbp, parseMoney, pct } from '../format';
import { ASSET_KINDS, netWorth, netWorthTrend, ownedValuePence, type Asset, type AssetKind, type NetWorthPoint } from '../../../core/assets';
import { explainNetWorth } from '../../../core/explain';
import type { Explanation } from '../../../core/explain';
import { ExplainButton, ExplainDialog } from '../explain';
import { newId } from '../store';

const KIND_LABEL = Object.fromEntries(ASSET_KINDS.map((kind) => [kind.id, kind.label])) as Record<AssetKind, string>;

function TrendChart({ points }: { points: NetWorthPoint[] }) {
  const width = 720;
  const height = 190;
  const padX = 16;
  const padY = 18;
  const values = points.map((point) => point.netPence);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const span = max - min || 1;
  const x = (index: number) => padX + (points.length === 1 ? (width - padX * 2) / 2 : (index / (points.length - 1)) * (width - padX * 2));
  const y = (value: number) => height - padY - ((value - min) / span) * (height - padY * 2);
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)},${y(point.netPence).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${height - padY} L${x(0).toFixed(1)},${height - padY} Z`;
  return (
    <div className="networth-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Net worth trend, ${points.length} recorded point${points.length === 1 ? '' : 's'}`}>
        <line className="chart-zero" x1={padX} x2={width - padX} y1={y(0)} y2={y(0)} />
        <path className="chart-area" d={area} />
        <path className="chart-line" d={line} fill="none" />
        {points.map((point, index) => (
          <circle key={point.key} className="chart-dot" cx={x(index)} cy={y(point.netPence)} r={3.5}>
            <title>{`${point.label}: ${gbp(point.netPence)}${point.complete ? '' : ' (partial record)'}`}</title>
          </circle>
        ))}
      </svg>
      <div className="chart-labels">
        <span>{points[0]?.label}</span>
        <span>{points.length > 1 ? points[points.length - 1]?.label : ''}</span>
      </div>
    </div>
  );
}

export function NetWorth({ ds, engine, update, notify }: ViewProps) {
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [draft, setDraft] = useState({ name: '', kind: 'property' as AssetKind, value: '', ownership: '100', notes: '' });
  const asOf = ds.settings.asOfDate;
  const worth = useMemo(() => netWorth(ds, engine, asOf), [ds, engine, asOf]);
  const trend = useMemo(() => netWorthTrend(ds, engine, asOf), [ds, engine, asOf]);
  const balances = engine.accountBalances(asOf);
  const savingsBalances = ds.savings ?? [];
  const assets = ds.assets ?? [];

  const add = () => {
    const name = draft.name.trim();
    if (!name) return notify('Give the asset a name');
    const valuePence = parseMoney(draft.value);
    if (!Number.isFinite(valuePence) || valuePence <= 0) return notify('Enter the asset value');
    const ownershipPct = Math.max(0, Math.min(100, Number(draft.ownership) || 100));
    update((dataset) => {
      dataset.assets = [...(dataset.assets ?? []), {
        id: newId('asset'),
        name,
        kind: draft.kind,
        valuePence,
        ownershipPct,
        includeInNetWorth: true,
        active: true,
        notes: draft.notes.trim() || undefined,
      }];
    });
    notify(`${name} added to net worth`);
    setDraft({ name: '', kind: draft.kind, value: '', ownership: '100', notes: '' });
  };

  const patch = (id: string, change: (asset: Asset) => void) => {
    update((dataset) => {
      const asset = (dataset.assets ?? []).find((entry) => entry.id === id);
      if (asset) change(asset);
    });
  };

  const remove = (asset: Asset) => {
    if (!confirm(`Remove ${asset.name} from net worth? The asset is deleted from this budget and appears in the next backup.`)) return;
    update((dataset) => {
      dataset.assets = (dataset.assets ?? []).filter((entry) => entry.id !== asset.id);
    });
    notify(`${asset.name} removed`);
  };

  const liabilities = worth.cardsPence + worth.debtsPence;
  const assetsTotal = worth.accountsPence + worth.savingsPence + worth.assetsPence;

  return (
    <>
      <section className="hero">
        <div className="hero-main">
          <span className="eyebrow">Net worth</span>
          <h2>{gbp(worth.netPence)}</h2>
          <div className="hero-figures">
            <div className="hero-figure"><span>Cash and savings</span><strong>{gbp(worth.accountsPence + worth.savingsPence)}</strong></div>
            <div className="hero-figure"><span>Assets</span><strong>{gbp(worth.assetsPence)}</strong></div>
            <div className="hero-figure"><span>Cards and debts</span><strong className="amount neg">{gbp(liabilities)}</strong></div>
          </div>
        </div>
        <div className="hero-side">
          <Badge tone="blue">As of {asOf}</Badge>
          <div className="muted">Assets cover <strong>{liabilities === 0 ? '—' : pct(assetsTotal / liabilities, 0)}</strong> of liabilities</div>
          <ExplainButton onClick={() => setExplanation(explainNetWorth(ds, engine, asOf))} label="Explain net worth" />
        </div>
      </section>

      <Section
        title="Assets"
        sub="Manual valuations: property, vehicles, pensions and investments. Only your ownership share counts."
      >
        <Table head={['Asset', 'Type', 'Value', 'Ownership', 'Counts', '']} numHead={[2, 3]}>
          {assets.map((asset) => (
            <tr key={asset.id}>
              <td>
                <input
                  className="input compact"
                  value={asset.name}
                  aria-label={`Name of ${asset.name}`}
                  onChange={(event) => patch(asset.id, (entry) => { entry.name = event.target.value; })}
                />
                {asset.notes && <div className="muted small">{asset.notes}</div>}
              </td>
              <td>
                <select
                  className="select compact"
                  value={asset.kind}
                  aria-label={`Type of ${asset.name}`}
                  onChange={(event) => patch(asset.id, (entry) => { entry.kind = event.target.value as AssetKind; })}
                >
                  {ASSET_KINDS.map((kind) => <option key={kind.id} value={kind.id}>{kind.label}</option>)}
                </select>
              </td>
              <td className="num">
                <input
                  className="input compact num"
                  defaultValue={(asset.valuePence / 100).toFixed(2)}
                  aria-label={`Value of ${asset.name}`}
                  onBlur={(event) => {
                    const valuePence = parseMoney(event.target.value);
                    if (!Number.isFinite(valuePence) || valuePence < 0) return;
                    patch(asset.id, (entry) => { entry.valuePence = valuePence; });
                  }}
                />
                <div className="muted small">You own {gbp(ownedValuePence(asset))}</div>
              </td>
              <td className="num">
                <input
                  className="input compact num"
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={asset.ownershipPct}
                  aria-label={`Ownership percentage of ${asset.name}`}
                  onBlur={(event) => {
                    const value = Math.max(0, Math.min(100, Number(event.target.value) || 0));
                    patch(asset.id, (entry) => { entry.ownershipPct = value; });
                  }}
                />%
              </td>
              <td>
                <label className="check-inline">
                  <input
                    type="checkbox"
                    checked={asset.includeInNetWorth !== false}
                    onChange={(event) => patch(asset.id, (entry) => { entry.includeInNetWorth = event.target.checked; })}
                  />
                  <span>{asset.includeInNetWorth === false ? 'Excluded' : 'In total'}</span>
                </label>
              </td>
              <td><button className="btn danger sm" type="button" onClick={() => remove(asset)}>Remove</button></td>
            </tr>
          ))}
        </Table>
        {assets.length === 0 && <Empty>No assets yet. Add property, a vehicle, a pension or an investment below.</Empty>}
        <div className="asset-form">
          <Field label="Name"><input className="input" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="e.g. Home" /></Field>
          <Field label="Type">
            <select className="select" value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as AssetKind })}>
              {ASSET_KINDS.map((kind) => <option key={kind.id} value={kind.id}>{kind.label}</option>)}
            </select>
          </Field>
          <Field label="Value"><input className="input" value={draft.value} onChange={(event) => setDraft({ ...draft, value: event.target.value })} placeholder="0.00" inputMode="decimal" /></Field>
          <Field label="Ownership %"><input className="input" value={draft.ownership} onChange={(event) => setDraft({ ...draft, ownership: event.target.value })} inputMode="decimal" /></Field>
          <Field label="Note (optional)"><input className="input" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Valuation date or source" /></Field>
          <button className="btn primary" type="button" onClick={add}>Add asset</button>
        </div>
        <p className="muted small" style={{ padding: '0 16px 16px' }}>
          A £300,000 home at 50% ownership counts as £150,000. Valuations are manual; FinanceHub does not fetch live prices.
        </p>
      </Section>

      <Section
        title="What counts"
        sub="Bank accounts and savings are included unless excluded here. Cards and debts are always liabilities."
      >
        <Table head={['Account', 'Balance', 'In net worth']} numHead={[1]}>
          {balances.map((account) => (
            <tr key={`bank-${account.name}`}>
              <td>{account.name} <span className="muted small">· bank</span></td>
              <td className="num">{gbp(account.balancePence)}</td>
              <td>
                <label className="check-inline">
                  <input
                    type="checkbox"
                    checked={account.excludeFromNetWorth !== true}
                    onChange={(event) => update((dataset) => {
                      const row = dataset.accounts.find((entry) => entry.name === account.name);
                      if (row) row.excludeFromNetWorth = !event.target.checked;
                    })}
                  />
                  <span>{account.excludeFromNetWorth === true ? 'Excluded' : 'Counted'}</span>
                </label>
              </td>
            </tr>
          ))}
          {savingsBalances.map((account) => (
            <tr key={`savings-${account.id}`}>
              <td>{account.name} <span className="muted small">· savings</span></td>
              <td className="num">{gbp(account.balancePence)}</td>
              <td>
                <label className="check-inline">
                  <input
                    type="checkbox"
                    checked={account.excludeFromNetWorth !== true}
                    onChange={(event) => update((dataset) => {
                      const row = (dataset.savings ?? []).find((entry) => entry.id === account.id);
                      if (row) row.excludeFromNetWorth = !event.target.checked;
                    })}
                  />
                  <span>{account.excludeFromNetWorth === true ? 'Excluded' : 'Counted'}</span>
                </label>
              </td>
            </tr>
          ))}
        </Table>
        {balances.length + savingsBalances.length === 0 && <Empty>No bank accounts or savings yet.</Empty>}
        <div className="metric-list" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', padding: 16 }}>
          <div className="metric"><span>Assets</span><strong>{gbp(assetsTotal)}</strong></div>
          <div className="metric"><span>Liabilities</span><strong>{gbp(liabilities)}</strong></div>
          <div className="metric"><span>Net worth</span><strong>{gbp(worth.netPence)}</strong></div>
        </div>
      </Section>

      <Section
        title="12-month trend"
        sub="Recorded month locks only. The current month is live."
        actions={<Badge tone="blue">{trend.length} point{trend.length === 1 ? '' : 's'}</Badge>}
      >
        {trend.length > 1 ? <TrendChart points={trend} /> : (
          <Empty>History starts with the next month lock. Existing locks did not record savings, debts or assets, so no past values are invented.</Empty>
        )}
        {trend.length > 1 && (
          <Table head={['Month', 'Accounts', 'Savings', 'Assets', 'Cards', 'Debts', 'Net']} numHead={[1, 2, 3, 4, 5, 6]}>
            {trend.map((point) => (
              <tr key={point.key}>
                <td>{point.label} {!point.complete && <Badge tone="amber">partial</Badge>}</td>
                <td className="num">{gbp(point.accountsPence)}</td>
                <td className="num">{gbp(point.savingsPence)}</td>
                <td className="num">{gbp(point.assetsPence)}</td>
                <td className="num">{gbp(point.cardsPence)}</td>
                <td className="num">{gbp(point.debtsPence)}</td>
                <td className="num"><strong>{gbp(point.netPence)}</strong></td>
              </tr>
            ))}
          </Table>
        )}
        <p className="muted small" style={{ padding: '0 16px 16px' }}>
          Locks created before this release stored accounts, cards and people only. They are shown as partial rather than
          backfilled, so the trend never claims an asset value that was not recorded.
        </p>
      </Section>

      <ExplainDialog explanation={explanation} onClose={() => setExplanation(null)} />
    </>
  );
}

export { KIND_LABEL };
