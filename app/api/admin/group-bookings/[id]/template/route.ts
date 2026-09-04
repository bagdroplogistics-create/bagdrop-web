import { NextRequest, NextResponse } from 'next/server'
import { requireAdminAuth } from '@/lib/admin-auth'
import * as XLSX from 'xlsx'

// Downloadable blank Guest/Bag manifest template — columns match exactly
// what POST .../import expects (see that route's HEADER_MAP), so a filled-
// in copy of this file round-trips cleanly.
export async function GET(req: NextRequest) {
  if (!requireAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const headers = ['Guest Name', 'Mobile Number', 'Email', 'Number of Bags', 'Hotel', 'Room Number', 'Delivery Location', 'Remarks']
  const example  = ['Rahul Shah', '9876543210', 'rahul@example.com', 5, 'Taj Aravali', '201', 'Udaipur — Delivery Counter', '']

  const ws = XLSX.utils.aoa_to_sheet([headers, example])
  ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length + 4, 16) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Guest & Bag Manifest')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="bagdrop-group-booking-manifest-template.xlsx"',
    },
  })
}
