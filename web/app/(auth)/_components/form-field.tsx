'use client';

import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input, type InputProps } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * Labelled input with inline validation message + a11y wiring (aria-invalid,
 * aria-describedby). Shared by all auth forms so error styling and screen-reader
 * association stay consistent. Password fields get a show/hide toggle.
 */
export interface FormFieldProps extends Omit<InputProps, 'id'> {
  id: string;
  /** Visible label. Omit (or empty) to render only the input — pass `aria-label`
   *  via `...props` for the accessible name when the label lives elsewhere. */
  label?: string;
  /** Localized error message; when present the field renders as invalid. */
  error?: string;
  /** Adds a visibility toggle for password inputs. */
  revealable?: boolean;
}

export const FormField = React.forwardRef<HTMLInputElement, FormFieldProps>(
  ({ id, label, error, revealable, type = 'text', className, ...props }, ref) => {
    const [shown, setShown] = React.useState(false);
    const errorId = `${id}-error`;
    const isPassword = type === 'password';
    const inputType = revealable && isPassword ? (shown ? 'text' : 'password') : type;

    return (
      <div className="space-y-1.5">
        {label ? <Label htmlFor={id}>{label}</Label> : null}
        <div className="relative">
          <Input
            ref={ref}
            id={id}
            type={inputType}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className={cn(
              error &&
                'border-danger focus-visible:ring-danger/40 focus-visible:ring-offset-0',
              revealable && isPassword && 'pr-10',
              className,
            )}
            {...props}
          />
          {revealable && isPassword ? (
            <button
              type="button"
              onClick={() => setShown((v) => !v)}
              aria-label={shown ? 'Nascondi password' : 'Mostra password'}
              tabIndex={-1}
              className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {shown ? (
                <EyeOff className="h-4 w-4" aria-hidden />
              ) : (
                <Eye className="h-4 w-4" aria-hidden />
              )}
            </button>
          ) : null}
        </div>
        {error ? (
          <p id={errorId} className="text-xs font-medium text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  },
);
FormField.displayName = 'FormField';
