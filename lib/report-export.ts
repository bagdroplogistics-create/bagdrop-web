// Shared export helpers for the Reports & Analytics detailed-report tabs.
// One implementation per format, reused by every report type (Inquiry
// Source, Booking Status, Route Performance, Partner, Customer, Payment,
// Driver & Operations, Document, Cancellation) instead of bespoke
// per-report export code. All four run entirely client-side — no new API
// round trip, no server-side file storage.
//
// Formats:
//   CSV     — hand-rolled, no dependency.
//   Excel   — 'xlsx' (SheetJS), dynamically imported so it isn't bundled
//             into every page that doesn't use it.
//   PDF     — '@react-pdf/renderer' (already a project dependency, used for
//             Quote/Invoice/Trip Sheet PDFs elsewhere), rendered against the
//             generic ReportTablePDF component. Same client-side
//             pdf(...).toBlob() pattern as app/(admin)/admin/trip-sheets/page.tsx.
//   Print   — opens a new window with a plain HTML table and calls
//             window.print(), so the browser's own "Save as PDF" / physical
//             print flow handles the rest. No dependency.

export interface ReportColumn { key: string; label: string }
export type ReportRow = Record<string, unknown>

function cellText(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  return String(v)
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function safeFilename(base: string, ext: string): string {
  const stamp = new Date().toISOString().slice(0, 10)
  return `${base.replace(/[^a-z0-9_-]+/gi, '_')}_${stamp}.${ext}`
}

// ── CSV ──────────────────────────────────────────────────────────────────
export function toCSV(columns: ReportColumn[], rows: ReportRow[]): string {
  const esc = (s: string) => {
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
    return s
  }
  const header = columns.map(c => esc(c.label)).join(',')
  const body = rows.map(r => columns.map(c => esc(cellText(r[c.key]))).join(',')).join('\n')
  return header + '\n' + body
}

export function downloadCSV(columns: ReportColumn[], rows: ReportRow[], filenameBase: string) {
  const csv = toCSV(columns, rows)
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }) // BOM for Excel-on-Windows friendliness
  triggerDownload(blob, safeFilename(filenameBase, 'csv'))
}

// ── Excel ────────────────────────────────────────────────────────────────
export async function downloadExcel(columns: ReportColumn[], rows: ReportRow[], filenameBase: string, sheetName = 'Report') {
  const XLSX = await import('xlsx')
  const aoa = [
    columns.map(c => c.label),
    ...rows.map(r => columns.map(c => cellText(r[c.key]))),
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31)) // Excel sheet-name length cap
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  triggerDownload(blob, safeFilename(filenameBase, 'xlsx'))
}

// ── PDF ──────────────────────────────────────────────────────────────────
export async function downloadPDF(
  columns: ReportColumn[],
  rows: ReportRow[],
  filenameBase: string,
  title: string,
  summary?: { label: string; value: string }[],
) {
  const { pdf } = await import('@react-pdf/renderer')
  const { default: ReportTablePDF } = await import('@/components/admin/ReportTablePDF')
  const generatedAt = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
  const blob = await pdf(
    ReportTablePDF({ title, generatedAt, columns, rows, summary })
  ).toBlob()
  triggerDownload(blob, safeFilename(filenameBase, 'pdf'))
}

// ── Print ────────────────────────────────────────────────────────────────
export function printReport(columns: ReportColumn[], rows: ReportRow[], title: string, summary?: { label: string; value: string }[]) {
  const win = window.open('', '_blank', 'width=1000,height=700')
  if (!win) return // popup blocked — nothing more we can do without a user gesture retry

  const generatedAt = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const summaryHtml = summary && summary.length
    ? `<div class="summary">${summary.map(it => `<div class="sbox"><div class="slabel">${esc(it.label)}</div><div class="sval">${esc(it.value)}</div></div>`).join('')}</div>`
    : ''

  const theadHtml = `<tr>${columns.map(c => `<th>${esc(c.label)}</th>`).join('')}</tr>`
  const tbodyHtml = rows.length
    ? rows.map(r => `<tr>${columns.map(c => `<td>${esc(cellText(r[c.key]))}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${columns.length}" class="empty">No data for the selected filters.</td></tr>`

  win.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${esc(title)} — Bagdrop</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; margin: 24px; color: #111827; }
  .brand { color: #FF6300; font-size: 20px; font-weight: 700; }
  h1 { font-size: 14px; margin: 4px 0 2px; }
  .meta { color: #6b7280; font-size: 11px; margin-bottom: 14px; }
  .summary { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; }
  .sbox { background: #f9fafb; border-left: 3px solid #FF6300; border-radius: 4px; padding: 8px 12px; min-width: 110px; }
  .slabel { color: #6b7280; font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; }
  .sval { color: #111827; font-size: 14px; font-weight: 700; margin-top: 2px; }
  table { border-collapse: collapse; width: 100%; font-size: 11px; }
  th { background: #FF6300; color: #fff; text-align: left; padding: 6px 8px; }
  td { border-bottom: 1px solid #e5e7eb; padding: 5px 8px; }
  tr:nth-child(even) td { background: #f9fafb; }
  .empty { text-align: center; color: #6b7280; padding: 20px; }
  footer { margin-top: 16px; text-align: center; color: #9ca3af; font-size: 10px; }
  @media print { body { margin: 10mm; } }
</style>
</head>
<body>
  <div class="brand">Bagdrop</div>
  <h1>${esc(title)}</h1>
  <div class="meta">Generated ${esc(generatedAt)} · ${rows.length} records</div>
  ${summaryHtml}
  <table><thead>${theadHtml}</thead><tbody>${tbodyHtml}</tbody></table>
  <footer>Bagdrop — Aviation Infrastructure Company · Confidential</footer>
</body>
</html>`)
  win.document.close()
  win.focus()
  // Give the new window a beat to lay out before invoking print — calling
  // immediately can race the document write on slower browsers.
  setTimeout(() => win.print(), 300)
}
