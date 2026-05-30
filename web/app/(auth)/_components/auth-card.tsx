import * as React from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * The form card used by every auth page: a token-driven surface with an optional
 * leading icon, title and subtitle. Keeps the four auth pages visually identical
 * without each one re-deriving header markup.
 */
export interface AuthCardProps {
  title: string;
  subtitle?: string;
  /** Optional leading icon (lucide component), rendered in an accent chip. */
  icon?: React.ComponentType<{ className?: string }>;
  /** Tone of the icon chip + ring. */
  tone?: 'primary' | 'success' | 'danger';
  children: React.ReactNode;
  /** Slot rendered below the card body (links, secondary actions). */
  footer?: React.ReactNode;
  className?: string;
}

const toneMap = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/12 text-success',
  danger: 'bg-danger/12 text-danger',
} as const;

export function AuthCard({
  title,
  subtitle,
  icon: Icon,
  tone = 'primary',
  children,
  footer,
  className,
}: AuthCardProps) {
  return (
    <div className={cn('space-y-4', className)}>
      <Card className="p-6 sm:p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          {Icon ? (
            <span
              className={cn(
                'mb-4 flex h-11 w-11 items-center justify-center rounded-xl',
                toneMap[tone],
              )}
            >
              <Icon className="h-5 w-5" />
            </span>
          ) : null}
          <h1 className="text-xl font-semibold tracking-tight text-card-foreground">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        {children}
      </Card>
      {footer ? (
        <div className="text-center text-sm text-muted-foreground">{footer}</div>
      ) : null}
    </div>
  );
}
