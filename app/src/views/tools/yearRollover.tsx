import { useMemo, useState } from 'react';
import type { ViewProps } from '../../types';
import { Section } from '../../components';
import { dateUk, gbp, todayIso } from '../../format';
import { planYearRollover, rolloverYear } from '../../../../core/yearRollover';

export function YearRolloverSection({ ds, year, update, setYear, notify }: Pick<ViewProps, 'ds' | 'update' | 'setYear' | 'notify'> & { year: number }) {
  const next = ds.settings.targetYear + 1;
  const [carryOver, setCarryOver] = useState(false);
  const result = planYearRollover(ds, next, { carryBalances: carryOver });
  const carryPreview = useMemo(
    () => planYearRollover(ds, next, { carryBalances: true }).plan?.carry,
    [ds, next],
  );
  const roll = () => {
    if (!result.ok || !result.plan) {
      notify(result.reason ?? 'That rollover is not available.');
      return;
    }
    const details = result.plan;
    const carryPlan = details.carry;
    const agreed = confirm([
      `Roll the budget from ${details.from} to ${details.to}?`,
      '',
      `As-of date → ${dateUk(details.asOfDate)}`,
      `Lock cutoff → ${dateUk(details.lockCutoff)}`,
      ...(carryPlan ? [
        '',
        `Carry balances into ${details.to} from ${dateUk(carryPlan.through)}:`,
        `• ${carryPlan.accountNames.length} accounts (${gbp(carryPlan.accountTotalPence)} total)`,
        `• ${carryPlan.cardCount} cards and ${carryPlan.personCount} people`,
        `• ${carryPlan.providerNames.length} provider ledgers`,
        `• ${carryPlan.billNames.length} bills continue with their current amounts`,
      ].filter(Boolean) : []),
      '',
      'Preserved:',
      ...details.preserved.map((entry) => `• ${entry}`),
      '',
      `The balance anchor remains ${ds.settings.anchorDate ? dateUk(ds.settings.anchorDate) : 'unset'}. Recalibrate it separately only after reconciling the bank balance.`,
    ].join('\n'));
    if (!agreed) return;
    update((dataset) => { rolloverYear(dataset, details.to, todayIso(), { carryBalances: carryOver }); });
    setYear(details.to);
    notify(carryOver
      ? `Target year is now ${details.to} — balances were carried into the new year`
      : `Target year is now ${details.to} — history and provider year blocks were kept`);
  };
  return (
    <Section title="Year rollover" sub="Move the configured year forward without rewriting history">
      <div style={{ padding: 16, display: 'grid', gap: 12 }}>
        <div className="metric-list" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          <div className="metric"><span>Target year</span><strong>{ds.settings.targetYear}</strong></div>
          <div className="metric"><span>Viewing</span><strong>{year}</strong></div>
          <div className="metric"><span>Next year</span><strong>{next}</strong></div>
        </div>
        <div className="notice info">
          Rolling over sets the As-of date and lock cutoff to the start of {next}, so new rows and bills land in the new year. By default month locks, transactions, bills, provider year blocks and the balance anchor date stay exactly as they are. Use the top-bar year selector to read any year without rolling over.
        </div>
        {carryPreview && (
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 14, border: '1px solid var(--line)', borderRadius: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={carryOver}
              onChange={(event) => setCarryOver(event.target.checked)}
              style={{ marginTop: 3 }}
            />
            <span>
              <strong>Carry over balances into {next}</strong>
              <span className="muted small" style={{ display: 'block', marginTop: 3 }}>
                Start {next} from the {dateUk(carryPreview.through)} close: {carryPreview.accountNames.length} accounts
                ({gbp(carryPreview.accountTotalPence)} total), {carryPreview.cardCount} cards, {carryPreview.personCount} people
                and {carryPreview.providerNames.length} provider ledgers. Bills continue with their current amounts and due dates.
                Earlier transactions and month locks stay in the budget.
              </span>
            </span>
          </label>
        )}
        {ds.settings.targetYear !== year && (
          <div className="notice warn">
            You are viewing {year} while the target year is {ds.settings.targetYear}. Rollover changes the target year used by the engine and new entries; it does not change which year you are viewing.
          </div>
        )}
        <div>
          <button className="btn primary" onClick={roll}>Roll over to {next}</button>
        </div>
      </div>
    </Section>
  );
}
