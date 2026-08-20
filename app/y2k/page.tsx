'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

// ─────────────────────────────────────────────────────────────
// WEDDING DETAILS
// ─────────────────────────────────────────────────────────────
const WEDDING_DATE = new Date('2026-12-17T00:00:00+05:30')

// ─────────────────────────────────────────────────────────────
// Y2K BOOKING FORM RESTRICTIONS — Y2K event only, not the regular
// BagDrop booking form. Wedding is 17 Dec 2026; pickup is only offered
// in the 3 days before it. Mirrored server-side in
// app/api/y2k/inquiry/route.ts so these can't be bypassed by editing
// form values directly (devtools, a raw fetch call, etc.) — both sides
// must be kept in sync if these ever change.
// ─────────────────────────────────────────────────────────────
const Y2K_PICKUP_DATE_MIN = '2026-12-10'
const Y2K_PICKUP_DATE_MAX = '2026-12-12'
const Y2K_PICKUP_DATES = ['2026-12-10', '2026-12-11', '2026-12-12']
// Preset pickup-location options. 'Others' is a UI-only sentinel — when
// picked, the guest gets a free-text input instead (see pickupCityOther in
// form state) and that text becomes the actual location sent to the API,
// so guests outside Mumbai/Mumbai Airport T2 can still submit a pickup.
const Y2K_PICKUP_LOCATIONS = ['Mumbai', 'Mumbai Airport T2', 'Others']
// Pickup and delivery both use the same 3 time slots (kept in one place —
// TIME_SLOTS below — and reused for both fields) instead of a raw
// time picker, per the Y2K form's simplified time-slot UX.
const Y2K_TIME_SLOTS = ['morning', 'afternoon', 'evening']

// ─────────────────────────────────────────────────────────────
// DESIGN TOKENS — "Aravalli Gold" palette, matched to the approved
// Y2K design reference (warm cream / deep forest green / muted gold).
// Replaces the previous pink/black theme. Fonts: Cormorant Garamond
// (display — already loaded globally via app/y2k/layout.tsx's
// next/font/google as --font-cormorant) for headings/numbers, Inter
// for body/UI copy.
// ─────────────────────────────────────────────────────────────
const Y = {
  cream:       '#F4EEE4',   // page background
  creamCard:   '#FBF8F2',   // input / card fill
  beige:       '#EDE5D6',   // alt section background
  darkGreen:   '#2A3329',   // dark section bg, primary CTA fill
  darkerGreen: '#24291F',   // footer bg
  gold:        '#C8A96E',   // accent — borders, focus rings
  goldLight:   '#E8CE9A',   // accent on dark bg — numbers, buttons
  goldPale:    '#F1DFB6',   // hero date text
  goldMuted:   '#6B5A3E',   // muted italic accents
  eyebrow:     '#B08D57',   // section eyebrow labels
  textDark:    '#2B2620',   // headings / primary text
  textBody:    '#5A5145',   // body copy
  textOnGold:  '#3A2E1C',   // text on light-gold buttons
  border:      '#E0D5C2',   // input borders
  borderCard:  '#E7DDCC',   // card borders
  statLabel:   '#8A8172',   // muted stat labels
  error:       '#C0392B',
}

const FONT_DISPLAY = "'Cormorant Garamond', var(--font-cormorant), serif"
const FONT_BODY    = "'Inter', sans-serif"

// ─────────────────────────────────────────────────────────────
// CONTENT — kept factual: only venue/date/service details already
// confirmed elsewhere on this page. No invented ceremony schedule.
// ─────────────────────────────────────────────────────────────
const HERO_BG        = '/images/wedding-slide.jpg'
const CELEBRATION_IMG = '/images/wedding-slide1.jpg'
const DESTINATION_BG  = '/images/y2k-palace.jpg'
const TRAVEL_IMG      = '/images/wedding-slide2.jpg'

const PROCESS_STEPS = [
  { n: '01', title: 'Door pickup, anywhere in India',  desc: 'From home or the airport — one call and we\'re there.' },
  { n: '02', title: 'Flight-synced transit',            desc: 'Tracked end-to-end, timed to land when you do.' },
  { n: '03', title: 'Delivered to your room',           desc: 'Waiting at Taj Aravali before you check in.' },
]

const INFO_CARDS = [
  { label: 'Wedding Weekend', title: 'Yashna & Yash · #Y2K', body: '17th & 18th December 2026\nTaj Aravali, Udaipur' },
  { label: 'Getting there',   title: 'Reach Udaipur',        body: 'Fly into Maharana Pratap Airport (UDR).\n~30 min drive from the airport.' },
  { label: 'Luggage service', title: 'Door-to-door by Bagdrop', body: 'RFID-tagged, tracked pickup to delivery.\nFully insured, no rush at the airport.' },
  { label: 'Questions?',      title: 'We\'re on call',        body: '+91 63571 15711\ninfo@bagdrop.co' },
]

// ─────────────────────────────────────────────────────────────
// SMALL UI HELPERS
// ─────────────────────────────────────────────────────────────
function Eyebrow({ children, dark=false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <span style={{ fontFamily:FONT_BODY, fontSize:11, fontWeight:600, letterSpacing:'0.28em', textTransform:'uppercase', color: dark ? Y.goldLight : Y.eyebrow }}>
      {children}
    </span>
  )
}

function PillButton({ children, href, onClick, variant='dark' }: { children: React.ReactNode; href?: string; onClick?: () => void; variant?: 'dark'|'gold'|'outline' }) {
  const base: React.CSSProperties = {
    display:'inline-block', textAlign:'center', fontFamily:FONT_BODY, fontSize:12.5, fontWeight:600,
    letterSpacing:'0.16em', textTransform:'uppercase', padding:'15px 28px', borderRadius:999,
    textDecoration:'none', cursor:'pointer', transition:'transform 0.25s ease, box-shadow 0.25s ease, background 0.25s ease',
  }
  const styles: Record<string, React.CSSProperties> = {
    dark:    { ...base, background:Y.darkGreen, color:Y.cream, border:'none' },
    gold:    { ...base, background:Y.goldLight, color:Y.textOnGold, border:'none' },
    outline: { ...base, background:'transparent', color:'currentColor', border:'1px solid currentColor' },
  }
  const style = styles[variant]
  const hover = () => {
    if (variant === 'dark') return { background:'#333F31', transform:'translateY(-2px)', boxShadow:'0 14px 32px rgba(42,51,41,0.32)' }
    if (variant === 'gold') return { transform:'translateY(-2px)', boxShadow:'0 10px 26px rgba(232,206,154,0.4)' }
    return { background:Y.gold, borderColor:Y.gold, color:'#fff' }
  }
  if (href) return (
    <a href={href} style={style}
      onMouseEnter={e=>Object.assign((e.currentTarget as HTMLAnchorElement).style, hover())}
      onMouseLeave={e=>Object.assign((e.currentTarget as HTMLAnchorElement).style, style)}>
      {children}
    </a>
  )
  return (
    <button type="button" onClick={onClick} style={{ ...style, width:'100%', border: style.border ?? 'none' }}
      onMouseEnter={e=>Object.assign((e.currentTarget as HTMLButtonElement).style, hover())}
      onMouseLeave={e=>Object.assign((e.currentTarget as HTMLButtonElement).style, style)}>
      {children}
    </button>
  )
}

function BtnSubmit({ children, onClick, disabled=false, type='button' }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; type?: 'button'|'submit' }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{
      display:'flex', alignItems:'center', justifyContent:'center',
      minHeight:56, padding:'10px 40px', width:'100%',
      background: disabled ? '#A9A18C' : Y.darkGreen,
      fontFamily:FONT_BODY, fontWeight:600, fontSize:13,
      textTransform:'uppercase', letterSpacing:'0.14em', color:Y.cream,
      border:'none', borderRadius:14, cursor: disabled ? 'not-allowed' : 'pointer',
      transition:'background 0.2s ease, transform 0.2s ease',
    }}
    onMouseEnter={e=>{ if (!disabled) (e.currentTarget as HTMLButtonElement).style.background='#333F31' }}
    onMouseLeave={e=>{ if (!disabled) (e.currentTarget as HTMLButtonElement).style.background=Y.darkGreen }}>
      {children}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────
// HOOKS
// ─────────────────────────────────────────────────────────────
function useCountdown(target: Date) {
  const [t, setT] = useState({ d:0, h:0, m:0, s:0, ready:false })
  const calc = useCallback(() => {
    const diff = target.getTime()-Date.now()
    if (diff<=0) { setT({d:0,h:0,m:0,s:0,ready:true}); return }
    setT({d:Math.floor(diff/86400000),h:Math.floor((diff%86400000)/3600000),m:Math.floor((diff%3600000)/60000),s:Math.floor((diff%60000)/1000),ready:true})
  },[target])
  useEffect(()=>{ calc(); const id=setInterval(calc,1000); return()=>clearInterval(id) },[calc])
  return t
}

function useReveal() {
  const ref = useRef<HTMLDivElement>(null)
  const [vis, setVis] = useState(false)
  useEffect(() => {
    const el=ref.current; if(!el) return
    const obs=new IntersectionObserver(([e])=>{if(e.isIntersecting){setVis(true);obs.disconnect()}},{threshold:0.08})
    obs.observe(el); return()=>obs.disconnect()
  },[])
  return { ref, vis }
}

function Reveal({ children, delay=0 }: { children: React.ReactNode; delay?: number }) {
  const { ref, vis } = useReveal()
  return (
    <div ref={ref} style={{ opacity:vis?1:0, transform:vis?'translateY(0)':'translateY(24px)', transition:`opacity 0.65s ease ${delay}ms, transform 0.65s ease ${delay}ms` }}>
      {children}
    </div>
  )
}

function CountUp({ to, suffix='', duration=1800 }: { to: number; suffix?: string; duration?: number }) {
  const [val, setVal] = useState(0)
  const { ref, vis }  = useReveal()
  useEffect(() => {
    if (!vis) return
    let start: number | null = null
    const step = (ts: number) => {
      if (!start) start = ts
      const progress = Math.min((ts - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setVal(Math.round(eased * to))
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [vis, to, duration])
  return <span ref={ref}>{val}{suffix}</span>
}

function CountdownBlock({ v, l, light=false }: { v: number; l: string; light?: boolean }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8, minWidth:56 }}>
      <span style={{ fontFamily:FONT_DISPLAY, fontSize:'clamp(30px,6vw,52px)', lineHeight:1, color: light ? Y.goldLight : Y.darkGreen }}>{String(v).padStart(2,'0')}</span>
      <span style={{ fontFamily:FONT_BODY, fontSize:10, letterSpacing:'0.24em', textTransform:'uppercase', color: light ? 'rgba(244,238,228,0.75)' : Y.statLabel }}>{l}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────
export default function Y2KPage() {
  const cd = useCountdown(WEDDING_DATE)
  const [scrolled, setScrolled] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [step, setStep]   = useState(1)
  const [form, setForm]   = useState({ name:'', phone:'', email:'', pickupCity:'', pickupCityOther:'', pickupAddress:'', pickupDate:'', pickupTime:'', weddingVenue:'Taj Aravali, Udaipur', bags:'1', bagSize:'', specialInstructions:'', hotelName:'', deliveryTime:'' })
  const [busy, setBusy]   = useState(false)
  const [done, setDone]   = useState(false)
  const [trackId, setTrackId] = useState('')
  const [err, setErr]     = useState('')

  // Nav background/shadow only switches once the hero has scrolled past —
  // purely visual (mirrors the approved Y2K design reference's nav), no
  // effect on booking functionality below.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive:true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  function patch(k: keyof typeof form, v: string) { setForm(p=>({...p,[k]:v})); setErr('') }

  function nextStep() {
    if (step===1) {
      const d=form.phone.replace(/\D/g,'')
      if (!form.name.trim()) { setErr('Please enter your full name.'); return }
      if (!/^[6-9]\d{9}$/.test(d)) { setErr('Enter a valid 10-digit Indian mobile number.'); return }
    }
    if (step===2&&!form.pickupCity.trim()) { setErr('Please select a pickup location.'); return }
    if (step===2&&!Y2K_PICKUP_LOCATIONS.includes(form.pickupCity)) { setErr('Please select a valid pickup location.'); return }
    // 'Others' needs the free-text location the guest typed in instead.
    if (step===2&&form.pickupCity==='Others'&&!form.pickupCityOther.trim()) { setErr('Please enter your pickup location.'); return }
    if (step===2&&!form.pickupAddress.trim()) { setErr('Please enter your pickup address.'); return }
    if (step===2&&!form.pickupDate) { setErr('Please select a pickup date.'); return }
    if (step===2&&!Y2K_PICKUP_DATES.includes(form.pickupDate)) { setErr('Pickup is only available on 10, 11 or 12 December 2026.'); return }
    // Pickup time now uses the same morning/afternoon/evening slots as
    // Preferred Delivery Time (see TIME_SLOTS below), not a raw clock
    // time — matches Y2K_TIME_SLOTS, checked again server-side.
    if (step===2&&!form.pickupTime) { setErr('Please select a pickup time.'); return }
    if (step===2&&!Y2K_TIME_SLOTS.includes(form.pickupTime)) { setErr('Please select a valid pickup time slot.'); return }
    if (step===3&&(!form.bags||Number(form.bags)<1)) { setErr('Please enter number of bags.'); return }
    setErr(''); setStep(s=>Math.min(s+1,4))
    document.getElementById('book')?.scrollIntoView({behavior:'smooth',block:'start'})
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.deliveryTime) { setErr('Please select a delivery time slot.'); return }
    setBusy(true); setErr('')
    try {
      const digits=form.phone.replace(/\D/g,'')
      // If the guest picked 'Others', the location they actually typed
      // lives in pickupCityOther — that's what gets sent as pickupCity,
      // not the literal word "Others".
      const resolvedPickupCity = form.pickupCity==='Others' ? form.pickupCityOther.trim() : form.pickupCity
      const res=await fetch('/api/y2k/inquiry',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          name:form.name, phone:digits, email:form.email,
          bags:form.bags, guests:'1',
          pickupAddress:`${form.pickupAddress}, ${resolvedPickupCity}`,
          // Sent separately (not just folded into pickupAddress above) so
          // the API route can validate/store it independent of whatever
          // string pickupAddress ends up containing.
          pickupCity:resolvedPickupCity,
          pickupTime:form.pickupTime||form.deliveryTime,
          deliveryAddress:form.weddingVenue||'Taj Aravali, Udaipur',
          requests:[
            form.bagSize?`Bag size: ${form.bagSize}`:'',
            form.hotelName?`Hotel: ${form.hotelName}`:'',
            form.deliveryTime?`Delivery slot: ${form.deliveryTime}`:'',
            form.specialInstructions,
          ].filter(Boolean).join(' · '),
          arrivalDate:form.pickupDate,
          // Sent as a discrete field (not just folded into the requests
          // note above) so the API route can validate it against the
          // allowed morning/afternoon/evening slots independently.
          deliveryTime:form.deliveryTime,
        }),
      })
      const d=await res.json()
      if (!res.ok) throw new Error(d.error??'Submission failed')
      setTrackId(d.trackingId??''); setDone(true)
      window.scrollTo({top:0,behavior:'smooth'})
    } catch(ex) {
      setErr(ex instanceof Error?ex.message:'Something went wrong. Please try again.')
    } finally { setBusy(false) }
  }

  // Both Preferred Pickup Time and Preferred Delivery Time use this same
  // set of slots (10 AM – 6 PM window); Night was removed entirely rather
  // than just hidden, per the Y2K booking form spec.
  const TIME_SLOTS = [
    {id:'morning',  label:'Morning',   range:'10:00 AM – 12:00 PM'},
    {id:'afternoon',label:'Afternoon', range:'12:00 PM – 3:00 PM'},
    {id:'evening',  label:'Evening',   range:'3:00 PM – 6:00 PM'},
  ]

  const fi: React.CSSProperties = { fontFamily:FONT_BODY, fontSize:15, color:Y.textDark, background:Y.creamCard, border:`1px solid ${Y.border}`, borderRadius:13, padding:'0 16px', height:52, width:'100%', outline:'none', transition:'border-color 0.2s, box-shadow 0.2s, background 0.2s' }
  const fiFocus = (e: React.FocusEvent<HTMLElement>) => { (e.currentTarget as HTMLElement).style.borderColor=Y.gold; (e.currentTarget as HTMLElement).style.boxShadow='0 0 0 3px rgba(200,169,110,0.18)'; (e.currentTarget as HTMLElement).style.background='#fff' }
  const fiBlur  = (e: React.FocusEvent<HTMLElement>) => { (e.currentTarget as HTMLElement).style.borderColor=Y.border; (e.currentTarget as HTMLElement).style.boxShadow='none'; (e.currentTarget as HTMLElement).style.background=Y.creamCard }

  // ── Thank-you ──────────────────────────────────────────────
  if (done) return (
    <div style={{ minHeight:'100vh', background:Y.darkerGreen, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'48px 24px', textAlign:'center', fontFamily:FONT_BODY }}>
      <style dangerouslySetInnerHTML={{__html:`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400&family=Inter:wght@400;500;600;700&display=swap'); @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}} .ty{animation:fadeUp 0.8s ease forwards}`}}/>
      <div className="ty" style={{ maxWidth:520 }}>
        <div style={{ width:68, height:68, borderRadius:'50%', background:Y.darkGreen, color:Y.goldLight, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 24px', fontSize:32 }}>✓</div>
        <p style={{ fontFamily:FONT_DISPLAY, fontWeight:400, fontSize:'clamp(40px,8vw,64px)', color:Y.goldLight, margin:'0 0 12px', lineHeight:1 }}>Your pickup is booked</p>
        <p style={{ fontSize:16, color:'rgba(244,238,228,0.75)', lineHeight:1.8, marginBottom:20 }}>Your Wedding Luggage Concierge request for <strong style={{color:'#fff'}}>Yashna &amp; Yash · #Y2K</strong> has been received. Our team will call you shortly to confirm your slot.</p>
        {trackId&&<div style={{ display:'inline-block', fontFamily:FONT_BODY, fontSize:20, letterSpacing:'0.12em', color:Y.goldLight, background:'rgba(200,169,110,0.12)', border:`1px dashed ${Y.gold}`, borderRadius:14, padding:'16px 32px', marginBottom:20 }}>{trackId}<p style={{ fontSize:11, color:'rgba(244,238,228,0.4)', margin:'6px 0 0', textTransform:'uppercase', letterSpacing:'0.2em' }}>Your Reference</p></div>}
        <p style={{ fontFamily:FONT_DISPLAY, fontStyle:'italic', fontSize:32, color:Y.goldLight, margin:'8px 0 4px' }}>#Y2K</p>
        <div style={{ marginTop:40, display:'flex', flexWrap:'wrap', gap:16, justifyContent:'center' }}>
          <button onClick={()=>{ setDone(false);setStep(1);setForm({name:'',phone:'',email:'',pickupCity:'',pickupCityOther:'',pickupAddress:'',pickupDate:'',pickupTime:'',weddingVenue:'Taj Aravali, Udaipur',bags:'1',bagSize:'',specialInstructions:'',hotelName:'',deliveryTime:''});setTrackId('') }}
            style={{ fontFamily:FONT_BODY, fontWeight:600, fontSize:12.5, textTransform:'uppercase', letterSpacing:'0.14em', background:Y.goldLight, color:Y.textOnGold, border:'none', borderRadius:999, padding:'14px 32px', cursor:'pointer' }}>
            Book Another Pickup
          </button>
          <a href="/y2k" style={{ fontFamily:FONT_BODY, fontWeight:600, fontSize:12.5, textTransform:'uppercase', letterSpacing:'0.14em', background:'transparent', color:'rgba(244,238,228,0.65)', border:'1px solid rgba(244,238,228,0.3)', borderRadius:999, padding:'13px 32px', textDecoration:'none', display:'inline-block' }}>
            ← Back to Landing Page
          </a>
        </div>
      </div>
    </div>
  )

  return (
    <div style={{ fontFamily:FONT_BODY, background:Y.cream, color:Y.textDark, overflowX:'hidden' }}>

      {/* ══ GLOBAL CSS ════════════════════════════════════════ */}
      <style dangerouslySetInnerHTML={{__html:`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,400;1,500&family=Inter:wght@400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing:border-box; }
        html { scroll-behavior:smooth; }
        body { margin:0; }
        a { color:inherit; }
        ::selection { background:${Y.gold}; color:#fff; }
        input, select, textarea { font-family:${FONT_BODY}; }
        select { -webkit-appearance:none; appearance:none; }
        input::placeholder, textarea::placeholder { color:#A99C87; }

        @keyframes wdReveal { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:none; } }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.25} }

        .header-top { background:${Y.darkerGreen}; padding:9px 15px; display:flex; align-items:center; justify-content:center; }
        .header-main { background: ${scrolled ? 'rgba(244,238,228,0.94)' : 'transparent'}; backdrop-filter: ${scrolled ? 'saturate(180%) blur(12px)' : 'none'}; box-shadow: ${scrolled ? '0 1px 0 rgba(0,0,0,0.06)' : 'none'}; transition:background 0.35s ease, box-shadow 0.35s ease; }
        .header-inner { max-width:1240px; margin:0 auto; display:flex; align-items:center; justify-content:space-between; height:88px; gap:24px; padding:0 20px; }
        .header-nav { display:flex; align-items:center; gap:32px; list-style:none; margin:0; padding:0; }
        .header-nav a { font-family:${FONT_BODY}; font-size:12.5px; font-weight:500; color:inherit; text-decoration:none; text-transform:uppercase; letter-spacing:0.12em; transition:opacity 0.2s; }
        .header-nav a:hover { opacity:0.6; }
        .header-logo { display:flex; align-items:center; }
        .header-logo img { height:56px; width:auto; display:block; filter: ${scrolled ? 'none' : 'brightness(0) invert(1)'}; transition:filter 0.35s ease; }

        .header-burger { display:none; flex-direction:column; justify-content:center; gap:5px; width:34px; height:34px; padding:0; background:none; border:none; cursor:pointer; }
        .burger-line { display:block; width:100%; height:1.5px; background:currentColor; transition:transform 0.25s ease, opacity 0.25s ease; }
        .burger-line.open:nth-child(1) { transform:translateY(6.5px) rotate(45deg); }
        .burger-line.open:nth-child(2) { opacity:0; }
        .burger-line.open:nth-child(3) { transform:translateY(-6.5px) rotate(-45deg); }
        .header-mobile-nav { display:none; }

        .wd-float-card:hover { transform:translateY(-6px); box-shadow:0 22px 44px rgba(45,32,18,0.14); }
        .wd-float-card { transition:transform 0.4s ease, box-shadow 0.4s ease; }

        @media (min-width:861px) { .wd-two-col { grid-template-columns:1fr 1fr !important; } }
        @media (max-width:860px) {
          .header-nav { display:none !important; }
          .header-cta { display:none !important; }
          .header-burger { display:flex !important; }
          .header-logo img { filter:none !important; }
          .header-top span { font-size:10.5px !important; }

          .venue-grid { grid-template-columns:1fr !important; gap:36px !important; }
          .venue-img { height:260px !important; }
          .stats-grid { grid-template-columns:repeat(2,1fr) !important; gap:32px 16px !important; }
          .book-grid { grid-template-columns:1fr !important; }
          .book-left { padding:44px 26px !important; order:2; }
          .book-right { padding:32px 18px !important; order:1; }
          .footer-grid { grid-template-columns:1fr !important; gap:32px !important; text-align:center; }
          .footer-social { justify-content:center !important; }
        }
        @media (max-width:560px) {
          .form-grid-2 { grid-template-columns:1fr !important; }
          .dt-slot-grid { grid-template-columns:1fr !important; }
        }
      `}}/>

      {/* ════════════════════════════════════════════════════ */}
      {/* NAVIGATION                                          */}
      {/* ════════════════════════════════════════════════════ */}
      <header style={{ position:'sticky', top:0, zIndex:200 }}>
        <div className="header-top">
          <span style={{ fontFamily:FONT_BODY, fontSize:12, color:'rgba(244,238,228,0.75)' }}>
            <strong style={{ color:Y.goldLight }}>Official</strong> Wedding Luggage Concierge for <strong style={{ color:'#fff' }}>#Y2K</strong> · <strong style={{ color:Y.goldLight }}>Taj Aravali, Udaipur</strong>
          </span>
        </div>
        <div className="header-main" style={{ color: scrolled ? Y.textDark : '#F4EEE4' }}>
          <div className="header-inner">
            <a href="#top" className="header-logo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/bagdrop-logo.png" alt="Bagdrop" />
            </a>
            <ul className="header-nav">
              <li><a href="#celebration">Celebration</a></li>
              <li><a href="#destination">Destination</a></li>
              <li><a href="#travel">Travel</a></li>
              <li><a href="#info">Details</a></li>
            </ul>
            <div style={{ display:'flex', alignItems:'center', gap:18 }}>
              <a href="#book" className="header-cta" style={{ fontFamily:FONT_BODY, fontSize:12.5, fontWeight:500, letterSpacing:'0.12em', textTransform:'uppercase', border:'1px solid currentColor', padding:'10px 22px', borderRadius:999, textDecoration:'none' }}>
                Book Bags
              </a>
              <button type="button" className="header-burger" aria-label={mobileNavOpen ? 'Close menu' : 'Open menu'} aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen(v => !v)} style={{ color:'inherit' }}>
                <span className={`burger-line ${mobileNavOpen ? 'open' : ''}`}/>
                <span className={`burger-line ${mobileNavOpen ? 'open' : ''}`}/>
                <span className={`burger-line ${mobileNavOpen ? 'open' : ''}`}/>
              </button>
            </div>
          </div>
        </div>
        <div className={`header-mobile-nav ${mobileNavOpen ? 'open' : ''}`} style={mobileNavOpen ? { display:'block', background:Y.darkGreen, color:Y.cream, padding:'8px 22px 26px' } : undefined}>
          <ul style={{ listStyle:'none', display:'flex', flexDirection:'column', margin:0, padding:0 }}>
            {[['#celebration','Celebration'],['#destination','Destination'],['#travel','Travel'],['#info','Details']].map(([href,label])=>(
              <li key={href}><a href={href} onClick={()=>setMobileNavOpen(false)} style={{ display:'block', padding:'14px 4px', fontFamily:FONT_DISPLAY, fontSize:24, color:'inherit', textDecoration:'none', borderBottom:'1px solid rgba(244,238,228,0.12)' }}>{label}</a></li>
            ))}
          </ul>
          <a href="#book" onClick={()=>setMobileNavOpen(false)} style={{ display:'block', textAlign:'center', marginTop:20, background:Y.goldLight, color:Y.textOnGold, fontFamily:FONT_BODY, fontWeight:600, fontSize:13, letterSpacing:'0.14em', textTransform:'uppercase', padding:16, borderRadius:999, textDecoration:'none' }}>
            Book Luggage Pickup
          </a>
        </div>
      </header>

      {/* ════════════════════════════════════════════════════ */}
      {/* HERO                                                */}
      {/* ════════════════════════════════════════════════════ */}
      <header id="top" style={{ position:'relative', minHeight:'100svh', marginTop:-88, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center', padding:'140px 20px 64px', overflow:'hidden' }}>
        <div style={{ position:'absolute', inset:0, zIndex:0, backgroundImage:`url(${HERO_BG})`, backgroundSize:'cover', backgroundPosition:'center' }}/>
        <div style={{ position:'absolute', inset:0, zIndex:1, pointerEvents:'none', background:'linear-gradient(180deg, rgba(20,16,10,0.55) 0%, rgba(20,16,10,0.32) 30%, rgba(20,16,10,0.42) 58%, rgba(20,16,10,0.82) 100%)' }}/>

        <div style={{ position:'relative', zIndex:2, color:'#F4EEE4', display:'flex', flexDirection:'column', alignItems:'center' }}>
          <span style={{ fontFamily:FONT_BODY, fontSize:12, fontWeight:500, letterSpacing:'0.42em', textTransform:'uppercase', opacity:0.9, marginBottom:28 }}>Taj Aravali · Udaipur</span>
          <h1 style={{ fontFamily:FONT_DISPLAY, fontWeight:400, fontSize:'clamp(48px,12vw,140px)', lineHeight:0.94, margin:0, display:'flex', flexWrap:'wrap', alignItems:'center', justifyContent:'center', gap:'clamp(12px,4vw,40px)', textShadow:'0 2px 30px rgba(0,0,0,0.55), 0 1px 4px rgba(0,0,0,0.4)' }}>
            <span style={{ fontStyle:'italic' }}>Yashna</span>
            <span style={{ color:Y.goldLight, fontSize:'0.5em' }}>❤</span>
            <span style={{ fontStyle:'italic' }}>Yash</span>
          </h1>
          <div style={{ display:'flex', alignItems:'center', gap:16, marginTop:34, background:'rgba(20,16,10,0.32)', border:'1px solid rgba(232,206,154,0.4)', backdropFilter:'blur(2px)', padding:'12px 24px', borderRadius:999 }}>
            <span style={{ width:28, height:1, background:'rgba(232,206,154,0.6)' }}/>
            <span style={{ fontFamily:FONT_BODY, fontSize:'clamp(12px,1.6vw,15px)', letterSpacing:'0.28em', textTransform:'uppercase', fontWeight:600, color:Y.goldPale }}>17 &amp; 18 December 2026</span>
            <span style={{ width:28, height:1, background:'rgba(232,206,154,0.6)' }}/>
          </div>

          <div style={{ display:'flex', gap:'clamp(18px,6vw,48px)', marginTop:48 }}>
            <CountdownBlock v={cd.d} l="Days" light/>
            <CountdownBlock v={cd.h} l="Hours" light/>
            <CountdownBlock v={cd.m} l="Minutes" light/>
            <CountdownBlock v={cd.s} l="Seconds" light/>
          </div>
        </div>
      </header>

      {/* ── TRAVEL LIGHT INFO CARD (overlaps hero) ── */}
      <section style={{ background:Y.cream, padding:'clamp(36px,7vw,72px) clamp(20px,5vw,56px) clamp(16px,4vw,40px)', position:'relative', zIndex:3 }}>
        <Reveal>
          <div style={{ maxWidth:1120, margin:'0 auto', background:'#4A3B29', color:'#F4EEE4', borderRadius:26, padding:'clamp(28px,5vw,48px)', display:'flex', flexWrap:'wrap', alignItems:'center', gap:'clamp(20px,4vw,44px)', boxShadow:'0 30px 70px rgba(45,32,18,0.28)' }}>
            <div style={{ flex:'1 1 340px', minWidth:'min(260px, 100%)' }}>
              <Eyebrow dark>Travel light to the mountains</Eyebrow>
              <p style={{ fontFamily:FONT_DISPLAY, fontSize:'clamp(22px,3.2vw,34px)', lineHeight:1.24, margin:'16px 0 0', fontWeight:400 }}>Arrive with only your best self. We&apos;ll carry your bags door-to-destination, timed to your flight.</p>
            </div>
            <div style={{ flex:'0 0 auto', display:'flex', flexDirection:'column', gap:14, minWidth:'min(220px, 100%)' }}>
              <div style={{ display:'flex', gap:22 }}>
                <div><div style={{ fontFamily:FONT_DISPLAY, fontSize:28, color:Y.goldLight }}>RFID</div><div style={{ fontSize:11, letterSpacing:'0.12em', textTransform:'uppercase', opacity:0.7 }}>Tagged &amp; sealed</div></div>
                <div><div style={{ fontFamily:FONT_DISPLAY, fontSize:28, color:Y.goldLight }}>100%</div><div style={{ fontSize:11, letterSpacing:'0.12em', textTransform:'uppercase', opacity:0.7 }}>Insured</div></div>
              </div>
              <PillButton href="#book" variant="gold">Book Luggage Pickup</PillButton>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ════════════════════════════════════════════════════ */}
      {/* 01 THE CELEBRATION                                  */}
      {/* ════════════════════════════════════════════════════ */}
      <section id="celebration" style={{ background:Y.cream, padding:'clamp(72px,12vw,140px) clamp(20px,5vw,56px) clamp(48px,8vw,96px)', scrollMarginTop:88 }}>
        <div className="wd-two-col" style={{ maxWidth:1120, margin:'0 auto', display:'grid', gridTemplateColumns:'1fr', gap:'clamp(36px,6vw,64px)', alignItems:'center' }}>
          <Reveal>
            <div>
              <Eyebrow>01 — The Celebration</Eyebrow>
              <h2 style={{ fontFamily:FONT_DISPLAY, fontWeight:400, fontSize:'clamp(34px,5.5vw,60px)', lineHeight:1.06, margin:'18px 0 0' }}>Two days in the <span style={{ fontStyle:'italic', color:Y.goldMuted }}>Aravallis</span>, one forever.</h2>
              <p style={{ fontFamily:FONT_BODY, fontSize:'clamp(15px,1.7vw,17px)', lineHeight:1.85, color:Y.textBody, maxWidth:'46ch', margin:'24px 0 0' }}>We&apos;re gathering the people we love most in the folds of the oldest mountains in India — for slow mornings, long evenings, and a wedding under an open Udaipur sky.</p>
              <div style={{ display:'flex', gap:36, marginTop:34 }}>
                <div><div style={{ fontFamily:FONT_DISPLAY, fontSize:'clamp(28px,4vw,40px)', color:Y.darkGreen }}>2</div><div style={{ fontSize:11, letterSpacing:'0.16em', textTransform:'uppercase', color:Y.statLabel }}>Days</div></div>
                <div style={{ width:1, background:'#D9CFBE' }}/>
                <div><div style={{ fontFamily:FONT_DISPLAY, fontSize:'clamp(28px,4vw,40px)', color:Y.darkGreen }}>1</div><div style={{ fontSize:11, letterSpacing:'0.16em', textTransform:'uppercase', color:Y.statLabel }}>Palace</div></div>
                <div style={{ width:1, background:'#D9CFBE' }}/>
                <div><div style={{ fontFamily:FONT_DISPLAY, fontSize:'clamp(28px,4vw,40px)', color:Y.darkGreen }}>∞</div><div style={{ fontSize:11, letterSpacing:'0.16em', textTransform:'uppercase', color:Y.statLabel }}>Memories</div></div>
              </div>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <div style={{ position:'relative' }}>
              <div style={{ position:'relative', width:'100%', aspectRatio:'4 / 5', borderRadius:22, overflow:'hidden', boxShadow:'0 30px 60px rgba(45,32,18,0.16)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={CELEBRATION_IMG} alt="Yashna &amp; Yash" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}/>
              </div>
              <div style={{ position:'absolute', bottom:-20, left:-16, background:Y.cream, padding:'16px 22px', borderRadius:16, boxShadow:'0 14px 34px rgba(45,32,18,0.12)', fontFamily:FONT_DISPLAY, fontStyle:'italic', fontSize:19, color:Y.goldMuted }}>#Y2K</div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════ */}
      {/* 02 THE DESTINATION                                  */}
      {/* ════════════════════════════════════════════════════ */}
      <section id="destination" style={{ position:'relative', minHeight:'80vh', display:'flex', alignItems:'flex-end', padding:'clamp(36px,8vw,84px) clamp(20px,5vw,56px)', overflow:'hidden', scrollMarginTop:88 }}>
        <div style={{ position:'absolute', inset:0, zIndex:0, backgroundImage:`url(${DESTINATION_BG})`, backgroundSize:'cover', backgroundPosition:'center' }}/>
        <div style={{ position:'absolute', inset:0, zIndex:1, pointerEvents:'none', background:'linear-gradient(180deg, rgba(20,16,10,0.34) 0%, rgba(20,16,10,0.05) 40%, rgba(20,16,10,0.8) 100%)' }}/>
        <div style={{ position:'relative', zIndex:2, color:'#F4EEE4', maxWidth:1120, margin:'0 auto', width:'100%' }}>
          <Reveal>
            <Eyebrow dark>02 — The Destination</Eyebrow>
            <h2 style={{ fontFamily:FONT_DISPLAY, fontWeight:400, fontSize:'clamp(40px,7.5vw,88px)', lineHeight:1, margin:'18px 0 0' }}>Taj Aravali,<br/><span style={{ fontStyle:'italic' }}>Udaipur</span></h2>
            <p style={{ fontFamily:FONT_BODY, fontSize:'clamp(15px,1.8vw,18px)', lineHeight:1.8, maxWidth:'52ch', margin:'24px 0 0', color:'rgba(244,238,228,0.9)' }}>Tucked into the Aravalli range above the City of Lakes — terraced gardens, still water, and mountain light that turns gold at dusk. About a 30-minute drive from Maharana Pratap Airport (UDR).</p>
          </Reveal>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════ */}
      {/* 03 TRAVEL LIGHT / BAGGAGE                           */}
      {/* ════════════════════════════════════════════════════ */}
      <section id="travel" style={{ background:Y.darkGreen, color:Y.cream, padding:'clamp(72px,12vw,140px) clamp(20px,5vw,56px)', scrollMarginTop:88 }}>
        <div style={{ maxWidth:1120, margin:'0 auto' }}>
          <div className="wd-two-col" style={{ display:'grid', gridTemplateColumns:'1fr', gap:'clamp(28px,5vw,56px)', alignItems:'center' }}>
            <Reveal>
              <div>
                <Eyebrow dark>03 — Travel Light</Eyebrow>
                <h2 style={{ fontFamily:FONT_DISPLAY, fontWeight:400, fontSize:'clamp(32px,5.5vw,58px)', lineHeight:1.06, margin:'18px 0 0' }}>Your bags, handled.<br/>So the mountains are all you carry.</h2>
                <p style={{ fontFamily:FONT_BODY, fontSize:'clamp(15px,1.7vw,17px)', lineHeight:1.8, color:'rgba(244,238,228,0.78)', margin:'20px 0 0', maxWidth:'48ch' }}>Powered by Bagdrop. We collect your luggage across India and deliver it straight to your room at Taj Aravali — flight-synced, RFID-tagged, and fully insured.</p>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <div style={{ position:'relative' }}>
                <div style={{ position:'relative', width:'100%', aspectRatio:'4 / 3', borderRadius:22, overflow:'hidden', boxShadow:'0 30px 60px rgba(0,0,0,0.28)' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={TRAVEL_IMG} alt="Bagdrop luggage delivery" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}/>
                </div>
                <div style={{ position:'absolute', bottom:-16, left:-16, background:Y.goldLight, color:Y.darkGreen, padding:'12px 20px', borderRadius:14, boxShadow:'0 14px 34px rgba(0,0,0,0.22)', fontFamily:FONT_BODY, fontSize:11, fontWeight:600, letterSpacing:'0.14em', textTransform:'uppercase' }}>Door-to-Door · Pan India</div>
              </div>
            </Reveal>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px,1fr))', gap:18, marginTop:52 }}>
            {PROCESS_STEPS.map(s=>(
              <Reveal key={s.n}>
                <div style={{ background:'rgba(244,238,228,0.05)', border:'1px solid rgba(244,238,228,0.12)', borderRadius:20, padding:30, height:'100%' }}>
                  <div style={{ fontFamily:FONT_DISPLAY, fontSize:40, color:Y.goldLight, lineHeight:1 }}>{s.n}</div>
                  <h3 style={{ fontFamily:FONT_BODY, fontSize:16, fontWeight:600, margin:'16px 0 8px' }}>{s.title}</h3>
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
      <section id="book" className="book-section" style={{ background:Y.beige, padding:'clamp(64px,10vw,110px) clamp(16px,4vw,40px)', scrollMarginTop:88 }}>
        <Reveal>
          <div style={{ maxWidth:640, margin:'0 auto', textAlign:'center' }}>
            <Eyebrow>04 — Reserve Your Pickup</Eyebrow>
            <h2 style={{ fontFamily:FONT_DISPLAY, fontWeight:400, fontSize:'clamp(32px,5.5vw,56px)', lineHeight:1.06, margin:'16px 0 10px' }}>Book your luggage pickup</h2>
            <p style={{ fontFamily:FONT_BODY, fontSize:'clamp(15px,1.7vw,17px)', lineHeight:1.75, color:Y.textBody, maxWidth:'44ch', margin:'0 auto' }}>A minute now, a weightless journey later. Pickups run 10–12 December 2026.</p>
          </div>
        </Reveal>

        <div className="book-grid" style={{ maxWidth:1080, margin:'40px auto 0', display:'grid', gridTemplateColumns:'0.85fr 1.15fr', borderRadius:26, overflow:'hidden', boxShadow:'0 30px 70px rgba(45,32,18,0.14)' }}>

          {/* LEFT: countdown + trust */}
          <div className="book-left" style={{ background:Y.darkGreen, color:Y.cream, padding:'52px 44px', display:'flex', flexDirection:'column', justifyContent:'center' }}>
            <Reveal>
              <Eyebrow dark>wedding concierge</Eyebrow>
              <h3 style={{ fontFamily:FONT_DISPLAY, fontSize:'clamp(28px,3.6vw,42px)', lineHeight:1.1, fontWeight:400, margin:'18px 0 16px' }}>Reserve your<br/><span style={{ fontStyle:'italic', color:Y.goldLight }}>Luggage Concierge</span></h3>
              <p style={{ fontSize:14.5, color:'rgba(244,238,228,0.6)', lineHeight:1.75, marginBottom:32 }}>Exclusive baggage handling for guests attending <strong style={{ color:'rgba(244,238,228,0.9)' }}>Yashna &amp; Yash&apos;s</strong> wedding at Taj Aravali · 17th–18th Dec 2026.</p>

              <div style={{ border:'1px solid rgba(232,206,154,0.25)', borderRadius:14, padding:'16px 20px', marginBottom:32, background:'rgba(232,206,154,0.06)' }}>
                <p style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.18em', color:Y.goldLight, margin:'0 0 4px' }}>All deliveries to</p>
                <p style={{ fontFamily:FONT_DISPLAY, fontSize:19, margin:0 }}>Taj Aravali, Udaipur</p>
                <p style={{ fontSize:12, color:'rgba(244,238,228,0.4)', marginTop:2 }}>17th–18th December 2026 · #Y2K</p>
              </div>

              <p style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.18em', color:'rgba(244,238,228,0.3)', marginBottom:14 }}>Wedding day countdown</p>
              <div style={{ display:'flex', gap:16 }}>
                <CountdownBlock v={cd.d} l="Days" light/>
                <CountdownBlock v={cd.h} l="Hrs" light/>
                <CountdownBlock v={cd.m} l="Min" light/>
                <CountdownBlock v={cd.s} l="Sec" light/>
              </div>
            </Reveal>
          </div>

          {/* RIGHT: form */}
          <div className="book-right" style={{ background:'#fff', padding:'44px 40px' }}>
            <Reveal>
              {/* Step indicator */}
              <div style={{ display:'flex', alignItems:'center', marginBottom:28 }}>
                {['Guest','Travel','Luggage','Delivery'].map((label,i)=>{
                  const s=i+1, active=step===s, doneStep=step>s
                  return (
                    <div key={label} style={{ display:'flex', alignItems:'center', flex:1 }}>
                      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
                        <div style={{ width:30, height:30, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, transition:'all 0.3s', background:doneStep?Y.gold:active?Y.darkGreen:'transparent', color:doneStep||active?'#fff':Y.statLabel, border:`2px solid ${doneStep||active?'transparent':Y.border}` }}>
                          {doneStep?'✓':s}
                        </div>
                        <span style={{ fontSize:9, textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:600, whiteSpace:'nowrap', color:active?Y.textDark:doneStep?Y.goldMuted:Y.statLabel }}>{label}</span>
                      </div>
                      {i<3&&<div style={{ flex:1, height:1, margin:'0 4px 18px', minWidth:12, background:step>s?Y.gold:Y.border }}/>}
                    </div>
                  )
                })}
              </div>

              <form onSubmit={submit}>

                {/* ── Step 1: Guest Info ── */}
                {step===1&&(
                  <>
                    <h3 style={{ fontFamily:FONT_DISPLAY, fontSize:26, color:Y.textDark, fontWeight:400, marginBottom:22 }}>Guest Information</h3>
                    <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:18 }}>
                      <label style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color:Y.goldMuted }}>Full Name *</label>
                      <input required type="text" placeholder="e.g. Priya Sharma" value={form.name} onChange={e=>patch('name',e.target.value)} onFocus={fiFocus} onBlur={fiBlur} style={fi}/>
                    </div>
                    <div className="form-grid-2" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
                      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                        <label style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color:Y.goldMuted }}>Mobile Number *</label>
                        <input required type="tel" placeholder="10-digit number" value={form.phone} onChange={e=>patch('phone',e.target.value.replace(/\D/g,'').slice(0,10))} onFocus={fiFocus} onBlur={fiBlur} style={fi}/>
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                        <label style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color:Y.goldMuted }}>Email (optional)</label>
                        <input type="email" placeholder="your@email.com" value={form.email} onChange={e=>patch('email',e.target.value)} onFocus={fiFocus} onBlur={fiBlur} style={fi}/>
                      </div>
                    </div>
                  </>
                )}

                {/* ── Step 2: Pickup Info ── */}
                {step===2&&(
                  <>
                    <h3 style={{ fontFamily:FONT_DISPLAY, fontSize:26, color:Y.textDark, fontWeight:400, marginBottom:22 }}>Pickup Information</h3>
                    <div className="form-grid-2" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
                      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                        <label style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color:Y.goldMuted }}>Pickup Date *</label>
                        {/* Pickup is only offered 10–12 Dec 2026 (3 days
                            before the 17 Dec wedding) — min/max restrict the
                            native date picker to exactly that window, so no
                            other date is selectable or typeable. Re-checked
                            in nextStep() and again server-side (see
                            Y2K_PICKUP_DATES) so this can't be bypassed by
                            editing the form's DOM/value directly. */}
                        <input required type="date" value={form.pickupDate}
                          min={Y2K_PICKUP_DATE_MIN} max={Y2K_PICKUP_DATE_MAX}
                          onChange={e=>patch('pickupDate',e.target.value)} onFocus={fiFocus} onBlur={fiBlur} style={fi}/>
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                        <label style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color:Y.goldMuted }}>Pickup Location *</label>
                        {/* Dropdown of preset serviced locations, plus an
                            'Others' escape hatch — picking it reveals a
                            free-text input below so guests outside
                            Mumbai/Mumbai Airport T2 can still submit a
                            pickup location manually. */}
                        <select required value={form.pickupCity} onChange={e=>patch('pickupCity',e.target.value)} onFocus={fiFocus} onBlur={fiBlur} style={fi}>
                          <option value="">Select pickup location…</option>
                          {Y2K_PICKUP_LOCATIONS.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                        </select>
                      </div>
                    </div>
                    {form.pickupCity==='Others'&&(
                      <div style={{ display:'flex', flexDirection:'column', gap:8, marginTop:18 }}>
                        <label style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color:Y.goldMuted }}>Enter Pickup Location *</label>
                        <input required type="text" placeholder="e.g. Pune, Nashik…" value={form.pickupCityOther} onChange={e=>patch('pickupCityOther',e.target.value)} onFocus={fiFocus} onBlur={fiBlur} style={fi}/>
                      </div>
                    )}
                    <div style={{ display:'flex', flexDirection:'column', gap:8, marginTop:18 }}>
                      <label style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color:Y.goldMuted }}>Pickup Address *</label>
                      <input required type="text" placeholder="House / Flat no., Street, Area" value={form.pickupAddress} onChange={e=>patch('pickupAddress',e.target.value)} onFocus={fiFocus} onBlur={fiBlur} style={fi}/>
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:8, marginTop:18 }}>
                      <label style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color:Y.goldMuted }}>Wedding Venue</label>
                      <input type="text" value={form.weddingVenue} readOnly style={{ ...fi, background:'#F1EBDD', color:Y.textBody, cursor:'default' }}/>
                    </div>
                    <div style={{ marginTop:18 }}>
                      <label style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color:Y.goldMuted }}>Preferred Pickup Time *</label>
                      {/* Same Morning/Afternoon/Evening slot picker as
                          Preferred Delivery Time (see TIME_SLOTS) instead
                          of a raw clock time — re-checked in nextStep()
                          and again server-side. */}
                      <div className="dt-slot-grid" style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginTop:8 }}>
                        {TIME_SLOTS.map(slot=>(
                          <button key={slot.id} type="button" onClick={()=>patch('pickupTime',slot.id)}
                            style={{ display:'flex', flexDirection:'column', gap:2, padding:'11px 12px', borderRadius:10, border:`1px solid ${form.pickupTime===slot.id?Y.gold:Y.border}`, cursor:'pointer', transition:'border-color 0.2s', background:form.pickupTime===slot.id?'#FBF3E4':'#fff', textAlign:'left' }}>
                            <span style={{ fontFamily:FONT_BODY, fontSize:11, fontWeight:700, color:form.pickupTime===slot.id?Y.goldMuted:Y.textDark }}>{slot.label}</span>
                            <span style={{ fontFamily:FONT_BODY, fontSize:10, color:Y.statLabel }}>{slot.range}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* ── Step 3: Luggage ── */}
                {step===3&&(
                  <>
                    <h3 style={{ fontFamily:FONT_DISPLAY, fontSize:26, color:Y.textDark, fontWeight:400, marginBottom:22 }}>Luggage Information</h3>
                    <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:18 }}>
                      <label style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color:Y.goldMuted }}>Number of Bags *</label>
                      <input required type="number" min={1} max={50} value={form.bags} onChange={e=>patch('bags',e.target.value)} onFocus={fiFocus} onBlur={fiBlur} style={fi}/>
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                      <label style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color:Y.goldMuted }}>Bag Type</label>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginTop:4 }}>
                        {['Cabin (Small)','Check-in (Medium)','Large Suitcase','Wedding Trunk','Sports Bag','Mixed Sizes'].map(size=>(
                          <button key={size} type="button" onClick={()=>patch('bagSize',size)}
                            style={{ padding:'8px 14px', borderRadius:999, border:`1px solid ${form.bagSize===size?Y.gold:Y.border}`, fontSize:11, cursor:'pointer', background:form.bagSize===size?'#FBF3E4':'#fff', transition:'all 0.2s', color:form.bagSize===size?Y.goldMuted:Y.textBody, fontWeight:form.bagSize===size?700:400, fontFamily:FONT_BODY }}>
                            {size}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:8, marginTop:18 }}>
                      <label style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color:Y.goldMuted }}>Special Instructions</label>
                      <textarea rows={3} placeholder="Fragile items, bridal wear, gifts…" value={form.specialInstructions} onChange={e=>patch('specialInstructions',e.target.value)} onFocus={fiFocus} onBlur={fiBlur} style={{ ...fi, height:'auto', padding:'14px 16px', resize:'vertical', lineHeight:1.6 }}/>
                    </div>
                  </>
                )}

                {/* ── Step 4: Delivery ── */}
                {step===4&&(
                  <>
                    <h3 style={{ fontFamily:FONT_DISPLAY, fontSize:26, color:Y.textDark, fontWeight:400, marginBottom:6 }}>Delivery Details</h3>
                    <p style={{ fontSize:13, color:Y.statLabel, marginBottom:20 }}>Your luggage will be delivered to <strong style={{ color:Y.textDark }}>Taj Aravali, Udaipur</strong> or your accommodation.</p>
                    <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:18 }}>
                      <label style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color:Y.goldMuted }}>Wedding Venue (Pre-Confirmed)</label>
                      <input type="text" readOnly value="Taj Aravali, Udaipur" style={{ ...fi, background:'#F1EBDD', color:Y.statLabel, cursor:'default' }}/>
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:18 }}>
                      <label style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color:Y.goldMuted }}>Hotel (if different)</label>
                      <input type="text" placeholder="e.g. Trident Udaipur" value={form.hotelName} onChange={e=>patch('hotelName',e.target.value)} onFocus={fiFocus} onBlur={fiBlur} style={fi}/>
                    </div>
                    <div>
                      <label style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color:Y.goldMuted }}>Preferred Delivery Time *</label>
                      <div className="dt-slot-grid" style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginTop:8 }}>
                        {TIME_SLOTS.map(slot=>(
                          <button key={slot.id} type="button" onClick={()=>patch('deliveryTime',slot.id)}
                            style={{ display:'flex', flexDirection:'column', gap:2, padding:'11px 12px', borderRadius:10, border:`1px solid ${form.deliveryTime===slot.id?Y.gold:Y.border}`, cursor:'pointer', transition:'border-color 0.2s', background:form.deliveryTime===slot.id?'#FBF3E4':'#fff', textAlign:'left' }}>
                            <span style={{ fontFamily:FONT_BODY, fontSize:11, fontWeight:700, color:form.deliveryTime===slot.id?Y.goldMuted:Y.textDark }}>{slot.label}</span>
                            <span style={{ fontFamily:FONT_BODY, fontSize:10, color:Y.statLabel }}>{slot.range}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {err&&<div style={{ background:'rgba(192,57,43,0.06)', border:'1px solid rgba(192,57,43,0.2)', borderRadius:10, padding:'10px 14px', marginTop:16, fontSize:12.5, color:Y.error }}>{err}</div>}

                {/* Navigation */}
                <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:22 }}>
                  {step>1
                    ? <button type="button" onClick={()=>setStep(s=>s-1)} style={{ fontFamily:FONT_BODY, fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', background:'transparent', border:`2px solid ${Y.border}`, borderRadius:12, color:Y.textBody, padding:'12px 20px', cursor:'pointer', transition:'border-color 0.2s' }}
                        onMouseEnter={e=>(e.currentTarget.style.borderColor=Y.gold)}
                        onMouseLeave={e=>(e.currentTarget.style.borderColor=Y.border)}>← Back</button>
                    : <span/>
                  }
                  <div style={{ flex:1 }}>
                    {step<4
                      ? <BtnSubmit onClick={nextStep}>Continue →</BtnSubmit>
                      : <BtnSubmit type="submit" disabled={busy}>{busy?'Submitting…':'Confirm Pickup · #Y2K'}</BtnSubmit>
                    }
                  </div>
                </div>

                <p style={{ fontFamily:FONT_BODY, fontSize:11.5, color:Y.statLabel, textAlign:'center', marginTop:16, lineHeight:1.7 }}>
                  No payment now · We&apos;ll call you to confirm ·{' '}
                  <a href="mailto:info@bagdrop.co" style={{ color:Y.goldMuted }}>info@bagdrop.co</a>
                </p>
              </form>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════ */}
      {/* 05 EVENT INFORMATION                                */}
      {/* ════════════════════════════════════════════════════ */}
      <section id="info" style={{ background:Y.beige, padding:'clamp(64px,10vw,120px) clamp(20px,5vw,56px)', scrollMarginTop:88 }}>
        <Reveal>
          <div style={{ textAlign:'center', marginBottom:48 }}>
            <Eyebrow>05 — The Details</Eyebrow>
            <h2 style={{ fontFamily:FONT_DISPLAY, fontWeight:400, fontSize:'clamp(32px,5.5vw,56px)', lineHeight:1.06, margin:'14px 0 0' }}>Everything you&apos;ll need</h2>
          </div>
        </Reveal>
        <div style={{ maxWidth:1120, margin:'0 auto', display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(230px,1fr))', gap:20 }}>
          {INFO_CARDS.map(c=>(
            <Reveal key={c.label}>
              <div className="wd-float-card" style={{ background:Y.creamCard, borderRadius:20, padding:30, border:`1px solid ${Y.borderCard}`, height:'100%' }}>
                <Eyebrow>{c.label}</Eyebrow>
                <h3 style={{ fontFamily:FONT_DISPLAY, fontWeight:500, fontSize:24, margin:'12px 0 6px', color:Y.textDark }}>{c.title}</h3>
                <p style={{ fontFamily:FONT_BODY, fontSize:14, lineHeight:1.7, color:Y.textBody, margin:0, whiteSpace:'pre-line' }}>{c.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ════════════════════════════════════════════════════ */}
      {/* STATS BANNER                                        */}
      {/* ════════════════════════════════════════════════════ */}
      <section style={{ position:'relative', padding:'80px 0', overflow:'hidden' }}>
        <div style={{ position:'absolute', inset:0, backgroundImage:'url(https://images.unsplash.com/photo-1583939003579-730e3918a45a?w=1920&q=80&auto=format&fit=crop)', backgroundSize:'cover', backgroundPosition:'center' }}/>
        <div style={{ position:'absolute', inset:0, background:'rgba(20,16,10,0.7)' }}/>
        <div style={{ position:'relative', zIndex:2, textAlign:'center', maxWidth:1170, margin:'0 auto', padding:'0 15px' }}>
          <Reveal>
            <p style={{ fontFamily:FONT_BODY, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.2em', color:'rgba(244,238,228,0.55)', marginBottom:18 }}>Trusted by Couples Across India</p>
            <h2 style={{ fontFamily:FONT_DISPLAY, fontSize:'clamp(30px,4.5vw,50px)', color:'#fff', fontWeight:400, lineHeight:1.15, margin:'0 0 6px' }}>Stress-free destination</h2>
            <p style={{ fontFamily:FONT_DISPLAY, fontSize:'clamp(26px,4vw,46px)', fontStyle:'italic', color:Y.goldLight, fontWeight:400, margin:'0 0 48px', lineHeight:1.15 }}>weddings, delivered</p>
            <div className="stats-grid" style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'32px 20px', maxWidth:900, margin:'0 auto' }}>
              {([
                { to:150,  suffix:'+',   label:'Guests Managed This Wedding' },
                { to:200,  suffix:'+',   label:'Bags Managed This Wedding' },
                { to:null, text:'Pan India', label:'Pickup Coverage Across India' },
                { to:null, text:'24/7',      label:'Dedicated Wedding Support' },
              ] as { to:number|null; suffix?:string; text?:string; label:string }[]).map(({ to, suffix, text, label }) => (
                <div key={label}>
                  <p style={{ fontFamily:FONT_DISPLAY, fontSize:'clamp(28px,3.5vw,44px)', color:Y.goldLight, fontWeight:400, margin:'0 0 10px', lineHeight:1 }}>
                    {to !== null ? <CountUp to={to} suffix={suffix??''} /> : text}
                  </p>
                  <p style={{ fontFamily:FONT_BODY, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em', color:'rgba(244,238,228,0.65)', lineHeight:1.55 }}>{label}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════ */}
      {/* ABOUT / VENUE BLOCK                                 */}
      {/* ════════════════════════════════════════════════════ */}
      <section style={{ padding:'80px 0', background:Y.cream }}>
        <div style={{ maxWidth:1170, margin:'0 auto', padding:'0 15px' }}>
          <Reveal>
            <div className="venue-grid" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:72, alignItems:'center' }}>
              <div>
                <Eyebrow>Find your ease</Eyebrow>
                <h2 style={{ fontFamily:FONT_DISPLAY, fontSize:'clamp(28px,4vw,44px)', lineHeight:1.1, color:Y.textDark, fontWeight:400, margin:'16px 0 30px' }}>
                  We Handle Everything<br/><span style={{ fontStyle:'italic' }}>For Your Happy Journey</span>
                </h2>
                {[
                  { title:'Airport Delivery',      desc:'Pickup from airport, delivered to your door.' },
                  { title:'Excess Baggage',        desc:'Ship it cheaper than the airline charges.' },
                  { title:'Door-to-Door',          desc:'From your home to any destination.' },
                  { title:'Destination Weddings',  desc:'White-glove handling for your big day.' },
                  { title:'Corporate Travel',      desc:'Volume rates and dedicated support.' },
                  { title:'Student Relocation',    desc:'Skip the airline fees when you move.' },
                ].map(({ title, desc }) => (
                  <div key={title} style={{ display:'flex', alignItems:'flex-start', gap:14, marginBottom:20 }}>
                    <div style={{ flexShrink:0, width:38, height:38, borderRadius:'50%', background:'rgba(200,169,110,0.14)', display:'flex', alignItems:'center', justifyContent:'center', marginTop:2 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={Y.goldMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="7" width="20" height="14" rx="2"/>
                        <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
                        <line x1="12" y1="12" x2="12" y2="16"/>
                        <line x1="10" y1="14" x2="14" y2="14"/>
                      </svg>
                    </div>
                    <div>
                      <p style={{ fontFamily:FONT_BODY, fontSize:15, fontWeight:700, color:Y.textDark, margin:'0 0 2px' }}>{title}</p>
                      <p style={{ fontSize:13, color:Y.textBody, margin:0, lineHeight:1.6 }}>{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ overflow:'hidden', borderRadius:20 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/y2k-palace.jpg"
                  alt="Taj Aravali, Udaipur"
                  className="venue-img"
                  style={{ width:'100%', height:380, objectFit:'cover', display:'block', transition:'transform 0.6s ease' }}
                  onMouseEnter={e=>(e.currentTarget.style.transform='scale(1.03)')}
                  onMouseLeave={e=>(e.currentTarget.style.transform='scale(1)')}/>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════ */}
      {/* COUNTDOWN BANNER                                    */}
      {/* ════════════════════════════════════════════════════ */}
      <section style={{ position:'relative', padding:'80px 0', overflow:'hidden' }}>
        <div style={{ position:'absolute', inset:0, backgroundImage:'url(/images/y2k-palace.jpg)', backgroundSize:'cover', backgroundPosition:'center' }}/>
        <div style={{ position:'absolute', inset:0, background:'rgba(17,17,17,0.72)' }}/>
        <div style={{ maxWidth:1170, margin:'0 auto', padding:'0 15px', position:'relative', zIndex:2 }}>
          <div style={{ maxWidth:700, margin:'0 auto', textAlign:'center' }}>
            <Reveal>
              <p style={{ fontFamily:FONT_DISPLAY, fontSize:'clamp(24px,3.5vw,36px)', fontStyle:'italic', color:Y.goldLight, textAlign:'center', margin:'0 0 16px' }}>17th–18th December 2026</p>
              <h2 style={{ fontFamily:FONT_DISPLAY, fontSize:'clamp(32px,5vw,52px)', lineHeight:1.1, color:'#fff', fontWeight:400, margin:'16px 0 32px' }}>
                Hurry Up To<br/><span style={{ fontStyle:'italic' }}>Book Your Concierge</span>
              </h2>
              {cd.ready&&(
                <div style={{ display:'flex', gap:20, justifyContent:'center', marginBottom:36, flexWrap:'wrap' }}>
                  <CountdownBlock v={cd.d} l="Days" light/>
                  <CountdownBlock v={cd.h} l="Hours" light/>
                  <CountdownBlock v={cd.m} l="Mins" light/>
                  <CountdownBlock v={cd.s} l="Secs" light/>
                </div>
              )}
              <PillButton onClick={()=>document.getElementById('book')?.scrollIntoView({behavior:'smooth'})} variant="gold">
                Book Your Concierge
              </PillButton>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════ */}
      {/* FOOTER                                              */}
      {/* ════════════════════════════════════════════════════ */}
      <footer style={{ background:Y.darkerGreen, color:Y.beige, padding:'clamp(64px,10vw,100px) clamp(20px,5vw,56px) 40px', textAlign:'center' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/bagdrop-logo.png" alt="Bagdrop" style={{ display:'block', margin:'0 auto 32px', height:'clamp(48px,8vw,64px)', width:'auto', filter:'brightness(0) invert(1)', opacity:0.92 }}/>
        <div style={{ fontFamily:FONT_DISPLAY, fontSize:'clamp(36px,7vw,68px)', lineHeight:1, display:'flex', alignItems:'center', justifyContent:'center', gap:18, flexWrap:'wrap' }}>
          <span style={{ fontStyle:'italic' }}>Yashna</span>
          <span style={{ width:8, height:8, borderRadius:'50%', background:Y.gold }}/>
          <span style={{ fontStyle:'italic' }}>Yash</span>
        </div>
        <p style={{ fontFamily:FONT_BODY, fontSize:12, letterSpacing:'0.3em', textTransform:'uppercase', margin:'22px 0 0', color:'rgba(237,229,214,0.7)' }}>17 &amp; 18 December 2026 · Udaipur</p>
        <p style={{ fontFamily:FONT_BODY, fontSize:14, letterSpacing:'0.2em', textTransform:'uppercase', margin:'8px 0 0', color:Y.gold }}>#Y2K</p>

        <div className="footer-grid" style={{ marginTop:56, paddingTop:36, borderTop:'1px solid rgba(237,229,214,0.12)', display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:32, textAlign:'left', maxWidth:1000, marginLeft:'auto', marginRight:'auto' }}>
          <div>
            <p style={{ fontFamily:FONT_BODY, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.14em', color:Y.gold, margin:'0 0 12px' }}>Reach Us</p>
            <a href="tel:+916357115711" style={{ display:'block', fontFamily:FONT_BODY, fontSize:14, color:'rgba(237,229,214,0.8)', textDecoration:'none', marginBottom:6 }}>+91 63571 15711</a>
            <a href="mailto:info@bagdrop.co" style={{ display:'block', fontFamily:FONT_BODY, fontSize:14, color:'rgba(237,229,214,0.8)', textDecoration:'none' }}>info@bagdrop.co</a>
          </div>
          <div>
            <p style={{ fontFamily:FONT_BODY, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.14em', color:Y.gold, margin:'0 0 12px' }}>Coverage</p>
            <p style={{ fontFamily:FONT_BODY, fontSize:14, color:'rgba(237,229,214,0.65)', lineHeight:1.8, margin:0 }}>Mumbai · Delhi · Ahmedabad<br/>Udaipur · Goa · Bangalore</p>
          </div>
          <div>
            <p style={{ fontFamily:FONT_BODY, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.14em', color:Y.gold, margin:'0 0 12px' }}>Follow Us</p>
            <div className="footer-social" style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
              <a href="https://www.instagram.com/bagdropofficial" target="_blank" rel="noopener noreferrer" style={{ fontFamily:FONT_BODY, fontSize:14, color:'rgba(237,229,214,0.8)', textDecoration:'none' }}>Instagram</a>
              <a href="https://wa.me/916357115711" target="_blank" rel="noopener noreferrer" style={{ fontFamily:FONT_BODY, fontSize:14, color:'rgba(237,229,214,0.8)', textDecoration:'none' }}>WhatsApp</a>
              <a href="https://www.facebook.com/profile.php?id=61579334791456" target="_blank" rel="noopener noreferrer" style={{ fontFamily:FONT_BODY, fontSize:14, color:'rgba(237,229,214,0.8)', textDecoration:'none' }}>Facebook</a>
            </div>
          </div>
        </div>

        <div style={{ marginTop:36, paddingTop:24, borderTop:'1px solid rgba(237,229,214,0.1)', fontFamily:FONT_BODY, fontSize:12, color:'rgba(237,229,214,0.45)' }}>
          © 2026 <a href="/" style={{ color:'inherit' }}>Bagdrop</a> · India&apos;s Premium Wedding Luggage Concierge · <a href="/privacy" style={{ color:'inherit' }}>Privacy Policy</a>
        </div>
      </footer>

    </div>
  )
}
