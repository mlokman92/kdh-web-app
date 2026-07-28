import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'

export interface SectionCardProps {
  title: string
  description?: string
  icon?: LucideIcon
  actions?: ReactNode
  children: ReactNode
  className?: string
  contentClassName?: string
}

/**
 * Card wrapper with a consistent header — used for every chart, table and
 * panel block across the application.
 */
export function SectionCard({
  title,
  description,
  icon: Icon,
  actions,
  children,
  className,
  contentClassName,
}: SectionCardProps) {
  return (
    <Card className={cn('gap-0 overflow-hidden py-0', className)}>
      <CardHeader className="items-center gap-x-3 gap-y-2 border-b border-border px-4 pt-3.5 pb-3.5!">
        <div className="flex min-w-0 items-center gap-2.5">
          {Icon && (
            <span
              aria-hidden="true"
              className="flex size-7 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary"
            >
              <Icon className="size-3.5" />
            </span>
          )}
          <div className="min-w-0">
            <CardTitle className="truncate text-sm font-semibold tracking-tight">
              {title}
            </CardTitle>
            {description && (
              // Wraps rather than truncates — in a narrow column sharing its
              // header row with filter controls, a one-line clamp was cutting
              // captions mid-word.
              <CardDescription className="mt-0.5 text-xs leading-snug text-pretty">
                {description}
              </CardDescription>
            )}
          </div>
        </div>
        {actions && (
          <CardAction className="flex flex-wrap items-center gap-2 self-center">
            {actions}
          </CardAction>
        )}
      </CardHeader>
      <CardContent className={cn('p-4', contentClassName)}>{children}</CardContent>
    </Card>
  )
}
