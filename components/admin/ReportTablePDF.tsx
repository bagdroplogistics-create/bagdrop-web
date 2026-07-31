import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

// Generic tabular-report PDF — shared by every "detailed report" export
// (Inquiry Source, Booking Status, Route Performance, Partner, Customer,
// Payment, Driver & Operations, Document, Cancellation). Deliberately plain
// (no per-report layout) so one component covers all of them; the fancier
// branded PDFs elsewhere in the app (QuotePDF, TripSheetPDF) stay untouched
// — this is a separate, additive component.

const ORANGE = '#FF6300'
const DARK   = '#111827'
const GREY   = '#6b7280'
const LIGHT  = '#f9fafb'
const BORDER = '#e5e7eb'

const s = StyleSheet.create({
  page:       { fontFamily: 'Helvetica', backgroundColor: '#fff', padding: '24 24 32', fontSize: 8 },
  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  brand:      { color: ORANGE, fontSize: 16, fontFamily: 'Helvetica-Bold' },
  title:      { color: DARK, fontSize: 11, fontFamily: 'Helvetica-Bold', marginTop: 2 },
  meta:       { color: GREY, fontSize: 7, textAlign: 'right' },
  divider:    { borderBottomWidth: 1.5, borderBottomColor: ORANGE, marginBottom: 10, marginTop: 6 },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  summaryBox: { backgroundColor: LIGHT, borderRadius: 4, padding: '6 10', borderLeftWidth: 2, borderLeftColor: ORANGE },
  summaryLbl: { color: GREY, fontSize: 6.5, textTransform: 'uppercase', letterSpacing: 0.4 },
  summaryVal: { color: DARK, fontSize: 10, fontFamily: 'Helvetica-Bold', marginTop: 1 },
  table:      { display: 'flex', width: 'auto', borderWidth: 1, borderColor: BORDER },
  thRow:      { flexDirection: 'row', backgroundColor: ORANGE },
  th:         { color: '#fff', fontSize: 7, fontFamily: 'Helvetica-Bold', padding: '5 4', borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.3)' },
  tr:         { flexDirection: 'row', borderTopWidth: 1, borderTopColor: BORDER },
  trAlt:      { backgroundColor: LIGHT },
  td:         { color: DARK, fontSize: 7, padding: '4 4', borderRightWidth: 1, borderRightColor: BORDER },
  footer:     { position: 'absolute', bottom: 14, left: 24, right: 24, textAlign: 'center', color: GREY, fontSize: 6.5 },
})

export interface PDFColumn { key: string; label: string }
export interface PDFSummaryItem { label: string; value: string }

interface ReportTablePDFProps {
  title:      string
  generatedAt: string
  columns:    PDFColumn[]
  rows:       Record<string, unknown>[]
  summary?:   PDFSummaryItem[]
}

function fmtCell(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  return String(v)
}

// PDF table columns get wide fast — cap what's shown on the PDF/print
// surface to keep it legible; the Excel/CSV exports still carry every
// column since those aren't page-width constrained.
const MAX_PDF_COLUMNS = 8
const ROWS_PER_PAGE = 28

export default function ReportTablePDF({ title, generatedAt, columns, rows, summary }: ReportTablePDFProps) {
  const cols = columns.slice(0, MAX_PDF_COLUMNS)
  const colWidth = `${(100 / Math.max(cols.length, 1)).toFixed(2)}%`
  const pages: Record<string, unknown>[][] = []
  for (let i = 0; i < rows.length; i += ROWS_PER_PAGE) pages.push(rows.slice(i, i + ROWS_PER_PAGE))
  if (pages.length === 0) pages.push([])

  return (
    <Document>
      {pages.map((pageRows, pageIdx) => (
        <Page key={pageIdx} size="A4" orientation="landscape" style={s.page}>
          <View style={s.header}>
            <View>
              <Text style={s.brand}>Bagdrop</Text>
              <Text style={s.title}>{title}</Text>
            </View>
            <View>
              <Text style={s.meta}>Generated {generatedAt}</Text>
              <Text style={s.meta}>Page {pageIdx + 1} of {pages.length}</Text>
            </View>
          </View>
          <View style={s.divider} />

          {pageIdx === 0 && summary && summary.length > 0 && (
            <View style={s.summaryRow}>
              {summary.map((it, i) => (
                <View key={i} style={s.summaryBox}>
                  <Text style={s.summaryLbl}>{it.label}</Text>
                  <Text style={s.summaryVal}>{it.value}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={s.table}>
            <View style={s.thRow}>
              {cols.map(c => (
                <Text key={c.key} style={[s.th, { width: colWidth }]}>{c.label}</Text>
              ))}
            </View>
            {pageRows.map((row, ri) => (
              <View key={ri} style={ri % 2 === 1 ? [s.tr, s.trAlt] : s.tr}>
                {cols.map(c => (
                  <Text key={c.key} style={[s.td, { width: colWidth }]}>{fmtCell(row[c.key])}</Text>
                ))}
              </View>
            ))}
            {pageRows.length === 0 && (
              <View style={s.tr}><Text style={[s.td, { width: '100%' }]}>No data for the selected filters.</Text></View>
            )}
          </View>

          <Text style={s.footer} fixed>Bagdrop — Aviation Infrastructure Company · Confidential · {rows.length} total records</Text>
        </Page>
      ))}
    </Document>
  )
}
