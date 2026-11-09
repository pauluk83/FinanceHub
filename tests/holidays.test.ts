import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { groupHolidayTrips } from '../core/holidays.ts';

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
  assert.equal(december.totalPence, 140109);
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
