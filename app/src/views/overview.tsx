import { useEffect, useState } from 'react';
import type { ViewProps } from '../types';
import { Badge, Bar, Card, Empty, Field, Money, Section, Table } from '../components';
import { dateTimeUk, dateUk, gbp, MONTHS, MONTH_LONG, parseMoney, pct } from '../format';
import { groupHolidayTrips } from '../../../core/holidays';
import { accountsNeedingReview } from '../../../core/accounts';
import { duplicateGroups } from '../../../core/importDedupe';
import { providerBalancesForYear } from '../../../core/providerSnapshot';

export function Dashboard({ ds, engine, year, month, setMonth, go, isLocal, lastSavedAt, lastSyncedAt, feedbackItems, openFeedback, userEmail }: ViewProps) {
  const [openHolidayTrips, setOpenHolidayTrips] = useState<Set<string>>(() => new Set());
  const toggleHolidayTrip = (key: string) => setOpenHolidayTrips((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });
  const d = engine.dashboard(year, month);
  const ytd = d.ytd;
  const refMonths = (ds.reference?.months ?? []) as any[];
  // Reconciliation against the workbook uses the uncorrected ledger: the months
  // shown deliberately exclude internal transfers, but the import itself should
  // still reproduce what the workbook recorded.
  const parity = refMonths.filter((m) => {
    const s = engine.monthlySummary(year, m.month);
    const income = engine.monthlyIncome(year, m.month, true).total;
    const expenses = engine.monthlyExpenses(year, m.month, true).total;
    return income === m.incomePence && expenses === m.expensesPence && income - expenses === m.netPence && s.owedPence === m.owedPence;
  }).length;
  const cells = MONTHS.map((label, i) => ({ label, ...engine.monthlySummary(year, i + 1) }));
  const start = new Date(`${year}-01-01`).getTime();
  const end = new Date(`${year}-12-31`).getTime();
  const now = new Date(ds.settings.asOfDate).getTime();
  const yearProgress = Math.max(0, Math.min(1, (now - start) / (end - start)));
  const holidayTrips = groupHolidayTrips(engine.holidays(ds.settings.asOfDate), (holiday) => holiday).slice(0, 7);
  const needsReview = accountsNeedingReview(ds.transactions, ds, d.asOf);
  const duplicateReview = duplicateGroups(ds.transactions.filter((t) => t.autoBill !== true));
  const duplicateRows = duplicateReview.reduce((sum, group) => sum + group.rows.length, 0);
  const peopleOwed = d.owedByPerson
    .filter((person) => person.balancePence > 0)
    .sort((a, b) => b.balancePence - a.balancePence);
  const unreadFeedback = feedbackItems
    .filter((item) => !item.readAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const latestFeedback = unreadFeedback[0];
  const feedbackWho = latestFeedback?.person === userEmail ? 'you' : latestFeedback?.person ?? 'someone';

  return (
    <>
      <section className="hero">
        <div className="hero-main">
          <span className="eyebrow">Current month</span>
          <h2>{MONTH_LONG[month - 1]} {year}</h2>
          <div className="hero-figures">
            <div className="hero-figure"><span>Income</span><strong className="amount pos">{gbp(d.current.incomePence)}</strong></div>
            <div className="hero-figure"><span>Expenses</span><strong className="amount neg">{gbp(d.current.expensesPence)}</strong></div>
            <div className="hero-figure"><span>Net</span><strong className={`amount ${d.current.netPence < 0 ? 'neg' : 'pos'}`}>{gbp(d.current.netPence, { sign: true })}</strong></div>
            <div className="hero-figure"><span>Owed to me</span><strong>{gbp(d.totalOwedPence)}</strong></div>
          </div>
        </div>
        <div className="hero-side">
          <Badge tone={d.current.locked ? 'amber' : 'green'}>{d.current.locked ? '🔒 Month locked' : '● Open month'}</Badge>
          <div className="muted">Savings rate <strong>{pct(ytd.savingsRate)}</strong></div>
          <div className="muted">{pct(yearProgress, 0)} of the year elapsed</div>
          <div className="saved-meta">
            <span>Data as of <strong>{dateUk(ds.settings.asOfDate)}</strong></span>
            <span>Last saved <strong>{lastSavedAt ? dateTimeUk(lastSavedAt) : '—'}</strong></span>
            {!isLocal && (
              <span>{lastSyncedAt ? `Cloud synced ${dateTimeUk(lastSyncedAt)}` : 'Cloud sync pending'}</span>
            )}
          </div>
        </div>
      </section>

      {latestFeedback && (
        <div className="notice info feedback-notice" role="status">
          <div className="feedback-notice-copy">
            <strong>{unreadFeedback.length === 1 ? 'New feedback message' : `${unreadFeedback.length} new feedback messages`}</strong>
            <span>From {feedbackWho}: “{feedbackExcerpt(latestFeedback.message)}”</span>
          </div>
          <button className="btn ghost sm" type="button" onClick={() => openFeedback('inbox')}>
            Read feedback
          </button>
        </div>
      )}

      {needsReview.length > 0 && (
        <Section
          title="Needs review"
          sub="These rows use account names that are not a bank, person, card or pseudo-account. They stay in the log but are excluded from totals until mapped."
          actions={<button className="btn ghost sm" onClick={() => go('accounts')}>Review in Accounts</button>}
        >
          <Table head={['Account', 'Rows', 'Expense total', 'State']} numHead={[1, 2]}>
            {needsReview.map((account) => (
              <tr key={account.name}>
                <td><strong>{account.name}</strong></td>
                <td className="num">{account.rows}</td>
                <td className="num">{gbp(account.expensePence)}</td>
                <td><Badge tone="amber">Not counted</Badge></td>
              </tr>
            ))}
          </Table>
        </Section>
      )}

      {duplicateReview.length > 0 && (
        <div className="notice info" role="status">
          <div>
            <strong>{duplicateReview.length} duplicate {duplicateReview.length === 1 ? 'group' : 'groups'} · {duplicateRows} rows</strong>
            <span>These rows share a date, account, type and amount. They stay in the ledger untouched; review them in Settings before changing anything.</span>
          </div>
          <button className="btn ghost sm" type="button" onClick={() => go('settings')}>
            Review duplicate check
          </button>
        </div>
      )}

      <div className="kpi-grid">
        <Card title="YTD income" value={gbp(ytd.incomePence)} sub={`${MONTHS[month - 1]} ${year} year to date`} tone="pos" />
        <Card title="YTD expenses" value={gbp(ytd.expensesPence)} sub="Bills, people, cards and cash" tone="neg" />
        <Card title="Net" value={gbp(ytd.netPence, { sign: true })} sub="Income minus expenses" tone={ytd.netPence < 0 ? 'neg' : 'pos'} />
        <Card title="Total owed" value={gbp(d.totalOwedPence)} sub="People accounts, opening + lent − repaid" />
        <Card title="Account balance" value={gbp(d.totalAccountBalancePence)} sub={`Across ${d.accounts.length} bank accounts`} />
        <Card title="Account target" value={gbp(d.accounts.reduce((s, a) => s + a.targetPence, 0))} sub="Combined target" />
        <Card title="Card balance" value={gbp(d.cardBalancePence)} sub={`${pct(d.cardUtilisation)} of ${gbp(d.cardLimitPence)}`} tone={d.cardBalancePence > 0 ? 'warn' : 'neutral'} />
        <Card title="Bills this month" value={gbp(d.billsTotalPence)} sub={`${d.bills.length} scheduled bills`} />
      </div>

      <Section
        title="Year at a glance"
        sub="Every month, newest lock state first — click a month to inspect it"
        actions={<Badge tone={refMonths.length === 0 ? 'neutral' : parity === 12 ? 'green' : 'amber'}>{refMonths.length === 0 ? 'Custom budget' : `${parity}/12 months match workbook`}</Badge>}
      >
        <div style={{ padding: 14 }}>
          <div className="month-strip">
            {cells.map((c) => (
              <button
                key={c.label}
                className={`month-btn ${month === c.month ? 'active' : ''}`}
                onClick={() => setMonth(c.month)}
                onDoubleClick={() => { setMonth(c.month); go('monthly'); }}
                title={`${c.label}: net ${gbp(c.netPence)}`}
              >
                <div className="month-name">{c.label}</div>
                <div className="month-net">{gbp(c.netPence)}</div>
                <span className="month-lock">{c.locked ? '🔒' : ' '}</span>
              </button>
            ))}
          </div>
        </div>
      </Section>      <Section
        title="Account reconciliation"
        sub="Expected balance at As-Of, with this month's flow, against target"
        actions={<button className="btn ghost sm" onClick={() => go('accounts')}>View accounts</button>}
      >
          <Table head={['Account', 'Flow', 'Balance', 'Target', 'Difference', '']} numHead={[1, 2, 3, 4]}>
            {d.accounts.map((a) => {
              const diff = a.targetPence - a.balancePence;
              return (
                <tr key={a.name}>
                  <td>{a.name}</td>
                  <td className="num"><Money pence={engine.accountFlow(a.name, year, month)} sign /></td>
                  <td className="num"><strong>{gbp(a.balancePence)}</strong></td>
                  <td className="num muted">{gbp(a.targetPence)}</td>
                  <td className={`num ${diff < 0 ? 'amount neg' : 'amount pos'}`}>{gbp(diff, { sign: true })}</td>
                  <td style={{ width: 90 }}><Bar value={a.targetPence === 0 ? 0 : a.balancePence / a.targetPence} tone={diff < 0 ? 'amber' : 'accent'} /></td>
                </tr>
              );
            })}
          </Table>
          {d.accounts.length === 0 && <Empty>No accounts yet — open Set up to add your first account.</Empty>}
      </Section>

      <div className="two-col">
        <Section
          title="Credit cards"
          sub="Opening + charges − refunds/payments"
          actions={<button className="btn ghost sm" onClick={() => go('cards')}>View cards</button>}
        >
          <Table head={['Card', 'Balance', 'Limit', 'Used', '']} numHead={[1, 2, 3]}>
            {d.cards.map((c) => (
              <tr key={c.name}>
                <td>{c.name}</td>
                <td className="num"><strong>{gbp(c.balancePence)}</strong></td>
                <td className="num muted">{gbp(c.limitPence)}</td>
                <td className="num">{pct(c.utilisation)}</td>
                <td style={{ width: 80 }}><Bar value={c.utilisation} tone={c.utilisation > 0.5 ? 'red' : 'accent'} /></td>
              </tr>
            ))}
          </Table>
          {d.cards.length === 0 && <Empty>No credit cards yet — add one in Set up.</Empty>}
        </Section>

        <Section
          title="People who owe me"
          sub="Positive balances only, as of the selected month"
          actions={<button className="btn ghost sm" onClick={() => go('people')}>View people</button>}
        >
          <div className="people-owed-grid">
            {peopleOwed.map((person) => (
              <div
                className="people-owed-item"
                key={person.shortName}
                title={person.fullName}
                aria-label={`${person.fullName || person.shortName}: ${gbp(person.balancePence)} owed`}
              >
                <span className="name">{person.shortName}</span>
                <span className="amount">{gbp(person.balancePence)}</span>
              </div>
            ))}
          </div>
          {peopleOwed.length === 0 && <Empty>No one owes you for this month.</Empty>}
        </Section>
      </div>

      <div className="two-col">
        <Section
          title="Bills due"
          sub={`Resolved for ${MONTH_LONG[month - 1]} — paid automatically on the due date`}
          actions={<button className="btn ghost sm" onClick={() => go('bills')}>View bills</button>}
        >
          <Table head={['Bill', 'Due', 'Method', 'Amount', 'Status']} numHead={[3]}>
            {d.bills.map((b) => (
              <tr key={b.name}>
                <td>{b.name}</td>
                <td className="muted">{dateUk(b.dueDate)}</td>
                <td className="muted small">{b.paymentMethod || '—'}</td>
                <td className="num"><strong>{gbp(b.amountPence)}</strong></td>
                <td>{b.paid ? <Badge tone="green">Paid</Badge> : <Badge>Scheduled</Badge>}</td>
              </tr>
            ))}
          </Table>
          {d.bills.length === 0 && <Empty>No bills scheduled for this month.</Empty>}
        </Section>

        <Section
          title="Holidays"
          sub="Soonest upcoming first; passed events sink to the bottom. Expand a trip for its cost lines."
          actions={<button className="btn ghost sm" onClick={() => go('holidays')}>View holidays</button>}
        >
          <div className="list">
            {holidayTrips.flatMap((trip) => {
              const headline = trip.headline;
              const showCostLines = openHolidayTrips.has(trip.key);
              const rows = [
                <div className="list-row" key={trip.key}>
                  <div>
                    <div className="title">{headline.event}</div>
                    <div className="sub">
                      {dateUk(trip.start)} → {dateUk(trip.end)} · {trip.nights ? `${trip.nights} nights` : 'No stay booked'}
                      {trip.extras.length > 0 ? ` · ${trip.extras.length} cost line${trip.extras.length === 1 ? '' : 's'}` : ''}
                    </div>
                    {trip.extras.length > 0 && (
                      <button
                        className="btn ghost sm"
                        aria-expanded={showCostLines}
                        style={{ marginTop: 4, padding: '1px 6px', fontSize: 11 }}
                        onClick={() => toggleHolidayTrip(trip.key)}
                      >
                        {showCostLines ? 'Hide' : 'Show'} {trip.extras.length} cost line{trip.extras.length === 1 ? '' : 's'}
                      </button>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <Badge tone={headline.ongoing ? 'amber' : headline.upcoming ? 'blue' : 'neutral'}>{headline.ongoing ? 'On holiday' : headline.upcoming ? `${headline.daysToGo} days` : 'Passed'}</Badge>
                    <div className="sub" style={{ marginTop: 3 }}>{trip.totalPence === null ? 'Amount redacted' : gbp(trip.totalPence)}{trip.extras.length > 0 ? ' incl. cost lines' : ''}</div>
                  </div>
                </div>,
              ];
              if (showCostLines) {
                trip.extras.forEach((extra, index) => {
                  const paid = String(extra.paid ?? '').toLowerCase();
                  rows.push(
                    <div
                      className="list-row"
                      key={`${trip.key}-cost-${index}`}
                      style={{ paddingLeft: 32, background: 'rgba(148, 163, 184, 0.06)' }}
                    >
                      <div>
                        <div className="title" style={{ fontWeight: 500 }}>{extra.event || 'Cost line'}</div>
                        <div className="sub">
                          Cost line · {paid.includes('unpaid') ? 'Unpaid' : paid.includes('paid') ? 'Paid' : 'Not set'}
                          {extra.ref ? ` · ${extra.ref}` : ''}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div className="sub">{extra.totalPence === null || extra.totalPence === undefined ? 'Amount redacted' : gbp(extra.totalPence)}</div>
                      </div>
                    </div>,
                  );
                });
              }
              return rows;
            })}
            {holidayTrips.length === 0 && <Empty>No holidays recorded.</Empty>}
          </div>
        </Section>
      </div>

    </>
  );
}

function feedbackExcerpt(message: string, max = 150) {
  const flat = message.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function monthEndIso(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function MonthEndClose({ ds, engine, year, month, update, notify }: Pick<ViewProps, 'ds' | 'engine' | 'year' | 'month' | 'update' | 'notify'>) {
  const key = monthKey(year, month);
  const endDate = monthEndIso(year, month);
  const [confirmed, setConfirmed] = useState(false);
  const [note, setNote] = useState('');
  const localLock = ds.monthLocks?.[key];
  const summary = engine.monthlySummary(year, month);
  const d = engine.dashboard(year, month);
  const complete = ds.settings.asOfDate >= endDate;

  useEffect(() => {
    setConfirmed(false);
    setNote('');
  }, [key]);

  const lockMonth = () => {
    if (!complete) return notify(`Set As-Of to ${dateUk(endDate)} or later before locking this month`);
    if (!confirmed) return notify('Confirm the balances before locking the month');
    const lockedAt = new Date().toISOString();
    update((dataset) => {
      dataset.monthLocks = {
        ...(dataset.monthLocks ?? {}),
        [key]: {
          lockedAt,
          note: note.trim(),
          incomePence: summary.incomePence,
          expensesPence: summary.expensesPence,
          netPence: summary.netPence,
          owedPence: summary.owedPence,
          accounts: d.accounts.map((a) => ({ name: a.name, balancePence: a.balancePence })),
          cards: d.cards.map((c) => ({ name: c.name, balancePence: c.balancePence })),
          people: d.owedByPerson.map((p) => ({ shortName: p.shortName, balancePence: p.balancePence })),
          bills: d.bills.map((b) => ({ name: b.name, amountPence: b.amountPence })),
          providers: providerBalancesForYear(dataset, year, endDate),
        },
      };
    });
    setConfirmed(false);
    setNote('');
    notify(`${MONTH_LONG[month - 1]} ${year} locked and balanced`);
  };

  const unlockMonth = () => {
    if (!localLock) return;
    if (!confirm(`Unlock ${MONTH_LONG[month - 1]} ${year}? The saved snapshot will be removed and the month will recalculate.`)) return;
    update((dataset) => {
      const next = { ...(dataset.monthLocks ?? {}) };
      delete next[key];
      dataset.monthLocks = next;
    });
    notify(`${MONTH_LONG[month - 1]} ${year} unlocked`);
  };

  if (summary.locked) {
    return (
      <Section
        title={`Month end — ${MONTH_LONG[month - 1]} ${year}`}
        sub={localLock ? `Locked ${dateUk(localLock.lockedAt.slice(0, 10))}` : 'Locked by the imported workbook'}
        actions={<Badge tone="amber">🔒 Locked</Badge>}
      >
        <div className="metric-list" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
          <div className="metric"><span>Income</span><strong>{gbp(summary.incomePence)}</strong></div>
          <div className="metric"><span>Expenses</span><strong>{gbp(summary.expensesPence)}</strong></div>
          <div className="metric"><span>Net</span><strong>{gbp(summary.netPence, { sign: true })}</strong></div>
          <div className="metric"><span>Owed</span><strong>{gbp(summary.owedPence)}</strong></div>
        </div>
        {localLock?.note && <div style={{ padding: '0 16px 16px' }}><div className="notice info">{localLock.note}</div></div>}
        {localLock && <div className="toolbar" style={{ borderBottom: 0 }}><button className="btn danger" onClick={unlockMonth}>Unlock this month</button></div>}
      </Section>
    );
  }

  return (
    <Section title={`Month end — ${MONTH_LONG[month - 1]} ${year}`} sub="Confirm the expected balances, then lock the month so its figures cannot change">
      {!complete && (
        <div style={{ padding: '0 16px 16px' }}>
          <div className="notice warn">This month ends {dateUk(endDate)}. Set the As-Of date to that date or later in Settings before locking it.</div>
        </div>
      )}
      <div className="metric-list" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        <div className="metric"><span>Expected bank balance</span><strong>{gbp(d.totalAccountBalancePence)}</strong></div>
        <div className="metric"><span>Card balance</span><strong>{gbp(d.cardBalancePence)}</strong></div>
        <div className="metric"><span>Owed to me</span><strong>{gbp(d.totalOwedPence)}</strong></div>
        <div className="metric"><span>Bills this month</span><strong>{gbp(d.billsTotalPence)}</strong></div>
      </div>
      <Table head={['Type', 'Name', 'Expected balance']} numHead={[2]}>
        {d.accounts.map((a) => <tr key={`bank-${a.name}`}><td>Bank</td><td>{a.name}</td><td className="num"><strong>{gbp(a.balancePence)}</strong></td></tr>)}
        {d.cards.map((c) => <tr key={`card-${c.name}`}><td>Card</td><td>{c.name}</td><td className="num"><strong>{gbp(c.balancePence)}</strong></td></tr>)}
        {d.owedByPerson.map((p) => <tr key={`person-${p.shortName}`}><td>Person</td><td>{p.shortName}</td><td className="num"><strong>{gbp(p.balancePence)}</strong></td></tr>)}
      </Table>
      {d.accounts.length + d.cards.length + d.owedByPerson.length === 0 && <Empty>No balances to confirm yet.</Empty>}
      <div style={{ padding: 16, display: 'grid', gap: 12 }}>
        <label className="muted small" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input id="month-end-confirm" type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          I have checked these balances against my bank, cards and people records.
        </label>
        <Field label="Reconciliation note (optional)">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Starling and Vanquis checked against statements" />
        </Field>
        <div><button className="btn primary" disabled={!complete || !confirmed} onClick={lockMonth}>Lock {MONTH_LONG[month - 1]} {year}</button></div>
      </div>
    </Section>
  );
}

export function MonthEnd(props: ViewProps) {
  return (
    <MonthEndClose
      ds={props.ds}
      engine={props.engine}
      year={props.year}
      month={props.month}
      update={props.update}
      notify={props.notify}
    />
  );
}

export function Monthly({ ds, engine, year, month, setMonth, go }: ViewProps) {
  const s = engine.monthlySummary(year, month);
  const inc = s.breakdown.income as any;
  const exp = s.breakdown.expenses as any;
  const mainAccount = ds.settings.primaryAccount || ds.accounts[0]?.name || 'Main account';
  const asOf = engine.throughFor(year, month);
  const accounts = engine.accountBalances(asOf);
  const people = engine.owedByPerson(asOf);
  const cells = MONTHS.map((label, i) => ({ label, ...engine.monthlySummary(year, i + 1) }));

  return (
    <>
      <Section
        title={`${MONTH_LONG[month - 1]} ${year}`}
        sub={s.locked ? (s.source === 'manual-lock' ? 'Locked month — snapshot saved at month-end close' : 'Locked month — read-only snapshot from the workbook') : 'Open month — recalculated live'}
        actions={<Badge tone={s.locked ? 'amber' : 'green'}>{s.locked ? '🔒 Locked' : '● Open'}</Badge>}
      >
        <div style={{ padding: 14 }}>
          <div className="month-strip">
            {cells.map((c) => (
              <button key={c.label} className={`month-btn ${month === c.month ? 'active' : ''}`} onClick={() => setMonth(c.month)}>
                <div className="month-name">{c.label}</div>
                <div className="month-net">{gbp(c.netPence)}</div>
                <span className="month-lock">{c.locked ? '🔒' : ' '}</span>
              </button>
            ))}
          </div>
        </div>
      </Section>

      <div className="kpi-grid">
        <Card title="Income" value={gbp(s.incomePence)} tone="pos" />
        <Card title="Expenses" value={gbp(s.expensesPence)} tone="neg" />
        <Card title="Net" value={gbp(s.netPence, { sign: true })} tone={s.netPence < 0 ? 'neg' : 'pos'} />
        <Card title="% income spent" value={pct(s.percentIncomeSpent)} tone={s.percentIncomeSpent > 1 ? 'warn' : 'neutral'} />
      </div>

      {s.locked ? (
        <div className="notice warn">
          This month is locked. Its income, expenses, net and owed figures are saved in the month-end snapshot and cannot be edited.
          Select an open month to see the live bill engine and breakdowns.
        </div>
      ) : (
        <div className="two-col">
          <Section title="Income sources" sub="PIP is additive per month; UC is single-valued" actions={<button className="btn ghost sm" onClick={() => go('income')}>View income schedule</button>}>
            <Table head={['Source', 'Amount', 'Share']} numHead={[1]}>
              {[
                ['PIP', inc.pip],
                ['Universal Credit', inc.uc],
                [`${mainAccount} income`, inc.starlingIncome],
                ['People repayments', inc.peopleIncome],
              ].map(([label, value]) => (
                <tr key={String(label)}>
                  <td>{label}</td>
                  <td className="num">{gbp(Number(value))}</td>
                  <td style={{ width: 130 }}><Bar value={s.incomePence === 0 ? 0 : Number(value) / s.incomePence} /></td>
                </tr>
              ))}
            </Table>
          </Section>

          <Section title="Expense composition" sub="Bills, people, cash, petrol/other and card spend">
            <Table head={['Bucket', 'Amount', 'Share']} numHead={[1]}>
              {[
                ['Scheduled bills', exp.bills, 'violet'],
                ['People', exp.people, 'blue'],
                [`${mainAccount} cash`, exp.starling, 'accent'],
                ['Petrol / Other', exp.pseudo, 'amber'],
                ['Card spend', exp.cardSpend, 'red'],
                ['Card refunds', -exp.cardRefunds, 'accent'],
              ].map(([label, value, tone]) => (
                <tr key={String(label)}>
                  <td>{label}</td>
                  <td className="num">{gbp(Number(value))}</td>
                  <td style={{ width: 130 }}><Bar value={s.expensesPence === 0 ? 0 : Math.max(0, Number(value)) / s.expensesPence} tone={String(tone)} /></td>
                </tr>
              ))}
            </Table>
          </Section>
        </div>
      )}

      <Section title="Scheduled bills" sub="Due dates honour one-off Bill Changes">
        <Table head={['Bill', 'Due', 'Method', 'Linked sheet', 'Amount']} numHead={[4]}>
          {(s.breakdown.bills.length ? s.breakdown.bills : engine.scheduledBills(year, month)).map((b) => (
            <tr key={b.name}>
              <td>{b.name}</td>
              <td className="muted">{dateUk(b.dueDate)}</td>
              <td className="muted small">{b.paymentMethod || '—'}</td>
              <td className="muted small">{b.linkedSheet || '—'}</td>
              <td className="num"><strong>{gbp(b.amountPence)}</strong></td>
            </tr>
          ))}
        </Table>
      </Section>

      <div className="two-col">
        <Section title="Accounts at month end" sub={dateUk(asOf)}>
          <Table head={['Account', 'Balance', 'Target']} numHead={[1, 2]}>
            {accounts.map((a) => (
              <tr key={a.name}>
                <td>{a.name}</td>
                <td className="num"><strong>{gbp(a.balancePence)}</strong></td>
                <td className="num muted">{gbp(a.targetPence)}</td>
              </tr>
            ))}
          </Table>
          {accounts.length === 0 && <Empty>No accounts yet.</Empty>}
        </Section>
        <Section title="People" sub="Owed = opening + lent − repaid">
          <Table head={['Person', 'Owed']} numHead={[1]}>
            {people.map((p) => (
              <tr key={p.shortName}>
                <td>{p.shortName}</td>
                <td className="num"><strong>{gbp(p.balancePence)}</strong></td>
              </tr>
            ))}
          </Table>
          {people.length === 0 && <Empty>No people added yet.</Empty>}
        </Section>
      </div>
    </>
  );
}

type ScheduleScheme = 'pip' | 'uc';
type ScheduleYearKey = 'year2026' | 'year2027' | 'year2028';
type ScheduleDraft = { scheme: ScheduleScheme; month: string; date: string; amount: string };

const SCHEDULE_YEARS = [2026, 2027, 2028] as const;
const scheduleYearKey = (year: number): ScheduleYearKey => year === 2027 ? 'year2027' : year === 2028 ? 'year2028' : 'year2026';
const scheduleMonthPrefix = (year: number, month: string) => `${year}-${String(MONTHS.indexOf(month) + 1).padStart(2, '0')}`;
const scheduleHasPayment = (row: any, key: ScheduleYearKey) => {
  const cell = row?.[key];
  return !!(cell?.date || cell?.amountPence);
};

function ScheduleInput({ kind, value, onCommit, label }: { kind: 'date' | 'money'; value: string; onCommit: (next: string) => boolean; label: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const next = draft.trim();
    if (next === value) return;
    if (!onCommit(next)) setDraft(value);
  };
  return (
    <input
      className={`table-input${kind === 'date' ? ' date' : ''}`}
      aria-label={label}
      type={kind === 'date' ? 'date' : 'text'}
      inputMode={kind === 'money' ? 'decimal' : undefined}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
        if (e.key === 'Escape') { setDraft(value); }
      }}
    />
  );
}

export function Income({ ds, engine, month, update, notify }: ViewProps) {
  const targetYear = ds.settings.targetYear;
  const [year, setYear] = useState(targetYear);
  const [draft, setDraft] = useState<ScheduleDraft>(() => ({ scheme: 'pip', month: MONTHS[month - 1], date: '', amount: '' }));

  useEffect(() => setYear(targetYear), [targetYear]);
  useEffect(() => setDraft((current) => ({ ...current, month: MONTHS[month - 1] })), [month]);

  const yearKey = scheduleYearKey(year);
  const asOf = ds.settings.asOfDate;
  const current = engine.monthlyIncome(targetYear, month);
  const rowsFor = (scheme: ScheduleScheme) => ds.incomeSchedules[scheme]
    .map((row, index) => ({ row, index, cell: row[yearKey] }))
    .filter(({ cell }) => !!cell?.date || !!cell?.amountPence);
  const pipRows = rowsFor('pip');
  const ucRows = rowsFor('uc');
  const pipTotal = pipRows.reduce((sum, entry) => sum + (entry.cell.amountPence || 0), 0);
  const ucTotal = ucRows.reduce((sum, entry) => sum + (entry.cell.amountPence || 0), 0);
  const selectedTotal = pipTotal + ucTotal;

  const validateDate = (date: string, monthLabel: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && date.startsWith(`${scheduleMonthPrefix(year, monthLabel)}-`);

  const editDate = (scheme: ScheduleScheme, rowIndex: number, monthLabel: string, next: string) => {
    if (!validateDate(next, monthLabel)) {
      notify(`Choose a date in ${monthLabel} ${year}`);
      return false;
    }
    update((dataset) => { dataset.incomeSchedules[scheme][rowIndex][yearKey].date = next; });
    return true;
  };

  const editAmount = (scheme: ScheduleScheme, rowIndex: number, next: string) => {
    const cleaned = next.replace(/[£,\s]/g, '');
    if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
      notify('Enter a valid amount, for example 306.80');
      return false;
    }
    update((dataset) => { dataset.incomeSchedules[scheme][rowIndex][yearKey].amountPence = parseMoney(cleaned); });
    return true;
  };

  const addPayment = () => {
    const amountPence = parseMoney(draft.amount);
    if (!validateDate(draft.date, draft.month)) {
      notify(`Choose a ${draft.month} ${year} payment date`);
      return;
    }
    if (!Number.isInteger(amountPence) || amountPence <= 0) {
      notify('Enter an amount above zero');
      return;
    }
    if (draft.scheme === 'uc' && ds.incomeSchedules.uc.some((row) => row.month === draft.month && scheduleHasPayment(row, yearKey))) {
      notify(`UC already has a ${draft.month} ${year} payment — edit that row instead`);
      return;
    }

    update((dataset) => {
      const rows = dataset.incomeSchedules[draft.scheme];
      if (draft.scheme === 'uc') {
        const existing = rows.find((row) => row.month === draft.month);
        if (existing) {
          existing[yearKey] = { date: draft.date, amountPence };
          return;
        }
      } else {
        const blank = rows.find((row) => row.month === draft.month && !scheduleHasPayment(row, yearKey));
        if (blank) {
          blank[yearKey] = { date: draft.date, amountPence };
          return;
        }
      }
      rows.push({
        month: draft.month,
        year2026: { date: '', amountPence: 0 },
        year2027: { date: '', amountPence: 0 },
        year2028: { date: '', amountPence: 0 },
        [yearKey]: { date: draft.date, amountPence },
      });
    });
    setDraft((current) => ({ ...current, date: '', amount: '' }));
    notify(`${draft.scheme === 'pip' ? 'PIP' : 'Universal Credit'} payment added for ${draft.month} ${year}`);
  };

  const renderScheme = (scheme: ScheduleScheme, title: string, rows: { row: any; index: number; cell: any }[], total: number) => (
    <Section title={title} sub={`${year} — ${rows.length} payment${rows.length === 1 ? '' : 's'}`}>
      <Table head={['Month', 'Payment date', 'Amount', 'Status']}>
        {rows.map(({ row, index, cell }) => (
          <tr key={`${scheme}-${index}`}>
            <td><strong>{row.month}</strong></td>
            <td>
              <ScheduleInput
                kind="date"
                value={cell.date || ''}
                label={`${title} ${row.month} date`}
                onCommit={(next) => editDate(scheme, index, row.month, next)}
              />
            </td>
            <td>
              <ScheduleInput
                kind="money"
                value={cell.amountPence ? (cell.amountPence / 100).toFixed(2) : ''}
                label={`${title} ${row.month} amount`}
                onCommit={(next) => editAmount(scheme, index, next)}
              />
            </td>
            <td>{cell.date && cell.date <= asOf ? <Badge tone="green">Paid</Badge> : <Badge>Scheduled</Badge>}</td>
          </tr>
        ))}
        {rows.length > 0 && (
          <tr>
            <td colSpan={2}><strong>Total</strong></td>
            <td className="num"><strong>{gbp(total)}</strong></td>
            <td />
          </tr>
        )}
      </Table>
      {rows.length === 0 && <Empty>No {title} entries for {year}. Add one below.</Empty>}
    </Section>
  );

  return (
    <>
      <Section
        title="Income schedule"
        sub="PIP and Universal Credit dates and amounts used by the monthly income engine"
        actions={<Badge tone="blue">Target year {targetYear}</Badge>}
      >
        <div className="kpi-grid" style={{ padding: '14px 14px 0' }}>
          <Card title={`PIP — ${MONTH_LONG[month - 1]}`} value={gbp(current.pip)} sub={`Target year ${targetYear}`} tone="pos" />
          <Card title={`Universal Credit — ${MONTH_LONG[month - 1]}`} value={gbp(current.uc)} sub={`Target year ${targetYear}`} tone="pos" />
          <Card title={`${year} scheduled`} value={gbp(selectedTotal)} sub={`${pipRows.length + ucRows.length} payments`} />
          <Card title="Target year" value={String(targetYear)} sub="Used by Monthly and Dashboard" />
        </div>
        <div className="notice" style={{ margin: '14px' }}>
          <strong>Where this month’s income comes from:</strong> Monthly reads these rows for target year {targetYear}. PIP rows for the selected month are added together; UC uses one row per month. Locked months keep their saved month-end totals, so editing a past locked month does not rewrite its snapshot.
        </div>
        <div className="tabs">
          {SCHEDULE_YEARS.map((option) => (
            <button key={option} className={`tab ${year === option ? 'active' : ''}`} onClick={() => setYear(option)}>{option}</button>
          ))}
        </div>
      </Section>

      <div className="two-col">
        {renderScheme('pip', 'PIP payments', pipRows, pipTotal)}
        {renderScheme('uc', 'Universal Credit payments', ucRows, ucTotal)}
      </div>

      <Section title={`Add ${year} payment`} sub="Adds a dated PIP or UC payment to the selected year; existing rows remain editable above">
        <div className="inline-form">
          <Field label="Type">
            <select className="select" value={draft.scheme} onChange={(e) => setDraft({ ...draft, scheme: e.target.value as ScheduleScheme })}>
              <option value="pip">PIP</option>
              <option value="uc">Universal Credit</option>
            </select>
          </Field>
          <Field label="Month">
            <select className="select" value={draft.month} onChange={(e) => setDraft({ ...draft, month: e.target.value })}>
              {MONTHS.map((label) => <option key={label} value={label}>{label}</option>)}
            </select>
          </Field>
          <Field label="Date">
            <input className="input" type="date" min={`${year}-01-01`} max={`${year}-12-31`} value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
          </Field>
          <Field label="Amount £">
            <input className="input" inputMode="decimal" placeholder="0.00" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
          </Field>
          <button className="btn primary" onClick={addPayment}>Add payment</button>
        </div>
        <div className="muted small" style={{ padding: '0 14px 14px' }}>
          PIP allows more than one payment in a month — December 2026 has two. UC keeps one payment per month.
        </div>
      </Section>
    </>
  );
}
