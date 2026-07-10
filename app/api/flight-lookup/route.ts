// BAGDROP — /api/flight-lookup
// Looks up flight info by IATA flight number (+ optional date)
// using AviationStack (https://aviationstack.com).
//
// Required env var: AVIATIONSTACK_API_KEY
// Free tier: 100 requests/month (upgrade for more volume).
//
// Query params:
//   flight  — IATA flight code, e.g. "AI302" or "6E204"
//   date    — ISO date string "YYYY-MM-DD" (optional, defaults to today)

import { NextResponse } from 'next/server'

export interface FlightInfo {
  flightNumber: string
  airline:      string
  status:       string
  departure: {
    airport:   string
    iata:      string
    terminal:  string
    scheduled: string   // ISO datetime
    estimated: string
  }
  arrival: {
    airport:   string
    iata:      string
    terminal:  string
    scheduled: string
    estimated: string
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)

  // Normalise: "AI 302" → "AI302"
  const flightRaw = searchParams.get('flight')?.trim().toUpperCase().replace(/\s+/g, '') ?? ''
  const date      = searchParams.get('date') ?? new Date().toISOString().split('T')[0]

  if (!flightRaw) {
    return NextResponse.json({ error: 'Flight number is required.' }, { status: 400 })
  }

  const apiKey = process.env.AVIATIONSTACK_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Flight lookup is not configured on this server.' },
      { status: 503 }
    )
  }

  try {
    const params = new URLSearchParams({
      access_key:  apiKey,
      flight_iata: flightRaw,
      flight_date: date,
    })

    const res = await fetch(
      `https://api.aviationstack.com/v1/flights?${params}`,
      { next: { revalidate: 300 } }   // cache 5 minutes per flight+date
    )

    if (!res.ok) {
      console.error('[flight-lookup] AviationStack HTTP error:', res.status)
      return NextResponse.json(
        { error: 'Flight data provider error. Please enter flight details manually.' },
        { status: 502 }
      )
    }

    const body = await res.json()

    if (body.error) {
      console.error('[flight-lookup] AviationStack API error:', body.error)
      return NextResponse.json(
        { error: 'Flight lookup failed. Check your API key or request limit.' },
        { status: 502 }
      )
    }

    const flights: unknown[] = body.data ?? []

    if (!flights.length) {
      return NextResponse.json(
        { error: `No flight found for ${flightRaw} on ${date}. Please check the number and try again.` },
        { status: 404 }
      )
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const f: any = flights[0]

    const result: FlightInfo = {
      flightNumber: f.flight?.iata  ?? flightRaw,
      airline:      f.airline?.name ?? '',
      status:       f.flight_status ?? 'scheduled',
      departure: {
        airport:   f.departure?.airport  ?? '',
        iata:      f.departure?.iata     ?? '',
        terminal:  f.departure?.terminal ?? '',
        scheduled: f.departure?.scheduled ?? '',
        estimated: f.departure?.estimated ?? f.departure?.actual ?? '',
      },
      arrival: {
        airport:   f.arrival?.airport  ?? '',
        iata:      f.arrival?.iata     ?? '',
        terminal:  f.arrival?.terminal ?? '',
        scheduled: f.arrival?.scheduled ?? '',
        estimated: f.arrival?.estimated ?? f.arrival?.actual ?? '',
      },
    }

    return NextResponse.json(result)

  } catch (err) {
    console.error('[flight-lookup] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Flight lookup failed. Please enter details manually.' },
      { status: 500 }
    )
  }
}
