'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface Quote {
  id: string
  quote_number: string
  customer_name: string
  customer_phone: string
  customer_email: string | null
  service_type: string
  from_city: string
  to_city: string
  pickup_date: string | null
  time_slot: string | null
  total_bags: number
  base_price: number
  cgst: number
  sgst: number
  total_amount: number
  status: string
  valid_until: string | null
  notes: string | null
  version: number
  created_at: string
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
}
function fmtRs(n: number) {
  return '₹ ' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function toWords(n: number): string {
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
    'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen']
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety']
  if (n === 0) return 'Zero'
  function below100(x: number) {
    if (x < 20) return ones[x]
    return tens[Math.floor(x/10)] + (x%10 ? ' ' + ones[x%10] : '')
  }
  function below1000(x: number) {
    if (x < 100) return below100(x)
    return ones[Math.floor(x/100)] + ' Hundred' + (x%100 ? ' ' + below100(x%100) : '')
  }
  const rupees  = Math.floor(n)
  const paise   = Math.round((n - rupees) * 100)
  let result = ''
  if (rupees >= 10000000) { result += below1000(Math.floor(rupees/10000000)) + ' Crore '; }
  if (rupees % 10000000 >= 100000) { result += below1000(Math.floor((rupees%10000000)/100000)) + ' Lakh '; }
  if (rupees % 100000 >= 1000) { result += below1000(Math.floor((rupees%100000)/1000)) + ' Thousand '; }
  if (rupees % 1000 >= 100) { result += ones[Math.floor((rupees%1000)/100)] + ' Hundred '; }
  if (rupees % 100 > 0) { result += below100(rupees % 100) + ' '; }
  result = result.trim() + ' Rupees'
  if (paise > 0) result += ' and ' + below100(paise) + ' Paise'
  return result + ' Only'
}
function serviceLabel(s: string) {
  if (s === 'airport-to-door') return 'Airport → Doorstep Delivery'
  if (s === 'door-to-airport') return 'Doorstep → Airport Delivery'
  if (s === 'intercity')       return 'Intercity Baggage Delivery'
  return s
}

export default function QuotePrintPage() {
  const { id } = useParams<{ id: string }>()
  const [quote,   setQuote]   = useState<Quote | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  useEffect(() => {
    const key = sessionStorage.getItem('bagdrop_admin_key')
    if (!key) { setError('Unauthorized'); setLoading(false); return }
    fetch(`/api/admin/quotes/${id}?key=${key}`)
      .then(r => r.json())
      .then(d => { setQuote(d.quote ?? null); setLoading(false) })
      .catch(() => { setError('Failed to load quote'); setLoading(false) })
  }, [id])

  useEffect(() => {
    if (quote) setTimeout(() => window.print(), 600)
  }, [quote])

  if (loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',color:'#9ca3af',fontFamily:'sans-serif'}}>Loading quote...</div>
  if (error || !quote) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',color:'#ef4444',fontFamily:'sans-serif'}}>{error || 'Quote not found'}</div>

  const statusColors: Record<string, string> = {
    draft: '#6b7280', sent: '#2563eb', accepted: '#16a34a', rejected: '#dc2626', expired: '#d97706'
  }
  const sc = statusColors[quote.status] ?? '#6b7280'

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @media print {
          @page { size: A4; margin: 0; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .page { box-shadow: none !important; margin: 0 !important; border-radius: 0 !important; }
        }
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background: #f3f4f6; color: #111827; }
      `}</style>

      {/* Top toolbar — hidden on print */}
      <div className="no-print" style={{position:'fixed',top:0,left:0,right:0,zIndex:10,background:'#fff',borderBottom:'1px solid #e5e7eb',padding:'12px 24px',display:'flex',alignItems:'center',justifyContent:'space-between',boxShadow:'0 1px 4px rgba(0,0,0,.06)'}}>
        <p style={{fontSize:'14px',fontWeight:700,color:'#374151'}}>{quote.quote_number} — Quote</p>
        <div style={{display:'flex',gap:'10px'}}>
          <button onClick={() => window.history.back()} style={{padding:'6px 16px',borderRadius:'8px',border:'1px solid #e5e7eb',background:'#fff',fontSize:'13px',color:'#6b7280',cursor:'pointer'}}>← Back</button>
          <button onClick={() => window.print()} style={{padding:'6px 16px',borderRadius:'8px',border:'none',background:'#f97316',color:'#fff',fontSize:'13px',fontWeight:700,cursor:'pointer'}}>Print / PDF</button>
        </div>
      </div>

      {/* A4 Page */}
      <div className="page" style={{maxWidth:'794px',margin:'72px auto 40px',background:'#fff',boxShadow:'0 4px 24px rgba(0,0,0,.10)',borderRadius:'4px',overflow:'hidden'}}>

        {/* Orange header band */}
        <div style={{background:'#f97316',padding:'28px 36px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div>
            <div style={{fontSize:'26px',fontWeight:900,color:'#fff',letterSpacing:'-0.5px',lineHeight:1}}>BAGDROP</div>
            <div style={{fontSize:'10px',color:'rgba(255,255,255,0.8)',marginTop:'3px',letterSpacing:'1px',textTransform:'uppercase'}}>India's Digital Baggage Infrastructure</div>
          </div>
          <div style={{textAlign:'right'}}>
            <div style={{fontSize:'11px',fontWeight:700,color:'rgba(255,255,255,0.7)',letterSpacing:'2px',textTransform:'uppercase'}}>Service Quote</div>
            <div style={{fontSize:'22px',fontWeight:900,color:'#fff',marginTop:'2px'}}>{quote.quote_number}</div>
            <div style={{fontSize:'11px',color:'rgba(255,255,255,0.8)',marginTop:'4px'}}>
              <span style={{background:'rgba(255,255,255,0.2)',borderRadius:'20px',padding:'2px 10px',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.5px'}}>{quote.status}</span>
            </div>
          </div>
        </div>

        {/* Metadata strip */}
        <div style={{background:'#fff7ed',borderBottom:'1px solid #fed7aa',padding:'12px 36px',display:'flex',gap:'32px',flexWrap:'wrap'}}>
          {[
            {label:'Date',   value: fmtDate(quote.created_at)},
            {label:'Valid Until', value: fmtDate(quote.valid_until)},
            {label:'Version', value: `v${quote.version ?? 1}`},
            {label:'GSTIN',  value: '24BDMPS7461P1ZM'},
            {label:'HSN/SAC', value: '996511'},
          ].map(f => (
            <div key={f.label}>
              <div style={{fontSize:'9px',fontWeight:700,color:'#9a3412',textTransform:'uppercase',letterSpacing:'0.8px'}}>{f.label}</div>
              <div style={{fontSize:'12px',fontWeight:600,color:'#111827',marginTop:'2px'}}>{f.value}</div>
            </div>
          ))}
        </div>

        {/* Main content */}
        <div style={{padding:'28px 36px'}}>

          {/* Customer + Route — 2 col */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'20px',marginBottom:'24px'}}>

            {/* Customer */}
            <div style={{background:'#f9fafb',borderRadius:'10px',padding:'16px 18px',borderLeft:'3px solid #f97316'}}>
              <div style={{fontSize:'9px',fontWeight:700,textTransform:'uppercase',letterSpacing:'1px',color:'#9ca3af',marginBottom:'8px'}}>Billed To</div>
              <div style={{fontSize:'15px',fontWeight:800,color:'#111827'}}>{quote.customer_name}</div>
              <div style={{fontSize:'12px',color:'#4b5563',marginTop:'4px'}}>{quote.customer_phone}</div>
              {quote.customer_email && <div style={{fontSize:'11px',color:'#6b7280',marginTop:'2px'}}>{quote.customer_email}</div>}
            </div>

            {/* Journey */}
            <div style={{background:'#f9fafb',borderRadius:'10px',padding:'16px 18px',borderLeft:'3px solid #111827'}}>
              <div style={{fontSize:'9px',fontWeight:700,textTransform:'uppercase',letterSpacing:'1px',color:'#9ca3af',marginBottom:'8px'}}>Journey Details</div>
              {/* Route viz */}
              <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'10px'}}>
                <div style={{textAlign:'center'}}>
                  <div style={{fontSize:'9px',color:'#9ca3af',textTransform:'uppercase'}}>From</div>
                  <div style={{fontSize:'13px',fontWeight:800,color:'#111827'}}>{quote.from_city}</div>
                </div>
                <div style={{flex:1,display:'flex',alignItems:'center',gap:'4px'}}>
                  <div style={{flex:1,height:'1px',background:'#d1d5db'}}/>
                  <div style={{fontSize:'16px'}}>✈</div>
                  <div style={{flex:1,height:'1px',background:'#d1d5db'}}/>
                </div>
                <div style={{textAlign:'center'}}>
                  <div style={{fontSize:'9px',color:'#9ca3af',textTransform:'uppercase'}}>To</div>
                  <div style={{fontSize:'13px',fontWeight:800,color:'#111827'}}>{quote.to_city}</div>
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px',fontSize:'11px',color:'#4b5563'}}>
                <div><span style={{color:'#9ca3af'}}>Pickup: </span><strong>{fmtDate(quote.pickup_date)}</strong></div>
                {quote.time_slot && <div><span style={{color:'#9ca3af'}}>Slot: </span><strong>{quote.time_slot}</strong></div>}
                <div><span style={{color:'#9ca3af'}}>Bags: </span><strong>{quote.total_bags} pc{quote.total_bags !== 1 ? 's' : ''}</strong></div>
                <div><span style={{color:'#9ca3af'}}>Service: </span><strong>{serviceLabel(quote.service_type).split(' ')[0]}</strong></div>
              </div>
            </div>
          </div>

          {/* Service table */}
          <table style={{width:'100%',borderCollapse:'collapse',marginBottom:'20px',fontSize:'12px'}}>
            <thead>
              <tr style={{background:'#111827',color:'#fff'}}>
                <th style={{padding:'10px 14px',textAlign:'left',fontWeight:700,borderRadius:'6px 0 0 0'}}>#</th>
                <th style={{padding:'10px 14px',textAlign:'left',fontWeight:700}}>Description</th>
                <th style={{padding:'10px 14px',textAlign:'center',fontWeight:700}}>Qty</th>
                <th style={{padding:'10px 14px',textAlign:'right',fontWeight:700}}>Rate</th>
                <th style={{padding:'10px 14px',textAlign:'right',fontWeight:700,borderRadius:'0 6px 0 0'}}>Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{borderBottom:'1px solid #f3f4f6'}}>
                <td style={{padding:'12px 14px',color:'#9ca3af'}}>1</td>
                <td style={{padding:'12px 14px'}}>
                  <div style={{fontWeight:700,color:'#111827'}}>{serviceLabel(quote.service_type)}</div>
                  <div style={{fontSize:'11px',color:'#6b7280',marginTop:'2px'}}>{quote.from_city} to {quote.to_city} · {quote.total_bags} bag{quote.total_bags !== 1 ? 's' : ''} · HSN 996511</div>
                </td>
                <td style={{padding:'12px 14px',textAlign:'center',color:'#374151'}}>{quote.total_bags}</td>
                <td style={{padding:'12px 14px',textAlign:'right',color:'#374151'}}>{fmtRs(quote.base_price / (quote.total_bags || 1))}</td>
                <td style={{padding:'12px 14px',textAlign:'right',fontWeight:700,color:'#111827'}}>{fmtRs(quote.base_price)}</td>
              </tr>
            </tbody>
          </table>

          {/* Totals + Bank — 2 col */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'20px',marginBottom:'20px',alignItems:'start'}}>

            {/* Bank details */}
            <div style={{background:'#f9fafb',borderRadius:'10px',padding:'14px 16px'}}>
              <div style={{fontSize:'9px',fontWeight:700,textTransform:'uppercase',letterSpacing:'1px',color:'#9ca3af',marginBottom:'8px'}}>Payment Details</div>
              <div style={{fontSize:'11px',color:'#374151',lineHeight:'1.7'}}>
                <div><span style={{color:'#9ca3af'}}>Bank: </span>Indian Overseas Bank</div>
                <div><span style={{color:'#9ca3af'}}>A/C: </span><strong>171702000001297</strong></div>
                <div><span style={{color:'#9ca3af'}}>IFSC: </span>IOBA0001717 · Gotri Road Branch</div>
                <div style={{marginTop:'6px',padding:'6px 10px',background:'#fff7ed',borderRadius:'6px',border:'1px solid #fed7aa'}}>
                  <span style={{color:'#9a3412',fontWeight:700}}>UPI: </span><strong style={{color:'#111827'}}>BAGDROP1717@IOB</strong>
                </div>
              </div>
            </div>

            {/* Totals */}
            <div>
              <div style={{borderTop:'1px solid #e5e7eb',paddingTop:'14px'}}>
                {[
                  {label:'Subtotal',  val: fmtRs(quote.base_price), bold: false, big: false},
                  {label:'CGST @ 2.5%', val: fmtRs(quote.cgst),   bold: false, big: false},
                  {label:'SGST @ 2.5%', val: fmtRs(quote.sgst),   bold: false, big: false},
                ].map(r => (
                  <div key={r.label} style={{display:'flex',justifyContent:'space-between',fontSize:'12px',color:'#6b7280',marginBottom:'6px'}}>
                    <span>{r.label}</span><span>{r.val}</span>
                  </div>
                ))}
                <div style={{display:'flex',justifyContent:'space-between',borderTop:'2px solid #111827',paddingTop:'10px',marginTop:'4px'}}>
                  <span style={{fontSize:'14px',fontWeight:800,color:'#111827'}}>Total Amount</span>
                  <span style={{fontSize:'16px',fontWeight:900,color:'#f97316'}}>{fmtRs(quote.total_amount)}</span>
                </div>
              </div>
              {/* Amount in words */}
              <div style={{marginTop:'10px',padding:'8px 12px',background:'#fff7ed',borderRadius:'8px',border:'1px solid #fed7aa'}}>
                <div style={{fontSize:'9px',fontWeight:700,color:'#9a3412',textTransform:'uppercase',letterSpacing:'0.8px',marginBottom:'3px'}}>Amount in Words</div>
                <div style={{fontSize:'11px',fontWeight:600,color:'#111827',fontStyle:'italic'}}>{toWords(quote.total_amount)}</div>
              </div>
            </div>
          </div>

          {/* Notes */}
          {quote.notes && (
            <div style={{background:'#f9fafb',borderRadius:'8px',padding:'12px 14px',marginBottom:'20px',borderLeft:'3px solid #f97316'}}>
              <div style={{fontSize:'9px',fontWeight:700,textTransform:'uppercase',letterSpacing:'1px',color:'#9ca3af',marginBottom:'4px'}}>Notes</div>
              <div style={{fontSize:'12px',color:'#374151'}}>{quote.notes}</div>
            </div>
          )}

          {/* T&C */}
          <div style={{borderTop:'1px solid #f3f4f6',paddingTop:'16px',marginBottom:'20px'}}>
            <div style={{fontSize:'10px',fontWeight:700,textTransform:'uppercase',letterSpacing:'1px',color:'#374151',marginBottom:'8px'}}>Terms & Conditions</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'4px 20px',fontSize:'10px',color:'#6b7280',lineHeight:'1.5'}}>
              {[
                'All bookings are confirmed on receipt of full payment. A CN number will be issued for reference.',
                'Only the services mentioned above are included. Company reserves the right to cancel at any point.',
                'Luggage must not contain any items prohibited by law. Alcohol and illegal substances are strictly prohibited. All bags are processed through Govt screening.',
                'Cancellation (Mumbai): ≥ 5 days before pickup for full refund. All other destinations: ≥ 7 days.',
                'Bagdrop is not liable for loss, damage or theft during transit. Secure valuables and carry essential documents personally.',
                'Rates are subject to change without prior notice. Services are subject to availability at the time of booking.',
              ].map((t, i) => (
                <div key={i} style={{display:'flex',gap:'6px'}}>
                  <span style={{color:'#f97316',fontWeight:700,flexShrink:0}}>{i+1}.</span>
                  <span>{t}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Footer — signature + company */}
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',borderTop:'1px solid #f3f4f6',paddingTop:'16px'}}>
            <div style={{fontSize:'10px',color:'#9ca3af',lineHeight:'1.6'}}>
              <div style={{fontWeight:700,color:'#374151',fontSize:'11px',marginBottom:'2px'}}>BAGDROP LOGISTICS SOLUTIONS PVT. LTD.</div>
              <div>TF-302, Ananta Stallion, Gotri Sevasi Road, Vadodara – 391101</div>
              <div>GSTIN: 24BDMPS7461P1ZM · CIN: U63090GJ2023PTC142601</div>
              <div>📞 63 5711 5711 · ✉ info@bagdrop.co.in · 🌐 bagdrop.co.in</div>
            </div>
            <div style={{textAlign:'center'}}>
              <div style={{width:'140px',borderTop:'1px solid #374151',paddingTop:'6px',fontSize:'10px',color:'#374151',fontWeight:600}}>Authorized Signatory</div>
              <div style={{fontSize:'9px',color:'#9ca3af',marginTop:'2px'}}>For Bagdrop Logistics Solutions Pvt. Ltd.</div>
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
