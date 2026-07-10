'use client'

import Image from 'next/image'
import { motion } from 'framer-motion'

const HAPPY_CLIENTS = [
  {
    name:    'Mr. Brijesh Patel',
    bags:    6,
    route:   'Vadodara to Mumbai',
    image:   '/images/testimonials/brijesh-patel.jpg',
    initials: 'BP',
  },
  {
    name:    'Mr. Suyash Vaishnav',
    bags:    3,
    route:   'Vadodara to Mumbai',
    image:   '/images/testimonials/suyash-vaishnav.jpg',
    initials: 'SV',
  },
  {
    name:    'Ms. Shimoli Joshi',
    bags:    2,
    route:   'Vadodara to Mumbai',
    image:   '/images/testimonials/shimoli-joshi.jpg',
    initials: 'SJ',
  },
  {
    name:    'Mr. Nimesh Shah',
    bags:    3,
    route:   'Vadodara to Mumbai',
    image:   '/images/testimonials/nimesh-shah.jpg',
    initials: 'NS',
  },
]

const containerVariants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
}

const cardVariants = {
  hidden:  { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' as const } },
}

function StarRow() {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} className="h-4 w-4 fill-[#FF6300]" viewBox="0 0 20 20" aria-hidden="true">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  )
}

export function Testimonials() {
  return (
    <section className="section-padding bg-cream" aria-labelledby="testimonials-heading">
      <div className="section-container">

        {/* Heading */}
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5, ease: 'easeOut' as const }}
        >
          <span className="eyebrow">Happy Clients</span>
          <h2 id="testimonials-heading" className="mt-3 font-display text-display-md text-text-primary">
            Real customers. Real deliveries.
          </h2>
          <p className="mt-4 text-lg text-text-secondary max-w-xl mx-auto">
            Every bag delivered. Every client smiling.
          </p>
        </motion.div>

        {/* Client cards */}
        <div className="-mx-4 sm:mx-0 mt-12">
          <motion.div
            className="flex gap-5 overflow-x-auto px-4 pb-4 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:overflow-visible sm:px-0 sm:pb-0 scrollbar-hide"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-60px' }}
          >
            {HAPPY_CLIENTS.map((client) => (
              <motion.div
                key={client.name}
                variants={cardVariants}
                className="w-[72vw] shrink-0 sm:w-auto overflow-hidden rounded-2xl border border-border bg-white shadow-sm"
              >
                {/* Photo */}
                <div className="relative h-72 w-full bg-stone-100">
                  <Image
                    src={client.image}
                    alt={client.name}
                    fill
                    className="object-cover object-top"
                    sizes="(max-width: 640px) 72vw, (max-width: 1024px) 50vw, 25vw"
                  />

                </div>

                {/* Details */}
                <div className="p-5">
                  <StarRow />
                  <p className="mt-2 font-bold text-text-primary">{client.name}</p>
                  <p className="mt-0.5 text-sm text-text-secondary">
                    <span className="font-semibold text-[#FF6300]">{client.bags} {client.bags === 1 ? 'Bag' : 'Bags'}</span>
                    {' '}Delivered
                  </p>
                  <p className="text-sm text-text-muted">{client.route}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>

      </div>
    </section>
  )
}
