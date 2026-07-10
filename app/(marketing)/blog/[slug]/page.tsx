import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Clock, Tag } from 'lucide-react'

// ── Shared post data (single source of truth) ─────────────────────────────
const POSTS: Record<string, {
  slug: string; tag: string; date: string; readTime: string
  title: string; excerpt: string; image: string
  content: { heading?: string; body: string }[]
}> = {
  'india-digital-baggage-infrastructure-layer': {
    slug:     'india-digital-baggage-infrastructure-layer',
    tag:      'Aviation Infrastructure',
    date:     'June 2025',
    readTime: '6 min read',
    title:    "Building India's Digital Baggage Infrastructure Layer",
    excerpt:  "India's airports handled over 370 million passengers in FY2024. Yet the baggage journey — from check-in to destination — remains largely manual, opaque, and expensive. Bagdrop is building the infrastructure layer that changes this.",
    image:    'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=1200&q=80&auto=format&fit=crop',
    content: [
      {
        body: "India's aviation sector is in the middle of its most significant expansion in history. Over 370 million passengers moved through Indian airports in FY2024. By 2030, that number is expected to cross 500 million. New terminals are being built in Navi Mumbai, Jewar, and Mopa. Airport capacity is scaling. But one thing isn't: the baggage journey.",
      },
      {
        heading: 'The Infrastructure Gap Nobody Is Talking About',
        body: "When a passenger lands at Mumbai's Chhatrapati Shivaji Maharaj International Airport after a 10-hour flight, their bags don't arrive at the same pace as their plane. They stand at a carousel — sometimes for 30 minutes, sometimes longer. Then they haul those bags to a cab, negotiate traffic, and drag everything to their front door. The airport experience ends at the terminal gate. The baggage experience continues for hours after.\n\nThis isn't just a convenience problem. It's an infrastructure gap. In every mature aviation market — the US, Europe, Singapore — third-party baggage logistics have become an accepted part of the airport ecosystem. In India, this layer doesn't exist at scale.",
      },
      {
        heading: "What 'Digital Baggage Infrastructure' Actually Means",
        body: "Bagdrop is not a courier company. We are building the digital coordination layer that sits between airports, passengers, hotels, and ground transport — and makes baggage invisible to the traveller.\n\nThat means: a passenger books a Bagdrop slot when they book their flight. Their bag is collected from home before departure and delivered to their destination before they arrive. On arrival, they walk out of the airport empty-handed. No carousel. No queues. No last-mile problem.\n\nThe infrastructure that makes this possible is: a network of city-level hubs, a real-time tracking and coordination platform, airport partnerships that allow pre-clearance and SLA-backed handoffs, and a revenue model that works for both airlines and passengers.",
      },
      {
        heading: 'The Market Timing Is Right',
        body: "Three things are converging in India right now that make this the right moment to build this infrastructure layer.\n\nFirst, airport privatisation. The shift of major airports to private operators has introduced a commercial mandate that didn't exist before — these operators now need to grow non-aero revenue, and passenger services like baggage handling are a natural category.\n\nSecond, the rise of digital-native passengers. India's middle class is increasingly booking everything online — flights, hotels, cabs. Adding baggage to that digital booking flow is a natural extension of behaviour that already exists.\n\nThird, the cost arbitrage. Domestic excess baggage fees on Indian carriers range from Rs. 400 to Rs. 800 per kg. For a 10kg excess bag, that's Rs. 4,000–8,000. Bagdrop's door-to-door price for the same bag on the same route is typically Rs. 1,500–2,500. The value proposition is mathematically obvious.",
      },
      {
        heading: 'Where We Are Today',
        body: "Bagdrop currently operates across airports in Mumbai, Delhi, and Ahmedabad, serving passengers travelling across Gujarat, Maharashtra, and Goa. We have validated unit economics — our hub breakeven is 17 bags per day, a threshold our pilot operations have consistently exceeded.\n\nBut the bigger picture is not about bags. It's about building the infrastructure layer that India's airports will need as they scale to 500 million passengers. We are the digital baggage infrastructure platform that every airport, airline, and hotel group in India will eventually need to integrate with.\n\nThat's the layer we're building.",
      },
    ],
  },

  'why-airline-excess-baggage-fees-are-broken': {
    slug:     'why-airline-excess-baggage-fees-are-broken',
    tag:      'Travel Economics',
    date:     'May 2025',
    readTime: '4 min read',
    title:    'Why Airline Excess Baggage Fees Are Broken — And What Comes Next',
    excerpt:  'Airlines charge Rs. 400–800 per kg for excess baggage. A standard 10kg excess bag from Mumbai to Delhi costs more than some budget tickets. The model is broken. Here\'s how the industry is evolving.',
    image:    'https://images.unsplash.com/photo-1553413077-190dd305871c?w=1200&q=80&auto=format&fit=crop',
    content: [
      {
        body: "Book a flight from Mumbai to Delhi on a budget carrier. The base fare might be Rs. 2,500. Add a 15kg check-in bag: another Rs. 600–900, depending on when you add it. Exceed that allowance at the airport counter by 10kg, and you're paying Rs. 400–800 per kg in excess fees — a surcharge that could cost more than the original ticket. This is the excess baggage problem, and it's costing Indian travellers thousands of crores of rupees every year.",
      },
      {
        heading: 'How We Got Here',
        body: "Airline excess baggage fees aren't new, but they've gotten dramatically more punitive in the last decade. As low-cost carriers unbundled their fares to compete on headline prices, they moved baggage into an à la carte revenue line. The result: a passenger who doesn't plan ahead — or underestimates their luggage weight — pays a penalty rate that's many multiples of what the airline actually spends to carry that bag.\n\nThis is not a sustainable equilibrium. It creates adversarial friction at check-in counters, generates customer service complaints, and disincentivises travel — particularly among families, NRIs, and students who routinely carry above-average luggage.",
      },
      {
        heading: 'The Arbitrage That Already Exists',
        body: "The economics of third-party baggage shipping have quietly become compelling. Door-to-door bag delivery services can move a 15kg bag between Indian cities for Rs. 800–1,500, depending on the route. An airline charges Rs. 600–900 just to add that same bag as checked luggage — before any excess penalties apply.\n\nFor passengers carrying 20–30kg of total luggage, the third-party route is often cheaper, more convenient, and less stressful. You check in at the airport with a personal item, board the aircraft faster, skip the carousel on arrival, and your bags are delivered to your door while you're still in the taxi home.",
      },
      {
        heading: 'What This Means for the Traveller',
        body: "The shift happening right now is behavioural. Passengers — particularly frequent travellers and families — are beginning to separate their luggage journey from their air journey. They fly with a cabin bag and ship everything else.\n\nThis isn't a workaround. It's a smarter way to travel. And as awareness grows, the demand for reliable, tech-enabled baggage logistics services will only increase.\n\nBagdrop exists to serve this shift — and to make the infrastructure that powers it seamless, predictable, and available to every Indian traveller.",
      },
    ],
  },

  'nri-travel-india-baggage-problem': {
    slug:     'nri-travel-india-baggage-problem',
    tag:      'NRI Travel',
    date:     'May 2025',
    readTime: '5 min read',
    title:    "The NRI Baggage Problem: Why Flying Home Shouldn't Cost a Fortune",
    excerpt:  "Every year, millions of NRIs fly to India carrying gifts, clothes, and everything in between — often paying more in excess fees than the goods are worth. Bagdrop's door-to-door service is changing that equation.",
    image:    'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=1200&q=80&auto=format&fit=crop',
    content: [
      {
        body: "Every October to January, and again around Diwali and weddings, millions of NRIs make the journey home to India. They come with gifts — electronics, chocolates, branded goods, clothes for extended family. They leave with specialities they can't find abroad — pickles, spices, artisanal goods, traditional outfits. And at every stage of this journey, the airline is waiting with an excess baggage counter.",
      },
      {
        heading: 'The True Cost of Flying Home',
        body: "A typical NRI family of four, flying in for a three-week stay, might check in with 8–10 bags between them. On the outbound journey, excess fees can add Rs. 15,000–30,000 to the cost of the trip. On the return, after two weeks of gifts and purchases, the number can be even higher.\n\nThis is money that leaves India — paid to international carriers as penalty fees. It's also a logistical headache: managing overweight bags, repacking at the check-in counter, arguing with airline staff, and still not knowing if everything will arrive undamaged.",
      },
      {
        heading: 'A Different Way to Handle the Homecoming',
        body: "What Bagdrop offers NRI travellers is a separation of journeys. Your family flies comfortably, within their cabin and standard checked baggage allowances. Your excess bags — the gifts, the clothes, the bulk items — travel separately with Bagdrop, picked up from your Indian home or hotel and delivered to any address across India.\n\nFor NRIs landing in Mumbai, Delhi, or Ahmedabad, this means: land, clear immigration, and leave the airport without a trolley. Your bags arrive at the family home the same day or the next morning. No excess fees. No trolley queues. No risk of damaged items in transit.",
      },
      {
        heading: 'The Numbers That Matter',
        body: "Bagdrop's domestic door-to-door rates start significantly below what airlines charge for excess baggage. For a typical NRI routing — say, Mumbai airport to a home in Surat — the cost per bag is often 40–60% less than the airline excess fee for the same weight.\n\nMore importantly, Bagdrop bags are insured, photographed at pickup, and tracked through delivery. That's a level of care that no airline check-in process provides as standard.\n\nIf you're planning your next trip home, the maths make the decision straightforward. Fly light. Ship smart.",
      },
    ],
  },

  'destination-wedding-logistics-india': {
    slug:     'destination-wedding-logistics-india',
    tag:      'Wedding Logistics',
    date:     'April 2025',
    readTime: '5 min read',
    title:    'The Hidden Logistics Challenge Behind Every Destination Wedding',
    excerpt:  'A destination wedding in Udaipur or Goa involves hundreds of kilograms of outfits, décor, and gifts moving across multiple cities. Most families don\'t think about the logistics until something goes wrong. We do.',
    image:    'https://images.unsplash.com/photo-1519225421980-715cb0215aed?w=1200&q=80&auto=format&fit=crop&crop=top',
    content: [
      {
        body: "A destination wedding in India is not one event. It's a minimum of three — the mehendi, the sangeet, the wedding — spread across two to five days, in a venue that everyone has flown or driven to from different cities. For a 200-guest wedding in Udaipur, that might mean 200 people, each carrying three to four days of formal outfits, jewellery, accessories, and gifts. The logistics of moving all of that, reliably and safely, to a single venue in a city where nobody lives is the problem that families consistently underestimate until it's too late.",
      },
      {
        heading: 'What Gets Left Behind — and What Gets Damaged',
        body: "Every wedding planner in India has a version of this story: the lehenga that got checked as airline luggage and arrived creased beyond saving. The set of gifts that was supposed to be courier-shipped to the venue but arrived two days after the wedding ended. The jewellery box that a guest panicked about carrying on a crowded domestic flight.\n\nThese are not rare edge cases. They are predictable failure modes in a system that wasn't designed to move precious, fragile, time-sensitive goods across cities for a fixed event date.",
      },
      {
        heading: 'The Bagdrop Approach to Wedding Logistics',
        body: "Bagdrop works with destination wedding families in two modes. The first is individual guest baggage — we coordinate with families to offer every outstation guest a Bagdrop slot, so they fly to the destination with a cabin bag and their wedding outfits arrive clean, pressed, and on time at the hotel or venue.\n\nThe second is group/bulk coordination — for the wedding family itself, we handle the movement of gifts, décor elements, personal effects, and outfit collections as a managed service, with dedicated handling, documentation, and insurance coverage for high-value items.\n\nWe currently operate across Maharashtra, Gujarat, and Goa — covering the most common Indian destination wedding corridors.",
      },
      {
        heading: 'Planning Your Wedding Logistics',
        body: "The earlier you plan, the better the experience. We recommend booking Bagdrop's wedding service at least 7 days before the event, to allow for coordination across multiple pickup locations and route optimisation for group shipments.\n\nFor families planning a Goa, Pune, Udaipur, or Gujarat wedding, reach out via WhatsApp for a custom quote. We'll handle the bags. You handle the celebrations.",
      },
    ],
  },

  'airport-integrated-baggage-services': {
    slug:     'airport-integrated-baggage-services',
    tag:      'Aviation Infrastructure',
    date:     'April 2025',
    readTime: '7 min read',
    title:    'Airport-Integrated Baggage Services: The Next Frontier in Passenger Experience',
    excerpt:  "Global airports from Heathrow to Changi have integrated third-party baggage services into their terminals. India's tier-1 airports are the next frontier. Here's what that integration looks like and why it matters.",
    image:    'https://images.unsplash.com/photo-1521791136064-7986c2920216?w=1200&q=80&auto=format&fit=crop',
    content: [
      {
        body: "Changi Airport doesn't just move planes. It moves passengers through an experience so seamless that tens of millions of transit travellers choose it as a layover destination in its own right. A significant part of that experience is the invisible handling of luggage — passengers barely think about their bags because the airport's service ecosystem has made baggage nearly frictionless.",
      },
      {
        heading: 'What Airport-Integrated Baggage Services Actually Look Like',
        body: "In mature aviation markets, the integration is layered. At London Heathrow, passengers can pre-register bags at their hotel, have them collected, and find them waiting at their destination hotel — the airport is just a waypoint in that journey, not the endpoint. At Changi, baggage services are embedded into the terminal experience: express handling, hotel delivery, city-wide logistics.\n\nThe common thread is that these airports have allowed third-party logistics operators to build services around the terminal ecosystem. The airport provides the regulatory framework and physical access points; the operator provides the last-mile logistics capability.",
      },
      {
        heading: "India's Airports at the Inflection Point",
        body: "India's tier-1 airports — Mumbai, Delhi, Bengaluru, Hyderabad, Chennai — are at an inflection point. Passenger volumes are crossing the thresholds at which international airports have historically needed to develop extended service ecosystems. Non-aero revenue pressure is intensifying as private operators look for differentiated income streams beyond landing fees and retail concessions.\n\nBaggage services are a natural category to integrate. They generate direct revenue, improve passenger satisfaction scores, reduce congestion at check-in counters, and create partnership opportunities with airlines and hotel chains.",
      },
      {
        heading: 'The Infrastructure Partnership Model',
        body: "Bagdrop's model is designed for airport integration. We are not competing with airport ground handling — we're building the city-side logistics layer that airports don't operate themselves: the home pickup before departure, the hotel delivery on arrival, the intercity movement between Indian cities.\n\nAn airport partner relationship with Bagdrop means: a co-branded passenger service available at booking, dedicated drop-off and collection zones in the terminal, and a revenue share on every bag processed through the airport's passenger base.\n\nThis is the infrastructure partnership model we're building toward — and the conversations we're having with India's major airport operators right now.",
      },
      {
        heading: 'Why This Matters for Passengers',
        body: "For the average Indian air traveller, airport-integrated baggage services mean one thing: the option to arrive at the airport with only what you need for the flight, knowing everything else has been handled. No trolleys, no overweight anxiety, no carousel queues on arrival.\n\nThis is not a luxury product. In markets where it's available, it's used by business travellers, families, senior citizens, and anyone who has decided that their time is worth more than the cost of the service.\n\nIn India, that market is 500 million passengers and growing.",
      },
    ],
  },

  'student-relocation-baggage-guide': {
    slug:     'student-relocation-baggage-guide',
    tag:      'Student Travel',
    date:     'March 2025',
    readTime: '4 min read',
    title:    "Moving Cities for College? Here's How to Ship Your Bags Without the Stress",
    excerpt:  'Relocating from Mumbai to Pune, Delhi to Bengaluru, or any city across India for your studies? Instead of hauling bags on a train or paying excess charges, Bagdrop picks up from your home and delivers to your hostel or PG — door to door, across India.',
    image:    'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?w=1200&q=80&auto=format&fit=crop',
    content: [
      {
        body: "Every June and July, hundreds of thousands of students across India pack up their rooms and move to new cities for college. From Mumbai to Pune. Delhi to Bengaluru. Ahmedabad to Hyderabad. Surat to Mumbai. The move itself is manageable — but the bags are a problem. Trains are crowded, auto and cab drivers charge extra for large luggage, and checking bags as airline excess is expensive and unreliable for bulk items.",
      },
      {
        heading: 'The Typical Student Relocation Load',
        body: "A student moving to a new city typically carries: two to four large bags of clothes and personal items, a small appliance or two (a fan, an iron, a kettle), books and stationery, and miscellaneous bedding or kitchen items if the accommodation isn't fully furnished.\n\nThat's 30–60 kg of goods, often more. Moving this on a train is physically exhausting. Sending it via standard courier risks damage and requires professional packing. Airlines charge excess baggage fees that can add Rs. 2,000–5,000 to the trip cost for this volume.",
      },
      {
        heading: 'How Bagdrop Makes the Move Easier',
        body: "Bagdrop's intercity service is specifically designed for exactly this use case. You book online, choose your pickup date, and our executive arrives at your home with packaging materials if needed. Your bags are weighed, documented, and photographed. Then they're transported directly to your new city — to your hostel address, your PG, or your flat — typically within 24–48 hours.\n\nNo heavy lifting on trains. No negotiating with auto drivers. No excess baggage counters. You travel light; your bags arrive at the destination.",
      },
      {
        heading: 'Domestic Coverage Across India',
        body: "Bagdrop's intercity service currently covers major student relocation corridors across India, including routes connecting Mumbai, Delhi, Ahmedabad, Surat, Pune, Vadodara, Rajkot, and Goa. We are continuously expanding coverage based on demand.\n\nNote: Bagdrop is an India-domestic service. We do not currently handle international shipments. If you're relocating within India for your studies, we've got you covered.",
      },
      {
        heading: 'Book Early for Semester Start',
        body: "The June–August period is our busiest season for student relocations. We recommend booking at least 72 hours before your intended pickup date during peak season to guarantee your slot. WhatsApp us or use the booking form on our website to get a quote for your specific route and volume.",
      },
    ],
  },
}

const TAG_COLORS: Record<string, string> = {
  'Aviation Infrastructure': 'bg-blue-50 text-blue-700',
  'Travel Economics':        'bg-amber-50 text-amber-700',
  'NRI Travel':              'bg-green-50 text-green-700',
  'Wedding Logistics':       'bg-pink-50 text-pink-700',
  'Student Travel':          'bg-purple-50 text-purple-700',
}

// ── Metadata ──────────────────────────────────────────────────────────────
export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params
  const post = POSTS[slug]
  if (!post) return { title: 'Not Found — Bagdrop' }
  return {
    title: `${post.title} — Bagdrop Blog`,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      images: [post.image],
    },
  }
}

export function generateStaticParams() {
  return Object.keys(POSTS).map(slug => ({ slug }))
}

// ── Page ──────────────────────────────────────────────────────────────────
export default async function BlogPostPage(
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const post = POSTS[slug]
  if (!post) notFound()

  const otherPosts = Object.values(POSTS).filter(p => p.slug !== slug).slice(0, 3)

  return (
    <div className="min-h-screen bg-cream">

      {/* Hero image */}
      <div className="relative h-72 w-full overflow-hidden bg-[#111] lg:h-96">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url('${post.image}')`, opacity: 0.55 }}
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" aria-hidden="true" />
        <div className="absolute bottom-0 left-0 right-0 section-container pb-8 lg:pb-12">
          <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold mb-3 ${TAG_COLORS[post.tag] ?? 'bg-gray-100 text-gray-600'}`}>
            {post.tag}
          </span>
          <h1 className="font-display text-2xl font-bold text-white leading-snug max-w-3xl lg:text-4xl">
            {post.title}
          </h1>
          <div className="mt-3 flex items-center gap-4 text-sm text-white/60">
            <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{post.readTime}</span>
            <span>{post.date}</span>
          </div>
        </div>
      </div>

      {/* Article */}
      <div className="section-container section-padding">
        <div className="grid gap-12 lg:grid-cols-[1fr_300px]">

          {/* Body */}
          <article>
            <Link href="/blog" className="mb-8 inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline">
              <ArrowLeft className="h-4 w-4" /> Back to Blog
            </Link>

            <p className="mt-6 text-lg text-text-secondary leading-relaxed font-medium border-l-4 border-brand pl-4">
              {post.excerpt}
            </p>

            <div className="mt-8 space-y-8">
              {post.content.map((block, i) => (
                <div key={i}>
                  {block.heading && (
                    <h2 className="font-display text-xl font-bold text-text-primary mb-3">
                      {block.heading}
                    </h2>
                  )}
                  {block.body.split('\n\n').map((para, j) => (
                    <p key={j} className="text-base text-text-secondary leading-relaxed mb-4">
                      {para}
                    </p>
                  ))}
                </div>
              ))}
            </div>

            {/* CTA */}
            <div className="mt-12 rounded-2xl border border-brand/20 bg-brand/5 p-8">
              <h3 className="font-display text-lg font-bold text-text-primary mb-2">
                Ready to travel light?
              </h3>
              <p className="text-sm text-text-secondary mb-4">
                Book your first Bagdrop delivery — airport to door, door to airport, or intercity.
              </p>
              <Link
                href="/book"
                className="inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white hover:bg-brand/90 transition-colors"
              >
                Get a Quote
              </Link>
            </div>
          </article>

          {/* Sidebar — More articles */}
          <aside className="hidden lg:block">
            <div className="sticky top-24">
              <p className="text-xs font-semibold uppercase tracking-widest text-text-muted mb-4">
                More Articles
              </p>
              <div className="space-y-4">
                {otherPosts.map(p => (
                  <Link
                    key={p.slug}
                    href={`/blog/${p.slug}`}
                    className="group block rounded-xl border border-border bg-white p-4 hover:border-brand/30 hover:shadow-sm transition-all"
                  >
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold mb-2 ${TAG_COLORS[p.tag] ?? 'bg-gray-100 text-gray-600'}`}>
                      {p.tag}
                    </span>
                    <h4 className="text-sm font-semibold text-text-primary leading-snug group-hover:text-brand transition-colors">
                      {p.title}
                    </h4>
                    <p className="mt-1 text-xs text-text-muted">{p.readTime} · {p.date}</p>
                  </Link>
                ))}
                <Link href="/blog" className="block text-center text-xs font-semibold text-brand hover:underline pt-2">
                  View all articles →
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
