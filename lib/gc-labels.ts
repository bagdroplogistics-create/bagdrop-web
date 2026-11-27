// BAGDROP — GC Bag Labels: client-side helpers shared by the LRs list and the
// LR detail page. Download and Print are deliberately separate actions that
// build the exact same PDF (see components/admin/GCLabelsPDF.tsx).

// The label's DELIVER TO address: the most complete one available. The LR's own address can be
// just a city ("Anand") when it was copied from the booking before the full address was entered,
// so also consider the booking's current drop address and keep the longest non-empty value.
export function fullestAddress(...candidates: Array<string | null | undefined>): string | null {
  const c = candidates.map(x => (x ?? '').trim()).filter(Boolean)
  if (c.length === 0) return null
  return c.reduce((best, x) => (x.length > best.length ? x : best))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buildGcLabelsBlob(lr: any): Promise<Blob> {
  const { pdf } = await import('@react-pdf/renderer')
  const { default: GCLabelsPDF } = await import('@/components/admin/GCLabelsPDF')
  return pdf(
    GCLabelsPDF({
      gcNumber: lr.lr_number,
      gcDate: lr.lr_date,
      fromCity: lr.from_city,
      toCity: lr.to_city,
      deliverToName: lr.consignee_name,
      deliverToAddress: fullestAddress(lr.delivery_address, lr.consignee_address, lr.booking_drop_address),
      totalBags: lr.total_bags ?? 1,
      contents: lr.content_description,
      // Labels always read: Booked At = pickup city, Delivery At = Godown, LR Type = TBB (Manual)
      bookedAt: lr.from_city,
      deliveryAt: 'Godown',
      consignorName: lr.consignor_name,
      consignorAddress: lr.consignor_address,
      lrType: 'TBB (Manual)',
    })
  ).toBlob()
}

async function fetchLr(id: string, adminKey: string) {
  const res = await fetch(`/api/admin/lrs/${id}?key=${encodeURIComponent(adminKey)}`)
  if (!res.ok) throw new Error('Could not load GC')
  const { lr } = await res.json()
  return lr
}

/** Download the labels as a PDF file. */
export async function downloadGcLabels(id: string, adminKey: string) {
  const lr = await fetchLr(id, adminKey)
  const blob = await buildGcLabelsBlob(lr)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `Bagdrop_Bag_Labels_${lr.lr_number}.pdf`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Open the browser print dialog for the labels (no file saved). */
export async function printGcLabels(id: string, adminKey: string) {
  const lr = await fetchLr(id, adminKey)
  const blob = await buildGcLabelsBlob(lr)
  const url = URL.createObjectURL(blob)
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  iframe.src = url
  // Chrome's "Save as PDF" in the print dialog uses the top page title as the file name.
  const prevTitle = document.title
  const fileTitle = `Bagdrop_Bag_Labels_${lr.lr_number}`
  const restoreTitle = () => { document.title = prevTitle }
  iframe.onload = () => {
    document.title = fileTitle
    window.addEventListener('afterprint', restoreTitle, { once: true })
    try { iframe.contentWindow?.focus(); iframe.contentWindow?.print() } catch { restoreTitle(); window.open(url, '_blank') }
    setTimeout(() => { restoreTitle(); if (iframe.parentNode) document.body.removeChild(iframe); URL.revokeObjectURL(url) }, 60_000)
  }
  document.body.appendChild(iframe)
}
