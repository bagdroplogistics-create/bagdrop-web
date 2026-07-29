'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SkybirdBookingEngine } from '@/components/booking/skybird-booking-engine'

export default function SkybirdNewInquiryPage() {
  const router = useRouter()
  const [skybirdKey, setSkybirdKey] = useState('')
  const [authed, setAuthed] = useState(false)

  useEffect(() => {
    const key = sessionStorage.getItem('bagdrop_skybird_key') ?? ''
    if (!key) { router.replace('/skybird/login'); return }
    setSkybirdKey(key)
    setAuthed(true)
  }, [router])

  if (!authed) return null

  return (
    <SkybirdBookingEngine
      skybirdKey={skybirdKey}
      onBackToList={() => router.push('/skybird')}
    />
  )
}
