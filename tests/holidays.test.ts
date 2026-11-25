import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { daysBetween, groupHolidayTrips, nightsBetween, rekeyHolidaysByStartYear } from '../core/holidays.ts';

type Row = {
  event?: string;
  start?: string;
  end?: string;
  nights?: number | string;
  totalPence?: number | null;
};

function loadRows(): Row[] {
  const dataset = JSON.parse(
    fs.readFileSync(path.resolve(import.meta.dirname, '..', 'data', 'workbook.json'), 'utf8'),
  ) as { holidays: Record<string, Row[]> };
  return Object.values(dataset.holidays).flat();
}

test('the December trip is one group with its three cost lines and full total', () => {
  const trips = groupHolidayTrips(loadRows(), (row) => row);
  const december = trips.find((trip) => trip.start === '2026-12-22');

  assert.ok(december);
  assert.equal(december.headline.event, 'Hesperia Bristol Playa - Mum');
  assert.equal(december.rows.length, 4);
  assert.equal(december.extras.length, 3);
  assert.equal(december.nights, 7);
  assert.equal(december.totalPence, 70054, 'the stored trip total already covers its cost lines, so it is not added twice');
});

test('yearly holiday totals match the workbook (extras are not counted twice)', () => {
  const trips = groupHolidayTrips(loadRows(), (row) => row);
  const yearTotal = (prefix: string) => trips
    .filter((trip) => trip.start.startsWith(prefix))
    .reduce((sum, trip) => sum + (trip.totalPence ?? 0), 0);

  assert.equal(yearTotal('2026'), 198219, 'Dashboard I64, bookings only, extras already inside the trip total');
  assert.equal(yearTotal('2027'), 158312, 'Dashboard I78, where the extras are separate from the booking');
});

test('a trip itemised as flights and hotel drops the booking total those lines replaced', () => {
  const [trip] = groupHolidayTrips([
    { event: 'Kn Matas Blanca -Mum', start: '2027-04-17', end: '2027-04-24', nights: 7, totalPence: 76100, totalText: '761' },
    { event: 'flights and hotel', start: '2027-04-17', end: '2027-04-24', nights: '-', totalPence: 77600 },
    { event: 'car parking', start: '2027-04-17', end: '2027-04-24', nights: '-', totalPence: 3482 },
    { event: 'Travel Insurance', start: '2027-04-17', end: '2027-04-24', nights: '-', totalPence: 4200 },
  ], (row) => row);

  assert.equal(trip.totalPence, 85282, '776 + 34.82 + 42, with the old 761 not added on top');
});

test('a booking total that excludes its cost lines still adds them', () => {
  const [trip] = groupHolidayTrips([
    { event: 'Hotel', start: '2026-02-01', end: '2026-02-05', nights: 4, totalPence: 30000 },
    { event: 'car parking', start: '2026-02-01', end: '2026-02-05', nights: '-', totalPence: 2500 },
  ], (row) => row);

  assert.equal(trip.totalPence, 32500);
});

test('days and nights are worked out from the dates', () => {
  assert.equal(daysBetween('2026-12-22', '2026-12-29'), 8, 'both the arrival and the leaving day count');
  assert.equal(nightsBetween('2026-12-22', '2026-12-29'), 7);
  assert.equal(nightsBetween('2026-12-22', '2026-12-22'), 0, 'a same-day trip has no nights');
  assert.equal(daysBetween('2026-12-22', ''), 1, 'a start with no end is one day');
  assert.equal(nightsBetween('2026-12-29', '2026-12-22'), null, 'an end before the start is refused');
  assert.equal(nightsBetween('', ''), null);
});

test('a trip saved with no night count still uses its dates and counts', () => {
  const trips = groupHolidayTrips([
    { event: 'New trip', start: '2027-08-02', end: '2027-08-09', nights: '' },
    { event: 'car parking', start: '2027-08-02', end: '2027-08-09', nights: '-' },
    { event: 'Old trip', start: '2027-09-06', end: '2027-09-10', nights: null },
  ], (row) => row);

  assert.equal(trips.length, 2, 'the parking line folds into its trip instead of becoming one');
  assert.equal(trips[0].headline.event, 'New trip');
  assert.equal(trips[0].nights, 7, '2 to 9 August is 7 nights even with a blank count');
  assert.equal(trips[0].extras.length, 1);
  assert.equal(trips[1].nights, 4, '6 to 10 September is 4 nights');
});

test('a trip shows the nights its dates cover, not a stale stored figure', () => {
  const [trip] = groupHolidayTrips([
    { event: 'Kn Matas', start: '2027-04-17', end: '2027-04-24', nights: 3 },
  ], (row) => row);

  assert.equal(trip.nights, 7, '17 to 24 April is 7 nights');
});

test('the 2027 insurance line ends with the Kn Matas trip and joins it', () => {
  const rows = loadRows();
  const insurance = rows.find((row) => row.event === 'Travel Insurance');
  assert.ok(insurance);
  assert.equal(insurance.end, '2027-04-24', 'the workbook had 17/04/2028');

  const trip = groupHolidayTrips(rows, (row) => row).find((candidate) => candidate.start === '2027-04-17');
  assert.ok(trip);
  assert.equal(trip.headline.event, 'Kn Matas Blanca -Mum');
  assert.equal(trip.rows.length, 3);
  assert.equal(trip.extras.length, 2);
});

test('the workbook renders 15 trips and 6 cost lines instead of 21 trip rows', () => {
  const rows = loadRows();
  const trips = groupHolidayTrips(rows, (row) => row);
  assert.equal(trips.length, 15);
  assert.equal(rows.length - trips.length, 6);
  assert.equal(new Set(trips.map((trip) => trip.key)).size, trips.length);
});

test('a holiday is filed under the year it starts', () => {
  const keyed = rekeyHolidaysByStartYear({
    2026: [
      { event: 'Mum 2027', start: '2027-04-17', end: '2027-04-24' },
      { event: 'December', start: '2026-12-22', end: '2026-12-29' },
    ],
    2027: [{ event: 'No date' }],
  });

  assert.deepEqual(Object.keys(keyed).sort(), ['2026', '2027']);
  assert.deepEqual(keyed['2026'].map((row) => row.event), ['December']);
  assert.deepEqual(keyed['2027'].map((row) => row.event).sort(), ['Mum 2027', 'No date']);
});

test('two real trips on the same dates stay separate and cost lines attach to the latest', () => {
  const grouped = groupHolidayTrips([
    { event: 'Trip A', start: '2026-01-01', end: '2026-01-05', nights: 4 },
    { event: 'Trip B', start: '2026-01-01', end: '2026-01-05', nights: 4 },
    { event: 'parking', start: '2026-01-01', end: '2026-01-05', nights: '-' },
  ], (row) => row);

  assert.equal(grouped.length, 2);
  assert.equal(grouped[0].key, '2026-01-01|2026-01-05|0');
  assert.equal(grouped[1].key, '2026-01-01|2026-01-05|1');
  assert.equal(grouped[0].extras.length, 0);
  assert.equal(grouped[1].headline.event, 'Trip B');
  assert.equal(grouped[1].extras[0].event, 'parking');
});
