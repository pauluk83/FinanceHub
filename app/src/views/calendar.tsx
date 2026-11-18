import { useEffect, useMemo, useState } from 'react';
import type { ViewProps } from '../types';
import { Badge, Section } from '../components';
import { dateUk, download, gbp, MONTHS, MONTH_LONG, todayIso } from '../format';
import { calendarIcs, monthCalendar, safeToSpend } from '../../../core/calendar';
import type { Explanation } from '../../../core/explain';
import { ExplainButton, ExplainDialog } from '../explain';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Monday-first leading blanks for a month grid. */
function leadingBlanks(year: number, month: number): number {
  const weekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return (weekday + 6) % 7;
}

export function CalendarView({ ds, engine, year, month, setMonth, notify }: ViewProps) {
  const today = todayIso();
  const days = useMemo(() => monthCalendar(ds, engine, year, month, today), [ds, engine, year, month, today]);
  const safe = useMemo(() => safeToSpend(ds, engine, today), [ds, engine, today]);
  const [selected, setSelected] = useState<string>('');
  const [explanation, setExplanation] = useState<Explanation | null>(null);

  useEffect(() => {
    setSelected('');
  }, [year, month]);

  const selectedDay = days.find((day) => day.date === selected);
  const monthOut = days.reduce((sum, day) => sum + day.bills.reduce((total, bill) => total + bill.amountPence, 0), 0);
  const monthIn = days.reduce((sum, day) => sum + day.income.reduce((total, entry) => total + entry.amountPence, 0), 0);
  const lead = leadingBlanks(year, month);
  const cells: (typeof days[number] | null)[] = [...Array.from({ length: lead }, () => null), ...days];

  const safeExplanation: Explanation = {
    key: 'safe-to-spend',
    title: 'Safe to spend',
    subtitle: `Cleared cash minus bills before ${safe.horizonLabel}`,
    totalPence: safe.availablePence,
    source: 'live',
    rows: [
      { label: 'Cleared cash', detail: safe.cashRows.map((row) => row.name).join(', ') || 'No open accounts', amountPence: safe.cashPence },
      { label: `Bills before ${safe.nextIncomeDate || safe.horizonDate}`, detail: `${safe.billRows.length} payment${safe.billRows.length === 1 ? '' : 's'}`, amountPence: -safe.billsPence },
      { label: 'Savings contributions', detail: `${safe.savingsRows.length} contribution${safe.savingsRows.length === 1 ? '' : 's'}`, amountPence: -safe.savingsPence },
    ],
    note: 'Card balances are not subtracted again: the bills and contributions above are the only deductions.',
  };

  const exportIcs = () => {
    download('financehub-calendar.ics', calendarIcs(ds, engine, { from: today }), 'text/calendar');
    notify('Calendar exported — import it into Google or Apple Calendar');
  };

  return (
    <>
      <section className="hero">
        <div className="hero-main">
          <span className="eyebrow">Safe to spend</span>
          <h2>{gbp(safe.availablePence)}</h2>
          <div className="hero-figures">
            <div className="hero-figure"><span>Cleared cash</span><strong>{gbp(safe.cashPence)}</strong></div>
            <div className="hero-figure"><span>Bills before income</span><strong className="amount neg">{gbp(safe.billsPence)}</strong></div>
            <div className="hero-figure"><span>Savings</span><strong className="amount neg">{gbp(safe.savingsPence)}</strong></div>
          </div>
        </div>
        <div className="hero-side">
          <Badge tone={safe.availablePence < 0 ? 'red' : 'green'}>
            {safe.availablePence < 0 ? 'Short before income' : `Until ${safe.horizonLabel}`}
          </Badge>
          <div className="muted">Next income {safe.nextIncomeDate ? dateUk(safe.nextIncomeDate) : 'not scheduled'}</div>
          <ExplainButton onClick={() => setExplanation(safeExplanation)} label="Explain figure" />
          <button className="btn" type="button" onClick={exportIcs}>Export .ics</button>
        </div>
      </section>

      <Section
        title={`${MONTH_LONG[month - 1]} ${year}`}
        sub="Bills, income, debt payments, savings contributions and holidays in one grid."
        actions={
          <div className="toolbar" style={{ border: 0, padding: 0 }}>
            <select className="month-select" aria-label="Calendar month" value={month} onChange={(event) => setMonth(Number(event.target.value))}>
              {MONTHS.map((label, index) => <option key={label} value={index + 1}>{label} {year}</option>)}
            </select>
            <Badge tone="blue">Out {gbp(monthOut)}</Badge>
            <Badge tone="green">In {gbp(monthIn)}</Badge>
          </div>
        }
      >
        <div className="calendar-grid">
          {WEEKDAYS.map((label) => <div className="calendar-weekday" key={label}>{label}</div>)}
          {cells.map((day, index) => {
            if (!day) return <div className="calendar-day blank" key={`blank-${index}`} />;
            const out = day.bills.reduce((sum, bill) => sum + bill.amountPence, 0)
              + day.debts.reduce((sum, debt) => sum + debt.amountPence, 0)
              + day.savings.reduce((sum, entry) => sum + entry.amountPence, 0);
            const income = day.income.reduce((sum, entry) => sum + entry.amountPence, 0);
            const events = day.bills.length + day.income.length + day.debts.length + day.savings.length + day.holidays.length;
            return (
              <button
                key={day.date}
                type="button"
                className={`calendar-day ${day.date === today ? 'today' : ''} ${selected === day.date ? 'selected' : ''} ${events > 0 ? 'has-events' : ''}`}
                onClick={() => setSelected(day.date)}
                aria-label={`${dateUk(day.date)}${events ? `, ${events} event${events === 1 ? '' : 's'}` : ''}`}
              >
                <span className="calendar-day-number">{day.day}</span>
                {day.holidays.length > 0 && <span className="calendar-chip holiday">✈ {day.holidays[0].name}</span>}
                {day.bills.slice(0, 2).map((bill) => <span className="calendar-chip bill" key={bill.name}>{bill.name}</span>)}
                {day.bills.length > 2 && <span className="calendar-chip more">+{day.bills.length - 2} bills</span>}
                {income > 0 && <span className="calendar-chip income">+{gbp(income)}</span>}
                {out > 0 && <span className="calendar-chip out">−{gbp(out)}</span>}
              </button>
            );
          })}
        </div>
        <p className="muted small" style={{ padding: '0 16px 16px' }}>
          The month's bill total is the same <strong>{gbp(monthOut - days.reduce((sum, day) => sum + day.debts.reduce((total, debt) => total + debt.amountPence, 0) + day.savings.reduce((total, entry) => total + entry.amountPence, 0), 0))}</strong> the
          bills ledger schedules. The .ics file carries the next 12 months with stable UIDs.
        </p>
      </Section>

      {selectedDay ? (
        <Section
          title={dateUk(selectedDay.date)}
          sub={`${selectedDay.bills.length + selectedDay.income.length + selectedDay.debts.length + selectedDay.savings.length + selectedDay.holidays.length} event(s)`}
          actions={<button className="btn ghost sm" type="button" onClick={() => setSelected('')}>Close</button>}
        >
          {selectedDay.locked && <div className="notice alert info">This month is locked; the calendar is read-only.</div>}
          {selectedDay.holidays.map((holiday) => (
            <div className="calendar-detail" key={`holiday-${holiday.name}`}>
              <Badge tone="blue">Holiday</Badge><strong>{holiday.name}</strong><span className="muted">{dateUk(holiday.start)} → {dateUk(holiday.end)}</span>
            </div>
          ))}
          {selectedDay.income.map((income, index) => (
            <div className="calendar-detail" key={`income-${income.kind}-${index}`}>
              <Badge tone="green">{income.kind}</Badge><strong>Income</strong><span className="amount pos">{gbp(income.amountPence)}</span>
            </div>
          ))}
          {selectedDay.bills.map((bill) => (
            <div className="calendar-detail" key={`bill-${bill.name}`}>
              <Badge tone={bill.paid ? 'amber' : 'blue'}>{bill.paid ? 'Paid' : 'Bill'}</Badge>
              <strong>{bill.name}</strong>
              <span className="muted">from {bill.account}</span>
              <span className="amount">{gbp(bill.amountPence)}</span>
            </div>
          ))}
          {selectedDay.debts.map((debt) => (
            <div className="calendar-detail" key={`debt-${debt.name}`}>
              <Badge tone="red">Debt</Badge><strong>{debt.name}</strong><span className="amount">{gbp(debt.amountPence)}</span>
            </div>
          ))}
          {selectedDay.savings.map((entry) => (
            <div className="calendar-detail" key={`savings-${entry.name}`}>
              <Badge tone="amber">Savings</Badge><strong>{entry.name}</strong><span className="amount">{gbp(entry.amountPence)}</span>
            </div>
          ))}
          {selectedDay.bills.length + selectedDay.income.length + selectedDay.debts.length + selectedDay.savings.length + selectedDay.holidays.length === 0 && (
            <div className="empty">Nothing scheduled on this day.</div>
          )}
        </Section>
      ) : (
        <Section title="Upcoming deductions" sub={`Due before ${safe.horizonLabel}`}>
          {safe.billRows.length === 0 ? <div className="empty">No bills due before the next income.</div> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Bill</th><th>Due</th><th className="num">Amount</th></tr></thead>
                <tbody>
                  {safe.billRows.map((bill) => (
                    <tr key={`${bill.name}-${bill.dueDate}`}>
                      <td>{bill.name}</td>
                      <td className="muted">{dateUk(bill.dueDate)}</td>
                      <td className="num">{gbp(bill.amountPence)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}

      <ExplainDialog explanation={explanation} onClose={() => setExplanation(null)} />
    </>
  );
}
