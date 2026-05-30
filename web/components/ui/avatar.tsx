'use client';

import * as React from 'react';
import { cn, initials } from '@/lib/utils';

const sizeMap = {
  sm: 'h-7 w-7 text-[10px]',
  md: 'h-9 w-9 text-xs',
  lg: 'h-12 w-12 text-sm',
} as const;

export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  src?: string | null;
  /** Display name → initials fallback + alt text. */
  name: string;
  size?: keyof typeof sizeMap;
}

/**
 * Avatar with graceful initials fallback (doc 08 §6.3 MarketerAvatar). Renders
 * the image when `src` loads; falls back to a token-colored initials chip on
 * missing/error src.
 */
export function Avatar({
  src,
  name,
  size = 'md',
  className,
  ...props
}: AvatarProps) {
  const [errored, setErrored] = React.useState(false);
  const showImg = Boolean(src) && !errored;

  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-muted font-medium text-muted-foreground',
        sizeMap[size],
        className,
      )}
      {...props}
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src as string}
          alt={name}
          className="h-full w-full object-cover"
          onError={() => setErrored(true)}
        />
      ) : (
        <span aria-hidden>{initials(name)}</span>
      )}
    </span>
  );
}
