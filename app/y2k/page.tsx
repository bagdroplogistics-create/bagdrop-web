'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

// ─────────────────────────────────────────────────────────────
// WEDDING DETAILS
// ─────────────────────────────────────────────────────────────
const WEDDING_DATE = new Date('2026-12-17T00:00:00+05:30')

// ─────────────────────────────────────────────────────────────
// DESIGN TOKENS
// ─────────────────────────────────────────────────────────────
const J = {
  pink:      '#ec9dab',
  pinkDark:  '#d4798a',
  pinkLight: '#f5d5dc',
  black:     '#111111',
  body:      '#555555',
  muted:     '#888888',
  border:    'rgba(17,17,17,0.1)',
  bg:        '#ffffff',
  bgLight:   '#f8f8fa',
  dark:      '#0e0608',
}

// ─────────────────────────────────────────────────────────────
// HERO SLIDES
// ─────────────────────────────────────────────────────────────
const HERO_SLIDES = [
  {
    bg:   '/images/wedding-slide1.jpg',
    label:'OFFICIAL WEDDING LUGGAGE PARTNER',
    loc:  'Taj Lake Palace · Udaipur · December 2026',
    h1a:  'Arrive Stress-Free.',
    h1b:  'Celebrate Fully.',
    sub:  "Exclusive luggage delivery service for Yashna & Yash's destination wedding. We collect from your city — your bags arrive at the palace before you do.",
  },
  {
    bg:   '/images/wedding-slide2.jpg',
    label:'OFFICIAL WEDDING LUGGAGE PARTNER',
    loc:  'Taj Lake Palace · Udaipur · December 2026',
    h1a:  'Premium Concierge for',
    h1b:  'Weddings & Events.',
    sub:  'We pick up from your doorstep across India and deliver directly to the venue — before you arrive.',
  },
  {
    bg:   '/images/wedding-slide.jpg',
    label:'OFFICIAL WEDDING LUGGAGE PARTNER',
    loc:  'Taj Lake Palace · Udaipur · December 2026',
    h1a:  'We Handle the Bags.',
    h1b:  'You Make Memories.',
    sub:  'White-glove baggage handling for every guest joining Yashna & Yash at Taj Lake Palace, Udaipur.',
  },
]

const FEATURES = [
  { icon:'🧳', title:'Door-to-Door',     desc:'Picked up and delivered right to your hotel or venue.' },
  { icon:'🔒', title:'Safe & Secured',   desc:'Photographed, sealed, and insured at pickup.' },
  { icon:'📲', title:'WhatsApp Updates', desc:'Real-time updates from pickup to palace delivery.' },
  { icon:'📞', title:'We Call You Back',  desc:'Our team will call you shortly to confirm your booking.' },
]

// ─────────────────────────────────────────────────────────────
// SVG ICON
// ─────────────────────────────────────────────────────────────
function CirclesIcon({ size = 20 }: { size?: number }) {
  return (
    <span style={{ display:'inline-block', width:size, height:size, margin:'0 8px', verticalAlign:'middle' }}>
      <svg viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg" width={size} height={size}>
        <circle cx="15" cy="15" r="13" stroke="#ec9dab" strokeWidth="1.4"/>
        <circle cx="15" cy="15" r="7"  stroke="#ec9dab" strokeWidth="1.4"/>
        <circle cx="15" cy="15" r="2"  fill="#ec9dab"/>
        <circle cx="15" cy="1"  r="1.5" fill="#ec9dab"/>
        <circle cx="15" cy="29" r="1.5" fill="#ec9dab"/>
        <circle cx="1"  cy="15" r="1.5" fill="#ec9dab"/>
        <circle cx="29" cy="15" r="1.5" fill="#ec9dab"/>
      </svg>
    </span>
  )
}

function Suptitle({ children, center=false, light=false }: { children: string; center?: boolean; light?: boolean }) {
  return (
    <p style={{
      fontFamily:'Montserrat,sans-serif',
      fontWeight:600, fontSize:14, lineHeight:'170%',
      textTransform:'uppercase',
      color: light ? 'rgba(236,157,171,0.85)' : J.pink,
      margin:'0 0 16px',
      textAlign: center ? 'center' : 'left',
    }}>
      {children}<CirclesIcon size={18}/>
    </p>
  )
}

function BtnDefault({ children, href, onClick, light=false }: { children: React.ReactNode; href?: string; onClick?: () => void; light?: boolean }) {
  const style: React.CSSProperties = {
    display:'inline-block',
    fontFamily:'Montserrat,sans-serif',
    fontWeight:500, fontSize:12,
    textTransform:'uppercase',
    color: light ? '#fff' : J.black,
    padding:'0.9em 2.8em',
    borderTop: `2px solid ${light ? '#fff' : J.black}`,
    borderBottom: `2px solid ${light ? '#fff' : J.black}`,
    borderLeft:'2px solid transparent',
    borderRight:'2px solid transparent',
    textDecoration:'none',
    cursor:'pointer',
    background:'transparent',
    transition:'all 0.25s ease',
    letterSpacing:'0.5px',
  }
  if (href) return <a href={href} style={style}
    onMouseEnter={e=>{(e.currentTarget as HTMLAnchorElement).style.borderColor=light?'rgba(255,255,255,0.5)':J.pink;(e.currentTarget as HTMLAnchorElement).style.color=light?'rgba(255,255,255,0.7)':J.pink}}
    onMouseLeave={e=>{(e.currentTarget as HTMLAnchorElement).style.borderColor=light?'#fff':J.black;(e.currentTarget as HTMLAnchorElement).style.color=light?'#fff':J.black}}>{children}</a>
  return <button onClick={onClick} style={style}
    onMouseEnter={e=>{(e.currentTarget as HTMLButtonElement).style.borderColor=J.pink;(e.currentTarget as HTMLButtonElement).style.color=J.pink}}
    onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.borderColor=J.black;(e.currentTarget as HTMLButtonElement).style.color=J.black}}>{children}</button>
}

function BtnSubmit({ children, onClick, disabled=false, type='button' }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; type?: 'button'|'submit' }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{
      display:'inline-flex', alignItems:'center', justifyContent:'center',
      minHeight:50, padding:'10px 40px',
      background: disabled ? '#d4b0b8' : J.pink,
      fontFamily:'Montserrat,sans-serif', fontWeight:600, fontSize:12,
      textTransform:'uppercase', color:'#fff',
      border:'none', cursor: disabled ? 'not-allowed' : 'pointer',
      transition:'background 0.2s ease', letterSpacing:'0.5px',
      width:'100%',
    }}
    onMouseEnter={e=>{ if (!disabled) (e.currentTarget as HTMLButtonElement).style.background=J.pinkDark }}
    onMouseLeave={e=>{ if (!disabled) (e.currentTarget as HTMLButtonElement).style.background=J.pink }}>
      {children}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────
// FALLING PETALS
// ─────────────────────────────────────────────────────────────
function FallingPetals() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef    = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const cvs = canvas as HTMLCanvasElement
    const ctx = cvs.getContext('2d')!

    const resize = () => { cvs.width = cvs.offsetWidth; cvs.height = cvs.offsetHeight }
    resize()
    window.addEventListener('resize', resize)

    const COLORS = [
      'rgba(236,157,171,0.85)','rgba(220,130,148,0.75)',
      'rgba(245,185,198,0.8)','rgba(210,110,135,0.7)','rgba(255,210,220,0.9)',
    ]

    type Petal = { x:number; y:number; w:number; h:number; rot:number; rotSpeed:number; xSpeed:number; ySpeed:number; swayAmp:number; swayFreq:number; tick:number; color:string; opacity:number }

    function makePetal(fromTop=false): Petal {
      return { x:Math.random()*cvs.width, y:fromTop?-20-Math.random()*cvs.height*0.4:Math.random()*cvs.height,
        w:8+Math.random()*10, h:4+Math.random()*5, rot:Math.random()*Math.PI*2,
        rotSpeed:(Math.random()-0.5)*0.04, xSpeed:(Math.random()-0.5)*0.6,
        ySpeed:0.8+Math.random()*1.4, swayAmp:20+Math.random()*30,
        swayFreq:0.012+Math.random()*0.018, tick:Math.random()*200,
        color:COLORS[Math.floor(Math.random()*COLORS.length)], opacity:0.55+Math.random()*0.45 }
    }

    const petals: Petal[] = []
    for (let i=0;i<28;i++) petals.push(makePetal(false))

    function drawPetal(p: Petal) {
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot); ctx.globalAlpha=p.opacity
      ctx.beginPath(); ctx.ellipse(0,0,p.w,p.h,0,0,Math.PI*2); ctx.fillStyle=p.color; ctx.fill()
      ctx.beginPath(); ctx.ellipse(p.w*0.15,-p.h*0.1,p.w*0.45,p.h*0.38,-0.3,0,Math.PI*2); ctx.fillStyle='rgba(255,255,255,0.25)'; ctx.fill()
      ctx.restore()
    }

    function frame() {
      ctx.clearRect(0,0,cvs.width,cvs.height)
      for (const p of petals) {
        p.tick++; p.rot+=p.rotSpeed; p.y+=p.ySpeed; p.x+=p.xSpeed+Math.sin(p.tick*p.swayFreq)*0.9
        drawPetal(p)
        if (p.y>cvs.height+20) Object.assign(p,makePetal(true))
      }
      rafRef.current=requestAnimationFrame(frame)
    }

    rafRef.current=requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener('resize',resize) }
  }, [])

  return <canvas ref={canvasRef} aria-hidden="true" style={{ position:'absolute',inset:0,width:'100%',height:'100%',zIndex:5,pointerEvents:'none' }}/>
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

// ─────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────
export default function Y2KPage() {
  const cd = useCountdown(WEDDING_DATE)
  const [slide, setSlide] = useState(0)
  const [step, setStep]   = useState(1)
  const [form, setForm]   = useState({ name:'', phone:'', email:'', pickupCity:'', pickupAddress:'', pickupDate:'', pickupTime:'', weddingVenue:'Taj Lake Palace, Udaipur', bags:'1', bagSize:'', specialInstructions:'', hotelName:'', roomNumber:'', deliveryTime:'' })
  const [busy, setBusy]   = useState(false)
  const [done, setDone]   = useState(false)
  const [trackId, setTrackId] = useState('')
  const [err, setErr]     = useState('')

  useEffect(() => {
    const id=setInterval(()=>setSlide(s=>(s+1)%HERO_SLIDES.length),5000)
    return()=>clearInterval(id)
  },[])

  function patch(k: keyof typeof form, v: string) { setForm(p=>({...p,[k]:v})); setErr('') }

  function nextStep() {
    if (step===1) {
      const d=form.phone.replace(/\D/g,'')
      if (!form.name.trim()) { setErr('Please enter your full name.'); return }
      if (!/^[6-9]\d{9}$/.test(d)) { setErr('Enter a valid 10-digit Indian mobile number.'); return }
    }
    if (step===2&&!form.pickupCity.trim()) { setErr('Please enter your pickup city.'); return }
    if (step===2&&!form.pickupAddress.trim()) { setErr('Please enter your pickup address.'); return }
    if (step===2&&!form.pickupDate) { setErr('Please select a pickup date.'); return }
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
      const res=await fetch('/api/y2k/inquiry',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          name:form.name, phone:digits, email:form.email,
          bags:form.bags, guests:'1',
          pickupAddress:`${form.pickupAddress}, ${form.pickupCity}`,
          pickupTime:form.pickupTime||form.deliveryTime,
          deliveryAddress:form.weddingVenue||'Taj Lake Palace, Udaipur',
          requests:[
            form.bagSize?`Bag size: ${form.bagSize}`:'',
            form.hotelName?`Hotel: ${form.hotelName}${form.roomNumber?', Room '+form.roomNumber:''}`:'',
            form.deliveryTime?`Delivery slot: ${form.deliveryTime}`:'',
            form.specialInstructions,
          ].filter(Boolean).join(' · '),
          arrivalDate:form.pickupDate,
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

  const DELIVERY_TIMES = [
    {id:'morning',  label:'Morning',   range:'6 AM – 12 PM', icon:'🌅'},
    {id:'afternoon',label:'Afternoon', range:'12 PM – 5 PM', icon:'☀️'},
    {id:'evening',  label:'Evening',   range:'5 PM – 9 PM',  icon:'🌆'},
    {id:'night',    label:'Night',     range:'9 PM – 6 AM',  icon:'🌙'},
  ]

  const fi: React.CSSProperties = { fontFamily:'Montserrat,sans-serif', fontSize:14, color:J.black, background:'#fff', border:`1px solid ${J.border}`, padding:'12px 16px', width:'100%', outline:'none', borderBottom:`1px solid rgba(85,85,85,0.3)`, borderTop:'none', borderLeft:'none', borderRight:'none', borderRadius:0, transition:'border-color 0.2s' }

  // ── Thank-you ──────────────────────────────────────────────
  if (done) return (
    <div style={{ minHeight:'100vh', background:'#1a0a12', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'48px 24px', textAlign:'center', fontFamily:'Montserrat,sans-serif' }}>
      <style dangerouslySetInnerHTML={{__html:`@import url('https://fonts.googleapis.com/css2?family=Sulphur+Point:wght@300;400;700&family=Montserrat:wght@300;400;500;600;700&display=swap'); @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}} .ty{animation:fadeUp 0.8s ease forwards}`}}/>
      <div className="ty" style={{ maxWidth:520 }}>
        <p style={{ fontSize:64, marginBottom:16 }}>💍</p>
        <p style={{ fontFamily:'Sulphur Point,sans-serif', fontSize:'clamp(48px,10vw,72px)', color:J.pink, margin:'0 0 12px', lineHeight:1 }}>Thank You!</p>
        <p style={{ fontSize:16, color:'rgba(255,255,255,0.65)', lineHeight:1.8, marginBottom:20 }}>Your Wedding Luggage Concierge request for <strong style={{color:'#fff'}}>Yashna & Yash · #Y2K</strong> has been received. Our team will call you shortly to confirm your slot.</p>
        {trackId&&<div style={{ border:`1px solid ${J.pink}`, padding:'16px 32px', display:'inline-block', marginBottom:20 }}><p style={{ fontFamily:'Sulphur Point,sans-serif', fontSize:28, color:J.pink, margin:0 }}>{trackId}</p><p style={{ fontSize:11, color:'rgba(255,255,255,0.4)', margin:'4px 0 0', textTransform:'uppercase', letterSpacing:'0.2em' }}>Your Reference</p></div>}
        <p style={{ fontFamily:'Sulphur Point,sans-serif', fontSize:48, color:J.pink, margin:'8px 0 4px' }}>#Y2K</p>
        <p style={{ fontSize:11, color:'rgba(255,255,255,0.3)', textTransform:'uppercase', letterSpacing:'0.2em' }}>Tag your wedding journey</p>
        <div style={{ marginTop:40, display:'flex', flexWrap:'wrap', gap:16, justifyContent:'center' }}>
          <button onClick={()=>{ setDone(false);setStep(1);setForm({name:'',phone:'',email:'',pickupCity:'',pickupAddress:'',pickupDate:'',pickupTime:'',weddingVenue:'Taj Lake Palace, Udaipur',bags:'1',bagSize:'',specialInstructions:'',hotelName:'',roomNumber:'',deliveryTime:''});setTrackId('') }}
            style={{ fontFamily:'Montserrat,sans-serif', fontWeight:600, fontSize:12, textTransform:'uppercase', letterSpacing:'0.5px', background:J.pink, color:'#fff', border:'none', padding:'14px 32px', cursor:'pointer' }}>
            Book Another Guest
          </button>
          <a href="/y2k" style={{ fontFamily:'Montserrat,sans-serif', fontWeight:600, fontSize:12, textTransform:'uppercase', letterSpacing:'0.5px', background:'transparent', color:'rgba(255,255,255,0.55)', borderTop:'2px solid rgba(255,255,255,0.3)', borderBottom:'2px solid rgba(255,255,255,0.3)', borderLeft:'2px solid transparent', borderRight:'2px solid transparent', padding:'12px 32px', textDecoration:'none', display:'inline-block' }}>
            ← Back to Landing Page
          </a>
        </div>
      </div>
    </div>
  )

  return (
    <div style={{ fontFamily:'Montserrat,sans-serif', background:J.bg, color:J.black, overflowX:'hidden' }}>

      {/* ══ GLOBAL CSS ════════════════════════════════════════ */}
      <style dangerouslySetInnerHTML={{__html:`
        @import url('https://fonts.googleapis.com/css2?family=Sulphur+Point:wght@300;400;700&family=Montserrat:wght@300;400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
        @keyframes heroSlide { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.25} }
        .hero-slide-in { animation:heroSlide 0.9s ease forwards; display:flex; flex-direction:column; align-items:center; text-align:center; width:100%; }

        .header-top { background:#111111; padding:9px 15px; display:flex; align-items:center; justify-content:center; }
        .header-main { border-bottom:1px solid rgba(17,17,17,0.1); padding:0 15px; }
        .header-inner { max-width:1170px; margin:0 auto; display:flex; align-items:center; justify-content:space-between; height:120px; gap:24px; }
        .header-nav { display:flex; gap:36px; list-style:none; }
        .header-nav a { font-size:15px; font-weight:600; color:#111; text-decoration:none; text-transform:uppercase; letter-spacing:0.6px; transition:color 0.2s; }
        .header-nav a:hover { color:${J.pink}; }
        .header-logo { display:flex; align-items:center; text-decoration:none; }
        .header-logo img { height:116px; width:auto; display:inline-block; }

        .container { max-width:1170px; margin:0 auto; padding:0 15px; }

        .promo-slider { position:relative; height:78vh; min-height:560px; overflow:hidden; }
        .promo-slide  { position:absolute; inset:0; transition:opacity 0.9s ease; }
        .promo-slide.active { opacity:1; z-index:1; }
        .promo-slide.inactive { opacity:0; z-index:0; }
        .promo-slide__bg { position:absolute; inset:0; background-size:cover; background-position:center; }
        .promo-slide__overlay { position:absolute; inset:0; background:rgba(14,6,8,0.62); }
        .promo-slide__content { position:relative; z-index:2; max-width:1170px; margin:0 auto; padding:0 15px; height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; }
        .promo-slide__badge { display:inline-flex; align-items:center; gap:6px; border:1.5px solid #d4a843; border-radius:30px; padding:5px 16px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:1.5px; color:#d4a843; margin-bottom:14px; }
        .promo-slide__loc { font-family:'Montserrat',sans-serif; font-size:14px; color:rgba(255,255,255,0.6); letter-spacing:0.5px; margin-bottom:18px; }
        .promo-slide__h1 { font-family:'Georgia',serif; font-size:clamp(62px,8.5vw,108px); line-height:105%; color:#fff; font-weight:400; margin-bottom:20px; text-align:center; }
        .promo-slide__h1 em { font-style:italic; font-weight:400; display:block; }
        .promo-slide__h1 em.em-gold { color:#d4a843; }
        .promo-slide__sub { font-size:17px; line-height:170%; color:rgba(255,255,255,0.8); margin-bottom:22px; max-width:560px; }
        .hero-couple-card { display:inline-flex; flex-direction:column; gap:5px; background:rgba(14,6,8,0.72); border:1px solid rgba(212,168,67,0.35); border-radius:14px; padding:12px 24px; margin-bottom:26px; align-items:center; }
        .hero-couple-name { font-family:'Sulphur Point',sans-serif; font-size:16px; color:#fff; font-weight:700; }
        .hero-couple-name .nc-hashtag { color:#d4a843; }
        .hero-couple-meta { font-size:12px; color:rgba(255,255,255,0.62); }
        .hero-date-highlight { background:rgba(212,168,67,0.18); border:1px solid rgba(212,168,67,0.5); border-radius:6px; padding:2px 8px; color:#d4a843; font-weight:700; font-size:12px; letter-spacing:0.3px; }
        .hero-cta-row { display:flex; gap:14px; align-items:center; justify-content:center; flex-wrap:wrap; }

        .logos-bar { border-top:1px solid rgba(17,17,17,0.08); border-bottom:1px solid rgba(17,17,17,0.08); padding:18px 0; }
        .logos-inner { max-width:1170px; margin:0 auto; padding:0 15px; display:flex; align-items:center; justify-content:space-around; flex-wrap:wrap; gap:16px; }
        .logo-badge { font-family:'Sulphur Point',sans-serif; font-size:16px; font-weight:900; color:rgba(17,17,17,0.88); letter-spacing:0.5px; text-transform:uppercase; }

        /* ── BOOKING SECTION ── */
        .book-section { background:#f2eff0; padding:80px 15px; }
        .book-grid { max-width:1100px; margin:0 auto; display:grid; grid-template-columns:1fr 1fr; box-shadow:0 24px 80px rgba(14,6,8,0.13); overflow:hidden; border-radius:6px; }
        .book-left { background:${J.dark}; padding:56px 48px; display:flex; flex-direction:column; justify-content:center; position:relative; overflow:hidden; }
        .book-right { background:#faf7f8; padding:56px 48px; display:flex; flex-direction:column; justify-content:center; }
        .book-form-card { background:#fff; padding:40px; border:1px solid rgba(17,17,17,0.08); box-shadow:0 8px 40px rgba(17,17,17,0.06); }

        .step-indicator { display:flex; align-items:center; gap:0; margin-bottom:32px; }
        .step-pip { display:flex; flex-direction:column; align-items:center; gap:6px; }
        .step-pip-num { width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; transition:all 0.3s; }
        .step-pip-label { font-size:9px; text-transform:uppercase; letter-spacing:0.8px; font-weight:600; white-space:nowrap; transition:color 0.3s; }
        .step-line { flex:1; height:1px; margin:0 4px 18px; transition:background 0.3s; min-width:16px; }

        .fld { display:flex; flex-direction:column; gap:8px; margin-bottom:18px; }
        .fld label { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.8px; color:${J.muted}; }
        .form-grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
        .bag-pill { padding:8px 14px; border:1px solid ${J.border}; font-size:11px; cursor:pointer; background:#fff; transition:all 0.2s; margin:0; font-family:'Montserrat',sans-serif; }
        .bag-pill.active { border-color:${J.pink}; color:${J.pink}; }
        .dt-slot { display:flex; align-items:center; gap:10px; padding:11px 14px; border:1px solid ${J.border}; cursor:pointer; transition:border-color 0.2s; background:#fff; text-align:left; }
        .dt-slot.active { border-color:${J.pink}; }
        .form-error { background:rgba(220,38,38,0.05); border:1px solid rgba(220,38,38,0.2); padding:10px 14px; margin-top:12px; font-size:12px; color:#DC2626; }
        .form-actions { display:flex; align-items:center; gap:12px; margin-top:16px; }

        .countdown { display:flex; gap:12px; align-items:flex-start; flex-wrap:wrap; }
        .countdown-unit { text-align:center; min-width:56px; }
        .countdown-num { font-family:'Sulphur Point',sans-serif; font-size:clamp(32px,4vw,52px); line-height:1; color:#fff; display:block; }
        .countdown-label { font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:1.5px; color:rgba(255,255,255,0.4); margin-top:6px; }
        .countdown-sep { font-family:'Sulphur Point',sans-serif; font-size:36px; color:rgba(255,255,255,0.25); line-height:1; margin-top:8px; animation:blink 1s step-end infinite; }

        .gift-banner { position:relative; padding:80px 0; overflow:hidden; }
        .gift-banner__bg { position:absolute; inset:0; background-size:cover; background-position:center; background-attachment:fixed; }
        .gift-banner__overlay { position:absolute; inset:0; background:rgba(17,17,17,0.72); }
        .gift-banner__content { position:relative; z-index:2; max-width:700px; margin:0 auto; text-align:center; }
        .gift-banner__h2 { font-family:'Georgia',serif; font-size:clamp(36px,5.5vw,60px); line-height:110%; color:#fff; font-weight:400; margin:16px 0 32px; }
        .gift-banner__h2 em { font-style:italic; font-weight:400; }
        .countdown { justify-content:center; }

        .footer { background:${J.pinkLight}; }
        .footer__bg { display:none; }
        .footer__overlay { display:none; }
        .footer__inner { position:relative; z-index:2; max-width:1170px; margin:0 auto; padding:72px 15px 40px; display:grid; grid-template-columns:1.4fr 1fr 1fr; gap:60px; }
        .footer__logo { display:block; margin-bottom:20px; }
        .footer__logo img { height:110px; width:auto; display:block; }
        .footer__label { font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:${J.dark}; margin-bottom:14px; }
        .footer__text { font-size:14px; font-weight:500; color:rgba(14,6,8,0.72); line-height:1.85; }
        .footer__link { font-size:14px; font-weight:600; color:rgba(14,6,8,0.7); text-decoration:none; display:block; margin-bottom:8px; transition:color 0.2s; }
        .footer__link:hover { color:${J.pinkDark}; }
        .footer__newsletter { display:flex; border-bottom:1px solid rgba(14,6,8,0.2); margin-top:8px; }
        .footer__bottom { position:relative; z-index:2; border-top:1px solid rgba(14,6,8,0.1); text-align:center; padding:20px 15px; }
        .footer__copy { font-size:13px; font-weight:500; color:rgba(14,6,8,0.55); }
        .footer__copy a { color:rgba(14,6,8,0.55); text-decoration:none; }
        .footer__copy a:hover { color:${J.pinkDark}; }

        @media (max-width:900px) {
          .book-section { padding:48px 12px; }
          .book-grid { grid-template-columns:1fr !important; }
          .book-left { padding:48px 28px !important; order:2; }
          .book-right { padding:40px 20px !important; order:1; }
          .footer__inner { grid-template-columns:1fr !important; gap:40px; }
        }
        @media (max-width:640px) {
          .book-section { padding:32px 10px; }
          .book-form-card { padding:24px 18px !important; }
          .form-grid-2 { grid-template-columns:1fr !important; }
          .book-left { padding:36px 20px !important; }
        }
      `}}/>

      {/* ════════════════════════════════════════════════════ */}
      {/* HEADER                                              */}
      {/* ════════════════════════════════════════════════════ */}
      <header style={{ position:'sticky', top:0, zIndex:200, background:'#fff' }}>
        <div className="header-top">
          <span style={{ fontFamily:'Montserrat,sans-serif', fontSize:12, color:'rgba(255,255,255,0.7)' }}>
            <strong style={{ color:J.pink }}>Official</strong> Wedding Luggage Concierge for <strong style={{ color:'#fff' }}>#Y2K</strong> · <strong style={{ color:J.pink, background:'rgba(236,157,171,0.12)', padding:'1px 6px', borderRadius:2 }}>Taj Lake Palace, Udaipur</strong>
          </span>
        </div>
        <div className="header-main">
          <div className="header-inner">
            <ul className="header-nav">
              <li><a href="#book">Book Now</a></li>
              <li><a href="#venue">About</a></li>
              <li><a href="#book">Contact</a></li>
            </ul>
            <a href="/" className="header-logo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/bagdrop-logo.png" alt="Bagdrop" />
            </a>
            <div style={{ display:'flex', alignItems:'center', gap:22 }}>
              <a href="tel:+916357115711" style={{ fontFamily:'Montserrat,sans-serif', fontSize:14, fontWeight:600, color:J.black, textDecoration:'none', letterSpacing:'0.3px', display:'flex', alignItems:'center', gap:7 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={J.pink} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.65 3.42 2 2 0 0 1 3.62 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6.07 6.07l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
                +91 63571 15711
              </a>
              <a href="#book" style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, textTransform:'uppercase', letterSpacing:'0.8px', background:J.pink, color:'#fff', padding:'13px 30px', textDecoration:'none', transition:'background 0.2s' }}
                onMouseEnter={e=>(e.currentTarget.style.background=J.pinkDark)}
                onMouseLeave={e=>(e.currentTarget.style.background=J.pink)}>
                Book Now
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* ════════════════════════════════════════════════════ */}
      {/* HERO SLIDER                                         */}
      {/* ════════════════════════════════════════════════════ */}
      <section className="promo-slider">
        <FallingPetals/>
        {HERO_SLIDES.map((s, i) => (
          <div key={i} className={`promo-slide ${i===slide?'active':'inactive'}`}>
            <div className="promo-slide__bg" style={{ backgroundImage:`url(${s.bg})` }}/>
            <div className="promo-slide__overlay"/>
            <div className="promo-slide__content">
              {i===slide&&(
                <div className="hero-slide-in">
                  <p className="promo-slide__badge">• {s.label}</p>
                  <p className="promo-slide__loc">{s.loc}</p>
                  <h1 className="promo-slide__h1">{s.h1a}<br/><em className="em-gold">{s.h1b}</em></h1>
                  <p className="promo-slide__sub">{s.sub}</p>
                  <div className="hero-couple-card">
                    <span className="hero-couple-name">Yashna ❤ Yash &nbsp;<span className="nc-hashtag">#Y2K</span></span>
                    <span className="hero-couple-meta">
                      <span className="hero-date-highlight">📅 17 December 2026</span>
                      &nbsp;&nbsp;🏛 Taj Lake Palace, Udaipur
                    </span>
                  </div>
                  <div className="hero-cta-row">
                    <BtnDefault href="#book" light>📦 Book Luggage Delivery</BtnDefault>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        <div style={{ position:'absolute', bottom:40, left:0, right:0, zIndex:3 }}>
          <div className="container">
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ display:'flex', gap:20 }}>
                {HERO_SLIDES.map((_,i)=>(
                  <button key={i} onClick={()=>setSlide(i)}
                    style={{ background:'none', border:'none', cursor:'pointer', fontFamily:'Sulphur Point,sans-serif', fontSize:13, color:i===slide?'#fff':'rgba(255,255,255,0.35)', transition:'color 0.2s', padding:0 }}>
                    {String(i+1).padStart(2,'0')}.
                  </button>
                ))}
              </div>
              <div style={{ display:'flex', gap:24 }}>
                <button onClick={()=>setSlide(s=>(s-1+HERO_SLIDES.length)%HERO_SLIDES.length)}
                  style={{ background:'none', border:'none', cursor:'pointer', fontFamily:'Montserrat,sans-serif', fontSize:11, fontWeight:600, textTransform:'uppercase', color:'rgba(255,255,255,0.55)', letterSpacing:'1px', display:'flex', alignItems:'center', gap:6 }}>← prev</button>
                <button onClick={()=>setSlide(s=>(s+1)%HERO_SLIDES.length)}
                  style={{ background:'none', border:'none', cursor:'pointer', fontFamily:'Montserrat,sans-serif', fontSize:11, fontWeight:600, textTransform:'uppercase', color:'rgba(255,255,255,0.55)', letterSpacing:'1px', display:'flex', alignItems:'center', gap:6 }}>next →</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Trust logos bar ── */}
      <div className="logos-bar">
        <div className="logos-inner">
          {['Mumbai','Delhi','Ahmedabad','Udaipur','Goa','Bangalore'].map(city=>(
            <span key={city} className="logo-badge">{city}</span>
          ))}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════ */}
      {/* BOOKING SECTION — SPLIT PANEL                       */}
      {/* ════════════════════════════════════════════════════ */}
      <section id="book" className="book-section">
      <div className="book-grid">

        {/* ── LEFT: Branding + Details ── */}
        <div className="book-left">
          {/* Decorative pink glow */}
          <div style={{ position:'absolute', top:-100, right:-100, width:400, height:400, borderRadius:'50%', background:`radial-gradient(circle, rgba(236,157,171,0.12) 0%, transparent 70%)`, pointerEvents:'none' }}/>
          <div style={{ position:'absolute', bottom:-60, left:-60, width:300, height:300, borderRadius:'50%', background:`radial-gradient(circle, rgba(236,157,171,0.08) 0%, transparent 70%)`, pointerEvents:'none' }}/>

          <Reveal>
            {/* Wedding badge */}
            <div style={{ display:'inline-flex', alignItems:'center', gap:8, border:`1px solid rgba(236,157,171,0.3)`, padding:'6px 16px', marginBottom:32 }}>
              <span style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'2px', color:J.pink }}>Official Service · #Y2K</span>
            </div>

            <Suptitle light>wedding concierge</Suptitle>

            <h2 style={{ fontFamily:'Georgia,serif', fontSize:'clamp(36px,4.5vw,58px)', lineHeight:'108%', color:'#fff', fontWeight:400, marginBottom:20 }}>
              Reserve Your<br/><em style={{ fontStyle:'italic', color:J.pink }}>Luggage Concierge</em>
            </h2>

            <p style={{ fontSize:15, color:'rgba(255,255,255,0.55)', lineHeight:'170%', marginBottom:36 }}>
              Exclusive baggage handling for guests attending<br/>
              <strong style={{ color:'rgba(255,255,255,0.9)' }}>Yashna & Yash&apos;s</strong> wedding at Taj Lake Palace · 17 Dec 2026.
            </p>

            {/* Destination confirmed card */}
            <div style={{ border:`1px solid rgba(236,157,171,0.25)`, padding:'18px 22px', marginBottom:40, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap', background:'rgba(236,157,171,0.06)' }}>
              <div>
                <p style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'2px', color:J.pink, margin:'0 0 4px' }}>All deliveries to</p>
                <p style={{ fontFamily:'Sulphur Point,sans-serif', fontSize:20, color:'#fff', margin:0 }}>Taj Lake Palace, Udaipur</p>
                <p style={{ fontSize:12, color:'rgba(255,255,255,0.35)', marginTop:2 }}>17 December 2026 · #Y2K</p>
              </div>
              <div style={{ background:J.pink, color:'#fff', padding:'7px 14px', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'1px', whiteSpace:'nowrap' }}>
                Pre-Confirmed ✓
              </div>
            </div>

            {/* 4 feature rows */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px 28px', marginBottom:44 }}>
              {FEATURES.map(f=>(
                <div key={f.title} style={{ display:'flex', gap:12, alignItems:'flex-start' }}>
                  <span style={{ fontSize:20, lineHeight:1, marginTop:2 }}>{f.icon}</span>
                  <div>
                    <p style={{ fontFamily:'Sulphur Point,sans-serif', fontSize:15, color:'#fff', margin:'0 0 3px' }}>{f.title}</p>
                    <p style={{ fontSize:12, color:'rgba(255,255,255,0.4)', lineHeight:'160%' }}>{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Countdown */}
            {cd.ready && (
              <div>
                <p style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'2px', color:'rgba(255,255,255,0.3)', marginBottom:14 }}>Wedding day countdown</p>
                <div className="countdown">
                  {[{v:cd.d,l:'Days'},{v:cd.h,l:'Hrs'},{v:cd.m,l:'Min'},{v:cd.s,l:'Sec'}].map(({v,l},i)=>(
                    <div key={l} style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
                      <div className="countdown-unit">
                        <span className="countdown-num">{String(v).padStart(2,'0')}</span>
                        <span className="countdown-label">{l}</span>
                      </div>
                      {i<3&&<span className="countdown-sep">:</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Reveal>
        </div>

        {/* ── RIGHT: The Form ── */}
        <div className="book-right">
          <Reveal>
            {/* Step indicator */}
            <div className="step-indicator" style={{ marginBottom:28 }}>
              {['Guest','Travel','Luggage','Delivery'].map((label,i)=>{
                const s=i+1, active=step===s, done2=step>s
                return (
                  <div key={label} style={{ display:'flex', alignItems:'center', flex:1 }}>
                    <div className="step-pip">
                      <div className="step-pip-num" style={{ background:done2?J.pink:active?J.black:'transparent', color:done2||active?'#fff':J.muted, border:`2px solid ${done2||active?'transparent':J.border}` }}>
                        {done2?'✓':s}
                      </div>
                      <span className="step-pip-label" style={{ color:active?J.black:done2?J.pink:J.muted }}>{label}</span>
                    </div>
                    {i<3&&<div className="step-line" style={{ background:step>s?J.pink:J.border }}/>}
                  </div>
                )
              })}
            </div>

            <div className="book-form-card">
              <form onSubmit={submit}>

                {/* ── Step 1: Guest Info ── */}
                {step===1&&(
                  <>
                    <h3 style={{ fontFamily:'Georgia,serif', fontSize:26, color:J.black, fontWeight:400, marginBottom:24 }}>Guest Information</h3>
                    <div className="fld">
                      <label>Full Name *</label>
                      <input required type="text" placeholder="e.g. Priya Sharma" value={form.name} onChange={e=>patch('name',e.target.value)} style={fi}/>
                    </div>
                    <div className="form-grid-2">
                      <div className="fld">
                        <label>Mobile Number *</label>
                        <input required type="tel" placeholder="10-digit number" value={form.phone} onChange={e=>patch('phone',e.target.value.replace(/\D/g,'').slice(0,10))} style={fi}/>
                      </div>
                      <div className="fld">
                        <label>Email (optional)</label>
                        <input type="email" placeholder="your@email.com" value={form.email} onChange={e=>patch('email',e.target.value)} style={fi}/>
                      </div>
                    </div>
                  </>
                )}

                {/* ── Step 2: Pickup Info ── */}
                {step===2&&(
                  <>
                    <h3 style={{ fontFamily:'Georgia,serif', fontSize:26, color:J.black, fontWeight:400, marginBottom:24 }}>Pickup Information</h3>
                    <div className="form-grid-2">
                      <div className="fld">
                        <label>Pickup Date *</label>
                        <input required type="date" value={form.pickupDate} onChange={e=>patch('pickupDate',e.target.value)} style={fi}/>
                      </div>
                      <div className="fld">
                        <label>Pickup City *</label>
                        <input required type="text" placeholder="e.g. Mumbai, Delhi" value={form.pickupCity} onChange={e=>patch('pickupCity',e.target.value)} style={fi}/>
                      </div>
                    </div>
                    <div className="fld">
                      <label>Pickup Address *</label>
                      <input required type="text" placeholder="House / Flat no., Street, Area" value={form.pickupAddress} onChange={e=>patch('pickupAddress',e.target.value)} style={fi}/>
                    </div>
                    <div className="form-grid-2">
                      <div className="fld">
                        <label>Preferred Pickup Time *</label>
                        <input required type="time" value={form.pickupTime} onChange={e=>patch('pickupTime',e.target.value)} style={fi}/>
                      </div>
                      <div className="fld">
                        <label>Wedding Venue</label>
                        <input type="text" value={form.weddingVenue} readOnly style={{ ...fi, background:'rgba(17,17,17,0.04)', color:J.body, cursor:'default' }}/>
                      </div>
                    </div>
                  </>
                )}

                {/* ── Step 3: Luggage ── */}
                {step===3&&(
                  <>
                    <h3 style={{ fontFamily:'Georgia,serif', fontSize:26, color:J.black, fontWeight:400, marginBottom:24 }}>Luggage Information</h3>
                    <div className="fld">
                      <label>Number of Bags *</label>
                      <input required type="number" min={1} max={50} value={form.bags} onChange={e=>patch('bags',e.target.value)} style={fi}/>
                    </div>
                    <div className="fld">
                      <label>Bag Type</label>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginTop:4 }}>
                        {['Cabin (Small)','Check-in (Medium)','Large Suitcase','Wedding Trunk','Sports Bag','Mixed Sizes'].map(size=>(
                          <button key={size} type="button" onClick={()=>patch('bagSize',size)}
                            className={`bag-pill${form.bagSize===size?' active':''}`}
                            style={{ padding:'8px 14px', border:`1px solid ${form.bagSize===size?J.pink:J.border}`, fontSize:11, cursor:'pointer', background:'#fff', transition:'all 0.2s', color:form.bagSize===size?J.pink:J.body, fontWeight:form.bagSize===size?700:400, fontFamily:'Montserrat,sans-serif' }}>
                            {size}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="fld" style={{ marginBottom:0 }}>
                      <label>Special Instructions</label>
                      <textarea rows={3} placeholder="Fragile items, bridal wear, gifts…" value={form.specialInstructions} onChange={e=>patch('specialInstructions',e.target.value)} style={{ ...fi, resize:'none' }}/>
                    </div>
                  </>
                )}

                {/* ── Step 4: Delivery ── */}
                {step===4&&(
                  <>
                    <h3 style={{ fontFamily:'Sulphur Point,sans-serif', fontSize:26, color:J.black, marginBottom:6 }}>Delivery Details</h3>
                    <p style={{ fontSize:13, color:J.muted, marginBottom:20 }}>Your luggage will be delivered to <strong style={{ color:J.black }}>Taj Lake Palace, Udaipur</strong> or your accommodation.</p>
                    <div className="fld">
                      <label>Wedding Venue (Pre-Confirmed)</label>
                      <input type="text" readOnly value="Taj Lake Palace, Udaipur" style={{ ...fi, background:'#f8f8fa', color:J.muted, cursor:'default' }}/>
                    </div>
                    <div className="form-grid-2">
                      <div className="fld">
                        <label>Hotel (if different)</label>
                        <input type="text" placeholder="e.g. Trident Udaipur" value={form.hotelName} onChange={e=>patch('hotelName',e.target.value)} style={fi}/>
                      </div>
                      <div className="fld">
                        <label>Room Number</label>
                        <input type="text" placeholder="e.g. 204" value={form.roomNumber} onChange={e=>patch('roomNumber',e.target.value)} style={fi}/>
                      </div>
                    </div>
                    <div className="fld" style={{ marginBottom:0 }}>
                      <label>Preferred Delivery Time *</label>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop:8 }}>
                        {DELIVERY_TIMES.map(slot=>(
                          <button key={slot.id} type="button" onClick={()=>patch('deliveryTime',slot.id)}
                            className={`dt-slot${form.deliveryTime===slot.id?' active':''}`}
                            style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 14px', border:`1px solid ${form.deliveryTime===slot.id?J.pink:J.border}`, cursor:'pointer', transition:'border-color 0.2s', background:'#fff', textAlign:'left' }}>
                            <span style={{ fontSize:16 }}>{slot.icon}</span>
                            <div>
                              <p style={{ fontFamily:'Montserrat,sans-serif', fontSize:11, fontWeight:700, color:form.deliveryTime===slot.id?J.pink:J.black, margin:0 }}>{slot.label}</p>
                              <p style={{ fontFamily:'Montserrat,sans-serif', fontSize:10, color:J.muted, margin:0 }}>{slot.range}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {err&&<div className="form-error">{err}</div>}

                {/* Navigation */}
                <div className="form-actions" style={{ marginTop:20 }}>
                  {step>1
                    ? <button type="button" onClick={()=>setStep(s=>s-1)} style={{ fontFamily:'Montserrat,sans-serif', fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px', background:'transparent', border:`2px solid ${J.border}`, color:J.body, padding:'12px 20px', cursor:'pointer', transition:'border-color 0.2s' }}
                        onMouseEnter={e=>(e.currentTarget.style.borderColor=J.pink)}
                        onMouseLeave={e=>(e.currentTarget.style.borderColor=J.border)}>← Back</button>
                    : <span/>
                  }
                  <div style={{ flex:1 }}>
                    {step<4
                      ? <BtnSubmit onClick={nextStep}>Continue →</BtnSubmit>
                      : <BtnSubmit type="submit" disabled={busy}>{busy?'Submitting…':'✦ Confirm Concierge · #Y2K'}</BtnSubmit>
                    }
                  </div>
                </div>

                <p style={{ fontFamily:'Montserrat,sans-serif', fontSize:11, color:J.muted, textAlign:'center', marginTop:14, lineHeight:'170%' }}>
                  No payment now · We&apos;ll call you to confirm ·{' '}
                  <a href="mailto:info@bagdrop.co" style={{ color:J.pink, textDecoration:'none' }}>info@bagdrop.co</a>
                </p>
              </form>
            </div>
          </Reveal>
        </div>
      </div>
      </section>

      {/* ════════════════════════════════════════════════════ */}
      {/* STATS BANNER                                        */}
      {/* ════════════════════════════════════════════════════ */}
      <section style={{ position:'relative', padding:'80px 0', overflow:'hidden' }}>
        {/* Background wedding photo */}
        <div style={{ position:'absolute', inset:0, backgroundImage:'url(https://images.unsplash.com/photo-1583939003579-730e3918a45a?w=1920&q=80&auto=format&fit=crop)', backgroundSize:'cover', backgroundPosition:'center' }}/>
        <div style={{ position:'absolute', inset:0, background:'rgba(10,6,4,0.68)' }}/>
        <div className="container" style={{ position:'relative', zIndex:2, textAlign:'center' }}>
          <Reveal>
            {/* Eyebrow */}
            <p style={{ fontFamily:'Montserrat,sans-serif', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'2.5px', color:'rgba(255,255,255,0.55)', marginBottom:18 }}>Trusted by Couples Across India</p>
            {/* Headline */}
            <h2 style={{ fontFamily:'Georgia,serif', fontSize:'clamp(32px,4.5vw,52px)', color:'#fff', fontWeight:400, lineHeight:'118%', margin:'0 0 6px' }}>
              Stress-free destination
            </h2>
            <p style={{ fontFamily:'Georgia,serif', fontSize:'clamp(28px,4vw,48px)', fontStyle:'italic', color:'#d4a843', fontWeight:400, margin:'0 0 52px', lineHeight:'120%' }}>
              weddings, delivered
            </p>
            {/* Stats row */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'32px 20px', maxWidth:900, margin:'0 auto' }}>
              {([
                { to:150,  suffix:'+',   label:'Guests Managed This Wedding' },
                { to:200,  suffix:'+',   label:'Bags Managed This Wedding' },
                { to:null, text:'Pan India', label:'Pickup Coverage Across India' },
                { to:null, text:'24/7',      label:'Dedicated Wedding Support' },
              ] as { to:number|null; suffix?:string; text?:string; label:string }[]).map(({ to, suffix, text, label }) => (
                <div key={label}>
                  <p style={{ fontFamily:'Georgia,serif', fontSize:'clamp(30px,3.5vw,46px)', color:'#d4a843', fontWeight:400, margin:'0 0 10px', lineHeight:1 }}>
                    {to !== null ? <CountUp to={to} suffix={suffix??''} /> : text}
                  </p>
                  <p style={{ fontFamily:'Montserrat,sans-serif', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'1.5px', color:'rgba(255,255,255,0.65)', lineHeight:'155%' }}>{label}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════ */}
      {/* ABOUT / VENUE BLOCK                                 */}
      {/* ════════════════════════════════════════════════════ */}
      <section style={{ padding:'80px 0' }} id="venue">
        <div className="container">
          <Reveal>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:72, alignItems:'center' }}>
              <div>
                <Suptitle>find your ease</Suptitle>
                <h2 style={{ fontFamily:'Georgia,serif', fontSize:'clamp(28px,4vw,46px)', lineHeight:'110%', color:J.black, fontWeight:400, marginBottom:32 }}>
                  We Handle Everything<br/><em style={{ fontStyle:'italic' }}>For Your Happy Journey</em>
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
                    <div style={{ flexShrink:0, width:40, height:40, borderRadius:'50%', background:`rgba(236,157,171,0.15)`, display:'flex', alignItems:'center', justifyContent:'center', marginTop:2 }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={J.pink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="7" width="20" height="14" rx="2"/>
                        <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
                        <line x1="12" y1="12" x2="12" y2="16"/>
                        <line x1="10" y1="14" x2="14" y2="14"/>
                      </svg>
                    </div>
                    <div>
                      <p style={{ fontFamily:'Sulphur Point,sans-serif', fontSize:17, fontWeight:700, color:J.black, margin:'0 0 2px' }}>{title}</p>
                      <p style={{ fontSize:13, color:J.body, margin:0, lineHeight:'160%' }}>{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ overflow:'hidden' }}>
                <img src="/images/y2k-palace.jpg"
                  alt="Taj Lake Palace, Udaipur"
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
      <section className="gift-banner">
        <div className="gift-banner__bg" style={{ backgroundImage:'url(/images/y2k-palace.jpg)' }}/>
        <div className="gift-banner__overlay"/>
        <div className="container" style={{ position:'relative', zIndex:2 }}>
          <div className="gift-banner__content">
            <Reveal>
              <p style={{ fontFamily:'Georgia,serif', fontSize:'clamp(28px,4vw,42px)', fontStyle:'italic', color:J.pink, textAlign:'center', margin:'0 0 18px', letterSpacing:'0.5px' }}>17 December 2026</p>
              <h2 className="gift-banner__h2">
                Hurry Up To<br/><em>Book Your Concierge</em>
              </h2>
              {cd.ready&&(
                <div className="countdown" style={{ marginBottom:36 }}>
                  {[{v:cd.d,l:'Days'},{v:cd.h,l:'Hours'},{v:cd.m,l:'Mins'},{v:cd.s,l:'Secs'}].map(({v,l},i)=>(
                    <div key={l} style={{ display:'flex', alignItems:'flex-start', gap:16 }}>
                      <div className="countdown-unit">
                        <span className="countdown-num">{String(v).padStart(2,'0')}</span>
                        <span className="countdown-label">{l}</span>
                      </div>
                      {i<3&&<span className="countdown-sep">:</span>}
                    </div>
                  ))}
                </div>
              )}
              <button onClick={()=>document.getElementById('book')?.scrollIntoView({behavior:'smooth'})}
                style={{ fontFamily:'Montserrat,sans-serif', fontWeight:600, fontSize:12, textTransform:'uppercase', letterSpacing:'0.8px', background:J.pink, color:'#fff', border:'none', padding:'16px 40px', cursor:'pointer', transition:'background 0.2s' }}
                onMouseEnter={e=>(e.currentTarget.style.background=J.pinkDark)}
                onMouseLeave={e=>(e.currentTarget.style.background=J.pink)}>
                Book Your Concierge
              </button>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════ */}
      {/* FOOTER                                              */}
      {/* ════════════════════════════════════════════════════ */}
      <footer className="footer">
        <div className="footer__bg" style={{ backgroundImage:'url(https://images.unsplash.com/photo-1587271339318-2e78e2466a09?w=1920&q=80&auto=format&fit=crop)' }}/>
        <div className="footer__overlay"/>
        <div className="footer__inner">
          <div>
            <span className="footer__logo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/bagdrop-logo.png" alt="Bagdrop" />
            </span>
            <p className="footer__text" style={{ marginBottom:24 }}>India&apos;s Premium Wedding Luggage Concierge. Serving guests at destination weddings across India.</p>
            <p className="footer__label">Write To Us</p>
            <a href="mailto:info@bagdrop.co" className="footer__link" style={{ fontSize:15, fontWeight:700, color:J.pinkDark }}>info@bagdrop.co</a>
          </div>
          <div>
            <p className="footer__label">Reach Us</p>
            <a href="tel:+916357115711" className="footer__link">+91 63571 15711</a>
            <a href="mailto:info@bagdrop.co" className="footer__link">info@bagdrop.co</a>
            <p className="footer__text" style={{ marginBottom:24 }}>Mumbai · Delhi · Ahmedabad · Udaipur · Goa · Bangalore</p>
            <p className="footer__label">Follow Us</p>
            <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
              <a href="https://www.instagram.com/bagdropofficial" target="_blank" rel="noopener noreferrer" className="footer__link" style={{ marginBottom:0 }}>Instagram</a>
              <a href="https://wa.me/916357115711" target="_blank" rel="noopener noreferrer" className="footer__link" style={{ marginBottom:0 }}>WhatsApp</a>
              <a href="https://www.facebook.com/profile.php?id=61579334791456" target="_blank" rel="noopener noreferrer" className="footer__link" style={{ marginBottom:0 }}>Facebook</a>
            </div>
          </div>
          <div>
            <p className="footer__label">#Y2K Wedding</p>
            <p style={{ fontFamily:'Sulphur Point,sans-serif', fontSize:36, color:J.pinkDark, margin:'0 0 8px', lineHeight:1 }}>Yashna &amp; Yash</p>
            <p className="footer__text" style={{ marginBottom:16 }}>17 December 2026<br/>Taj Lake Palace, Udaipur</p>
            <p style={{ fontFamily:'Sulphur Point,sans-serif', fontSize:28, color:J.pinkDark, margin:'0 0 4px' }}>#Y2K</p>
            <p style={{ fontSize:11, fontWeight:600, color:'rgba(14,6,8,0.45)', textTransform:'uppercase', letterSpacing:'1px' }}>Official Wedding Hashtag</p>
          </div>
        </div>
        <div className="footer__bottom">
          <p className="footer__copy">© 2026 <a href="/">Bagdrop</a> · India&apos;s Premium Wedding Luggage Concierge · <a href="/privacy">Privacy Policy</a></p>
        </div>
      </footer>

    </div>
  )
}
