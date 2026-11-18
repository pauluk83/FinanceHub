import { useState } from 'react';
import type { ViewProps } from '../types';
import { Badge, Empty, Field, Section, Table } from '../components';
import { dateUk, gbp, parseMoney } from '../format';
import { buildForecast, type ForecastOverride } from '../../../core/forecast';

/**
 * 12-month cash forecast with an in-memory what-if. The scenario is applied to
 * a second calculation only; nothing here writes to the budget.
 */
export function Forecast({ ds, engine }: ViewProps) {
  const [whatIf, setWhatIf] = useState(false);
  const [draft, setDraft] = useState({ billsPercent: '10', extraDebt: '', savingsExtra: '', income: '', oneOff: '' });
  const [oneOffMonth, setOneOffMonth] = useState('');

  const baseline = buildForecast(ds, engine);
  const oneOffKey = oneOffMonth || baseline.months[1]?.key || baseline.months[0]?.key || '';
  const override: ForecastOverride = {
    billsPercent: Number(draft.billsPercent) || 0,
    extraDebtPence: parseMoney(draft.extraDebt),
    savingsExtraPence: parseMoney(draft.savingsExtra),
    incomePence: draft.income.trim() === '' ? null : parseMoney(draft.income),
    oneOffPence: parseMoney(draft.oneOff),
    oneOffMonth: oneOffKey,
  };
  const scenario = whatIf ? buildForecast(ds, engine, { override }) : null;
  const shown = scenario ?? baseline;
  const lowestLabel = baseline.months.find((entry) => entry.key === baseline.lowestKey)?.label ?? '—';
  const scenarioLowest = scenario?.months.find((entry) => entry.key === scenario.lowestKey)?.label ?? '—';

  return (
    <>
      <Section
        title="Twelve-month forecast"
        sub={`Cash from your As-of date (${dateUk(baseline.through)}) forward, using scheduled bills, PIP/UC, debt payments and savings contributions. Savings moves are shown as money moved, not spent.`}
        actions={<Badge tone={baseline.monthsNegative ? 'amber' : 'green'}>{baseline.monthsNegative ? `${baseline.monthsNegative} months below zero` : 'No month below zero'}</Badge>}
      >
        <div className="metric-list" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
          <div className="metric"><span>Cash at As-of</span><strong>{gbp(baseline.startPence)}</strong></div>
          <div className="metric"><span>Cash in 12 months</span><strong>{gbp(shown.endPence)}</strong></div>
          <div className="metric"><span>Savings held then</span><strong>{gbp(shown.endSavingsPence)}</strong></div>
          <div className="metric"><span>Total position then</span><strong>{gbp(shown.endPositionPence)}</strong></div>
        </div>
        <div style={{ padding: '0 16px 16px' }}>
          <div className="notice info">
            The first row covers what is left of {baseline.months[0]?.label ?? 'this month'} from your As-of date, so nothing already in the balance is counted twice.
            Lowest cash is {gbp(shown.lowestPence)} at {scenario ? scenarioLowest : lowestLabel}; savings contributions leave the current account but stay in Position.
            {baseline.currentMonth && (
              <> The engine&apos;s full-month view of {baseline.currentMonth.label} is {gbp(baseline.currentMonth.incomePence)} income and {gbp(baseline.currentMonth.expensesPence)} expenses, a net of {gbp(baseline.currentMonth.netPence, { sign: true })}.</>
            )}
          </div>
        </div>
        <Table head={['Month', 'Opening', 'Income', 'Bills', 'Debt', 'To savings', 'One-off', 'Closing cash', 'Savings held', 'Position', ...(scenario ? ['What-if position'] : [])]} numHead={[1, 2, 3, 4, 5, 6, 7, 8, 9]}>
          {baseline.months.map((entry, index) => {
            const alt = scenario?.months[index];
            return (
              <tr key={entry.key}>
                <td>
                  <strong>{entry.label}</strong>
                  {entry.partial && <div className="muted small">Rest of the month</div>}
                </td>
                <td className="num">{gbp(entry.openingPence)}</td>
                <td className="num">{gbp(entry.incomePence)}</td>
                <td className="num">{gbp(entry.billsPence)}</td>
                <td className="num">{gbp(entry.debtPence)}</td>
                <td className="num">{gbp(entry.savingsPence)}</td>
                <td className="num">{entry.oneOffPence ? gbp(entry.oneOffPence) : '—'}</td>
                <td className="num"><strong className={entry.closingPence < 0 ? 'amount neg' : ''}>{gbp(entry.closingPence)}</strong></td>
                <td className="num">{gbp(entry.savingsBalancePence)}</td>
                <td className="num"><strong className={entry.positionPence < 0 ? 'amount neg' : ''}>{gbp(entry.positionPence)}</strong></td>
                {scenario && (
                  <td className="num">
                    <strong className={alt && alt.positionPence < 0 ? 'amount neg' : ''}>{alt ? gbp(alt.positionPence) : '—'}</strong>
                    {alt && alt.positionPence !== entry.positionPence && (
                      <div className="muted small">{gbp(alt.positionPence - entry.positionPence, { sign: true })}</div>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </Table>
        {baseline.months.length === 0 && <Empty>No forecast months could be built.</Empty>}
      </Section>

      <Section
        title="What-if scenario"
        sub="Temporary assumptions compared with the real forecast. Nothing is written to the budget."
        actions={
          <button className={`btn ${whatIf ? 'ghost' : 'primary'}`} onClick={() => setWhatIf((current) => !current)}>
            {whatIf ? 'Clear scenario' : 'Start a scenario'}
          </button>
        }
      >
        {whatIf ? (
          <div className="form-grid" style={{ padding: 16 }}>
            <Field label="Bills change %" hint="Positive means bills rise; negative means they fall.">
              <input className="input" inputMode="decimal" value={draft.billsPercent} onChange={(event) => setDraft({ ...draft, billsPercent: event.target.value })} />
            </Field>
            <Field label="Extra debt payment £/month">
              <input className="input" inputMode="decimal" value={draft.extraDebt} onChange={(event) => setDraft({ ...draft, extraDebt: event.target.value })} />
            </Field>
            <Field label="Extra saved £/month">
              <input className="input" inputMode="decimal" value={draft.savingsExtra} onChange={(event) => setDraft({ ...draft, savingsExtra: event.target.value })} />
            </Field>
            <Field label="Income overrides £/month" hint="Leave blank to keep the scheduled PIP and Universal Credit.">
              <input className="input" inputMode="decimal" value={draft.income} onChange={(event) => setDraft({ ...draft, income: event.target.value })} />
            </Field>
            <Field label="One-off expense £">
              <input className="input" inputMode="decimal" value={draft.oneOff} onChange={(event) => setDraft({ ...draft, oneOff: event.target.value })} />
            </Field>
            <Field label="One-off month">
              <select className="select" value={oneOffKey} onChange={(event) => setOneOffMonth(event.target.value)}>
                {baseline.months.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
              </select>
            </Field>
            <div style={{ gridColumn: '1 / -1' }}>
              <div className="notice warn">
                Extra debt and savings amounts start in the rest of this month and continue for the whole horizon. This scenario exists only in this page; closing it or choosing Clear scenario restores the real forecast, and the budget is never edited.
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: '0 16px 16px' }}>
            <p className="muted small" style={{ margin: 0 }}>
              Start a scenario to raise or cut bills, pay more into a debt or savings account, override income, or add a one-off expense and compare it side by side.
            </p>
          </div>
        )}
        {scenario && (
          <div className="metric-list" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            <div className="metric"><span>Position difference</span><strong>{gbp(scenario.endPositionPence - baseline.endPositionPence, { sign: true })}</strong></div>
            <div className="metric"><span>Lowest point</span><strong>{gbp(scenario.lowestPence - baseline.lowestPence, { sign: true })}</strong></div>
            <div className="metric"><span>Months below zero</span><strong>{scenario.monthsNegative}</strong></div>
          </div>
        )}
      </Section>

      <Section title="Assumptions" sub="Exactly what the projection does and does not use">
        <div className="list">
          {baseline.notes.map((note) => (
            <div className="list-row" key={note}><div className="sub">{note}</div></div>
          ))}
        </div>
      </Section>
    </>
  );
}
