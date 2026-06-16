'use client'

import * as React from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Minus } from 'lucide-react'

const FAQS = [
  {
    question: 'How far in advance do I need to book?',
    answer:
      'We recommend booking at least 24 hours in advance for airport pickups and 48 hours for intercity deliveries. Same-day service may be available in select cities — check at checkout.',
  },
  {
    question: 'What happens if my bag is damaged or lost?',
    answer:
      'Every Bagdrop delivery includes standard insurance coverage. If anything happens to your bag, we initiate a claim immediately. You can also upgrade to Rs. 50,000 premium coverage at checkout for high-value items.',
  },
  {
    question: 'Which cities do you currently operate in?',
    answer:
      'We operate from Mumbai (BOM), Delhi (DEL), and Ahmedabad (AMD) airports with door-to-door service across Gujarat and Maharashtra. We also offer airport service in Goa (GOI). More cities are being added — check coverage at booking.',
  },
  {
    question: 'Can I track my bag in real time?',
    answer:
      'Yes. Once your booking is confirmed, you receive a live tracking link via WhatsApp and email. You can share this link with anyone — family, hotel reception, or your event coordinator.',
  },
  {
    question: 'What types of bags can you handle?',
    answer:
      'We handle cabin bags, medium and large suitcases, oversized luggage, sports equipment (duffel bags, golf bags), and wedding garments. Prohibited items follow standard logistics regulations. When in doubt, contact us on WhatsApp.',
  },
  {
    question: 'Is there a weight limit per bag?',
    answer:
      'Standard bags up to 32 kg are covered under normal pricing. Bags between 32–50 kg fall under our Oversized category. For heavier items or commercial shipments, contact us for a custom quote.',
  },
]

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = React.useState(false)

  return (
    <div className="border-b border-border last:border-0">
      <button
        className="flex w-full items-start justify-between gap-4 py-5 text-left"
        onClick={() => setOpen(prev => !prev)}
        aria-expanded={open}
      >
        <span className={`text-base font-semibold transition-colors duration-200 ${open ? 'text-brand' : 'text-text-primary'}`}>
          {question}
        </span>
        <span className={`mt-0.5 shrink-0 transition-colors duration-200 ${open ? 'text-brand' : 'text-text-muted'}`}>
          {open ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' as const }}
            className="overflow-hidden"
          >
            <p className="pb-5 text-sm leading-relaxed text-text-secondary">
              {answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function FaqSection() {
  return (
    <section className="section-padding bg-white" aria-labelledby="faq-heading">
      <div className="section-container">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.4fr] lg:gap-20">

          {/* Left — sticky header */}
          <motion.div
            className="lg:sticky lg:top-24 lg:self-start"
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, ease: 'easeOut' as const }}
          >
            <span className="eyebrow">FAQ</span>
            <h2
              id="faq-heading"
              className="mt-3 font-display text-display-md text-text-primary"
            >
              Common questions
            </h2>
            <p className="mt-4 text-lg text-text-secondary">
              Can&apos;t find what you need?
            </p>
            <div className="mt-2 space-y-2">
              <Link
                href="/faq"
                className="block text-brand hover:underline font-medium text-base"
              >
                See all FAQs →
              </Link>
              <Link
                href="/contact"
                className="block text-brand hover:underline font-medium text-base"
              >
                Contact us →
              </Link>
              <a
                href="https://wa.me/919000000000"
                target="_blank"
                rel="noopener noreferrer"
                className="block text-brand hover:underline font-medium text-base"
              >
                WhatsApp us →
              </a>
            </div>
          </motion.div>

          {/* Right — accordion */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, ease: 'easeOut' as const }}
          >
            {FAQS.map(faq => (
              <FaqItem key={faq.question} question={faq.question} answer={faq.answer} />
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  )
}
