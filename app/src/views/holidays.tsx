import { useState } from 'react';
import type { ViewProps } from '../types';
import { Badge, Empty, Field, Section, Table } from '../components';
import { dateUk, gbp, parseMoney } from '../format';
import { groupHolidayTrips } from '../../../core/holidays';

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

type HolidayDraft = {
  year: string;
  event: string;
  start: string;
  end: string;
  nights: string;
  ref: string;
  paid: string;
  total: string;
  address: string;
  notes: string;
};

function emptyDraft(year: number): HolidayDraft {
  return {
    year: String(year),
    event: '',
    start: '',
    end: '',
    nights: '',
    ref: '',
    paid: '✓ Paid',
    total: '',
    address: '',
    notes: '',
  };
}

function draftFor(year: number, holiday: Holiday): HolidayDraft {
  return {
    year: String(year),
    event: holiday.event ?? '',
    start: holiday.start ?? '',
    end: holiday.end ?? '',
    nights: holiday.nights === '-' ? '' : String(holiday.nights ?? ''),
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

export function Holidays({ ds, update, notify }: ViewProps) {
  const [editing, setEditing] = useState<HolidayRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [openTrips, setOpenTrips] = useState<Set<string>>(() => new Set());
  const [draft, setDraft] = useState<HolidayDraft>(() => emptyDraft(ds.settings.targetYear));
  const rows = collectRows(ds);
  const asOf = ds.settings.asOfDate;
  const trips = groupHolidayTrips(rows, (row) => row.holiday);
  const formOpen = adding || Boolean(editing);
  const upcoming = trips.filter((trip) => trip.start && trip.start >= asOf);
  const totalNights = rows.reduce((sum, row) => sum + (typeof row.holiday.nights === 'number' ? row.holiday.nights : 0), 0);
  const totalSpend = rows.reduce((sum, row) => sum + (typeof row.holiday.totalPence === 'number' ? row.holiday.totalPence : 0), 0);

  const toggleTrip = (key: string) => setOpenTrips((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  const openAdd = () => {
    setEditing(null);
    setAdding(true);
    setDraft(emptyDraft(ds.settings.targetYear));
  };

  const openEdit = (row: HolidayRow) => {
    setAdding(false);
    setEditing(row);
    setDraft(draftFor(row.year, row.holiday));
  };

  const closeForm = () => {
    setEditing(null);
    setAdding(false);
    setDraft(emptyDraft(ds.settings.targetYear));
  };

  const save = () => {
    const event = draft.event.trim();
    if (!event) return notify('Give the holiday a name');
    if (!draft.start) return notify('Choose a start date');
    if (draft.end && draft.end < draft.start) return notify('The end date cannot be before the start date');
    const year = Number(draft.year);
    if (!Number.isFinite(year) || year < 2000 || year > 2100) return notify('Choose a valid holiday year');

    const nightsText = draft.nights.trim();
    const nights = nightsText && /^\d+(\.\d+)?$/.test(nightsText) ? Number(nightsText) : nightsText;
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
      sub="Add, edit or remove trips. Cost lines fold under their trip; expand one to edit its flights, parking or insurance."
      actions={<button className="btn primary" onClick={formOpen ? closeForm : openAdd}>{formOpen ? 'Close form' : 'Add holiday'}</button>}
    >
      <div className="metric-list" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        <div className="metric"><span>Trips</span><strong>{trips.length}</strong></div>
        <div className="metric"><span>Upcoming</span><strong>{upcoming.length}</strong></div>
        <div className="metric"><span>Nights booked</span><strong>{totalNights}</strong></div>
        <div className="metric"><span>Recorded total</span><strong>{gbp(totalSpend)}</strong></div>
      </div>

      {formOpen && (
        <div style={{ padding: 16, borderBottom: '1px solid var(--line)' }}>
          <div className="form-grid">
            <Field label="Year"><input className="input" type="number" min={2000} max={2100} value={draft.year} onChange={(e) => setDraft({ ...draft, year: e.target.value })} /></Field>
            <Field label="Holiday name"><input className="input" placeholder="e.g. Unity - Mum" value={draft.event} onChange={(e) => setDraft({ ...draft, event: e.target.value })} /></Field>
            <Field label="Start date"><input className="input" type="date" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} /></Field>
            <Field label="End date"><input className="input" type="date" value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} /></Field>
            <Field label="Nights" hint="Leave blank if not applicable"><input className="input" inputMode="numeric" value={draft.nights} onChange={(e) => setDraft({ ...draft, nights: e.target.value })} /></Field>
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

      <Table head={['Holiday', 'Dates', 'Nights', 'Payment', 'Total', 'Reference', '']} numHead={[2, 4]}>
        {trips.map((trip) => {
          const showCostLines = openTrips.has(trip.key);
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
                <td className="num">{nightsLabel(row.holiday)}</td>
                <td>{paidBadge(row.holiday.paid)}</td>
                <td className="num">{extra ? totalLabel(row.holiday) : headlineTotal}</td>
                <td className="muted small">{row.holiday.ref || '—'}</td>
                <td className="nowrap">
                  <button className="btn ghost sm" onClick={() => openEdit(row)}>Edit</button>
                  <button className="btn ghost sm" onClick={() => remove(row)}>Remove</button>
                </td>
              </tr>
            );
          });
        })}
      </Table>
      {rows.length === 0 && <Empty>No holidays recorded. Add a trip to populate the Dashboard tracker.</Empty>}
      <div style={{ padding: '0 16px 16px' }}>
        <div className="notice info">Cost lines share a trip's dates and are totalled with the headline row. Use <strong>Show cost lines</strong> to reveal and edit flights, parking or insurance individually. Changes are included in the local/cloud budget document and update the Dashboard holiday section immediately.</div>
      </div>
    </Section>
  );
}
