import { useState } from 'react';
import type { ViewProps } from '../types';
import { Badge, Empty, Field, Section, Table } from '../components';
import { dateUk, gbp, parseMoney } from '../format';
import { daysBetween, groupHolidayTrips, nightsBetween } from '../../../core/holidays';

type Holiday = {
  event?: string;
  start?: string;
  end?: string;
  nights?: number | string;
  ref?: string;
  status?: string;
  notes?: string;
  paid?: string;
  totalText?: string;
  totalPence?: number | null;
  address?: string;
};

type HolidayRow = { year: number; index: number; holiday: Holiday };

type CostTarget = { key: string; trip: string; year: number; start: string; end: string };

type HolidayDraft = {
  event: string;
  start: string;
  end: string;
  ref: string;
  paid: string;
  total: string;
  address: string;
  notes: string;
};

function emptyDraft(): HolidayDraft {
  return {
    event: '',
    start: '',
    end: '',
    ref: '',
    paid: '✓ Paid',
    total: '',
    address: '',
    notes: '',
  };
}

function draftFor(holiday: Holiday): HolidayDraft {
  return {
    event: holiday.event ?? '',
    start: holiday.start ?? '',
    end: holiday.end ?? '',
    ref: holiday.ref ?? '',
    paid: holiday.paid ?? '',
    total: holiday.totalPence === null || holiday.totalPence === undefined ? '' : (holiday.totalPence / 100).toFixed(2),
    address: holiday.address ?? '',
    notes: holiday.notes ?? '',
  };
}

function collectRows(ds: ViewProps['ds']): HolidayRow[] {
  return Object.entries(ds.holidays ?? {})
    .flatMap(([year, list]) => (list ?? []).map((holiday, index) => ({
      year: Number(year),
      index,
      holiday: holiday as Holiday,
    })))
    .filter((row) => Number.isFinite(row.year))
    .sort((a, b) => a.year - b.year || (a.holiday.start ?? '').localeCompare(b.holiday.start ?? ''));
}

function daysUntil(start: string | undefined, asOf: string): number | null {
  if (!start) return null;
  const days = Math.ceil((Date.parse(`${start}T00:00:00Z`) - Date.parse(`${asOf}T00:00:00Z`)) / 86400000);
  return Number.isFinite(days) ? days : null;
}

function paidBadge(paid: string | undefined) {
  const value = String(paid ?? '').toLowerCase();
  if (value.includes('unpaid')) return <Badge tone="amber">Unpaid</Badge>;
  if (value.includes('paid')) return <Badge tone="green">Paid</Badge>;
  return <Badge>Not set</Badge>;
}

function totalLabel(holiday: Holiday): string {
  if (typeof holiday.totalPence === 'number') return gbp(holiday.totalPence);
  if (holiday.totalText) return `${holiday.totalText} (text)`;
  return '—';
}

function nightsLabel(holiday: Holiday): string {
  if (typeof holiday.nights === 'number') return `${holiday.nights} night${holiday.nights === 1 ? '' : 's'}`;
  return holiday.nights && holiday.nights !== '-' ? String(holiday.nights) : '—';
}

export function Holidays({ ds, year, update, notify }: ViewProps) {
  const [editing, setEditing] = useState<HolidayRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [costFor, setCostFor] = useState<CostTarget | null>(null);
  const [costDraft, setCostDraft] = useState({ label: '', amount: '', paid: '✓ Paid', ref: '', notes: '' });
  const [openTrips, setOpenTrips] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<HolidayDraft>(emptyDraft);
  const allRows = collectRows(ds);
  // The tracker follows the year in the top bar, like every other ledger page.
  const rows = allRows.filter((row) => row.year === year);
  const otherYears = [...new Set(allRows.filter((row) => row.year !== year).map((row) => row.year))].sort();
  const asOf = ds.settings.asOfDate;
  const trips = groupHolidayTrips(rows, (row) => row.holiday);
  const formOpen = adding || Boolean(editing);
  // The form's own count as the dates change: 22 to 29 December is 8 days, 7 nights.
  const draftDays = draft.start ? daysBetween(draft.start, draft.end || draft.start) : null;
  const draftNights = draft.start ? nightsBetween(draft.start, draft.end || draft.start) : null;
  const upcoming = trips.filter((trip) => trip.start && trip.start >= asOf);
  const query = search.trim().toLowerCase();
  const visibleTrips = query
    ? trips.filter((trip) => {
      const rows = [trip.headline, ...trip.extras].map((row) => [
        row.holiday.event,
        row.holiday.address,
        row.holiday.ref,
        row.holiday.notes,
        row.holiday.start,
        row.holiday.end,
      ].filter(Boolean).join(' '));
      return rows.join(' ').toLowerCase().includes(query);
    })
    : trips;
  // Nights come from the dates, so a trip added with just a start and end date counts here.
  const totalNights = trips.reduce((sum, trip) => sum + (trip.nights ?? 0), 0);
  // Trip totals, not every row: a trip whose total already covers its cost lines is counted once.
  const totalSpend = trips.reduce((sum, trip) => sum + (trip.totalPence ?? 0), 0);

  const toggleTrip = (key: string) => setOpenTrips((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  const openAdd = () => {
    setCostFor(null);
    setEditing(null);
    setAdding(true);
    setDraft(emptyDraft());
  };

  const openCostLine = (target: CostTarget) => {
    setAdding(false);
    setEditing(null);
    setCostDraft({ label: '', amount: '', paid: '✓ Paid', ref: '', notes: '' });
    setCostFor(target);
  };

  const saveCostLine = () => {
    if (!costFor) return;
    const label = costDraft.label.trim();
    if (!label) return notify('Name the cost line, e.g. Hotel, car park or travel insurance');
    const amount = costDraft.amount.trim();
    const next: Holiday = {
      event: label,
      start: costFor.start,
      end: costFor.end,
      nights: '',
      paid: costDraft.paid,
      totalPence: amount ? parseMoney(amount) : null,
      ref: costDraft.ref.trim(),
      notes: costDraft.notes.trim(),
    };
    update((dataset) => {
      dataset.holidays = dataset.holidays ?? {};
      const key = String(costFor.year);
      dataset.holidays[key] = [...(dataset.holidays[key] ?? []), next];
    });
    setOpenTrips((current) => new Set(current).add(costFor.key));
    notify(`${label} added to ${costFor.trip}`);
    setCostFor(null);
  };

  const openEdit = (row: HolidayRow) => {
    setAdding(false);
    setEditing(row);
    setDraft(draftFor(row.holiday));
  };

  const closeForm = () => {
    setEditing(null);
    setAdding(false);
    setCostFor(null);
    setDraft(emptyDraft());
  };

  const save = () => {
    const event = draft.event.trim();
    if (!event) return notify('Give the holiday a name');
    if (!draft.start) return notify('Choose a start date');
    if (draft.end && draft.end < draft.start) return notify('The end date cannot be before the start date');
    const year = Number(draft.start.slice(0, 4));
    if (!Number.isFinite(year) || year < 2000 || year > 2100) return notify('Choose a start date with a valid year');

    // The nights are the dates, not a separate figure to type.
    const nights = nightsBetween(draft.start, draft.end || draft.start) ?? 0;
    const totalText = draft.total.trim();
    const existing = editing?.holiday;
    const next: Holiday = {
      ...(existing ?? {}),
      event,
      start: draft.start,
      end: draft.end,
      nights,
      ref: draft.ref.trim(),
      paid: draft.paid,
      totalPence: totalText ? parseMoney(totalText) : existing?.totalPence ?? null,
      totalText: totalText ? undefined : existing?.totalText,
      address: draft.address.trim(),
      notes: draft.notes.trim(),
    };

    update((dataset) => {
      dataset.holidays = dataset.holidays ?? {};
      if (editing) {
        const oldKey = String(editing.year);
        const newKey = String(year);
        const oldList = dataset.holidays[oldKey] ?? [];
        oldList.splice(editing.index, 1);
        dataset.holidays[oldKey] = oldList;
        const target = dataset.holidays[newKey] ?? [];
        target.push(next);
        dataset.holidays[newKey] = target;
        if (oldKey !== newKey && oldList.length === 0) delete dataset.holidays[oldKey];
      } else {
        const key = String(year);
        dataset.holidays[key] = [...(dataset.holidays[key] ?? []), next];
      }
    });

    notify(editing ? `${event} updated` : `${event} added to the holiday tracker`);
    closeForm();
  };

  const remove = (row: HolidayRow) => {
    const name = row.holiday.event || 'this holiday';
    if (!confirm(`Remove “${name}”? This cannot be undone.`)) return;
    update((dataset) => {
      const key = String(row.year);
      const current = dataset.holidays?.[key] ?? [];
      const next = current.filter((_, index) => index !== row.index);
      if (!dataset.holidays) return;
      if (next.length === 0) delete dataset.holidays[key];
      else dataset.holidays[key] = next;
    });
    if (editing?.year === row.year && editing.index === row.index) closeForm();
    notify(`${name} removed`);
  };

  return (
    <Section
      title="Holiday tracker"
      sub="Add, edit or remove trips, then add cost lines such as hotel, car park or travel insurance. Cost lines fold under their trip; expand one to edit them."
      actions={<button className="btn primary" onClick={formOpen ? closeForm : openAdd}>{formOpen ? 'Close form' : 'Add holiday'}</button>}
    >
      <div className="metric-list" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        <div className="metric"><span>Trips</span><strong>{trips.length}</strong></div>
        <div className="metric"><span>Upcoming</span><strong>{upcoming.length}</strong></div>
        <div className="metric"><span>Nights booked</span><strong>{totalNights}</strong></div>
        <div className="metric"><span>Recorded total</span><strong>{gbp(totalSpend)}</strong></div>
      </div>

      {costFor && (
        <div style={{ padding: 16, borderBottom: '1px solid var(--line)' }}>
          <h3 className="card-title">Add a cost line to {costFor.trip}</h3>
          <p className="card-sub">
            {costFor.start ? `${dateUk(costFor.start)} → ${dateUk(costFor.end || costFor.start)}` : 'No dates on this trip'} — the cost line shares the trip's dates and is totalled with it.
          </p>
          <div className="form-grid">
            <Field label="Cost" hint="What it is, e.g. Hotel, car park, travel insurance">
              <input className="input" placeholder="e.g. Travel insurance" value={costDraft.label} onChange={(e) => setCostDraft({ ...costDraft, label: e.target.value })} />
            </Field>
            <Field label="Amount £"><input className="input" inputMode="decimal" placeholder="0.00" value={costDraft.amount} onChange={(e) => setCostDraft({ ...costDraft, amount: e.target.value })} /></Field>
            <Field label="Payment">
              <select className="select" value={costDraft.paid} onChange={(e) => setCostDraft({ ...costDraft, paid: e.target.value })}>
                <option value="✓ Paid">Paid</option>
                <option value="X Unpaid">Unpaid</option>
                <option value="">Not set</option>
              </select>
            </Field>
            <Field label="Reference"><input className="input" placeholder="Booking reference" value={costDraft.ref} onChange={(e) => setCostDraft({ ...costDraft, ref: e.target.value })} /></Field>
            <Field label="Notes"><input className="input" placeholder="e.g. Annual policy" value={costDraft.notes} onChange={(e) => setCostDraft({ ...costDraft, notes: e.target.value })} /></Field>
          </div>
          <div className="toolbar" style={{ borderBottom: 0, padding: '12px 0 0' }}>
            <button className="btn primary" onClick={saveCostLine}>Add cost line</button>
            <button className="btn" onClick={() => setCostFor(null)}>Cancel</button>
          </div>
        </div>
      )}

      {formOpen && (
        <div style={{ padding: 16, borderBottom: '1px solid var(--line)' }}>
          <div className="form-grid">
            <Field label="Holiday name"><input className="input" placeholder="e.g. Unity - Mum" value={draft.event} onChange={(e) => setDraft({ ...draft, event: e.target.value })} /></Field>
            <Field label="Start date"><input className="input" type="date" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} /></Field>
            <Field label="End date"><input className="input" type="date" value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} /></Field>
            <Field
              label="Days and nights"
              hint={draftDays === null
                ? 'Choose the dates and this fills itself in'
                : `${draftDays} day${draftDays === 1 ? '' : 's'} away · ${draftNights} night${draftNights === 1 ? '' : 's'}`}
            >
              <input
                className="input"
                value={draftNights === null ? '' : `${draftDays} day${draftDays === 1 ? '' : 's'} · ${draftNights} night${draftNights === 1 ? '' : 's'}`}
                placeholder="Set the start and end dates"
                readOnly
                aria-readonly="true"
              />
            </Field>
            <Field label="Payment">
              <select className="select" value={draft.paid} onChange={(e) => setDraft({ ...draft, paid: e.target.value })}>
                <option value="✓ Paid">Paid</option>
                <option value="X Unpaid">Unpaid</option>
                <option value="">Not set</option>
              </select>
            </Field>
            <Field label="Total £" hint={editing?.holiday.totalText && !draft.total ? `Imported text: ${editing.holiday.totalText}` : undefined}>
              <input className="input" inputMode="decimal" placeholder="0.00" value={draft.total} onChange={(e) => setDraft({ ...draft, total: e.target.value })} />
            </Field>
            <Field label="Reference"><input className="input" placeholder="Booking reference" value={draft.ref} onChange={(e) => setDraft({ ...draft, ref: e.target.value })} /></Field>
            <Field label="Address"><input className="input" placeholder="Where you are staying" value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} /></Field>
            <Field label="Notes"><input className="input" placeholder="e.g. Mum paid half" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></Field>
          </div>
          <div className="toolbar" style={{ borderBottom: 0, padding: '12px 0 0' }}>
            <button className="btn primary" onClick={save}>{editing ? 'Save changes' : 'Add holiday'}</button>
            <button className="btn" onClick={closeForm}>Cancel</button>
          </div>
        </div>
      )}

      <div className="toolbar">
        <input
          className="input"
          placeholder="Search holidays, places or references…"
          aria-label="Search holidays"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <span className="muted small">
          {visibleTrips.length} of {trips.length} trip{trips.length === 1 ? '' : 's'} in {year}
          {otherYears.length > 0 && ` · ${otherYears.join(', ')} available from the year bar`}
        </span>
      </div>
      <Table head={['Holiday', 'Dates', 'Nights', 'Payment', 'Total', 'Reference', '']} numHead={[2, 4]}>
        {visibleTrips.length === 0 && (
          <tr><td colSpan={7}><span className="muted">No holidays match that search.</span></td></tr>
        )}
        {visibleTrips.map((trip) => {
          const showCostLines = openTrips.has(trip.key);
          const tripDays = daysBetween(trip.start, trip.end);
          const visibleRows = showCostLines ? [trip.headline, ...trip.extras] : [trip.headline];
          return visibleRows.map((row, position) => {
            const extra = position > 0;
            const days = daysUntil(row.holiday.start, asOf);
            const end = row.holiday.end && row.holiday.end >= (row.holiday.start ?? '') ? row.holiday.end : row.holiday.start;
            const ongoing = days !== null && days <= 0 && !!end && end >= asOf;
            const passed = days !== null && days < 0 && !ongoing;
            const headlineTotal = trip.extras.length > 0 && trip.totalPence !== null
              ? <>{gbp(trip.totalPence)}<div className="muted small">trip total</div></>
              : totalLabel(row.holiday);
            return (
              <tr
                key={`${row.year}-${row.index}-${row.holiday.event ?? 'holiday'}`}
                style={extra ? { background: 'rgba(148, 163, 184, 0.08)' } : undefined}
              >
                <td style={extra ? { paddingLeft: 30 } : undefined}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <strong>{row.holiday.event || 'Untitled holiday'}</strong>
                    {extra ? <Badge tone="neutral">Cost line</Badge> : trip.extras.length > 0 && (
                      <button className="btn ghost sm" aria-expanded={showCostLines} onClick={() => toggleTrip(trip.key)}>
                        {showCostLines ? 'Hide' : 'Show'} {trip.extras.length} cost line{trip.extras.length === 1 ? '' : 's'}
                      </button>
                    )}
                  </div>
                  <div className="muted small">{row.year}{row.holiday.address ? ` · ${row.holiday.address}` : ''}</div>
                  {row.holiday.notes && <div className="muted small">{row.holiday.notes}</div>}
                </td>
                <td className="nowrap">
                  {extra ? (
                    <span className="muted small">Same dates as trip</span>
                  ) : (
                    <>
                      {dateUk(row.holiday.start)} → {dateUk(row.holiday.end)}
                      <div className="sub" style={{ marginTop: 3 }}>{ongoing ? <Badge tone="amber">On holiday</Badge> : passed ? <Badge tone="neutral">Passed</Badge> : days !== null ? <Badge tone="blue">{days === 0 ? 'Today' : `${days} days`}</Badge> : <Badge>No date</Badge>}</div>
                    </>
                  )}
                </td>
                <td className="num">
                  {extra ? nightsLabel(row.holiday) : (
                    <>
                      {trip.nights === null ? <span className="muted">—</span> : `${trip.nights} night${trip.nights === 1 ? '' : 's'}`}
                      {tripDays !== null && <div className="muted small">{tripDays} day{tripDays === 1 ? '' : 's'}</div>}
                    </>
                  )}
                </td>
                <td>{paidBadge(row.holiday.paid)}</td>
                <td className="num">{extra ? totalLabel(row.holiday) : headlineTotal}</td>
                <td className="muted small">{row.holiday.ref || '—'}</td>
                <td className="nowrap">
                  {!extra && (
                    <button
                      className="btn ghost sm"
                      onClick={() => openCostLine({ key: trip.key, trip: row.holiday.event || 'this trip', year: Number(trip.start.slice(0, 4)) || row.year, start: trip.start, end: trip.end })}
                    >Add cost line</button>
                  )}
                  <button className="btn ghost sm" onClick={() => openEdit(row)}>Edit</button>
                  <button className="btn ghost sm" onClick={() => remove(row)}>Remove</button>
                </td>
              </tr>
            );
          });
        })}
      </Table>
      {rows.length === 0 && (
        <Empty>
          {allRows.length === 0
            ? 'No holidays recorded. Add a trip to populate the Dashboard tracker.'
            : `No holidays in ${year}. ${allRows.length} trip${allRows.length === 1 ? ' is' : 's are'} in ${otherYears.join(', ')} — choose that year in the top bar.`}
        </Empty>
      )}
    </Section>
  );
}
