'use client'

import { motion } from 'framer-motion'

/**
 * SceneGallery — Horizontal editorial photo strip.
 *
 * PLACEHOLDER IMAGES: All images are sourced from Unsplash for development.
 * Replace before launch. See art direction comments per scene.
 *
 * Each Bagdrop photo should be:
 * - Shot at 2:3 or 4:3 ratio, landscape orientation
 * - Warm, premium colour grading (not cold/clinical)
 * - Hero: person or luggage in foreground, airport/venue in background
 * - No stock-photo expressions — candid, aspirational
 */

const SCENES = [
  {
    id: 'airport-pickup',
    // Art direction: Mumbai/Delhi airport terminal — natural light, premium feel.
    // Show Bagdrop staff or traveller at arrivals/departures.
    src: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=680&h=510&q=80&auto=format&fit=crop',
    badge: 'Airport Pickup',
    caption: 'Collected at arrivals, delivered to your door',
    bgPosition: 'center 40%',
  },
  {
    id: 'excess-baggage',
    // Art direction: Multiple premium suitcases / excess bags on trolley or carousel.
    // Show the scale of the problem Bagdrop solves.
    src: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=680&h=510&q=80&auto=format&fit=crop',
    badge: 'Excess Baggage',
    caption: 'Ship ahead and skip airline excess fees entirely',
    bgPosition: 'center center',
  },
  {
    id: 'hands-free',
    // Art direction: Traveller walking through airport terminal, hands-free,
    // no bags visible. Wide angle, aspirational.
    src: 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=680&h=510&q=80&auto=format&fit=crop',
    badge: 'Hands-Free Travel',
    caption: 'Nothing to carry but your boarding pass',
    bgPosition: 'center 30%',
  },
  {
    id: 'doorstep-delivery',
    // Art direction: Premium suitcase at an upscale home entrance or hotel lobby.
    // Show delivery as a luxury service, not a courier drop.
    src: 'https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=680&h=510&q=80&auto=format&fit=crop',
    badge: 'Doorstep Delivery',
    caption: 'Your bags arrive before your taxi does',
    bgPosition: 'center 60%',
  },
  {
    id: 'destination-wedding',
    // Art direction: Wedding venue with luggage — outdoor setting, golden light.
    // Premium wardrobe boxes or garment bags on a scenic background.
    src: 'https://images.unsplash.com/photo-1519225421980-715cb0215aed?w=680&h=510&q=80&auto=format&fit=crop',
    badge: 'Destination Weddings',
    caption: 'Wedding wardrobes delivered with ceremony-grade care',
    bgPosition: 'center 25%',
  },
]

// Stagger container
const containerVariants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
}

// Individual card entrance
const cardVariants = {
  hidden:  { opacity: 0, y: 24, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.55, ease: 'easeOut' as const },
  },
}

export function SceneGallery() {
  return (
    <section
      className="section-padding overflow-hidden bg-white"
      aria-labelledby="scene-gallery-heading"
    >
      {/* Section heading — contained */}
      <div className="section-container mb-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5, ease: 'easeOut' as const }}
        >
          <span className="eyebrow">Service Gallery</span>
          <h2
            id="scene-gallery-heading"
            className="mt-3 font-display text-display-md text-text-primary max-w-2xl"
          >
            Every journey handled,{' '}
            <span className="text-gradient">end to end.</span>
          </h2>
          <p className="mt-4 text-lg text-text-secondary max-w-xl">
            From Mumbai arrivals to destination wedding venues — Bagdrop is
            wherever your bags need to be.
          </p>
        </motion.div>
      </div>

      {/* Full-bleed horizontal photo strip.
          Left padding mirrors the section-container offset so the first card
          aligns with the rest of the page content. On small screens it falls
          back to 1rem. */}
      <div
        className="overflow-x-auto scrollbar-hide"
        style={{
          paddingLeft: 'max(1rem, calc((100vw - 80rem) / 2 + 2rem))',
          scrollSnapType: 'x mandatory',
        }}
        role="region"
        aria-label="Service gallery — swipe to see more scenes"
      >
        <motion.div
          className="flex gap-4 pr-8"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
        >
          {SCENES.map((scene) => (
            <motion.article
              key={scene.id}
              variants={cardVariants}
              className="group relative w-[300px] shrink-0 overflow-hidden rounded-2xl bg-neutral-100 sm:w-[340px]"
              style={{
                aspectRatio: '4 / 3',
                scrollSnapAlign: 'start',
              }}
            >
              {/* Background photo */}
              <div
                className="absolute inset-0 bg-cover bg-no-repeat transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                style={{
                  backgroundImage: `url('${scene.src}')`,
                  backgroundPosition: scene.bgPosition,
                }}
                aria-hidden="true"
              />

              {/* Gradient overlay — dark at bottom for text legibility */}
              <div
                className="absolute inset-0 bg-gradient-to-t from-midnight/90 via-midnight/20 to-transparent"
                aria-hidden="true"
              />

              {/* Content — badge + caption at bottom */}
              <div className="absolute inset-x-0 bottom-0 p-5">
                <span className="inline-flex items-center rounded-full bg-brand px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white">
                  {scene.badge}
                </span>
                <p className="mt-2.5 text-sm font-medium leading-snug text-white/90">
                  {scene.caption}
                </p>
              </div>
            </motion.article>
          ))}
        </motion.div>
      </div>

      {/* Scroll progress dots */}
      <div className="section-container mt-5 flex items-center gap-3">
        <span className="text-xs text-text-muted">Swipe to explore</span>
        <div className="flex items-center gap-1.5" aria-hidden="true">
          {SCENES.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all duration-300 ${
                i === 0 ? 'w-6 bg-brand' : 'w-1.5 bg-border'
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
