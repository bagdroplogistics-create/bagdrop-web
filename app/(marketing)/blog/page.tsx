import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Clock, Tag } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Blog — Bagdrop | Aviation Infrastructure & Baggage Technology',
  description: 'Insights on aviation infrastructure, digital baggage technology, and the future of travel logistics in India.',
}

const POSTS = [
  {
    slug:      'india-digital-baggage-infrastructure-layer',
    tag:       'Aviation Infrastructure',
    date:      'June 2025',
    readTime:  '6 min read',
    title:     'Building India\'s Digital Baggage Infrastructure Layer',
    excerpt:   'India\'s airports handled over 370 million passengers in FY2024. Yet the baggage journey — from check-in to destination — remains largely manual, opaque, and expensive. Bagdrop is building the infrastructure layer that changes this.',
    image:     'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=800&q=80&auto=format&fit=crop',
  },
  {
    slug:      'why-airline-excess-baggage-fees-are-broken',
    tag:       'Travel Economics',
    date:      'May 2025',
    readTime:  '4 min read',
    title:     'Why Airline Excess Baggage Fees Are Broken — And What Comes Next',
    excerpt:   'Airlines charge Rs. 400–800 per kg for excess baggage. A standard 10kg excess bag from Mumbai to Delhi costs more than some budget tickets. The model is broken. Here\'s how the industry is evolving.',
    image:     'https://images.unsplash.com/photo-1553413077-190dd305871c?w=800&q=80&auto=format&fit=crop',
  },
  {
    slug:      'nri-travel-india-baggage-problem',
    tag:       'NRI Travel',
    date:      'May 2025',
    readTime:  '5 min read',
    title:     'The NRI Baggage Problem: Why Flying Home Shouldn\'t Cost a Fortune',
    excerpt:   'Every year, millions of NRIs fly to India carrying gifts, clothes, and everything in between — often paying more in excess fees than the goods are worth. Bagdrop\'s door-to-door service is changing that equation.',
    image:     'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=800&q=80&auto=format&fit=crop',
  },
  {
    slug:      'destination-wedding-logistics-india',
    tag:       'Wedding Logistics',
    date:      'April 2025',
    readTime:  '5 min read',
    title:     'The Hidden Logistics Challenge Behind Every Destination Wedding',
    excerpt:   'A destination wedding in Udaipur or Goa involves hundreds of kilograms of outfits, décor, and gifts moving across multiple cities. Most families don\'t think about the logistics until something goes wrong. We do.',
    image:     'https://images.unsplash.com/photo-1519225421980-715cb0215aed?w=800&q=80&auto=format&fit=crop&crop=top',
  },
  {
    slug:      'adani-airports-partnership-opportunity',
    tag:       'Aviation Infrastructure',
    date:      'April 2025',
    readTime:  '7 min read',
    title:     'Airport-Integrated Baggage Services: The Next Frontier in Passenger Experience',
    excerpt:   'Global airports from Heathrow to Changi have integrated third-party baggage services into their terminals. India\'s tier-1 airports are the next frontier. Here\'s what that integration looks like and why it matters.',
    image:     'https://images.unsplash.com/photo-1521791136064-7986c2920216?w=800&q=80&auto=format&fit=crop',
  },
  {
    slug:      'student-relocation-baggage-guide',
    tag:       'Student Travel',
    date:      'March 2025',
    readTime:  '4 min read',
    title:     'The Complete Guide to Shipping Your Bags When Moving Abroad for Studies',
    excerpt:   'Moving from India to the UK, US, Canada, or Australia for your Masters? Airlines will charge you Rs. 8,000–15,000 for the extra bags. Bagdrop ships them door-to-door for significantly less. Here\'s everything you need to know.',
    image:     'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?w=800&q=80&auto=format&fit=crop',
  },
]

const TAG_COLORS: Record<string, string> = {
  'Aviation Infrastructure': 'bg-blue-50 text-blue-700',
  'Travel Economics':        'bg-amber-50 text-amber-700',
  'NRI Travel':              'bg-green-50 text-green-700',
  'Wedding Logistics':       'bg-pink-50 text-pink-700',
  'Student Travel':          'bg-purple-50 text-purple-700',
}

export default function BlogPage() {
  const [featured, ...rest] = POSTS

  return (
    <div className="min-h-screen bg-cream">

      {/* Hero */}
      <section className="relative overflow-hidden bg-[#111] py-20 lg:py-28">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-50"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=1400&q=80')" }}
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/40 to-black/10" aria-hidden="true" />
        <div className="relative z-10 section-container">
          <span className="eyebrow text-white/50">Bagdrop Blog</span>
          <h1 className="mt-3 font-display text-display-lg font-bold text-white max-w-2xl">
            Aviation Infrastructure & Travel Insights
          </h1>
          <p className="mt-4 text-lg text-white/65 max-w-xl">
            Perspectives on the future of baggage logistics, airport technology, and smarter travel in India.
          </p>
        </div>
      </section>

      <div className="section-container section-padding">

        {/* Featured post */}
        <div className="mb-14">
          <p className="text-xs font-semibold uppercase tracking-widest text-text-muted mb-5">Featured</p>
          <Link
            href={`/blog/${featured.slug}`}
            className="group grid gap-0 overflow-hidden rounded-2xl border border-border bg-white shadow-sm hover:shadow-lg transition-all duration-300 lg:grid-cols-[1.1fr_1fr]"
          >
            <div className="relative h-64 lg:h-auto overflow-hidden">
              <div
                className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-[1.04]"
                style={{ backgroundImage: `url('${featured.image}')` }}
              />
            </div>
            <div className="flex flex-col justify-center p-8 lg:p-10">
              <div className="flex items-center gap-2 mb-4">
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${TAG_COLORS[featured.tag] ?? 'bg-gray-100 text-gray-600'}`}>
                  {featured.tag}
                </span>
              </div>
              <h2 className="font-display text-2xl font-bold text-text-primary leading-snug group-hover:text-brand transition-colors">
                {featured.title}
              </h2>
              <p className="mt-3 text-base text-text-secondary leading-relaxed line-clamp-3">
                {featured.excerpt}
              </p>
              <div className="mt-6 flex items-center justify-between">
                <div className="flex items-center gap-3 text-xs text-text-muted">
                  <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{featured.readTime}</span>
                  <span>{featured.date}</span>
                </div>
                <span className="flex items-center gap-1 text-sm font-semibold text-brand">
                  Read more <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </div>
            </div>
          </Link>
        </div>

        {/* Rest of posts */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {rest.map(post => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
            >
              <div className="relative h-48 overflow-hidden bg-stone-100">
                <div
                  className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-[1.06]"
                  style={{ backgroundImage: `url('${post.image}')` }}
                />
              </div>
              <div className="flex flex-1 flex-col p-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${TAG_COLORS[post.tag] ?? 'bg-gray-100 text-gray-600'}`}>
                    {post.tag}
                  </span>
                </div>
                <h3 className="font-display text-base font-bold text-text-primary leading-snug group-hover:text-brand transition-colors flex-1">
                  {post.title}
                </h3>
                <p className="mt-2 text-sm text-text-secondary leading-relaxed line-clamp-2">
                  {post.excerpt}
                </p>
                <div className="mt-4 flex items-center gap-3 text-xs text-text-muted">
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{post.readTime}</span>
                  <span>{post.date}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Coming soon notice */}
        <div className="mt-14 rounded-2xl border border-brand/20 bg-brand/5 p-8 text-center">
          <Tag className="mx-auto h-6 w-6 text-brand mb-3" />
          <h3 className="font-display text-lg font-bold text-text-primary">More articles coming soon</h3>
          <p className="mt-2 text-sm text-text-secondary max-w-md mx-auto">
            We publish weekly insights on aviation infrastructure, travel logistics, and the future of baggage technology in India.
          </p>
        </div>
      </div>
    </div>
  )
}
