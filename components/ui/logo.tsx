import Image from 'next/image'
import { cn } from '@/lib/utils'

interface BagdropLogoProps {
  className?: string
  showTagline?: boolean
  /** "light" = white — use on dark/orange backgrounds | "default" = orange — use on light backgrounds */
  variant?: 'default' | 'light'
}

export function BagdropLogo({
  className,
  showTagline = false,
  variant = 'default',
}: BagdropLogoProps) {
  // Icon: invert to white on orange/dark bg
  const iconFilter  = variant === 'light' ? 'brightness-0 invert' : ''
  const textColor   = variant === 'light' ? 'text-white'          : 'text-[#FF6300]'
  const taglineColor = variant === 'light' ? 'text-white/60'      : 'text-gray-400'

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      {/* Bag icon — from PNG, sized independently */}
      <div className="relative h-14 w-auto shrink-0">
        <Image
          src="/images/logo-icon.png"
          alt=""
          width={54}
          height={70}
          className={cn('h-14 w-auto object-contain', iconFilter)}
          priority
          aria-hidden="true"
        />
      </div>

      {/* Wordmark — pure text, always crisp */}
      <div className="flex flex-col justify-center leading-none">
        <span
          className={cn(
            'font-black tracking-tight',
            'text-[1.6rem]',
            textColor
          )}
          style={{ fontFamily: 'inherit', letterSpacing: '-0.02em' }}
        >
          BAGDROP
        </span>
        {showTagline && (
          <span
            className={cn(
              'mt-[4px] text-[0.6rem] font-semibold uppercase tracking-[0.18em]',
              taglineColor
            )}
          >
            BAG. BOX. DELIVERED.
          </span>
        )}
      </div>
    </div>
  )
}
