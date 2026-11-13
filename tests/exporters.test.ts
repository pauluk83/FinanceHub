import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExcelWorkbook, buildPrintReport } from '../core/exporters.ts';

test('the Excel workbook escapes text and keeps numeric cells numeric', () => {
  const xml = buildExcelWorkbook([
    { name: 'A&B / 2026', rows: [['Name', 'Amount'], ['<script>', 12.5]] },
  ]);
  assert.match(xml, /ss:Name="A&amp;B   2026"/);
  assert.match(xml, /&lt;script&gt;/);
  assert.match(xml, /ss:Type="Number">12\.5</);
  assert.match(xml, /ss:Type="String">Name</);
});

test('the print report escapes content and includes the table', () => {
  const html = buildPrintReport({
    title: 'Statement <2026>',
    subtitle: 'Current & savings',
    summary: [['Opening', '£1,800.00']],
    head: ['Date', 'Description'],
    rows: [['2026-11-01', '<b>Salary</b>']],
  });
  assert.match(html, /Statement &lt;2026&gt;/);
  assert.match(html, /Current &amp; savings/);
  assert.match(html, /&lt;b&gt;Salary&lt;\/b&gt;/);
  assert.match(html, /<table>/);
  assert.equal(html.includes('<b>Salary</b>'), false);
});
