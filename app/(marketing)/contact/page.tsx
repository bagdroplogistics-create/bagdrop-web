'use client'

import * as React from 'react'
import { Mail, Phone, MessageCircle, MapPin, Clock, Send, CheckCircle2 } from 'lucide-react'

export default function ContactPage() {
  const [form, setForm]           = React.useState({ name: '', email: '', phone: '', subject: '', message: '' })
  const [loading, setLoading]     = React.useState(false)
  const [submitted, setSubmitted] = React.useState(false)
  const [error, setError]         = React.useState('')

  function update(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) { setSubmitted(true) }
      else { setError('Something went wrong. Please WhatsApp us directly.') }
    } catch {
      setError('Network error. Please try WhatsApp.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-cream">

      {/* Hero */}
      <section className="relative bg-[#111] py-20 lg:py-28 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-55"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1521791136064-7986c2920216?w=1400&q=80')" }}
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/35 to-black/10" aria-hidden="true" />
        <div className="relative z-10 section-container text-center">
          <span className="eyebrow text-white/50">Get in Touch</span>
          <h1 className="mt-3 font-display text-display-lg font-bold text-white">
            {"We're here to help"}
          </h1>
          <p className="mt-4 text-lg text-white/60 max-w-md mx-auto">
            Questions, quotes, partnerships, or just want to say hi — we respond fast.
          </p>
        </div>
      </section>

      <div className="section-container section-padding">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr] lg:gap-16">

          {/* ── LEFT — contact channels + offices ── */}
          <div>
            <h2 className="font-display text-xl font-bold text-text-primary mb-5">Contact us directly</h2>
            <div className="space-y-4">

              {/* WhatsApp — now shows 3 numbers */}
              <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-50 text-green-600">
                    <MessageCircle className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-1">WhatsApp</p>
                    <p className="text-[11px] text-text-muted mb-2">Fastest response — reply within 15 min</p>
                    <div className="space-y-1">
                      <a href="https://wa.me/919624516661" target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm font-semibold text-green-600 hover:underline">
                        <MessageCircle className="h-3.5 w-3.5" />+91 96245 16661
                      </a>
                      <a href="https://wa.me/916357115711" target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm font-semibold text-green-600 hover:underline">
                        <MessageCircle className="h-3.5 w-3.5" />+91 63 5711 5711
                      </a>
                      <a href="https://wa.me/916357335733" target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm font-semibold text-green-600 hover:underline">
                        <MessageCircle className="h-3.5 w-3.5" />+91 63 5733 5733
                      </a>
                    </div>
                  </div>
                </div>
              </div>

              {/* Email */}
              <a href="mailto:info@bagdrop.co"
                className="flex items-start gap-4 rounded-2xl border border-border bg-white p-5 shadow-sm hover:border-brand/30 hover:shadow-md transition-all group">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <Mail className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Email</p>
                  <p className="font-semibold text-text-primary group-hover:text-brand transition-colors">info@bagdrop.co</p>
                  <p className="text-xs text-text-muted mt-0.5">For booking inquiries and quotes</p>
                </div>
              </a>

            </div>

            {/* Business Hours */}
            <div className="mt-6 rounded-2xl border border-border bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/10 text-brand">
                  <Clock className="h-4 w-4" />
                </div>
                <h3 className="font-semibold text-text-primary">Business Hours</h3>
              </div>
              <div className="space-y-1.5 text-sm text-text-secondary">
                <p>Monday – Saturday: 8:00 AM – 8:00 PM IST</p>
                <p>Sunday: 10:00 AM – 5:00 PM IST</p>
                <p className="text-xs text-text-muted mt-2">WhatsApp support available 24/7 for urgent queries</p>
              </div>
            </div>

            {/* Our Offices */}
            <div className="mt-8">
              <h2 className="font-display text-xl font-bold text-text-primary mb-4">Our Offices</h2>
              <div className="space-y-4">

                {/* Vadodara HO — only 96245 16661 */}
                <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin className="h-4 w-4 text-brand shrink-0" />
                    <p className="font-bold text-text-primary text-sm">
                      Vadodara
                      <span className="ml-2 rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-semibold text-brand uppercase tracking-wide">Head Office</span>
                    </p>
                  </div>
                  <p className="text-sm text-text-secondary leading-relaxed mb-3">
                    302, 3rd Floor, Ananta Stallion, Gotri Sevasi Road,<br />Gotri, Vadodara &ndash; 391101
                  </p>
                  <a href="tel:+919624516661" className="flex items-center gap-2 text-sm text-brand hover:underline">
                    <Phone className="h-3.5 w-3.5" />+91 96245 16661
                  </a>
                </div>

                {/* Goa */}
                <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin className="h-4 w-4 text-brand shrink-0" />
                    <p className="font-bold text-text-primary text-sm">Goa</p>
                  </div>
                  <p className="text-sm text-text-secondary leading-relaxed mb-3">
                    Shop No 18, Ground Floor, Models Millienium Vistas,<br />Caranzalem Panaji, Goa
                  </p>
                  <div className="space-y-1">
                    <a href="tel:+919624516665" className="flex items-center gap-2 text-sm text-brand hover:underline">
                      <Phone className="h-3.5 w-3.5" />+91 96245 16665
                    </a>
                    <a href="tel:+919023113014" className="flex items-center gap-2 text-sm text-brand hover:underline">
                      <Phone className="h-3.5 w-3.5" />+91 90231 13014
                    </a>
                  </div>
                </div>

                {/* Mumbai */}
                <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin className="h-4 w-4 text-brand shrink-0" />
                    <p className="font-bold text-text-primary text-sm">Mumbai</p>
                  </div>
                  <p className="text-sm text-text-secondary leading-relaxed mb-3">
                    Shop no 1/B, S.L.Matkar Marg, Opp Orbit Tower,<br />Near Dipanker Building, Prabhadevi (West),<br />Mumbai &ndash; 400025
                  </p>
                  <a href="tel:+919624516662" className="flex items-center gap-2 text-sm text-brand hover:underline">
                    <Phone className="h-3.5 w-3.5" />+91 96245 16662
                  </a>
                </div>

              </div>
            </div>
          </div>

          {/* ── RIGHT — form + Sky Bird GSA ── */}
          <div className="space-y-8">

            {/* Contact form */}
            <div className="rounded-2xl border border-border bg-white p-8 shadow-sm">
              {submitted ? (
                <div className="flex h-full flex-col items-center justify-center text-center py-12">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 mb-4">
                    <CheckCircle2 className="h-8 w-8 text-green-600" />
                  </div>
                  <h3 className="font-display text-xl font-bold text-text-primary">Message Sent!</h3>
                  <p className="mt-2 text-text-secondary">{"We'll get back to you within 30 minutes during business hours."}</p>
                  <button
                    onClick={() => { setSubmitted(false); setForm({ name: '', email: '', phone: '', subject: '', message: '' }) }}
                    className="mt-6 text-sm font-semibold text-brand hover:underline"
                  >
                    Send another message
                  </button>
                </div>
              ) : (
                <>
                  <h2 className="font-display text-xl font-bold text-text-primary mb-6">Send us a message</h2>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-text-secondary">Name *</label>
                        <input
                          type="text" required value={form.name} onChange={e => update('name', e.target.value)}
                          placeholder="Your name"
                          className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-text-secondary">Phone *</label>
                        <input
                          type="tel" required value={form.phone} onChange={e => update('phone', e.target.value)}
                          placeholder="+91 98765 43210"
                          className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-text-secondary">Email *</label>
                      <input
                        type="email" required value={form.email} onChange={e => update('email', e.target.value)}
                        placeholder="you@example.com"
                        className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-text-secondary">Subject</label>
                      <select
                        value={form.subject} onChange={e => update('subject', e.target.value)}
                        className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-text-primary focus:border-brand focus:outline-none"
                      >
                        <option value="">Select a topic</option>
                        <option value="Booking Inquiry">Booking Inquiry</option>
                        <option value="Get a Quote">Get a Quote</option>
                        <option value="Partnership">Airport / Hotel Partnership</option>
                        <option value="Corporate">Corporate Account</option>
                        <option value="Support">Support / Complaint</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-text-secondary">Message *</label>
                      <textarea
                        required rows={4} value={form.message} onChange={e => update('message', e.target.value)}
                        placeholder="Tell us how we can help..."
                        className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 resize-none"
                      />
                    </div>
                    {error && <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</p>}
                    <button
                      type="submit" disabled={loading}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3.5 font-bold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
                    >
                      <Send className="h-4 w-4" />
                      {loading ? 'Sending...' : 'Send Message'}
                    </button>
                    <p className="text-center text-xs text-text-muted">
                      Or WhatsApp us for an instant reply
                    </p>
                  </form>
                </>
              )}
            </div>

            {/* Sky Bird Travel & Tours — Exclusive GSA USA */}
            <div className="overflow-hidden rounded-2xl border border-blue-100 shadow-sm">
              {/* Airport / excess baggage image */}
              <div
                className="relative h-44 bg-cover bg-center"
                style={{ backgroundImage: "url('https://images.unsplash.com/photo-1553413077-190dd305871c?w=900&q=80&auto=format&fit=crop')" }}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-[#001f5b]/80 via-[#001f5b]/30 to-transparent" />
                <div className="absolute bottom-4 left-5">
                  <span className="rounded-full bg-white/20 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white backdrop-blur-sm">
                    Exclusive GSA &mdash; USA
                  </span>
                </div>
              </div>

              {/* Sky Bird details */}
              <div className="bg-white p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-2xl">
                    ✈
                  </div>
                  <div>
                    <p className="font-bold text-[#003580] text-base">Sky Bird Travel &amp; Tours</p>
                    <p className="text-xs text-blue-500 font-medium mt-0.5">Official US Partner for Bagdrop</p>
                  </div>
                </div>
                <p className="text-sm text-text-secondary mb-4 leading-relaxed">
                  NRIs and travellers flying from the USA can reach Bagdrop through our exclusive US partner, Sky Bird Travel &amp; Tours.
                </p>
                <div className="space-y-2">
                  <a href="tel:+18887592473"
                    className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-[#003580] hover:bg-blue-100 transition-colors">
                    <Phone className="h-4 w-4 shrink-0" />+1 888 759 2473
                  </a>
                  <a href="mailto:res@skybirdtravel.com"
                    className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-[#003580] hover:bg-blue-100 transition-colors">
                    <Mail className="h-4 w-4 shrink-0" />res@skybirdtravel.com
                  </a>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
