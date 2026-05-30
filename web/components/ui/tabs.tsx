'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Lightweight, accessible tabs (no Radix). Controlled or uncontrolled via
 * `value`/`defaultValue`. Keyboard: Arrow keys move focus+selection, Home/End
 * jump. Uses roving `role="tablist"`/`role="tab"`/`role="tabpanel"` semantics.
 */

interface TabsContextValue {
  value: string;
  setValue: (v: string) => void;
  baseId: string;
}

const TabsContext = React.createContext<TabsContextValue | null>(null);

function useTabs(): TabsContextValue {
  const ctx = React.useContext(TabsContext);
  if (!ctx) throw new Error('Tabs components must be used within <Tabs>');
  return ctx;
}

export interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}

export function Tabs({
  value: controlled,
  defaultValue,
  onValueChange,
  className,
  children,
  ...props
}: TabsProps) {
  const reactId = React.useId();
  const [uncontrolled, setUncontrolled] = React.useState(defaultValue ?? '');
  const value = controlled ?? uncontrolled;

  const setValue = React.useCallback(
    (v: string) => {
      if (controlled === undefined) setUncontrolled(v);
      onValueChange?.(v);
    },
    [controlled, onValueChange],
  );

  const ctx = React.useMemo<TabsContextValue>(
    () => ({ value, setValue, baseId: reactId }),
    [value, setValue, reactId],
  );

  return (
    <TabsContext.Provider value={ctx}>
      <div className={cn('flex flex-col gap-2', className)} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

export const TabsList = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, onKeyDown, ...props }, ref) => {
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const tabs = Array.from(
      e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    );
    const current = tabs.findIndex((t) => t === document.activeElement);
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = current + 1;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = current - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next >= 0) {
      e.preventDefault();
      const target = tabs[(next + tabs.length) % tabs.length];
      target?.focus();
      target?.click();
    }
    onKeyDown?.(e);
  }

  return (
    <div
      ref={ref}
      role="tablist"
      onKeyDown={handleKeyDown}
      className={cn(
        'inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
});
TabsList.displayName = 'TabsList';

export interface TabsTriggerProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}

export const TabsTrigger = React.forwardRef<
  HTMLButtonElement,
  TabsTriggerProps
>(({ className, value, ...props }, ref) => {
  const { value: active, setValue, baseId } = useTabs();
  const selected = active === value;
  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      id={`${baseId}-trigger-${value}`}
      aria-selected={selected}
      aria-controls={`${baseId}-panel-${value}`}
      tabIndex={selected ? 0 : -1}
      data-state={selected ? 'active' : 'inactive'}
      onClick={() => setValue(value)}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
        selected
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground',
        className,
      )}
      {...props}
    />
  );
});
TabsTrigger.displayName = 'TabsTrigger';

export interface TabsContentProps
  extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

export const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(
  ({ className, value, ...props }, ref) => {
    const { value: active, baseId } = useTabs();
    if (active !== value) return null;
    return (
      <div
        ref={ref}
        role="tabpanel"
        id={`${baseId}-panel-${value}`}
        aria-labelledby={`${baseId}-trigger-${value}`}
        tabIndex={0}
        className={cn(
          'animate-fade-in ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          className,
        )}
        {...props}
      />
    );
  },
);
TabsContent.displayName = 'TabsContent';
