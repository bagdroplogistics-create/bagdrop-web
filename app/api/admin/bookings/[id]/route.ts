import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdminAuth } from '@/lib/admin-auth'
import type { BookingStatus } from '@/lib/supabase'

export async function PATCH(
req: NextRequest,
context: { params: Promise<{ id: string }> }
) {
if (!requireAdminAuth(req)) {
return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

const { id } = await context.params

const body = await req.json()
const { status, notes } = body as {
status?: BookingStatus
notes?: string
}

if (!status) {
return NextResponse.json(
{ error: 'status is required' },
{ status: 400 }
)
}

const { data: existing } = await supabaseAdmin
.from('bookings')
.select('status_history')
.eq('id', id)
.single()

const history = existing?.status_history ?? []
history.push({
status,
timestamp: new Date().toISOString(),
note: notes ?? null,
})

const { data, error } = await supabaseAdmin
.from('bookings')
.update({
status,
notes: notes ?? null,
status_history: history,
})
.eq('id', id)
.select()
.single()

if (error) {
return NextResponse.json(
{ error: error.message },
{ status: 500 }
)
}

return NextResponse.json({ booking: data })
}

export async function GET(
req: NextRequest,
context: { params: Promise<{ id: string }> }
) {
if (!requireAdminAuth(req)) {
return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

const { id } = await context.params

const { data, error } = await supabaseAdmin
.from('bookings')
.select('*')
.eq('id', id)
.single()

if (error) {
return NextResponse.json(
{ error: error.message },
{ status: 500 }
)
}

return NextResponse.json({ booking: data })
}
