'use client'

import { useState, useEffect, useRef } from 'react'
import BookingWizard from './BookingWizard'

// ─────────────────────────────────────────────────────────────
// This page is a 1:1 rebuild of the approved Y2K design reference
// (the "Aravalli Gold" HTML mockup) — every section, color, font,
// spacing value and piece of copy below is taken directly from that
// design. The only things NOT taken verbatim from the mockup are:
//   1) A few fields the mockup's demo form omits but the real booking
//      flow requires (Email, Pickup Address) — added as extra grid
//      cells, styled identically to the mockup's own fields.
//   2) The "Delivery location" field, which the mockup shows as an
//      editable dropdown — kept as a fixed, disabled field here
//      because the real backend/booking flow always delivers to Taj
//      Aravali, Udaipur (this was already true before this redesign;
//      unrelated to the visual rebuild).
//   3) The booking-window subtitle ("Pickups run …") uses the real
//      10–12 Dec window instead of the mockup's placeholder dates, to
//      match the actual date-picker restriction below it.
// The mockup's own demo booking-form JS (client-side only, fake
// tracking code, no backend) was NOT used — this page keeps the real,
// already-working submit/validation logic wired to
// app/api/y2k/inquiry/route.ts.
// ─────────────────────────────────────────────────────────────

const WEDDING_DATE = new Date('2026-12-17T00:00:00+05:30')

// ── Real booking-flow constants — unchanged from before this redesign,
// mirrored server-side in app/api/y2k/inquiry/route.ts. Do not edit one
// side without the other. ──────────────────────────────────────────

// ── Design tokens — exact hex values from the approved reference ──────
const Y = {
  cream:       '#F4EEE4',
  creamCard:   '#FBF8F2',
  beige:       '#EDE5D6',
  darkGreen:   '#2A3329',
  darkerGreen: '#24291F',
  darkBrown:   '#4A3B29',
  gold:        '#C8A96E',
  goldLight:   '#E8CE9A',
  goldPale:    '#F1DFB6',
  goldMuted:   '#6B5A3E',
  eyebrow:     '#B08D57',
  textDark:    '#2B2620',
  textBody:    '#5A5145',
  textOnGold:  '#3A2E1C',
  border:      '#E0D5C2',
  borderCard:  '#E7DDCC',
  statLabel:   '#8A8172',
  muted:       '#A99C87',
  error:       '#C0392B',
}

const FONT_DISPLAY = "'Cormorant Garamond', var(--font-cormorant), serif"
const FONT_BODY    = "'Inter', sans-serif"

// ── Imagery — the design reference used blank "drop an image here"
// placeholders; these are the real photos supplied by the founder for
// each section (2026-08-20). ────────────────────────────────────────
const IMG_HERO        = '/images/y2k-hero-mountains.webp'    // "misty Aravalli mountains at golden hour"
const IMG_CELEBRATION = '/images/y2k-couple.jpeg'             // "editorial couple / candid moment" — Yashna & Yash
const IMG_DESTINATION = '/images/y2k-taj-aravali-dusk.webp'   // "wide Udaipur / Taj Aravali landscape" — the actual resort at dusk
const IMG_TRAVEL      = '/images/y2k-bagdrop-luggage.webp'    // "Bagdrop luggage-delivery image" — bellman with tagged bags
// Stacked/vertical lockup (icon on top, BAGDROP wordmark + tagline below)
// — this is the mark used in the approved HTML design reference, not the
// side-by-side horizontal lockup. Same file already in the repo as
// public/logo-white.png. Inverted to white via CSS filter for use on dark
// backgrounds (nav when not scrolled, footer) — brightness(0) invert(1)
// forces a white silhouette regardless of source color, so this works the
// same way regardless of which logo file is used here.
const IMG_LOGO        = '/logo-white.png'

const NOISE_BG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"

// ─────────────────────────────────────────────────────────────
// SMALL UI HELPERS
// ─────────────────────────────────────────────────────────────
function Eyebrow({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={{ fontFamily:FONT_BODY, fontSize:11, fontWeight:600, letterSpacing:'0.28em', textTransform:'uppercase', color: color ?? Y.eyebrow }}>
      {children}
    </span>
  )
}

function useCountdown(target: Date) {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const diff = Math.max(0, target.getTime() - (now ?? target.getTime()))
  const day = 86400000, hr = 3600000, min = 60000
  const d = Math.floor(diff / day)
  const h = Math.floor((diff % day) / hr)
  const m = Math.floor((diff % hr) / min)
  const s = Math.floor((diff % min) / 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return { d: pad(d), h: pad(h), m: pad(m), s: pad(s), ready: now !== null }
}

function useReveal() {
  const ref = useRef<HTMLDivElement>(null)
  const [vis, setVis] = useState(false)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVis(true); obs.disconnect() } }, { threshold: 0.08 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return { ref, vis }
}

// JS equivalent of the reference's CSS `.wd-reveal` (fade + rise into
// view) — implemented with IntersectionObserver instead of the
// Chrome-only `animation-timeline: view()` the mockup used, so it
// renders identically across all browsers.
function Reveal({ children }: { children: React.ReactNode }) {
  const { ref, vis } = useReveal()
  return (
    <div ref={ref} style={{ height:'100%', opacity: vis ? 1 : 0, transform: vis ? 'translateY(0)' : 'translateY(28px)', transition: 'opacity 0.6s ease, transform 0.6s ease' }}>
      {children}
    </div>
  )
}

// Countdown is isolated in its own component, with its own 1-second
// setInterval tick living here instead of in the page component. If the
// ticking state lived in Y2KPage itself, every field on the entire
// ~700-line page (every heading, button, card) would get a brand-new
// inline style object and re-render once per second — on the live site
// this showed up as a continuous, page-wide flicker/jitter in the text.
// Keeping the tick local means only these 4 numbers re-render each
// second; the rest of the page renders once and stays still.
function Countdown({ target }: { target: Date }) {
  const cd = useCountdown(target)
  return (
    <div style={{ display:'flex', gap:'clamp(20px,6vw,52px)', marginTop:48 }}>
      {[['Days',cd.d],['Hours',cd.h],['Minutes',cd.m],['Seconds',cd.s]].map(([l,v])=>(
        <div key={l} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
          <span style={{ fontFamily:FONT_DISPLAY, fontSize:'clamp(34px,7vw,56px)', lineHeight:1, color:Y.goldLight }}>{v}</span>
          <span style={{ fontFamily:FONT_BODY, fontSize:10, letterSpacing:'0.24em', textTransform:'uppercase', opacity:0.8 }}>{l}</span>
        </div>
      ))}
    </div>
  )
}

function BookingForm() {
  // Test mode — ?test=1 on the URL: submissions skip the real BDA/BDL
  // tracking numbers and every outbound notification (see
  // app/api/y2k/inquiry/route.ts's isTestMode handling).
  const [isTestMode, setIsTestMode] = useState(false)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setIsTestMode(params.get('test') === '1' || params.get('test') === 'true')
  }, [])
  return (
    <>
      {isTestMode && (
        <div style={{ maxWidth:720, margin:'0 auto 24px', background:'#FEF3C7', border:'1px solid #F59E0B', borderRadius:12, padding:'12px 20px', textAlign:'center', fontFamily:FONT_BODY, fontSize:13, fontWeight:600, color:'#92400E' }}>
          🧪 TEST MODE — submissions here don&apos;t use real BDA/BDL tracking numbers and won&apos;t send any WhatsApp or email notifications.
        </div>
      )}
      <div style={{ maxWidth:760, margin:'0 auto', textAlign:'center' }}>
        <Eyebrow>04 — Reserve Your Pickup</Eyebrow>
        <h2 style={{ fontFamily:FONT_DISPLAY, fontWeight:400, color:Y.textDark, fontSize:'clamp(36px,6vw,64px)', lineHeight:1.05, margin:'18px 0 12px' }}>Book your luggage pickup</h2>
        <p style={{ fontFamily:FONT_BODY, fontSize:'clamp(15px,1.7vw,17px)', lineHeight:1.75, color:Y.textBody, maxWidth:'44ch', margin:'0 auto' }}>One request for your whole family. Pickups run 10–12 December 2026 from Mumbai.</p>
      </div>
      <BookingWizard isTestMode={isTestMode} />
    </>
  )
}

function FloatSVG({ dur, del, r, style, stroke, opacity, big }: { dur: string; del: string; r: string; style: React.CSSProperties; stroke: string; opacity: number; big?: boolean }) {
  return (
    <svg
      className="wd-float"
      style={{ ['--dur' as string]: dur, ['--del' as string]: del, ['--r' as string]: r, position: 'absolute', opacity, ...style }}
      viewBox={big ? '0 0 60 60' : '0 0 40 80'} fill="none" stroke={stroke} strokeWidth={1}
    >
      {big
        ? <path d="M30 54 C14 54 8 40 12 26 C26 24 34 34 34 48 M30 40 C40 34 52 38 52 52 C40 54 32 50 30 40"/>
        : <path d="M20 78 C20 50 20 22 20 4 M20 20 C10 16 6 24 6 34 C16 34 20 28 20 20 M20 32 C30 28 34 36 34 46 C24 46 20 40 20 32 M20 44 C12 42 8 50 9 58 C18 56 20 52 20 44"/>}
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────
export default function Y2KPage() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div style={{ fontFamily:FONT_BODY, background:Y.cream, color:Y.textDark, overflowX:'hidden' }}>

      {/* ══ GLOBAL CSS ════════════════════════════════════════ */}
      <style dangerouslySetInnerHTML={{__html:`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,400;1,500&family=Inter:wght@400;500;600;700&display=swap');
        html { scroll-behavior:smooth; -webkit-text-size-adjust:100%; }
        body { margin:0; }
        * { box-sizing:border-box; }
        a { color:inherit; text-decoration:none; }
        a:hover { color:${Y.eyebrow}; }
        ::selection { background:${Y.gold}; color:#fff; }
        input, select, textarea { font-family:${FONT_BODY}; }
        select { -webkit-appearance:none; appearance:none; }
        input::placeholder, textarea::placeholder { color:${Y.muted}; }
        @keyframes wdFloat { 0%,100% { transform:translateY(0) rotate(var(--r,0deg)); } 50% { transform:translateY(-16px) rotate(var(--r,0deg)); } }
        .wd-float { animation:wdFloat var(--dur,9s) ease-in-out infinite; animation-delay:var(--del,0s); }
        .wd-float-card { transition:transform 0.4s ease, box-shadow 0.4s ease; }
        .wd-float-card:hover { transform:translateY(-6px); box-shadow:0 22px 44px rgba(45,32,18,0.14); }
        @media (prefers-reduced-motion: reduce) { .wd-float { animation:none; } html { scroll-behavior:auto; } }
        @media (min-width:861px) { .wd-two-col { grid-template-columns:1fr 1fr !important; } }
        @media (max-width:860px) {
          .wd-desktop-nav { display:none !important; }
          .wd-hamburger { display:flex !important; }
        }
        @media (max-width:560px) {
          .wd-form-grid { grid-template-columns:1fr !important; }
        }
      `}}/>

      {/* Full-page grain texture, mirrors the reference exactly */}
      <div style={{ position:'fixed', inset:0, pointerEvents:'none', zIndex:90, opacity:0.045, mixBlendMode:'multiply', backgroundImage:`url("${NOISE_BG}")` }}/>

      {/* ════════════════════════════════════════════════════ */}
      {/* NAVIGATION                                          */}
      {/* ════════════════════════════════════════════════════ */}
      <nav style={{ position:'fixed', top:0, left:0, right:0, zIndex:100, height:92, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 clamp(20px,5vw,56px)', background: scrolled ? 'rgba(244,238,228,0.92)' : 'transparent', color: scrolled ? Y.textDark : Y.cream, boxShadow: scrolled ? '0 1px 0 rgba(0,0,0,0.06)' : 'none', backdropFilter: scrolled ? 'saturate(180%) blur(12px)' : 'none', WebkitBackdropFilter: scrolled ? 'saturate(180%) blur(12px)' : 'none', transition:'background 0.4s ease, color 0.4s ease, box-shadow 0.4s ease' }}>
        <a href="#top" style={{ display:'flex', alignItems:'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {/* Source PNG is pure white pixels, so scrolled needed its own
              filter (was 'none', which just showed white-on-cream — nearly
              invisible). brightness(0) crushes it to a black silhouette;
              brightness(0) invert(1) flips that to white for the dark hero. */}
          <img src={IMG_LOGO} alt="Bagdrop" style={{ height:'clamp(48px, 8vw, 80px)', width:'auto', display:'block', filter: scrolled ? 'brightness(0)' : 'brightness(0) invert(1)', transition:'filter 0.4s ease' }}/>
        </a>
        <div className="wd-desktop-nav" style={{ display:'flex', alignItems:'center', gap:34, fontFamily:FONT_BODY, fontSize:12.5, fontWeight:500, letterSpacing:'0.13em', textTransform:'uppercase' }}>
          <a href="#celebration">Celebration</a>
          <a href="#destination">Destination</a>
          <a href="#travel">Travel</a>
          <a href="#book" style={{ border:'1px solid currentColor', padding:'9px 20px', borderRadius:999, letterSpacing:'0.13em', transition:'background 0.2s, border-color 0.2s, color 0.2s' }}
            onMouseEnter={e=>{ e.currentTarget.style.background=Y.gold; e.currentTarget.style.borderColor=Y.gold; e.currentTarget.style.color='#fff' }}
            onMouseLeave={e=>{ e.currentTarget.style.background='transparent'; e.currentTarget.style.borderColor='currentColor'; e.currentTarget.style.color='inherit' }}>
            Book Bags
          </a>
        </div>
        <button type="button" onClick={()=>setMenuOpen(true)} aria-label="Open menu" className="wd-hamburger"
          style={{ display:'none', background:'none', border:'none', color:'inherit', cursor:'pointer', padding:8, flexDirection:'column', gap:5, width:42, height:42, alignItems:'center', justifyContent:'center' }}>
          <span style={{ width:22, height:1.5, background:'currentColor', display:'block' }}/>
          <span style={{ width:22, height:1.5, background:'currentColor', display:'block' }}/>
          <span style={{ width:22, height:1.5, background:'currentColor', display:'block' }}/>
        </button>
      </nav>

      {/* ── MOBILE MENU (right-side drawer, matches reference) ── */}
      <div onClick={()=>setMenuOpen(false)} style={{ position:'fixed', inset:0, zIndex:110, background:'rgba(20,16,10,0.45)', backdropFilter:'blur(4px)', opacity: menuOpen?1:0, pointerEvents: menuOpen?'auto':'none', transition:'opacity 0.35s ease' }}/>
      <aside style={{ position:'fixed', top:0, right:0, bottom:0, zIndex:120, width:'min(82vw, 340px)', background:Y.darkGreen, color:Y.cream, transform: menuOpen ? 'translateX(0)' : 'translateX(100%)', transition:'transform 0.42s cubic-bezier(0.22,1,0.36,1)', display:'flex', flexDirection:'column', padding:'28px 30px', boxShadow:'-20px 0 60px rgba(0,0,0,0.3)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:48 }}>
          <span style={{ fontFamily:FONT_DISPLAY, fontSize:22, letterSpacing:'0.04em' }}>Yashna &amp; Yash</span>
          <button type="button" onClick={()=>setMenuOpen(false)} aria-label="Close menu" style={{ background:'rgba(255,255,255,0.1)', border:'none', color:Y.cream, width:40, height:40, borderRadius:'50%', fontSize:20, cursor:'pointer', lineHeight:1 }}>×</button>
        </div>
        <nav style={{ display:'flex', flexDirection:'column', gap:4, fontFamily:FONT_DISPLAY }}>
          <a onClick={()=>setMenuOpen(false)} href="#celebration" style={{ fontSize:30, padding:'12px 0', borderBottom:'1px solid rgba(255,255,255,0.1)' }}>The Celebration</a>
          <a onClick={()=>setMenuOpen(false)} href="#destination" style={{ fontSize:30, padding:'12px 0', borderBottom:'1px solid rgba(255,255,255,0.1)' }}>The Destination</a>
          <a onClick={()=>setMenuOpen(false)} href="#travel" style={{ fontSize:30, padding:'12px 0', borderBottom:'1px solid rgba(255,255,255,0.1)' }}>Travel Light</a>
        </nav>
        <a onClick={()=>setMenuOpen(false)} href="#book" style={{ marginTop:'auto', textAlign:'center', background:Y.gold, color:Y.darkGreen, fontFamily:FONT_BODY, fontSize:13, fontWeight:600, letterSpacing:'0.16em', textTransform:'uppercase', padding:18, borderRadius:999 }}>
          Book Luggage Pickup
        </a>
      </aside>

      {/* ════════════════════════════════════════════════════ */}
      {/* HERO                                                */}
      {/* ════════════════════════════════════════════════════ */}
      <header id="top" style={{ position:'relative', minHeight:'100svh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center', padding:'100px 20px 56px', overflow:'hidden' }}>
        <div style={{ position:'absolute', inset:0, zIndex:0, backgroundImage:`url(${IMG_HERO})`, backgroundSize:'cover', backgroundPosition:'center' }}/>
        <div style={{ position:'absolute', inset:0, zIndex:1, pointerEvents:'none', background:'linear-gradient(180deg, rgba(20,16,10,0.55) 0%, rgba(20,16,10,0.32) 30%, rgba(20,16,10,0.42) 58%, rgba(20,16,10,0.82) 100%)' }}/>
        <div style={{ position:'absolute', inset:0, zIndex:1, pointerEvents:'none', background:'radial-gradient(ellipse 60% 45% at 50% 46%, rgba(20,16,10,0.4) 0%, transparent 70%)' }}/>
        <svg viewBox="0 0 1440 220" preserveAspectRatio="none" style={{ position:'absolute', left:0, right:0, bottom:0, width:'100%', height:200, zIndex:1, pointerEvents:'none', opacity:0.5 }}>
          <path d="M0 220 L0 150 L180 92 L340 138 L520 60 L700 128 L900 44 L1080 120 L1260 78 L1440 132 L1440 220 Z" fill="none" stroke="rgba(244,238,228,0.35)" strokeWidth={1.2}/>
        </svg>

        <div style={{ position:'relative', zIndex:2, color:Y.cream, display:'flex', flexDirection:'column', alignItems:'center' }}>
          <span style={{ fontFamily:FONT_BODY, fontSize:12, fontWeight:500, letterSpacing:'0.42em', textTransform:'uppercase', opacity:0.9, marginBottom:28, paddingLeft:'0.42em' }}>Taj Aravali · Udaipur</span>
          <h1 style={{ fontFamily:FONT_DISPLAY, fontWeight:400, color:Y.cream, fontSize:'clamp(52px,13vw,152px)', lineHeight:0.94, letterSpacing:'-0.01em', margin:0, display:'flex', flexWrap:'wrap', alignItems:'center', justifyContent:'center', gap:'clamp(14px,4vw,44px)', textShadow:'0 2px 30px rgba(0,0,0,0.55), 0 1px 4px rgba(0,0,0,0.4)' }}>
            <span style={{ fontStyle:'italic' }}>Yashna</span>
            <svg viewBox="0 0 24 24" style={{ width:'clamp(28px,7vw,62px)', height:'auto', flexShrink:0 }} aria-label="and">
              <path d="M12 21.2s-8.2-5.1-10.4-10C-0.2 6.6 2.6 3.4 6.2 4c2 .3 3.2 1.7 3.8 3 .6-1.3 1.8-2.7 3.8-3 3.6-.6 6.4 2.6 4.6 7.2-2.2 4.9-10.4 10-10.4 10Z" fill="none" stroke="#E8CE9A" strokeWidth={1}/>
            </svg>
            <span style={{ fontStyle:'italic' }}>Yash</span>
          </h1>
          <div style={{ display:'flex', alignItems:'center', gap:16, marginTop:34, background:'rgba(20,16,10,0.32)', border:'1px solid rgba(232,206,154,0.4)', backdropFilter:'blur(2px)', padding:'12px 24px', borderRadius:999 }}>
            <span style={{ width:28, height:1, background:'rgba(232,206,154,0.6)' }}/>
            <span style={{ fontFamily:FONT_BODY, fontSize:'clamp(12px,1.6vw,15px)', letterSpacing:'0.28em', textTransform:'uppercase', fontWeight:600, color:Y.goldPale, textShadow:'0 1px 3px rgba(0,0,0,0.5)' }}>17 &amp; 18 December 2026</span>
            <span style={{ width:28, height:1, background:'rgba(232,206,154,0.6)' }}/>
          </div>

          <Countdown target={WEDDING_DATE} />
        </div>
      </header>

      {/* ── BROWN "TRAVEL LIGHT" INFO BOX (overlaps hero) ── */}
      <section style={{ background:Y.cream, padding:'clamp(40px,7vw,80px) clamp(20px,5vw,56px) clamp(20px,4vw,48px)', position:'relative', zIndex:3 }}>
        <Reveal>
          <div style={{ maxWidth:1120, margin:'0 auto', background:Y.darkBrown, color:Y.cream, borderRadius:26, padding:'clamp(30px,5vw,52px)', display:'flex', flexWrap:'wrap', alignItems:'center', gap:'clamp(22px,4vw,48px)', boxShadow:'0 30px 70px rgba(45,32,18,0.28)', position:'relative', overflow:'hidden' }}>
            <svg viewBox="0 0 400 120" preserveAspectRatio="none" style={{ position:'absolute', right:-20, bottom:-10, width:320, height:120, opacity:0.14, pointerEvents:'none' }}>
              <path d="M0 120 L60 60 L120 92 L200 30 L280 84 L340 48 L400 90 L400 120 Z" fill="none" stroke="#E8CE9A" strokeWidth={2}/>
            </svg>
            <div style={{ flex:'1 1 340px', minWidth:'min(260px,100%)' }}>
              <Eyebrow color={Y.goldLight}>Travel light to the mountains</Eyebrow>
              <p style={{ fontFamily:FONT_DISPLAY, fontSize:'clamp(24px,3.4vw,36px)', lineHeight:1.24, margin:'16px 0 0', fontWeight:400 }}>Arrive with only your best self. We&apos;ll carry your bags door-to-destination. Your bags reach before you do!</p>
            </div>
            <div style={{ flex:'0 0 auto', display:'flex', flexDirection:'column', gap:14, minWidth:'min(220px,100%)' }}>
              <div style={{ display:'flex', gap:22, fontFamily:FONT_BODY }}>
                <div><div style={{ fontFamily:FONT_DISPLAY, fontSize:30, color:Y.goldLight }}>Wedding</div><div style={{ fontSize:11, letterSpacing:'0.12em', textTransform:'uppercase', opacity:0.7 }}>Synced</div></div>
                <div><div style={{ fontFamily:FONT_DISPLAY, fontSize:30, color:Y.goldLight }}>100%</div><div style={{ fontSize:11, letterSpacing:'0.12em', textTransform:'uppercase', opacity:0.7 }}>Fully wrapped</div></div>
              </div>
              <a href="#book" style={{ textAlign:'center', background:Y.goldLight, color:Y.textOnGold, fontFamily:FONT_BODY, fontSize:12.5, fontWeight:600, letterSpacing:'0.16em', textTransform:'uppercase', padding:'16px 28px', borderRadius:999, transition:'transform 0.25s ease, box-shadow 0.25s ease' }}
                onMouseEnter={e=>{ e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 10px 26px rgba(232,206,154,0.4)' }}
                onMouseLeave={e=>{ e.currentTarget.style.transform='none'; e.currentTarget.style.boxShadow='none' }}>
                Book Luggage Pickup
              </a>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ════════════════════════════════════════════════════ */}
      {/* 01 THE CELEBRATION                                  */}
      {/* ════════════════════════════════════════════════════ */}
      <section id="celebration" style={{ background:Y.cream, padding:'clamp(96px,14vw,168px) clamp(20px,5vw,56px) clamp(60px,9vw,110px)', scrollMarginTop:92 }}>
        <div className="wd-two-col" style={{ maxWidth:1120, margin:'0 auto', display:'grid', gridTemplateColumns:'1fr', gap:'clamp(40px,6vw,72px)', alignItems:'center' }}>
          <Reveal>
            <div>
              <Eyebrow>01 — The Celebration</Eyebrow>
              <h2 style={{ fontFamily:FONT_DISPLAY, fontWeight:400, color:Y.textDark, fontSize:'clamp(38px,6vw,68px)', lineHeight:1.06, margin:'20px 0 0', letterSpacing:'-0.01em' }}>Two days in the <span style={{ fontStyle:'italic', color:Y.goldMuted }}>Aravallis</span>, one forever.</h2>
              <p style={{ fontFamily:FONT_BODY, fontSize:'clamp(15px,1.7vw,17px)', lineHeight:1.85, color:Y.textBody, maxWidth:'46ch', margin:'26px 0 0' }}>We&apos;re gathering the people we love most in the folds of the oldest mountains in India — for slow mornings, long evenings, and a wedding under an open Udaipur sky. No rush, no noise. Just us, and you.</p>
              <div style={{ display:'flex', gap:40, marginTop:38, fontFamily:FONT_BODY }}>
                <div><div style={{ fontFamily:FONT_DISPLAY, fontSize:'clamp(30px,4vw,42px)', color:Y.darkGreen }}>2</div><div style={{ fontSize:11, letterSpacing:'0.16em', textTransform:'uppercase', color:Y.statLabel }}>Days</div></div>
                <div style={{ width:1, background:'#D9CFBE' }}/>
                <div><div style={{ fontFamily:FONT_DISPLAY, fontSize:'clamp(30px,4vw,42px)', color:Y.darkGreen }}>1</div><div style={{ fontSize:11, letterSpacing:'0.16em', textTransform:'uppercase', color:Y.statLabel }}>Palace</div></div>
                <div style={{ width:1, background:'#D9CFBE' }}/>
                <div><div style={{ fontFamily:FONT_DISPLAY, fontSize:'clamp(30px,4vw,42px)', color:Y.darkGreen }}>∞</div><div style={{ fontSize:11, letterSpacing:'0.16em', textTransform:'uppercase', color:Y.statLabel }}>Memories</div></div>
              </div>
            </div>
          </Reveal>
          <Reveal>
            <div style={{ position:'relative' }}>
              <div style={{ position:'relative', width:'100%', aspectRatio:'4 / 5', borderRadius:22, overflow:'hidden', boxShadow:'0 30px 60px rgba(45,32,18,0.16)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={IMG_CELEBRATION} alt="Yashna &amp; Yash" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}/>
              </div>
              <div style={{ position:'absolute', bottom:-22, left:-22, background:Y.cream, padding:'18px 24px', borderRadius:16, boxShadow:'0 14px 34px rgba(45,32,18,0.12)', fontFamily:FONT_DISPLAY, fontStyle:'italic', fontSize:20, color:Y.goldMuted }}>#Y2K</div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════ */}
      {/* 02 THE DESTINATION                                  */}
      {/* ════════════════════════════════════════════════════ */}
      <section id="destination" style={{ position:'relative', minHeight:'86vh', display:'flex', alignItems:'flex-end', padding:'clamp(40px,8vw,88px) clamp(20px,5vw,56px)', overflow:'hidden', scrollMarginTop:92 }}>
        <div style={{ position:'absolute', inset:0, zIndex:0, backgroundImage:`url(${IMG_DESTINATION})`, backgroundSize:'cover', backgroundPosition:'center' }}/>
        <div style={{ position:'absolute', inset:0, zIndex:1, pointerEvents:'none', background:'linear-gradient(180deg, rgba(20,16,10,0.34) 0%, rgba(20,16,10,0.05) 40%, rgba(20,16,10,0.78) 100%)' }}/>
        <div style={{ position:'relative', zIndex:2, color:Y.cream, maxWidth:1120, margin:'0 auto', width:'100%' }}>
          <Reveal>
            <div>
              <Eyebrow color={Y.goldLight}>02 — The Destination</Eyebrow>
              <h2 style={{ fontFamily:FONT_DISPLAY, fontWeight:400, color:Y.cream, fontSize:'clamp(42px,8vw,96px)', lineHeight:1, margin:'18px 0 0', letterSpacing:'-0.01em' }}>Taj Aravali,<br/><span style={{ fontStyle:'italic' }}>Udaipur</span></h2>
              <p style={{ fontFamily:FONT_BODY, fontSize:'clamp(15px,1.8vw,18px)', lineHeight:1.8, maxWidth:'52ch', margin:'24px 0 0', color:'rgba(244,238,228,0.9)' }}>Tucked into the Aravalli range above the City of Lakes — terraced gardens, still water, and mountain light that turns gold at dusk. A 30-minute drive from Maharana Pratap Airport.</p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════ */}
      {/* 03 TRAVEL / BAGGAGE                                 */}
      {/* ════════════════════════════════════════════════════ */}
      <section id="travel" style={{ background:Y.darkGreen, color:Y.cream, padding:'clamp(88px,12vw,148px) clamp(20px,5vw,56px)', scrollMarginTop:92, position:'relative', overflow:'hidden' }}>
        <svg viewBox="0 0 1440 260" preserveAspectRatio="none" style={{ position:'absolute', left:0, right:0, top:0, width:'100%', height:220, opacity:0.1, pointerEvents:'none' }}>
          <path d="M0 260 L0 180 L200 100 L400 160 L620 70 L840 150 L1060 60 L1260 140 L1440 90 L1440 260 Z" fill="none" stroke="#E8CE9A" strokeWidth={1.4}/>
        </svg>
        <div style={{ maxWidth:1120, margin:'0 auto', position:'relative' }}>
          <div className="wd-two-col" style={{ display:'grid', gridTemplateColumns:'1fr', gap:'clamp(32px,5vw,60px)', alignItems:'center' }}>
            <Reveal>
              <div>
                <Eyebrow color={Y.goldLight}>03 — Travel Light</Eyebrow>
                <h2 style={{ fontFamily:FONT_DISPLAY, fontWeight:400, color:Y.cream, fontSize:'clamp(36px,6vw,64px)', lineHeight:1.06, margin:'20px 0 0' }}>Your bags, handled.<br/>So the mountains are all you carry.</h2>
                <p style={{ fontFamily:FONT_BODY, fontSize:'clamp(15px,1.7vw,17px)', lineHeight:1.8, color:'rgba(244,238,228,0.78)', margin:'22px 0 0', maxWidth:'48ch' }}>Powered by Bagdrop. We collect your luggage in Mumbai and deliver it straight to your room at Taj Aravali — wedding-synced &amp; fully wrapped.</p>
              </div>
            </Reveal>
            <Reveal>
              <div style={{ position:'relative' }}>
                <div style={{ position:'relative', width:'100%', aspectRatio:'4 / 3', borderRadius:22, overflow:'hidden', boxShadow:'0 30px 60px rgba(0,0,0,0.28)' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={IMG_TRAVEL} alt="Bagdrop luggage delivery" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}/>
                </div>
                <div style={{ position:'absolute', bottom:-18, left:-18, background:Y.goldLight, color:Y.darkGreen, padding:'12px 20px', borderRadius:14, boxShadow:'0 14px 34px rgba(0,0,0,0.22)', fontFamily:FONT_BODY, fontSize:11, fontWeight:600, letterSpacing:'0.14em', textTransform:'uppercase' }}>Mumbai → Udaipur</div>
              </div>
            </Reveal>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px,1fr))', gap:18, marginTop:52 }}>
            {[
              { n:'01', title:'Door pickup, Mumbai',     desc:'From home or the airport — one tap and we\'re there.' },
              { n:'02', title:'Wedding-synced transit',   desc:'Tracked end-to-end, timed to land when you do.' },
              { n:'03', title:'Delivered to your room',  desc:'Waiting at Taj Aravali before you check in.' },
            ].map(s=>(
              <Reveal key={s.n}>
                <div style={{ background:'rgba(244,238,228,0.05)', border:'1px solid rgba(244,238,228,0.12)', borderRadius:20, padding:30, height:'100%' }}>
                  <div style={{ fontFamily:FONT_DISPLAY, fontSize:42, color:Y.goldLight, lineHeight:1 }}>{s.n}</div>
                  <h3 style={{ fontFamily:FONT_BODY, fontSize:16, fontWeight:600, color:Y.cream, letterSpacing:'0.02em', margin:'18px 0 8px' }}>{s.title}</h3>
                  <p style={{ fontFamily:FONT_BODY, fontSize:14, lineHeight:1.7, color:'rgba(244,238,228,0.7)', margin:0 }}>{s.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════ */}
      {/* 04 BOOKING FORM                                     */}
      {/* ════════════════════════════════════════════════════ */}
      <section id="book" style={{ background:Y.cream, padding:'clamp(88px,12vw,148px) clamp(20px,5vw,56px)', scrollMarginTop:92 }}>
        <BookingForm />
      </section>

      {/* ════════════════════════════════════════════════════ */}
      {/* 05 FOOTER                                           */}
      {/* ════════════════════════════════════════════════════ */}
      <footer style={{ background:Y.darkerGreen, color:Y.beige, padding:'clamp(72px,10vw,110px) clamp(20px,5vw,56px) 40px', textAlign:'center' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={IMG_LOGO} alt="Bagdrop" style={{ display:'block', margin:'0 auto 36px', height:'clamp(64px,14vw,120px)', width:'auto', opacity:0.95, filter:'brightness(0) invert(1)' }}/>
        <div style={{ fontFamily:FONT_DISPLAY, fontSize:'clamp(40px,8vw,76px)', lineHeight:1, display:'flex', alignItems:'center', justifyContent:'center', gap:20, flexWrap:'wrap' }}>
          <span style={{ fontStyle:'italic' }}>Yashna</span>
          <span style={{ width:8, height:8, borderRadius:'50%', background:Y.gold }}/>
          <span style={{ fontStyle:'italic' }}>Yash</span>
        </div>
        <p style={{ fontFamily:FONT_BODY, fontSize:12, letterSpacing:'0.3em', textTransform:'uppercase', margin:'24px 0 0', color:'rgba(237,229,214,0.7)' }}>17 &amp; 18 December 2026 · Udaipur</p>
        <p style={{ fontFamily:FONT_BODY, fontSize:14, letterSpacing:'0.2em', textTransform:'uppercase', margin:'8px 0 0', color:Y.gold }}>#Y2K</p>
        <div style={{ marginTop:48, paddingTop:28, borderTop:'1px solid rgba(237,229,214,0.12)', fontFamily:FONT_BODY, fontSize:12, color:'rgba(237,229,214,0.5)', display:'flex', flexWrap:'wrap', gap:'8px 20px', alignItems:'center', justifyContent:'center' }}>
          <span>With love, from the mountains</span>
          <span style={{ opacity:0.4 }}>·</span>
          <span>Luggage handled by Bagdrop — Bag. Box. Delivered.</span>
        </div>
      </footer>

    </div>
  )
}
