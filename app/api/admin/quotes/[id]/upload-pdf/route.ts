import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'
import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer'
import React from 'react'

// ── Helpers ────────────────────────────────────────────────────────
function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
}
function fmtRs(n: number) {
  return 'Rs. ' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function serviceLabel(s: string) {
  if (s === 'airport-to-door') return 'Airport to Doorstep Delivery'
  if (s === 'door-to-airport') return 'Doorstep to Airport Delivery'
  if (s === 'intercity')       return 'Intercity Baggage Delivery'
  return s
}
function toWords(n: number): string {
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
    'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen']
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety']
  if (n === 0) return 'Zero Rupees Only'
  function below100(x: number) {
    if (x < 20) return ones[x]
    return tens[Math.floor(x/10)] + (x%10 ? ' ' + ones[x%10] : '')
  }
  function below1000(x: number) {
    if (x < 100) return below100(x)
    return ones[Math.floor(x/100)] + ' Hundred' + (x%100 ? ' ' + below100(x%100) : '')
  }
  const rupees = Math.floor(n)
  const paise  = Math.round((n - rupees) * 100)
  let result = ''
  if (rupees >= 10000000) result += below1000(Math.floor(rupees/10000000)) + ' Crore '
  if (rupees % 10000000 >= 100000) result += below1000(Math.floor((rupees%10000000)/100000)) + ' Lakh '
  if (rupees % 100000 >= 1000) result += below1000(Math.floor((rupees%100000)/1000)) + ' Thousand '
  if (rupees % 1000 >= 100) result += ones[Math.floor((rupees%1000)/100)] + ' Hundred '
  if (rupees % 100 > 0) result += below100(rupees % 100) + ' '
  result = result.trim() + ' Rupees'
  if (paise > 0) result += ' and ' + below100(paise) + ' Paise'
  return result + ' Only'
}

// ── PDF Styles ─────────────────────────────────────────────────────
const s = StyleSheet.create({
  page:         { fontFamily: 'Helvetica', fontSize: 10, color: '#111827', backgroundColor: '#ffffff' },
  // Header
  header:       { backgroundColor: '#f97316', padding: '24 32', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLeft:   { flexDirection: 'column' },
  brand:        { fontSize: 22, fontFamily: 'Helvetica-Bold', color: '#ffffff', letterSpacing: -0.5 },
  brandSub:     { fontSize: 8, color: 'rgba(255,255,255,0.8)', marginTop: 2, letterSpacing: 1 },
  headerRight:  { alignItems: 'flex-end' },
  quoteLabel:   { fontSize: 8, fontFamily: 'Helvetica-Bold', color: 'rgba(255,255,255,0.7)', letterSpacing: 2 },
  quoteNumber:  { fontSize: 16, fontFamily: 'Helvetica-Bold', color: '#ffffff', marginTop: 2 },
  statusPill:   { marginTop: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10, paddingVertical: 2, paddingHorizontal: 8 },
  statusText:   { fontSize: 8, color: '#ffffff', fontFamily: 'Helvetica-Bold' },
  // Meta strip
  metaStrip:    { backgroundColor: '#fff7ed', borderBottom: '1 solid #fed7aa', paddingVertical: 10, paddingHorizontal: 32, flexDirection: 'row', gap: 24 },
  metaItem:     { flexDirection: 'column' },
  metaLabel:    { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#9a3412', letterSpacing: 0.8, textTransform: 'uppercase' },
  metaValue:    { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#111827', marginTop: 2 },
  // Body
  body:         { padding: '20 32' },
  row2:         { flexDirection: 'row', gap: 16, marginBottom: 16 },
  // Cards
  card:         { flex: 1, backgroundColor: '#f9fafb', borderRadius: 6, padding: '12 14', borderLeft: '3 solid #f97316' },
  cardDark:     { flex: 1, backgroundColor: '#f9fafb', borderRadius: 6, padding: '12 14', borderLeft: '3 solid #111827' },
  cardLabel:    { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#9ca3af', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  cardName:     { fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#111827' },
  cardText:     { fontSize: 9, color: '#4b5563', marginTop: 3 },
  // Route
  routeRow:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  routeCity:    { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#111827' },
  routeCityLbl: { fontSize: 7, color: '#9ca3af', textTransform: 'uppercase' },
  routeLine:    { flex: 1, height: 1, backgroundColor: '#d1d5db' },
  routeArrow:   { fontSize: 10, color: '#374151' },
  grid2:        { flexDirection: 'row', gap: 8 },
  gridItem:     { flex: 1 },
  gridLabel:    { fontSize: 7, color: '#9ca3af' },
  gridVal:      { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#111827' },
  // Table
  table:        { marginBottom: 14 },
  thead:        { flexDirection: 'row', backgroundColor: '#111827', borderRadius: 4 },
  theadCell:    { paddingVertical: 8, paddingHorizontal: 10, fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#ffffff' },
  tbodyRow:     { flexDirection: 'row', borderBottom: '1 solid #f3f4f6', paddingVertical: 10 },
  tcell:        { paddingHorizontal: 10, fontSize: 9, color: '#374151' },
  tcellBold:    { paddingHorizontal: 10, fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#111827' },
  // Totals
  totalsRow:    { flexDirection: 'row', gap: 16, marginBottom: 14 },
  bankCard:     { flex: 1, backgroundColor: '#f9fafb', borderRadius: 6, padding: '12 14' },
  bankLabel:    { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#9ca3af', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  bankRow:      { flexDirection: 'row', gap: 4, marginTop: 2 },
  bankKey:      { fontSize: 8, color: '#9ca3af', width: 32 },
  bankVal:      { fontSize: 8, color: '#374151', fontFamily: 'Helvetica-Bold' },
  upiBox:       { marginTop: 6, padding: '5 8', backgroundColor: '#fff7ed', borderRadius: 4, border: '1 solid #fed7aa' },
  upiText:      { fontSize: 8, color: '#9a3412', fontFamily: 'Helvetica-Bold' },
  totalsCard:   { flex: 1 },
  totalLine:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  totalKey:     { fontSize: 9, color: '#6b7280' },
  totalVal:     { fontSize: 9, color: '#6b7280' },
  totalDivider: { borderTop: '1.5 solid #111827', marginTop: 4, marginBottom: 8 },
  grandKey:     { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#111827' },
  grandVal:     { fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#f97316' },
  amtWords:     { marginTop: 6, padding: '6 10', backgroundColor: '#fff7ed', borderRadius: 6, border: '1 solid #fed7aa' },
  amtWordsLbl:  { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#9a3412', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 2 },
  amtWordsVal:  { fontSize: 8, fontFamily: 'Helvetica-BoldOblique', color: '#111827' },
  // Notes
  notesBox:     { backgroundColor: '#f9fafb', borderRadius: 6, padding: '10 12', marginBottom: 12, borderLeft: '3 solid #f97316' },
  notesLabel:   { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#9ca3af', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 3 },
  notesText:    { fontSize: 9, color: '#374151' },
  // T&C
  tcSection:    { borderTop: '1 solid #f3f4f6', paddingTop: 12, marginBottom: 12 },
  tcTitle:      { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#374151', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  tcGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  tcItem:       { width: '48%', flexDirection: 'row', gap: 4, marginBottom: 4 },
  tcNum:        { fontSize: 7, color: '#f97316', fontFamily: 'Helvetica-Bold', width: 10 },
  tcText:       { fontSize: 7, color: '#6b7280', flex: 1, lineHeight: 1.4 },
  // Footer
  footer:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: '1 solid #f3f4f6', paddingTop: 12 },
  footerLeft:   { flexDirection: 'column' },
  footerCo:     { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#374151', marginBottom: 2 },
  footerText:   { fontSize: 7, color: '#9ca3af', lineHeight: 1.5 },
  sig:          { alignItems: 'center' },
  sigLine:      { width: 140, borderTop: '1 solid #374151', paddingTop: 4, fontSize: 8, color: '#374151', fontFamily: 'Helvetica-Bold', textAlign: 'center' },
  sigSub:       { fontSize: 7, color: '#9ca3af', marginTop: 2, textAlign: 'center' },
})

// ── PDF Template ───────────────────────────────────────────────────
interface Quote {
  id: string; quote_number: string; customer_name: string; customer_phone: string
  customer_email: string | null; service_type: string; from_city: string; to_city: string
  pickup_date: string | null; time_slot: string | null; total_bags: number
  base_price: number; cgst: number; sgst: number; total_amount: number
  status: string; valid_until: string | null; notes: string | null; version: number; created_at: string
}

function QuotePDF({ q }: { q: Quote }) {
  const TC = [
    'All bookings are confirmed on receipt of full payment. A CN number will be issued for reference.',
    'Only the services mentioned above are included. Company reserves the right to cancel at any point.',
    'Luggage must not contain prohibited items. Alcohol and illegal substances are strictly prohibited.',
    'Cancellation (Mumbai): 5+ days before pickup for full refund. Other cities: 7+ days.',
    'Bagdrop is not liable for loss, damage or theft during transit. Carry valuables personally.',
    'Rates are subject to change. Services subject to availability at time of booking.',
  ]

  return React.createElement(Document, { title: `Bagdrop Quote ${q.quote_number}`, author: 'Bagdrop' },
    React.createElement(Page, { size: 'A4', style: s.page },
      // Header
      React.createElement(View, { style: s.header },
        React.createElement(View, { style: s.headerLeft },
          React.createElement(Text, { style: s.brand }, 'BAGDROP'),
          React.createElement(Text, { style: s.brandSub }, "INDIA'S DIGITAL BAGGAGE INFRASTRUCTURE")
        ),
        React.createElement(View, { style: s.headerRight },
          React.createElement(Text, { style: s.quoteLabel }, 'SERVICE QUOTE'),
          React.createElement(Text, { style: s.quoteNumber }, q.quote_number),
          React.createElement(View, { style: s.statusPill },
            React.createElement(Text, { style: s.statusText }, q.status.toUpperCase())
          )
        )
      ),

      // Meta strip
      React.createElement(View, { style: s.metaStrip },
        ...[
          { label: 'DATE',      val: fmtDate(q.created_at) },
          { label: 'VALID UNTIL', val: fmtDate(q.valid_until) },
          { label: 'VERSION',   val: `v${q.version ?? 1}` },
          { label: 'GSTIN',     val: '24BDMPS7461P1ZM' },
          { label: 'HSN/SAC',   val: '996511' },
        ].map(f =>
          React.createElement(View, { key: f.label, style: s.metaItem },
            React.createElement(Text, { style: s.metaLabel }, f.label),
            React.createElement(Text, { style: s.metaValue }, f.val)
          )
        )
      ),

      // Body
      React.createElement(View, { style: s.body },

        // Customer + Journey
        React.createElement(View, { style: s.row2 },
          // Customer
          React.createElement(View, { style: s.card },
            React.createElement(Text, { style: s.cardLabel }, 'BILLED TO'),
            React.createElement(Text, { style: s.cardName }, q.customer_name),
            React.createElement(Text, { style: s.cardText }, q.customer_phone),
            q.customer_email ? React.createElement(Text, { style: s.cardText }, q.customer_email) : null
          ),
          // Journey
          React.createElement(View, { style: s.cardDark },
            React.createElement(Text, { style: s.cardLabel }, 'JOURNEY DETAILS'),
            React.createElement(View, { style: s.routeRow },
              React.createElement(View, null,
                React.createElement(Text, { style: s.routeCityLbl }, 'FROM'),
                React.createElement(Text, { style: s.routeCity }, q.from_city)
              ),
              React.createElement(View, { style: s.routeLine }),
              React.createElement(Text, { style: s.routeArrow }, '>'),
              React.createElement(View, { style: s.routeLine }),
              React.createElement(View, null,
                React.createElement(Text, { style: s.routeCityLbl }, 'TO'),
                React.createElement(Text, { style: s.routeCity }, q.to_city)
              )
            ),
            React.createElement(View, { style: s.grid2 },
              React.createElement(View, { style: s.gridItem },
                React.createElement(Text, { style: s.gridLabel }, 'Pickup'),
                React.createElement(Text, { style: s.gridVal }, fmtDate(q.pickup_date))
              ),
              q.time_slot ? React.createElement(View, { style: s.gridItem },
                React.createElement(Text, { style: s.gridLabel }, 'Slot'),
                React.createElement(Text, { style: s.gridVal }, q.time_slot)
              ) : null,
              React.createElement(View, { style: s.gridItem },
                React.createElement(Text, { style: s.gridLabel }, 'Bags'),
                React.createElement(Text, { style: s.gridVal }, `${q.total_bags} pc${q.total_bags !== 1 ? 's' : ''}`)
              ),
              React.createElement(View, { style: s.gridItem },
                React.createElement(Text, { style: s.gridLabel }, 'Service'),
                React.createElement(Text, { style: s.gridVal }, serviceLabel(q.service_type).split(' ')[0])
              )
            )
          )
        ),

        // Service Table
        React.createElement(View, { style: s.table },
          React.createElement(View, { style: s.thead },
            ...(['#', 'Description', 'Qty', 'Rate', 'Amount'] as const).map((h, i) =>
              React.createElement(Text, {
                key: h,
                style: [s.theadCell, i === 1 ? { flex: 1 } : i === 0 ? { width: 24 } : { width: 60, textAlign: i > 1 ? 'right' : 'left' }]
              }, h)
            )
          ),
          React.createElement(View, { style: s.tbodyRow },
            React.createElement(Text, { style: [s.tcell, { width: 24, color: '#9ca3af' }] }, '1'),
            React.createElement(View, { style: { flex: 1, paddingHorizontal: 10 } },
              React.createElement(Text, { style: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#111827' } }, serviceLabel(q.service_type)),
              React.createElement(Text, { style: { fontSize: 8, color: '#6b7280', marginTop: 2 } },
                `${q.from_city} to ${q.to_city} · ${q.total_bags} bag${q.total_bags !== 1 ? 's' : ''} · HSN 996511`)
            ),
            React.createElement(Text, { style: [s.tcell, { width: 60, textAlign: 'center' }] }, String(q.total_bags)),
            React.createElement(Text, { style: [s.tcell, { width: 60, textAlign: 'right' }] }, fmtRs(q.base_price / (q.total_bags || 1))),
            React.createElement(Text, { style: [s.tcellBold, { width: 60, textAlign: 'right' }] }, fmtRs(q.base_price))
          )
        ),

        // Totals + Bank
        React.createElement(View, { style: s.totalsRow },
          // Bank
          React.createElement(View, { style: s.bankCard },
            React.createElement(Text, { style: s.bankLabel }, 'PAYMENT DETAILS'),
            ...[
              { k: 'Bank', v: 'Indian Overseas Bank' },
              { k: 'A/C', v: '171702000001297' },
              { k: 'IFSC', v: 'IOBA0001717' },
            ].map(r =>
              React.createElement(View, { key: r.k, style: s.bankRow },
                React.createElement(Text, { style: s.bankKey }, r.k),
                React.createElement(Text, { style: s.bankVal }, r.v)
              )
            ),
            React.createElement(View, { style: s.upiBox },
              React.createElement(Text, { style: s.upiText }, 'UPI: BAGDROP1717@IOB')
            )
          ),
          // Totals
          React.createElement(View, { style: s.totalsCard },
            ...[
              { k: 'Subtotal', v: fmtRs(q.base_price) },
              { k: 'CGST @ 2.5%', v: fmtRs(q.cgst) },
              { k: 'SGST @ 2.5%', v: fmtRs(q.sgst) },
            ].map(r =>
              React.createElement(View, { key: r.k, style: s.totalLine },
                React.createElement(Text, { style: s.totalKey }, r.k),
                React.createElement(Text, { style: s.totalVal }, r.v)
              )
            ),
            React.createElement(View, { style: s.totalDivider }),
            React.createElement(View, { style: s.totalLine },
              React.createElement(Text, { style: s.grandKey }, 'Total Amount'),
              React.createElement(Text, { style: s.grandVal }, fmtRs(q.total_amount))
            ),
            React.createElement(View, { style: s.amtWords },
              React.createElement(Text, { style: s.amtWordsLbl }, 'Amount in Words'),
              React.createElement(Text, { style: s.amtWordsVal }, toWords(q.total_amount))
            )
          )
        ),

        // Notes
        q.notes ? React.createElement(View, { style: s.notesBox },
          React.createElement(Text, { style: s.notesLabel }, 'NOTES'),
          React.createElement(Text, { style: s.notesText }, q.notes)
        ) : null,

        // T&C
        React.createElement(View, { style: s.tcSection },
          React.createElement(Text, { style: s.tcTitle }, 'Terms & Conditions'),
          React.createElement(View, { style: s.tcGrid },
            ...TC.map((t, i) =>
              React.createElement(View, { key: i, style: s.tcItem },
                React.createElement(Text, { style: s.tcNum }, `${i+1}.`),
                React.createElement(Text, { style: s.tcText }, t)
              )
            )
          )
        ),

        // Footer
        React.createElement(View, { style: s.footer },
          React.createElement(View, { style: s.footerLeft },
            React.createElement(Text, { style: s.footerCo }, 'BAGDROP LOGISTICS SOLUTIONS PVT. LTD.'),
            React.createElement(Text, { style: s.footerText }, 'TF-302, Ananta Stallion, Gotri Sevasi Road, Vadodara - 391101'),
            React.createElement(Text, { style: s.footerText }, 'GSTIN: 24BDMPS7461P1ZM · CIN: U63090GJ2023PTC142601'),
            React.createElement(Text, { style: s.footerText }, '+91 63 5711 5711 · info@bagdrop.co.in · bagdrop.co.in')
          ),
          React.createElement(View, { style: s.sig },
            React.createElement(Text, { style: s.sigLine }, 'Authorized Signatory'),
            React.createElement(Text, { style: s.sigSub }, 'For Bagdrop Logistics Solutions Pvt. Ltd.')
          )
        )
      )
    )
  )
}

// ── Route Handler ──────────────────────────────────────────────────
export const runtime = 'nodejs'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  // 1. Fetch quote
  const { data: quote, error } = await supabaseAdmin
    .from('quotes')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !quote) {
    return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
  }

  // 2. Generate PDF buffer
  let pdfBuffer: Buffer
  try {
    // Call QuotePDF as a plain function to get the Document ReactElement,
    // then cast — pdf() needs ReactElement<DocumentProps> but TS infers component props
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfDoc = pdf(QuotePDF({ q: quote }) as any)
    const blob   = await pdfDoc.toBlob()
    const arr    = await blob.arrayBuffer()
    pdfBuffer    = Buffer.from(arr)
  } catch (err) {
    console.error('PDF generation error:', err)
    return NextResponse.json({ error: 'PDF generation failed' }, { status: 500 })
  }

  // 3. Upload to Supabase Storage
  const filename  = `${quote.quote_number.replace(/\//g, '-')}_v${quote.version ?? 1}.pdf`
  const storagePath = `${id}/${filename}`

  const { error: uploadError } = await supabaseAdmin.storage
    .from('quotes')
    .upload(storagePath, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,                  // overwrite on re-send
    })

  if (uploadError) {
    console.error('Storage upload error:', uploadError)
    return NextResponse.json({ error: 'Upload failed: ' + uploadError.message }, { status: 500 })
  }

  // 4. Get public URL
  const { data: urlData } = supabaseAdmin.storage
    .from('quotes')
    .getPublicUrl(storagePath)

  return NextResponse.json({
    url:      urlData.publicUrl,
    filename,
  })
}
