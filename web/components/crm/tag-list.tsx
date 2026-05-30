import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * TagList — read-only display of a contact/document tag set (server-safe). Shows
 * up to `max` tags then a "+N" overflow chip. Use {@link TagInput} for editing.
 */
export interface TagListProps {
  tags: string[];
  /** Max chips before collapsing into a "+N" overflow chip (default 4). */
  max?: number;
  size?: 'sm' | 'md';
  className?: string;
}

export function TagList({ tags, max = 4, size = 'md', className }: TagListProps) {
  if (!tags.length) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const visible = tags.slice(0, max);
  const overflow = tags.length - visible.length;
  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      {visible.map((tag) => (
        <Badge
          key={tag}
          variant="secondary"
          className={cn(size === 'sm' && 'px-2 py-0 text-[0.7rem]')}
        >
          {tag}
        </Badge>
      ))}
      {overflow > 0 && (
        <Badge variant="outline" className={cn(size === 'sm' && 'px-2 py-0 text-[0.7rem]')}>
          +{overflow}
        </Badge>
      )}
    </div>
  );
}
