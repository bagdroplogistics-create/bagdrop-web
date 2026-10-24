// Appends one row to a Google Sheet through a Google Apps Script web app (see
// docs/y2k-google-sheet-setup.md). Best-effort: a failure here must never affect the booking.
// Does nothing unless Y2K_SHEET_WEBHOOK_URL is set, so it is safe to deploy before the sheet exists.

export async function appendInquiryToSheet(row: Record<string, string | number | boolean | null | undefined>): Promise<void> {
  const url = process.env.Y2K_SHEET_WEBHOOK_URL
  if (!url) return
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 8000)
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: process.env.Y2K_SHEET_WEBHOOK_SECRET ?? '', row }),
      signal: ctrl.signal,
      redirect: 'follow',
    })
    clearTimeout(timer)
    if (!res.ok) console.error('[sheets-webhook] failed:', res.status)
    else console.log('[sheets-webhook] row added for', row.tracking_id)
  } catch (e) {
    console.error('[sheets-webhook] error (non-fatal):', e instanceof Error ? e.message : e)
  }
}
