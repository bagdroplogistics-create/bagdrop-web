'use client'

import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  // Base — shared across all variants
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'rounded-lg font-semibold transition-all duration-200',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-40',
    'select-none',
  ],
  {
    variants: {
      variant: {
        // Orange CTA — primary action (Book, Pay, Submit)
        primary: [
          'bg-brand text-white',
          'hover:bg-brand-hover hover:-translate-y-0.5',
          'shadow-[0_4px_16px_rgba(255,99,0,0.25)]',
          'hover:shadow-[0_6px_24px_rgba(255,99,0,0.35)]',
          'active:translate-y-0 active:shadow-sm',
        ],

        // White button — used inside the dark hero section
        'primary-dark': [
          'bg-white text-midnight',
          'hover:bg-cream hover:-translate-y-0.5',
          'shadow-lg hover:shadow-xl',
          'active:translate-y-0',
        ],

        // Outlined — secondary actions
        secondary: [
          'border-[1.5px] border-border-strong bg-transparent text-text-primary',
          'hover:border-brand hover:bg-brand-light hover:text-brand',
          'active:bg-brand-light/70',
        ],

        // Text-only — ghost actions, links
        ghost: [
          'bg-transparent text-brand',
          'hover:bg-brand-light',
          'active:bg-brand-light/70',
        ],

        // For destructive actions (cancel, delete)
        destructive: [
          'bg-error text-white',
          'hover:bg-red-700 hover:-translate-y-0.5',
          'shadow-sm hover:shadow-md',
        ],

        // Outline on dark background (hero secondary CTA)
        outline: [
          'border-[1.5px] border-white/30 bg-white/10 text-white backdrop-blur-sm',
          'hover:border-white/60 hover:bg-white/20',
          'active:bg-white/10',
        ],
      },

      size: {
        sm:   'h-9 px-4 text-sm rounded-md',
        md:   'h-11 px-6 text-base',
        lg:   'h-12 px-8 text-lg rounded-xl',
        xl:   'h-14 px-10 text-xl rounded-xl',  // Hero CTA
        icon: 'h-10 w-10 p-0',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size:    'md',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Render as child element (e.g. Next.js Link) */
  asChild?: boolean
  /** Show loading spinner and disable interactions */
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        aria-disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <svg
              className="h-4 w-4 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12" cy="12" r="10"
                stroke="currentColor" strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <span>Loading…</span>
          </>
        ) : (
          children
        )}
      </Comp>
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
