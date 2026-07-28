import { cn } from '@/lib/utils'

export interface KdhMarkProps {
  className?: string
}

/**
 * KDH One Asset logo mark — three stacked plates suggesting layered land
 * parcels and built assets, anchored by a survey point. Uses currentColor so
 * it inherits whatever token the surrounding surface sets.
 */
export function KdhMark({ className }: KdhMarkProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      role="img"
      aria-label="KDH One Asset"
      className={cn('size-6', className)}
    >
      <path
        d="M16 3.2 29 10.1 16 17 3 10.1 16 3.2Zm0 3.6L9.2 10.1 16 13.4l6.8-3.3L16 6.8Z"
        fill="currentColor"
        fillRule="evenodd"
        opacity={0.95}
      />
      <path
        d="M16 19.4 6.4 14.3 3 16.1l13 6.9 13-6.9-3.4-1.8L16 19.4Z"
        fill="currentColor"
        opacity={0.55}
      />
      <path
        d="M16 25.4 6.4 20.3 3 22.1l13 6.9 13-6.9-3.4-1.8L16 25.4Z"
        fill="currentColor"
        opacity={0.3}
      />
    </svg>
  )
}
