export type ExportCell = string | number | boolean | null | undefined;

export interface ExportSheet {
  name: string;
  rows: ExportCell[][];
}

export interface PrintReport {
  title: string;
  subtitle?: string;
  summary?: Array<[string, string]>;
  head: string[];
  rows: string[][];
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function safeSheetName(name: string, index: number): string {
  const cleaned = name.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31);
  return cleaned || `Sheet${index + 1}`;
}

function cellXml(value: ExportCell, header: boolean): string {
  if (value === null || value === undefined || value === '') {
    return `<Cell${header ? ' ss:StyleID="header"' : ''}/>`;
  }
  const numeric = typeof value === 'number' && Number.isFinite(value);
  const text = numeric ? String(value) : typeof value === 'boolean' ? (value ? 'TRUE' : 'FALSE') : String(value);
  return `<Cell${header ? ' ss:StyleID="header"' : ''}><Data ss:Type="${numeric ? 'Number' : 'String'}">${escapeXml(text)}</Data></Cell>`;
}

/**
 * Excel-readable SpreadsheetML. It opens as a normal workbook in Excel and
 * LibreOffice without adding a spreadsheet runtime dependency to the app.
 */
export function buildExcelWorkbook(sheets: ExportSheet[]): string {
  const worksheets = sheets.map((sheet, index) => {
    const rows = sheet.rows.map((row, rowIndex) => (
      `<Row>${row.map((cell) => cellXml(cell, rowIndex === 0)).join('')}</Row>`
    )).join('');
    return `<Worksheet ss:Name="${escapeXml(safeSheetName(sheet.name, index))}"><Table>${rows}</Table></Worksheet>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="header"><Font ss:Bold="1"/></Style>
  </Styles>
  ${worksheets}
</Workbook>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** A self-contained report for the browser/Electron print-to-PDF dialog. */
export function buildPrintReport(report: PrintReport): string {
  const summary = report.summary?.length
    ? `<div class="summary">${report.summary.map(([label, value]) => (
      `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`
    )).join('')}</div>`
    : '';
  const head = report.head.map((cell) => `<th>${escapeHtml(cell)}</th>`).join('');
  const body = report.rows.map((row) => (
    `<tr>${row.map((cell, index) => `<td${index > 0 ? ' class="num"' : ''}>${escapeHtml(cell)}</td>`).join('')}</tr>`
  )).join('');

  return `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8">
<title>${escapeHtml(report.title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font: 11px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; color: #17202a; margin: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #5b6773; margin: 0 0 16px; }
  .summary { display: flex; flex-wrap: wrap; gap: 10px; margin: 0 0 16px; }
  .summary div { border: 1px solid #d7dde3; border-radius: 6px; padding: 8px 12px; min-width: 120px; }
  .summary span { display: block; color: #5b6773; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
  .summary strong { display: block; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; background: #eef2f5; border-bottom: 1px solid #b9c3cc; padding: 5px 6px; font-size: 10px; text-transform: uppercase; letter-spacing: .03em; }
  td { border-bottom: 1px solid #e3e8ec; padding: 4px 6px; vertical-align: top; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  @page { size: A4 landscape; margin: 12mm; }
  @media print { body { margin: 0; } thead { display: table-header-group; } tr { break-inside: avoid; } }
</style></head><body>
<h1>${escapeHtml(report.title)}</h1>
${report.subtitle ? `<p class="sub">${escapeHtml(report.subtitle)}</p>` : ''}
${summary}
<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
</body></html>`;
}
