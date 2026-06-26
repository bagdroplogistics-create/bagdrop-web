'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

// ── Wedding date ──────────────────────────────────────────────
const WEDDING_DATE = new Date('2026-12-17T00:00:00+05:30')

// ── Color palette ─────────────────────────────────────────────
const C = {
  gold:      '#C9A84C', goldLight: '#E8D49A', goldDark: '#A07830',
  champagne: '#F5ECD6', blush: '#F0C0CB', blushDeep: '#D4889A',
  cream:     '#FDFAF5', deepWine: '#1A0A12', wine: '#2E1020',
  textDark:  '#2C1810', textMid: '#6B4C3B',
}

// ── Curated wedding images ────────────────────────────────────
const IMG = {
  hero:    'https://images.unsplash.com/photo-1519741497674-611481863552?w=1920&q=85&auto=format&fit=crop',
  flowers: 'https://images.unsplash.com/photo-1562510952-aad46e9d2b82?w=1920&q=85&auto=format&fit=crop',
  palace:  'https://images.unsplash.com/photo-1587271339318-2e78e2466a09?w=1920&q=85&auto=format&fit=crop',
  gallery: [
    { src: 'https://images.unsplash.com/photo-1583939003579-730e3918a45a?w=600&q=80&auto=format&fit=crop', label: 'Indian Celebration' },
    { src: 'https://images.unsplash.com/photo-1606216794074-735e91aa2c92?w=600&q=80&auto=format&fit=crop', label: 'Elegant Décor' },
    { src: 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=600&q=80&auto=format&fit=crop', label: 'Wedding Lights' },
    { src: 'https://images.unsplash.com/photo-1591604466107-ec97de577aff?w=600&q=80&auto=format&fit=crop', label: 'Floral Arrangements' },
    { src: 'https://images.unsplash.com/photo-1465495976277-4387d4b0b4c6?w=600&q=80&auto=format&fit=crop', label: 'Wedding Moments' },
    { src: 'https://images.unsplash.com/photo-1460978812857-470ed1c77af0?w=600&q=80&auto=format&fit=crop', label: 'Celebration' },
  ],
}

// ── Time slots ────────────────────────────────────────────────
const TIME_SLOTS = [
  { id: 'morning',   label: 'Morning',   range: '6:00 AM – 1:00 PM',  icon: '🌅' },
  { id: 'afternoon', label: 'Afternoon', range: '1:00 PM – 5:00 PM',  icon: '☀️'  },
  { id: 'evening',   label: 'Evening',   range: '5:00 PM – 8:00 PM',  icon: '🌆' },
  { id: 'night',     label: 'Night',     range: '8:00 PM – 6:00 AM',  icon: '🌙' },
]

// ── Countdown hook ────────────────────────────────────────────
function useCountdown(target: Date) {
  const [t, setT] = useState({ d: 0, h: 0, m: 0, s: 0, ready: false })
  const calc = useCallback(() => {
    const diff = target.getTime() - Date.now()
    if (diff <= 0) { setT({ d:0,h:0,m:0,s:0,ready:true }); return }
    setT({ d: Math.floor(diff/86400000), h: Math.floor((diff%86400000)/3600000),
           m: Math.floor((diff%3600000)/60000), s: Math.floor((diff%60000)/1000), ready: true })
  }, [target])
  useEffect(() => { calc(); const id = setInterval(calc,1000); return () => clearInterval(id) }, [calc])
  return t
}

// ── Scroll-reveal hook ────────────────────────────────────────
function useReveal() {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect() } }, { threshold: 0.12 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return { ref, visible }
}

// ── Reveal wrapper component ──────────────────────────────────
function Reveal({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: React.CSSProperties }) {
  const { ref, visible } = useReveal()
  return (
    <div ref={ref} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(32px)',
      transition: `opacity 0.75s ease ${delay}ms, transform 0.75s ease ${delay}ms`,
      ...style,
    }}>
      {children}
    </div>
  )
}

// ── Gold ornament ─────────────────────────────────────────────
function Ornament({ color = C.gold, size = 'md' }: { color?: string; size?: 'sm'|'md'|'lg' }) {
  const w = size === 'sm' ? 40 : size === 'lg' ? 100 : 64
  const fs = size === 'sm' ? 14 : size === 'lg' ? 22 : 18
  return (
    <div style={{ display:'flex',alignItems:'center',justifyContent:'center',gap:10,margin:'10px 0' }}>
      <div style={{ height:1,width:w,background:`linear-gradient(to right, transparent, ${color})` }}/>
      <span style={{ color,fontSize:fs,lineHeight:1 }}>✦</span>
      <div style={{ height:1,width:24,background:color }}/>
      <span style={{ color,fontSize:fs*0.55,lineHeight:1 }}>❤</span>
      <div style={{ height:1,width:24,background:color }}/>
      <span style={{ color,fontSize:fs,lineHeight:1 }}>✦</span>
      <div style={{ height:1,width:w,background:`linear-gradient(to left, transparent, ${color})` }}/>
    </div>
  )
}

// ── Countdown tile ────────────────────────────────────────────
function Tile({ v, label }: { v: number; label: string }) {
  return (
    <div style={{ display:'flex',flexDirection:'column',alignItems:'center',gap:8 }}>
      <div style={{
        background:'rgba(255,255,255,0.07)',border:`1px solid rgba(201,168,76,0.35)`,
        borderRadius:16,padding:'20px 18px',minWidth:80,backdropFilter:'blur(12px)',
        boxShadow:'0 8px 32px rgba(0,0,0,0.25)',
      }}>
        <span style={{
          display:'block',fontFamily:'var(--font-cormorant),Georgia,serif',
          fontSize:'clamp(32px,7vw,56px)',fontWeight:300,color:C.goldLight,
          lineHeight:1,textAlign:'center',letterSpacing:'0.02em',
        }}>
          {String(v).padStart(2,'0')}
        </span>
      </div>
      <span style={{
        fontFamily:'var(--font-lato),sans-serif',fontSize:10,
        letterSpacing:'0.22em',textTransform:'uppercase',color:'rgba(245,236,214,0.55)',
      }}>
        {label}
      </span>
    </div>
  )
}

// ── Form field ────────────────────────────────────────────────
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ display:'flex',flexDirection:'column',gap:7 }}>
      <label style={{ fontFamily:'var(--font-lato),sans-serif',fontSize:10,fontWeight:700,
        letterSpacing:'0.2em',textTransform:'uppercase',color:C.goldDark }}>
        {label}{required && <span style={{ color:'#C9A84C',marginLeft:3 }}>*</span>}
      </label>
      {children}
    </div>
  )
}

const IS: React.CSSProperties = {
  fontFamily:'var(--font-lato),sans-serif',fontSize:14,color:C.textDark,
  background:'#FDFAF5',border:`1.5px solid rgba(201,168,76,0.28)`,
  borderRadius:12,padding:'13px 16px',width:'100%',boxSizing:'border-box',
  outline:'none',transition:'border-color 0.2s',
}

// ── PAGE ──────────────────────────────────────────────────────
export default function Y2KPage() {
  const cd = useCountdown(WEDDING_DATE)

  const [form, setForm] = useState({
    name:'', phone:'', email:'', guests:'1', bags:'1',
    pickupAddress:'', pickupTime:'', deliveryAddress:'Taj Lake Palace, Udaipur', requests:'',
  })
  const [busy,      setBusy]      = useState(false)
  const [done,      setDone]      = useState(false)
  const [trackId,   setTrackId]   = useState('')
  const [err,       setErr]       = useState('')
  const [focusedInput, setFocusedInput] = useState<string|null>(null)

  function patch(k: keyof typeof form, v: string) { setForm(p=>({...p,[k]:v})); setErr('') }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const digits = form.phone.replace(/\D/g,'')
    if (!form.name.trim()) { setErr('Please enter your full name.'); return }
    if (!/^[6-9]\d{9}$/.test(digits)) { setErr('Enter a valid 10-digit Indian mobile number.'); return }
    if (!form.pickupAddress.trim()) { setErr('Please enter your pickup address.'); return }
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/y2k/inquiry', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ ...form, phone: digits }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Submission failed')
      setTrackId(d.trackingId ?? '')
      setDone(true)
      window.scrollTo({ top:0, behavior:'smooth' })
    } catch(ex) {
      setErr(ex instanceof Error ? ex.message : 'Something went wrong. Please try again.')
    } finally { setBusy(false) }
  }

  // ── Thank you screen ───────────────────────────────────────
  if (done) return (
    <div style={{ minHeight:'100vh',background:`linear-gradient(160deg,${C.deepWine} 0%,${C.wine} 100%)`,
      display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
      padding:'48px 24px',textAlign:'center',
    }}>
      <style dangerouslySetInnerHTML={{ __html:`
        @keyframes thankScale { from{opacity:0;transform:scale(0.85)} to{opacity:1;transform:scale(1)} }
        @keyframes floatHeart { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-14px)} }
        .thank-in { animation: thankScale 0.8s cubic-bezier(0.34,1.56,0.64,1) forwards; }
        .float-h  { animation: floatHeart 3s ease-in-out infinite; }
      `}}/>
      <div className="thank-in" style={{ maxWidth:540 }}>
        <div className="float-h" style={{ fontSize:72,marginBottom:20 }}>💍</div>
        <p style={{ fontFamily:'var(--font-great-vibes),cursive',fontSize:'clamp(42px,10vw,68px)',color:C.goldLight,marginBottom:0,lineHeight:1 }}>
          Thank You!
        </p>
        <Ornament color={C.gold} size="lg" />
        <p style={{ fontFamily:'var(--font-cormorant),Georgia,serif',fontSize:'clamp(18px,4vw,24px)',fontStyle:'italic',color:C.champagne,lineHeight:1.75,margin:'20px 0 12px' }}>
          Your luggage concierge request for<br/>
          <span style={{ color:C.goldLight }}>Yashna ❤️ Yash&apos;s wedding</span> has been received.
        </p>
        <p style={{ fontFamily:'var(--font-lato),sans-serif',fontSize:14,color:'rgba(245,236,214,0.7)',lineHeight:1.85,marginBottom:32 }}>
          Our team will coordinate your baggage delivery for <strong style={{ color:C.goldLight }}>#Y2K</strong><br/>
          at Taj Lake Palace, Udaipur. We&apos;ll be in touch on your number shortly.
        </p>
        {trackId && (
          <div style={{ background:'rgba(201,168,76,0.12)',border:`1px solid rgba(201,168,76,0.35)`,borderRadius:16,padding:'20px 36px',marginBottom:32,display:'inline-block' }}>
            <p style={{ fontFamily:'var(--font-lato),sans-serif',fontSize:10,letterSpacing:'0.25em',textTransform:'uppercase',color:C.goldLight,margin:'0 0 6px' }}>Your Reference</p>
            <p style={{ fontFamily:'var(--font-cormorant),Georgia,serif',fontSize:30,color:C.gold,margin:0,fontWeight:300 }}>{trackId}</p>
          </div>
        )}
        <div style={{ background:'rgba(255,255,255,0.05)',border:`1px solid rgba(201,168,76,0.2)`,borderRadius:14,padding:'18px 28px',marginBottom:36 }}>
          <p style={{ fontFamily:'var(--font-cormorant),Georgia,serif',fontSize:38,color:C.gold,margin:0,fontWeight:300 }}>#Y2K</p>
          <p style={{ fontFamily:'var(--font-lato),sans-serif',fontSize:11,color:'rgba(245,236,214,0.45)',letterSpacing:'0.12em',margin:'4px 0 0' }}>Share your wedding moments</p>
        </div>
        <a href="mailto:info@bagdrop.co" style={{ fontFamily:'var(--font-lato),sans-serif',fontSize:12,color:'rgba(245,236,214,0.4)',textDecoration:'none' }}>
          info@bagdrop.co
        </a>
      </div>
    </div>
  )

  return (
    <div style={{ fontFamily:'var(--font-lato),sans-serif',background:C.cream,overflowX:'hidden' }}>

      {/* ── Global CSS ───────────────────────────────────────── */}
      <style dangerouslySetInnerHTML={{ __html:`
        @import url('https://fonts.googleapis.com/css2?family=Great+Vibes&family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&display=swap');

        @keyframes fadeUp    { from{opacity:0;transform:translateY(28px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn    { from{opacity:0} to{opacity:1} }
        @keyframes float     { 0%,100%{transform:translateY(0) rotate(-2deg)} 50%{transform:translateY(-14px) rotate(2deg)} }
        @keyframes floatSlow { 0%,100%{transform:translateY(0) rotate(1deg)} 50%{transform:translateY(-20px) rotate(-1deg)} }
        @keyframes shimmer   { 0%{background-position:-200% center} 100%{background-position:200% center} }
        @keyframes petalFall { 0%{transform:translateY(-60px) rotate(0deg) scale(0.8);opacity:0}
          8%{opacity:0.85} 90%{opacity:0.6} 100%{transform:translateY(105vh) rotate(540deg) scale(0.6);opacity:0} }
        @keyframes pulseGold { 0%,100%{box-shadow:0 0 0 0 rgba(201,168,76,0.4)} 50%{box-shadow:0 0 0 10px rgba(201,168,76,0)} }
        @keyframes heroEntrance { 0%{opacity:0;transform:translateY(40px)} 100%{opacity:1;transform:translateY(0)} }
        @keyframes rotate360 { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes scaleIn   { from{opacity:0;transform:scale(0.9)} to{opacity:1;transform:scale(1)} }
        @keyframes slideLeft { from{opacity:0;transform:translateX(40px)} to{opacity:1;transform:translateX(0)} }

        .hero-title  { animation: heroEntrance 1.2s cubic-bezier(0.25,0.46,0.45,0.94) 0.3s both; }
        .hero-sub    { animation: heroEntrance 1.2s cubic-bezier(0.25,0.46,0.45,0.94) 0.6s both; }
        .hero-cta    { animation: heroEntrance 1.2s cubic-bezier(0.25,0.46,0.45,0.94) 0.9s both; }
        .hero-badge  { animation: fadeIn 1s ease 0.1s both; }
        .petal       { position:absolute;pointer-events:none;border-radius:50% 0 50% 0;animation:petalFall linear infinite; }
        .gallery-img { transition:transform 0.5s ease,box-shadow 0.5s ease;overflow:hidden;border-radius:16px; }
        .gallery-img:hover img { transform:scale(1.08); }
        .gallery-img img { transition:transform 0.5s ease;width:100%;height:100%;object-fit:cover;display:block; }
        .info-card   { transition:transform 0.3s ease,box-shadow 0.3s ease; }
        .info-card:hover { transform:translateY(-6px);box-shadow:0 12px 40px rgba(44,24,16,0.12) !important; }
        .shimmer-text {
          background:linear-gradient(90deg,${C.gold} 0%,${C.goldLight} 40%,#FFF5CC 50%,${C.goldLight} 60%,${C.gold} 100%);
          background-size:200% auto;-webkit-background-clip:text;-webkit-text-fill-color:transparent;
          background-clip:text;animation:shimmer 4s linear infinite;
        }
        .cta-btn-primary { transition:transform 0.2s,box-shadow 0.2s; }
        .cta-btn-primary:hover { transform:translateY(-2px);box-shadow:0 8px 32px rgba(201,168,76,0.5) !important; }
        .cta-btn-secondary:hover { border-color:rgba(201,168,76,0.8) !important; }
        .time-slot { transition:all 0.2s ease;cursor:pointer; }
        .time-slot:hover { border-color:rgba(201,168,76,0.6) !important;background:rgba(201,168,76,0.06) !important; }
        .form-input:focus { border-color:rgba(201,168,76,0.7) !important;box-shadow:0 0 0 3px rgba(201,168,76,0.1) !important; }
        .scroll-indicator { animation:float 2.5s ease-in-out infinite; }
        .spin-floral { animation:rotate360 30s linear infinite; }
        @media (max-width:640px) { .gallery-grid { grid-template-columns:repeat(2,1fr) !important; } }
      `}} />

      {/* ── Announcement bar ─────────────────────────────────── */}
      <div style={{ background:`linear-gradient(90deg,${C.deepWine},#4A1025,${C.deepWine})`,
        padding:'9px 16px',textAlign:'center',position:'sticky',top:0,zIndex:100 }}>
        <p style={{ fontFamily:'var(--font-lato),sans-serif',fontSize:11,letterSpacing:'0.22em',
          textTransform:'uppercase',color:C.goldLight,margin:0 }}>
          ✨&nbsp;&nbsp;Official Wedding Luggage Concierge Partner for <strong>#Y2K</strong>&nbsp;&nbsp;✨
        </p>
      </div>

      {/* ── HERO (850px) ─────────────────────────────────────── */}
      <section style={{
        height:850,position:'relative',display:'flex',flexDirection:'column',
        alignItems:'center',justifyContent:'center',overflow:'hidden',
      }}>
        {/* Background image */}
        <div style={{
          position:'absolute',inset:0,
          backgroundImage:`url(https://plain-apac-prod-public.komododecks.com/202606/11/HknjydMBieL05anJkDic/image.png)`,
          backgroundSize:'cover',backgroundPosition:'center center',backgroundRepeat:'no-repeat',
        }}/>
        {/* Soft overlay — keep image visible, just ensure text legibility */}
        <div style={{ position:'absolute',inset:0,background:'linear-gradient(180deg,rgba(255,250,245,0.22) 0%,rgba(250,244,238,0.38) 55%,rgba(245,236,214,0.55) 100%)' }}/>
        <div style={{ position:'absolute',inset:0,background:'radial-gradient(ellipse at center bottom,rgba(201,168,76,0.06) 0%,transparent 70%)' }}/>

        {/* Rose petals */}
        {[
          { left:'8%',  delay:0,   dur:9,  size:14, color:'rgba(240,192,203,0.7)' },
          { left:'18%', delay:2.5, dur:11, size:10, color:'rgba(201,168,76,0.5)' },
          { left:'35%', delay:1,   dur:13, size:16, color:'rgba(240,192,203,0.6)' },
          { left:'55%', delay:3.5, dur:10, size:12, color:'rgba(245,236,214,0.5)' },
          { left:'70%', delay:0.8, dur:12, size:18, color:'rgba(240,192,203,0.7)' },
          { left:'82%', delay:2,   dur:9,  size:11, color:'rgba(201,168,76,0.4)' },
          { left:'92%', delay:4,   dur:14, size:15, color:'rgba(240,192,203,0.55)'},
          { left:'45%', delay:5,   dur:11, size:9,  color:'rgba(245,236,214,0.45)'},
        ].map((p,i) => (
          <div key={i} className="petal" style={{
            left:p.left,top:'-60px',width:p.size,height:p.size,
            background:p.color,animationDelay:`${p.delay}s`,animationDuration:`${p.dur}s`,
          }}/>
        ))}

        {/* Decorative rings */}
        <div style={{ position:'absolute',top:'12%',right:'8%',width:180,height:180,borderRadius:'50%',
          border:'1px solid rgba(201,168,76,0.25)',opacity:0.7 }} className="spin-floral"/>
        <div style={{ position:'absolute',bottom:'18%',left:'6%',width:120,height:120,borderRadius:'50%',
          border:'1px solid rgba(160,120,48,0.2)' }}/>

        {/* Content — frosted glass card for readability */}
        <div style={{ position:'relative',textAlign:'center',padding:'0 24px',maxWidth:780,zIndex:2 }}>
          <div style={{
            background:'rgba(255,252,248,0.82)',backdropFilter:'blur(18px)',
            WebkitBackdropFilter:'blur(18px)',
            border:`1px solid rgba(201,168,76,0.28)`,borderRadius:28,
            padding:'clamp(28px,5vw,48px) clamp(24px,5vw,52px)',
            boxShadow:'0 8px 48px rgba(44,24,16,0.12)',
          }}>

            <div className="hero-badge" style={{
              display:'inline-block',background:`linear-gradient(135deg,${C.deepWine},#4A1025)`,
              borderRadius:999,padding:'8px 24px',marginBottom:24,
            }}>
              <span style={{ fontFamily:'var(--font-lato),sans-serif',fontSize:10,
                letterSpacing:'0.22em',textTransform:'uppercase',color:C.goldLight }}>
                ✨ Official Wedding Luggage Concierge for #Y2K ✨
              </span>
            </div>

            <div className="hero-title">
              <p style={{ fontFamily:'var(--font-great-vibes),cursive',fontSize:'clamp(18px,3.5vw,26px)',
                color:C.blushDeep,margin:'0 0 8px',letterSpacing:'0.03em' }}>
                Welcome to
              </p>
              <h1 className="shimmer-text" style={{
                fontFamily:'var(--font-cormorant),Georgia,serif',
                fontSize:'clamp(34px,7vw,70px)',fontWeight:300,lineHeight:1.05,margin:'0 0 4px',letterSpacing:'-0.01em',
              }}>
                Yashna ❤️ Yash&apos;s
              </h1>
              <h1 style={{ fontFamily:'var(--font-cormorant),Georgia,serif',fontSize:'clamp(22px,4.5vw,44px)',
                fontWeight:300,color:C.textDark,lineHeight:1.2,margin:'0 0 20px',fontStyle:'italic',letterSpacing:'0.02em' }}>
                Destination Wedding
              </h1>
            </div>

            <Ornament color={C.goldDark} />

            <div className="hero-sub">
              <p style={{
                fontFamily:'var(--font-lato),sans-serif',fontSize:'clamp(13px,1.8vw,16px)',
                color:C.textMid,lineHeight:1.65,margin:'16px 0 24px',
                maxWidth:520,marginLeft:'auto',marginRight:'auto',
              }}>
                Attending <strong style={{ color:C.goldDark }}>#Y2K</strong> at Taj Lake Palace, Udaipur on 17 Dec 2026?{' '}
                Let BagDrop handle your luggage while you focus on the celebrations.
              </p>
            </div>

            <div className="hero-cta" style={{ display:'flex',flexWrap:'wrap',gap:12,justifyContent:'center' }}>
              <a href="#book" className="cta-btn-primary" style={{
                fontFamily:'var(--font-lato),sans-serif',fontSize:12,fontWeight:700,
                letterSpacing:'0.14em',textTransform:'uppercase',color:'#fff',
                background:`linear-gradient(135deg,${C.deepWine} 0%,#4A1025 100%)`,
                padding:'13px 30px',borderRadius:999,textDecoration:'none',
                boxShadow:`0 4px 20px rgba(44,24,16,0.25)`,
              }}>
                Book Luggage Concierge
              </a>
              <a href="#wedding-info" className="cta-btn-secondary" style={{
                fontFamily:'var(--font-lato),sans-serif',fontSize:12,fontWeight:600,
                letterSpacing:'0.14em',textTransform:'uppercase',color:C.goldDark,
                background:'transparent',padding:'12px 30px',borderRadius:999,textDecoration:'none',
                border:`1.5px solid rgba(201,168,76,0.6)`,transition:'all 0.2s',
              }}>
                View Details
              </a>
            </div>

          </div>
        </div>

        {/* Scroll cue */}
        <div className="scroll-indicator" style={{ position:'absolute',bottom:28,left:'50%',transform:'translateX(-50%)',
          display:'flex',flexDirection:'column',alignItems:'center',gap:6,zIndex:2 }}>
          <div style={{ width:1,height:36,background:`linear-gradient(to bottom,transparent,rgba(160,120,48,0.55))` }}/>
          <span style={{ fontSize:9,letterSpacing:'0.25em',textTransform:'uppercase',color:'rgba(160,120,48,0.6)' }}>scroll</span>
        </div>
      </section>

      {/* ── PHOTO GALLERY ────────────────────────────────────── */}
      <section style={{ background:`linear-gradient(180deg,${C.deepWine} 0%,#1F0D16 100%)`,padding:'clamp(48px,8vw,80px) 24px' }}>
        <Reveal>
          <p style={{ textAlign:'center',fontFamily:'var(--font-lato),sans-serif',fontSize:10,
            letterSpacing:'0.3em',textTransform:'uppercase',color:'rgba(232,212,154,0.55)',marginBottom:32 }}>
            Celebrating love · Taj Lake Palace · Udaipur
          </p>
        </Reveal>
        <div className="gallery-grid" style={{
          display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,
          maxWidth:1000,margin:'0 auto',
        }}>
          {IMG.gallery.map((img,i) => (
            <Reveal key={i} delay={i * 80}>
              <div className="gallery-img" style={{
                height: i===0||i===3 ? 260 : 200,
                boxShadow:'0 4px 20px rgba(0,0,0,0.3)',
              }}>
                <img src={img.src} alt={img.label} loading="lazy"/>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── COUPLE SHOWCASE ──────────────────────────────────── */}
      <section style={{
        position:'relative',padding:'clamp(64px,10vw,100px) 24px',
        backgroundImage:`url(${IMG.flowers})`,backgroundSize:'cover',backgroundPosition:'center',backgroundAttachment:'fixed',
        overflow:'hidden',
      }}>
        <div style={{ position:'absolute',inset:0,background:'rgba(250,244,238,0.92)' }}/>
        <div style={{ maxWidth:700,margin:'0 auto',position:'relative',textAlign:'center' }}>

          {/* Spinning floral ornament */}
          <div style={{ fontSize:28,letterSpacing:10,marginBottom:20,color:C.blushDeep,opacity:0.65 }}>✿ ❀ ✿</div>

          <Reveal>
            <div style={{
              background:'rgba(255,255,255,0.9)',border:`1px solid rgba(201,168,76,0.28)`,
              borderRadius:28,padding:'clamp(36px,7vw,64px) clamp(24px,6vw,60px)',
              boxShadow:'0 16px 60px rgba(44,24,16,0.10),0 2px 8px rgba(201,168,76,0.08)',
              backdropFilter:'blur(8px)',position:'relative',
            }}>
              {/* Decorative corners */}
              {['tl','tr','bl','br'].map(pos => (
                <div key={pos} style={{
                  position:'absolute',
                  top: pos.startsWith('t') ? 14 : 'auto',
                  bottom: pos.startsWith('b') ? 14 : 'auto',
                  left: pos.endsWith('l') ? 14 : 'auto',
                  right: pos.endsWith('r') ? 14 : 'auto',
                  width:40,height:40,opacity:0.35,
                  borderTop: pos.startsWith('t') ? `2px solid ${C.gold}` : 'none',
                  borderBottom: pos.startsWith('b') ? `2px solid ${C.gold}` : 'none',
                  borderLeft: pos.endsWith('l') ? `2px solid ${C.gold}` : 'none',
                  borderRight: pos.endsWith('r') ? `2px solid ${C.gold}` : 'none',
                }}/>
              ))}

              <div style={{ height:1,background:`linear-gradient(90deg,transparent,${C.gold},transparent)`,marginBottom:36 }}/>

              <p style={{ fontFamily:'var(--font-lato),sans-serif',fontSize:10,letterSpacing:'0.32em',
                textTransform:'uppercase',color:C.goldDark,marginBottom:20 }}>
                Together with their families
              </p>

              <h2 style={{ fontFamily:'var(--font-great-vibes),cursive',fontSize:'clamp(52px,12vw,90px)',
                color:C.deepWine,lineHeight:1,margin:'0 0 4px' }}>Yashna</h2>
              <p style={{ fontSize:28,margin:'8px 0',color:C.gold }}>❤️</p>
              <h2 style={{ fontFamily:'var(--font-great-vibes),cursive',fontSize:'clamp(52px,12vw,90px)',
                color:C.deepWine,lineHeight:1,margin:'0 0 32px' }}>Yash</h2>

              <Ornament color={C.goldDark} />

              <div style={{ marginTop:28 }}>
                <p style={{ fontFamily:'var(--font-cormorant),Georgia,serif',fontStyle:'italic',
                  fontSize:'clamp(15px,3vw,19px)',color:C.textMid,marginBottom:10,letterSpacing:'0.02em',lineHeight:1.6 }}>
                  request the pleasure of your company at their wedding celebration
                </p>
                <p style={{ fontFamily:'var(--font-cormorant),Georgia,serif',fontSize:'clamp(18px,4vw,26px)',
                  fontWeight:600,color:C.textDark,marginBottom:6 }}>
                  Taj Lake Palace, Udaipur
                </p>
                <p style={{ fontFamily:'var(--font-lato),sans-serif',fontSize:12,letterSpacing:'0.18em',
                  textTransform:'uppercase',color:C.goldDark }}>
                  17 December 2026
                </p>
              </div>

              {/* Hashtag monogram */}
              <div style={{ marginTop:28,display:'inline-block',background:`linear-gradient(135deg,${C.champagne},#FAF0E0)`,
                border:`1px solid rgba(201,168,76,0.3)`,borderRadius:14,padding:'12px 32px' }}>
                <p style={{ fontFamily:'var(--font-cormorant),Georgia,serif',fontSize:26,color:C.goldDark,margin:0,letterSpacing:'0.06em' }}>#Y2K</p>
              </div>

              <div style={{ height:1,background:`linear-gradient(90deg,transparent,${C.gold},transparent)`,marginTop:36 }}/>
            </div>
          </Reveal>

          <div style={{ fontSize:28,letterSpacing:10,marginTop:20,color:C.blushDeep,opacity:0.65 }}>✿ ❀ ✿</div>
        </div>
      </section>

      {/* ── WELCOME LETTER ───────────────────────────────────── */}
      <section style={{
        position:'relative',padding:'clamp(60px,10vw,100px) 24px',
        backgroundImage:`url(${IMG.palace})`,backgroundSize:'cover',backgroundPosition:'center',
        overflow:'hidden',
      }}>
        <div style={{ position:'absolute',inset:0,background:'linear-gradient(160deg,rgba(22,8,16,0.91) 0%,rgba(30,12,20,0.94) 100%)' }}/>
        <div style={{ maxWidth:660,margin:'0 auto',position:'relative',textAlign:'center' }}>
          <Reveal>
            <p style={{ fontFamily:'var(--font-lato),sans-serif',fontSize:10,letterSpacing:'0.3em',
              textTransform:'uppercase',color:C.goldLight,opacity:0.65,marginBottom:18 }}>
              A note for our guests
            </p>
            <h2 style={{ fontFamily:'var(--font-cormorant),Georgia,serif',fontSize:'clamp(26px,5vw,42px)',
              fontWeight:300,color:'#FFF',marginBottom:8,fontStyle:'italic' }}>
              Dear Wedding Guest,
            </h2>
            <Ornament color={C.gold} />
            <p style={{ fontFamily:'var(--font-cormorant),Georgia,serif',fontSize:'clamp(17px,3vw,22px)',
              color:'rgba(245,236,214,0.85)',lineHeight:1.85,margin:'24px 0 18px',fontStyle:'italic' }}>
              Welcome to the celebration of Yashna &amp; Yash.
            </p>
            <p style={{ fontFamily:'var(--font-lato),sans-serif',fontSize:15,color:'rgba(245,236,214,0.68)',
              lineHeight:1.95,marginBottom:18 }}>
              To make your journey effortless, <strong style={{ color:C.goldLight }}>BagDrop</strong> has partnered to
              provide dedicated luggage concierge services for all wedding guests attending{' '}
              <strong style={{ color:C.goldLight }}>#Y2K</strong> at Taj Lake Palace, Udaipur.
            </p>
            <p style={{ fontFamily:'var(--font-cormorant),Georgia,serif',fontSize:'clamp(17px,3vw,22px)',
              color:'rgba(245,236,214,0.82)',lineHeight:1.85,fontStyle:'italic' }}>
              Simply arrive, enjoy the festivities,<br/>and we&apos;ll take care of the baggage logistics.
            </p>
            <div style={{ marginTop:36,display:'inline-block',background:'rgba(201,168,76,0.1)',
              border:`1px solid rgba(201,168,76,0.28)`,borderRadius:14,padding:'15px 32px' }}>
              <p style={{ fontFamily:'var(--font-lato),sans-serif',fontSize:11,letterSpacing:'0.2em',
                textTransform:'uppercase',color:C.goldLight,margin:0 }}>
                ✨ Exclusive Concierge for #Y2K Guests ✨
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── WEDDING INFO ─────────────────────────────────────── */}
      <section id="wedding-info" style={{ background:C.cream,padding:'clamp(60px,10vw,100px) 24px' }}>
        <div style={{ maxWidth:860,margin:'0 auto',textAlign:'center' }}>
          <Reveal>
            <p style={{ fontFamily:'var(--font-lato),sans-serif',fontSize:10,letterSpacing:'0.3em',
              textTransform:'uppercase',color:C.goldDark,marginBottom:10 }}>Wedding Details</p>
            <h2 style={{ fontFamily:'var(--font-cormorant),Georgia,serif',fontSize:'clamp(28px,5vw,46px)',
              fontWeight:300,color:C.textDark,marginBottom:6 }}>Everything You Need to Know</h2>
            <Ornament color={C.gold} />
          </Reveal>
          <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:20,marginTop:48 }}>
            {[
              { emoji:'📍',label:'Venue',       value:'Taj Lake Palace\nUdaipur' },
              { emoji:'📅',label:'Wedding Date', value:'17 December 2026' },
              { emoji:'💍',label:'Celebration',  value:'Yashna ❤️ Yash' },
              { emoji:'🏷', label:'Hashtag',     value:'#Y2K' },
            ].map(({emoji,label,value},i) => (
              <Reveal key={label} delay={i*100}>
                <div className="info-card" style={{
                  background:'#fff',border:`1px solid rgba(201,168,76,0.18)`,borderRadius:22,
                  padding:'32px 20px',boxShadow:'0 2px 20px rgba(44,24,16,0.05)',textAlign:'center',
                }}>
                  <div style={{ fontSize:32,marginBottom:14 }}>{emoji}</div>
                  <p style={{ fontFamily:'var(--font-lato),sans-serif',fontSize:9,letterSpacing:'0.25em',
                    textTransform:'uppercase',color:C.goldDark,marginBottom:10 }}>{label}</p>
                  <p style={{ fontFamily:'var(--font-cormorant),Georgia,serif',fontSize:'clamp(16px,3vw,21px)',
                    fontWeight:500,color:C.textDark,lineHeight:1.35,whiteSpace:'pre-line' }}>{value}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── COUNTDOWN ────────────────────────────────────────── */}
      <section style={{
        background:`linear-gradient(160deg,${C.deepWine} 0%,#2A0D1A 50%,${C.deepWine} 100%)`,
        padding:'clamp(64px,10vw,100px) 24px',textAlign:'center',position:'relative',overflow:'hidden',
      }}>
        <div style={{ position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',
          width:'150%',height:'150%',background:'radial-gradient(ellipse,rgba(201,168,76,0.06) 0%,transparent 65%)',pointerEvents:'none' }}/>
        <Reveal>
          <p style={{ fontFamily:'var(--font-lato),sans-serif',fontSize:10,letterSpacing:'0.3em',
            textTransform:'uppercase',color:C.goldLight,opacity:0.65,marginBottom:14,position:'relative' }}>
            The Big Day Approaches
          </p>
          <h2 style={{ fontFamily:'var(--font-cormorant),Georgia,serif',fontSize:'clamp(26px,5vw,46px)',
            fontWeight:300,color:'#FFF',marginBottom:4,position:'relative' }}>
            Counting Down to{' '}<span style={{ color:C.goldLight }}>#Y2K</span>
          </h2>
          <p style={{ fontFamily:'var(--font-cormorant),Georgia,serif',fontStyle:'italic',
            fontSize:'clamp(15px,2.5vw,19px)',color:'rgba(245,236,214,0.55)',marginBottom:48,position:'relative' }}>
            17 December 2026 · Taj Lake Palace, Udaipur
          </p>
        </Reveal>
        {cd.ready && (
          <Reveal delay={200}>
            <div style={{ display:'flex',justifyContent:'center',gap:'clamp(12px,3vw,24px)',flexWrap:'wrap' }}>
              <Tile v={cd.d} label="Days"/>
              <span style={{ color:'rgba(201,168,76,0.35)',fontSize:42,fontFamily:'var(--font-cormorant)',alignSelf:'center',marginTop:-20 }}>·</span>
              <Tile v={cd.h} label="Hours"/>
              <span style={{ color:'rgba(201,168,76,0.35)',fontSize:42,fontFamily:'var(--font-cormorant)',alignSelf:'center',marginTop:-20 }}>·</span>
              <Tile v={cd.m} label="Minutes"/>
              <span style={{ color:'rgba(201,168,76,0.35)',fontSize:42,fontFamily:'var(--font-cormorant)',alignSelf:'center',marginTop:-20 }}>·</span>
              <Tile v={cd.s} label="Seconds"/>
            </div>
          </Reveal>
        )}
        <Reveal delay={300}>
          <div style={{ marginTop:52 }}>
            <Ornament color="rgba(201,168,76,0.35)" />
          </div>
        </Reveal>
      </section>

      {/* ── BOOKING FORM ─────────────────────────────────────── */}
      <section id="book" style={{
        background:`linear-gradient(160deg,#FAF4EE 0%,${C.champagne} 100%)`,
        padding:'clamp(64px,10vw,100px) 24px',
      }}>
        <div style={{ maxWidth:680,margin:'0 auto' }}>
          <Reveal>
            <div style={{ textAlign:'center',marginBottom:48 }}>
              <p style={{ fontFamily:'var(--font-lato),sans-serif',fontSize:10,letterSpacing:'0.3em',
                textTransform:'uppercase',color:C.goldDark,marginBottom:12 }}>Concierge Booking</p>
              <h2 style={{ fontFamily:'var(--font-cormorant),Georgia,serif',fontSize:'clamp(28px,5vw,46px)',
                fontWeight:300,color:C.textDark,marginBottom:8 }}>
                Reserve Your Wedding<br/>Luggage Concierge
              </h2>
              <Ornament color={C.gold} />
              <p style={{ fontFamily:'var(--font-lato),sans-serif',fontSize:14,color:C.textMid,marginTop:16,lineHeight:1.75 }}>
                Exclusive luggage assistance for guests attending<br/>
                <strong>Yashna ❤️ Yash&apos;s</strong> wedding at Taj Lake Palace, Udaipur.
              </p>
            </div>
          </Reveal>

          <form onSubmit={submit}>
            <Reveal delay={100}>
              <div style={{ background:'#fff',borderRadius:26,padding:'clamp(24px,5vw,44px)',
                border:`1px solid rgba(201,168,76,0.22)`,boxShadow:'0 8px 48px rgba(44,24,16,0.08)',marginBottom:20 }}>

                <div style={{ display:'grid',gap:20,gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',marginBottom:20 }}>
                  <Field label="Full Name" required>
                    <input required type="text" placeholder="e.g. Priya Sharma" value={form.name}
                      onChange={e=>patch('name',e.target.value)}
                      className="form-input" style={IS}
                      onFocus={()=>setFocusedInput('name')} onBlur={()=>setFocusedInput(null)}/>
                  </Field>
                  <Field label="Mobile Number" required>
                    <input required type="tel" placeholder="10-digit number" value={form.phone}
                      onChange={e=>patch('phone',e.target.value.replace(/\D/g,'').slice(0,10))}
                      className="form-input" style={IS}
                      onFocus={()=>setFocusedInput('phone')} onBlur={()=>setFocusedInput(null)}/>
                  </Field>
                </div>

                <div style={{ marginBottom:20 }}>
                  <Field label="Email Address">
                    <input type="email" placeholder="your@email.com (optional)" value={form.email}
                      onChange={e=>patch('email',e.target.value)}
                      className="form-input" style={IS}/>
                  </Field>
                </div>

                <div style={{ display:'grid',gap:20,gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',marginBottom:20 }}>
                  <Field label="Guests in Group">
                    <input type="number" min={1} max={100} value={form.guests}
                      onChange={e=>patch('guests',e.target.value)}
                      className="form-input" style={IS}/>
                  </Field>
                  <Field label="Number of Bags">
                    <input type="number" min={1} max={50} value={form.bags}
                      onChange={e=>patch('bags',e.target.value)}
                      className="form-input" style={IS}/>
                  </Field>
                </div>

                {/* Pickup Address */}
                <div style={{ marginBottom:20 }}>
                  <Field label="Pickup Address" required>
                    <input required type="text" placeholder="Your hotel / home address in Udaipur" value={form.pickupAddress}
                      onChange={e=>patch('pickupAddress',e.target.value)}
                      className="form-input" style={IS}/>
                  </Field>
                </div>

                {/* Pickup Time Slot */}
                <div style={{ marginBottom:20 }}>
                  <label style={{ fontFamily:'var(--font-lato),sans-serif',fontSize:10,fontWeight:700,
                    letterSpacing:'0.2em',textTransform:'uppercase',color:C.goldDark,display:'block',marginBottom:10 }}>
                    Preferred Pickup Time
                  </label>
                  <div style={{ display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:10 }}>
                    {TIME_SLOTS.map(slot => {
                      const active = form.pickupTime === slot.id
                      return (
                        <button key={slot.id} type="button" onClick={()=>patch('pickupTime',slot.id)}
                          className="time-slot"
                          style={{
                            display:'flex',alignItems:'center',gap:10,
                            padding:'12px 14px',borderRadius:14,textAlign:'left',cursor:'pointer',
                            border: active ? `2px solid ${C.gold}` : '2px solid rgba(201,168,76,0.2)',
                            background: active ? `rgba(201,168,76,0.1)` : '#FDFAF5',
                            transition:'all 0.2s',
                          }}>
                          <span style={{ fontSize:18 }}>{slot.icon}</span>
                          <div>
                            <p style={{ fontFamily:'var(--font-lato),sans-serif',fontSize:12,fontWeight:700,
                              color: active ? C.goldDark : C.textDark,margin:0,letterSpacing:'0.05em' }}>
                              {slot.label}
                            </p>
                            <p style={{ fontFamily:'var(--font-lato),sans-serif',fontSize:10,
                              color:C.textMid,margin:0,marginTop:2 }}>{slot.range}</p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Delivery Address — fixed */}
                <div style={{ marginBottom:20 }}>
                  <Field label="Delivery Address">
                    <input type="text" value="Taj Lake Palace, Udaipur" readOnly
                      style={{ ...IS, background:'#F5ECD6', color:C.textMid, cursor:'default',
                        border:`1.5px solid rgba(201,168,76,0.18)` }}/>
                  </Field>
                </div>

                {/* Special Requests */}
                <div>
                  <Field label="Special Requests">
                    <textarea rows={3} placeholder="Fragile items, specific handling, timing preferences…" value={form.requests}
                      onChange={e=>patch('requests',e.target.value)}
                      className="form-input" style={{ ...IS,resize:'none' }}/>
                  </Field>
                </div>

                {err && (
                  <div style={{ marginTop:18,background:'rgba(220,38,38,0.07)',border:'1px solid rgba(220,38,38,0.18)',
                    borderRadius:12,padding:'12px 16px' }}>
                    <p style={{ fontFamily:'var(--font-lato),sans-serif',fontSize:13,color:'#DC2626',margin:0 }}>{err}</p>
                  </div>
                )}
              </div>
            </Reveal>

            <Reveal delay={200}>
              <button type="submit" disabled={busy} className="cta-btn-primary" style={{
                fontFamily:'var(--font-lato),sans-serif',fontSize:13,fontWeight:700,
                letterSpacing:'0.14em',textTransform:'uppercase',color:C.textDark,
                background: busy ? 'rgba(201,168,76,0.5)' : `linear-gradient(135deg,${C.goldLight} 0%,${C.gold} 100%)`,
                border:'none',padding:'18px 40px',borderRadius:999,
                cursor: busy ? 'not-allowed' : 'pointer',
                boxShadow:`0 4px 24px rgba(201,168,76,0.3)`,width:'100%',
              }}>
                {busy ? '✦ Submitting your request…' : '✦ Reserve Luggage Concierge for #Y2K'}
              </button>
              <p style={{ fontFamily:'var(--font-lato),sans-serif',fontSize:11,color:C.textMid,
                textAlign:'center',opacity:0.65,marginTop:14 }}>
                No payment required now · Our team will reach out to confirm details · Inquiry sent to info@bagdrop.co
              </p>
            </Reveal>
          </form>
        </div>
      </section>

      {/* ── SOCIAL SECTION ───────────────────────────────────── */}
      <section style={{ background:`linear-gradient(180deg,${C.wine} 0%,${C.deepWine} 100%)`,
        padding:'clamp(60px,10vw,96px) 24px',textAlign:'center' }}>
        <div style={{ maxWidth:580,margin:'0 auto' }}>
          <Reveal>
            <div style={{ fontSize:40,marginBottom:16 }}>📸</div>
            <p style={{ fontFamily:'var(--font-lato),sans-serif',fontSize:10,letterSpacing:'0.3em',
              textTransform:'uppercase',color:C.goldLight,opacity:0.6,marginBottom:14 }}>
              Share the love
            </p>
            <h2 style={{ fontFamily:'var(--font-cormorant),Georgia,serif',fontSize:'clamp(28px,5vw,44px)',
              fontWeight:300,color:'#FFF',marginBottom:6 }}>
              Share Your Memories
            </h2>
            <Ornament color={C.gold} />
            <p style={{ fontFamily:'var(--font-lato),sans-serif',fontSize:14,color:'rgba(245,236,214,0.65)',
              lineHeight:1.85,margin:'20px 0 32px' }}>
              Capture every moment — tag your posts,<br/>stories, and reels with the official hashtag.
            </p>
            <div style={{ background:'rgba(201,168,76,0.12)',border:`2px solid rgba(201,168,76,0.35)`,
              borderRadius:22,padding:'28px 44px',display:'inline-block',marginBottom:36,
              animation:'pulseGold 3s ease-in-out infinite' }}>
              <p style={{ fontFamily:'var(--font-cormorant),Georgia,serif',
                fontSize:'clamp(48px,12vw,80px)',fontWeight:300,color:C.goldLight,margin:0,lineHeight:1 }}>
                #Y2K
              </p>
              <p style={{ fontFamily:'var(--font-lato),sans-serif',fontSize:10,letterSpacing:'0.18em',
                textTransform:'uppercase',color:'rgba(245,236,214,0.45)',marginTop:8 }}>
                Official Wedding Hashtag
              </p>
            </div>
            <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:10,maxWidth:500,margin:'0 auto' }}>
              {[
                '✈️  Arrival & travel moments',
                '💒  Wedding ceremonies',
                '🏰  Udaipur & Lake Palace',
                '🎊  Receptions & festivities',
              ].map(item => (
                <div key={item} style={{
                  fontFamily:'var(--font-lato),sans-serif',fontSize:13,
                  color:'rgba(245,236,214,0.6)',background:'rgba(255,255,255,0.04)',
                  border:'1px solid rgba(201,168,76,0.12)',borderRadius:12,
                  padding:'10px 18px',textAlign:'left',
                }}>{item}</div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────── */}
      <footer style={{ background:'#080308',padding:'clamp(40px,6vw,60px) 24px 28px',textAlign:'center' }}>
        <div style={{ maxWidth:480,margin:'0 auto' }}>
          <p style={{ fontFamily:'var(--font-great-vibes),cursive',fontSize:36,color:C.goldLight,marginBottom:4 }}>
            Yashna ❤️ Yash
          </p>
          <p style={{ fontFamily:'var(--font-cormorant),Georgia,serif',fontSize:17,
            color:'rgba(245,236,214,0.45)',marginBottom:24,letterSpacing:'0.06em' }}>
            #Y2K · 17 December 2026 · Taj Lake Palace, Udaipur
          </p>
          <Ornament color="rgba(201,168,76,0.25)" />
          <div style={{ marginTop:24,display:'flex',flexDirection:'column',gap:6 }}>
            <p style={{ fontFamily:'var(--font-lato),sans-serif',fontSize:11,color:'rgba(245,236,214,0.3)',letterSpacing:'0.08em' }}>
              Luggage concierge exclusively for #Y2K wedding guests
            </p>
            <p style={{ fontFamily:'var(--font-lato),sans-serif',fontSize:10,color:'rgba(245,236,214,0.18)',letterSpacing:'0.05em' }}>
              Powered by{' '}
              <a href="https://bagdrop.co" style={{ color:'rgba(201,168,76,0.38)',textDecoration:'none' }}>Bagdrop</a>
              {' '}— India&apos;s Premium Luggage Concierge ·{' '}
              <a href="mailto:info@bagdrop.co" style={{ color:'rgba(201,168,76,0.38)',textDecoration:'none' }}>info@bagdrop.co</a>
            </p>
          </div>
        </div>
      </footer>

    </div>
  )
}
