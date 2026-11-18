import { useState } from 'react';
import type { ViewProps } from '../types';
import { Badge, Empty, Field, Section, Table } from '../components';
import { dateUk, gbp, MONTH_LONG, parseMoney, todayIso } from '../format';
import { applyPayoffPlan, payoffPlan, savingsProgress, yearComparison, type PayoffStrategy, type ComparisonRow } from '../../../core/progress';

function percent(change: number | null): string {
  if (change === null) return '—';
  return `${change > 0 ? '+' : ''}${(change * 100).toFixed(1)}%`;
}

function ComparisonTable({ rows, empty }: { rows: ComparisonRow[]; empty: string }) {
  if (rows.length === 0) return <Empty>{empty}</Empty>;
  return (
    <Table head={['Item', 'This period', 'Previous year', 'Change', '%']} numHead={[1, 2, 3, 4]}>
      {rows.map((row) => (
        <tr key={row.label}>
          <td><strong>{row.label}</strong></td>
          <td className="num">{gbp(row.currentPence)}</td>
          <td className="num">{gbp(row.previousPence)}</td>
          <td className={`num ${row.deltaPence < 0 ? 'amount neg' : row.deltaPence > 0 ? 'amount pos' : ''}`}>{gbp(row.deltaPence, { sign: true })}</td>
          <td className="num muted">{percent(row.changePct)}</td>
        </tr>
      ))}
    </Table>
  );
}

/**
 * Progress pack: debt payoff, savings on track and year over year. Only the
 * explicit Apply action writes, and then only each debt's monthly payment.
 */
export function Progress({ ds, engine, year, month, update, notify }: ViewProps) {
  const today = todayIso();
  const [strategy, setStrategy] = useState<PayoffStrategy>('snowball');
  const [extra, setExtra] = useState('');
  const [wholeYear, setWholeYear] = useState(false);

  const plan = payoffPlan(ds.debts ?? [], { strategy, extraPence: parseMoney(extra), startDate: today });
  const order = [...plan.perDebt].sort((left, right) => (left.payoffMonth ?? 999) - (right.payoffMonth ?? 999));
  const savings = savingsProgress(ds.savings ?? [], today);
  const comparison = yearComparison(ds, engine, year, wholeYear ? null : month);
  const period = wholeYear ? String(year) : `${MONTH_LONG[month - 1]} ${year}`;
  const applied = plan.startingPayments.filter((entry) => entry.fromPence !== entry.toPence);

  const apply = () => {
    if (!plan.ok) return notify(plan.reason ?? 'That plan cannot be applied');
    if (applied.length === 0) return notify('Every debt already pays its planned amount');
    const agreed = confirm([
      `Update ${applied.length} monthly payment${applied.length === 1 ? '' : 's'} to the ${strategy} plan?`,
      '',
      ...applied.map((entry) => `${entry.name}: ${gbp(entry.fromPence)} → ${gbp(entry.toPence)}`),
      '',
      'Only the monthly payment changes. Each debt balance is left exactly as it is.',
    ].join('\n'));
    if (!agreed) return;
    update((dataset) => { applyPayoffPlan(dataset, plan); });
    notify(`${applied.length} debt payment${applied.length === 1 ? '' : 's'} updated to the plan`);
  };

  return (
    <>
      <Section
        title="Debt payoff"
        sub="Snowball clears the smallest balance first; avalanche clears the highest interest rate first. Payments roll to the next debt as each one is cleared."
        actions={
          <div style={{ display: 'flex', gap: 6 }}>
            <button className={`btn sm ${strategy === 'snowball' ? 'primary' : 'ghost'}`} onClick={() => setStrategy('snowball')}>Snowball</button>
            <button className={`btn sm ${strategy === 'avalanche' ? 'primary' : 'ghost'}`} onClick={() => setStrategy('avalanche')}>Avalanche</button>
          </div>
        }
      >
        {(ds.debts ?? []).length > 0 ? (
          <>
            <div style={{ padding: 16 }}>
              <Field label="Extra payment each month £" hint="Added on top of every minimum, then rolled into the next debt.">
                <input className="input" inputMode="decimal" style={{ maxWidth: 200 }} value={extra} onChange={(event) => setExtra(event.target.value)} />
              </Field>
            </div>
            <div className="metric-list" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
              <div className="metric"><span>Debt-free in</span><strong>{plan.ok ? `${plan.months} months` : '—'}</strong></div>
              <div className="metric"><span>Payoff date</span><strong style={{ fontSize: 16 }}>{plan.ok ? dateUk(plan.payoffDate) : '—'}</strong></div>
              <div className="metric"><span>Interest paid</span><strong>{gbp(plan.totalInterestPence)}</strong></div>
              <div className="metric"><span>Interest saved</span><strong>{plan.minimumComplete ? gbp(plan.interestSavedPence) : '—'}</strong></div>
            </div>
            {!plan.ok && (
              <div style={{ padding: '0 16px 16px' }}><div className="notice warn">{plan.reason}</div></div>
            )}
            <Table head={['Order', 'Debt', 'Balance', 'Pays now', 'Planned payment', 'Cleared']} numHead={[2, 3, 4]}>
              {order.map((entry, index) => {
                const debt = (ds.debts ?? []).find((row) => row.id === entry.id);
                return (
                  <tr key={entry.id}>
                    <td className="num">{index + 1}</td>
                    <td><strong>{entry.name}</strong><div className="muted small">{debt?.interestRatePct ? `${debt.interestRatePct}% APR` : 'No interest rate recorded'}</div></td>
                    <td className="num">{gbp(debt?.balancePence ?? 0)}</td>
                    <td className="num">{gbp(debt?.monthlyPaymentPence ?? 0)}</td>
                    <td className="num"><strong>{gbp(entry.startingPaymentPence)}</strong></td>
                    <td className="muted nowrap">{entry.payoffDate ? dateUk(entry.payoffDate) : 'Not within 50 years'}</td>
                  </tr>
                );
              })}
            </Table>
            <div className="toolbar" style={{ borderBottom: 0 }}>
              <span className="muted small">
                {plan.minimumComplete
                  ? `Minimum payments alone would cost ${gbp(plan.minimumInterestPence)} in interest.`
                  : 'The minimum payments never clear the balance, so there is no saving to compare.'}
              </span>
              <div className="toolbar-spacer" />
              <button className="btn primary" disabled={!plan.ok || applied.length === 0} onClick={apply}>
                Apply {applied.length || ''} planned payment{applied.length === 1 ? '' : 's'}
              </button>
            </div>
          </>
        ) : (
          <Empty>Add a debt with a balance under Debts to plan a payoff.</Empty>
        )}
      </Section>

      <Section
        title="Savings on track"
        sub="Each target is compared with the regular contribution and the interest rate on the account."
        actions={<Badge tone={savings.some((entry) => entry.onTrack === false) ? 'amber' : 'green'}>{savings.filter((entry) => entry.onTrack === false).length} behind</Badge>}
      >
        {savings.length > 0 ? (
          <Table head={['Account', 'Balance', 'Target', 'Target date', 'Required', 'Paying', 'Status']} numHead={[1, 2, 4, 5]}>
            {savings.map((entry) => (
              <tr key={entry.id}>
                <td><strong>{entry.name}</strong>{entry.projectedDate && <div className="muted small">Reaches target {dateUk(entry.projectedDate)}</div>}</td>
                <td className="num">{gbp(entry.balancePence)}</td>
                <td className="num">{entry.targetPence ? gbp(entry.targetPence) : '—'}</td>
                <td className="muted nowrap">{entry.targetDate ? dateUk(entry.targetDate) : 'Not set'}</td>
                <td className="num">{entry.requiredMonthlyPence === null ? '—' : `${gbp(entry.requiredMonthlyPence)}/mo`}</td>
                <td className="num">{gbp(entry.monthlyContributionPence)}/mo</td>
                <td>
                  {entry.onTrack === null ? <Badge tone="neutral">{entry.status}</Badge>
                    : entry.onTrack ? <Badge tone="green">On track</Badge>
                      : <Badge tone="amber">Behind by {gbp(entry.gapPence)}/mo</Badge>}
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>Add a savings account with a target under Savings to track progress.</Empty>
        )}
        <div style={{ padding: '0 16px 16px' }}>
          <div className="notice info">Set a target date on a savings account to make the required monthly figure meaningful; without one, the page shows when the current contribution reaches the target.</div>
        </div>
      </Section>

      <Section
        title={`Year over year — ${period}`}
        sub="Locked months use the recorded close; open months recalculate. Categories and provider spend come from the same ledger."
        actions={
          <button className="btn ghost sm" onClick={() => setWholeYear((current) => !current)}>
            {wholeYear ? 'Show this month' : 'Show the whole year'}
          </button>
        }
      >
        {comparison.hasPrevious ? (
          <>
            <ComparisonTable rows={comparison.rows} empty="No figures to compare yet." />
            <div style={{ padding: '0 16px 8px' }}><div className="notice info">{comparison.note}</div></div>
            <div style={{ padding: '0 16px 16px' }}>
              <h3 style={{ margin: '8px 0', fontSize: 15 }}>By category</h3>
              <ComparisonTable rows={comparison.categories} empty="No categorised spending in either period." />
              <h3 style={{ margin: '16px 0 8px', fontSize: 15 }}>By provider link</h3>
              <ComparisonTable rows={comparison.providers} empty="No scheduled bills in either period." />
            </div>
          </>
        ) : (
          <div style={{ padding: 16 }}><div className="notice warn">{comparison.note}</div></div>
        )}
      </Section>
    </>
  );
}
