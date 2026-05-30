import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Inline server/form-level error banner shared by the auth forms. Renders
 * nothing when `message` is falsy. role="alert" so screen readers announce it.
 */
export interface FormErrorProps {
  message?: string | null;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}

export function FormError({ message, icon: Icon, className }: FormErrorProps) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger',
        className,
      )}
    >
      {Icon ? <Icon className="mt-0.5 h-4 w-4 shrink-0" /> : null}
      <span>{message}</span>
    </div>
  );
}
