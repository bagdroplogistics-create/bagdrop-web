import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default:  'bg-brand-light text-brand',
        gold:     'bg-gold-light text-[#8B6914]',
        success:  'bg-success-bg text-success',
        warning:  'bg-warning-bg text-warning',
        error:    'bg-error-bg text-error',
        neutral:  'bg-[#F0F0F0] text-neutral-dark',
        dark:     'bg-midnight/10 text-midnight',
        outline:  'border border-border text-text-secondary bg-transparent',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
