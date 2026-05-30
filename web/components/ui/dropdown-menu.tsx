'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Lightweight dropdown menu (no Radix). Click trigger to toggle; closes on
 * outside-click, Escape, or item selection. Good enough for the topbar user
 * menu / row actions; for complex menus (submenus, typeahead) swap in Radix
 * later without changing call sites much.
 */

interface DropdownContextValue {
  open: boolean;
  setOpen: (v: boolean) => void;
  triggerRef: React.RefObject<HTMLButtonElement>;
  contentRef: React.RefObject<HTMLDivElement>;
}

const DropdownContext = React.createContext<DropdownContextValue | null>(null);

function useDropdown(): DropdownContextValue {
  const ctx = React.useContext(DropdownContext);
  if (!ctx)
    throw new Error('DropdownMenu components must be used within <DropdownMenu>');
  return ctx;
}

export function DropdownMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node;
      if (
        !contentRef.current?.contains(t) &&
        !triggerRef.current?.contains(t)
      ) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const ctx = React.useMemo<DropdownContextValue>(
    () => ({ open, setOpen, triggerRef, contentRef }),
    [open],
  );

  return (
    <DropdownContext.Provider value={ctx}>
      <div className="relative inline-block text-left">{children}</div>
    </DropdownContext.Provider>
  );
}

export interface DropdownMenuTriggerProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Render the single child element as the trigger (avoids button-in-button). */
  asChild?: boolean;
}

export const DropdownMenuTrigger = React.forwardRef<
  HTMLButtonElement,
  DropdownMenuTriggerProps
>(({ onClick, asChild, children, ...props }, _ref) => {
  const { open, setOpen, triggerRef } = useDropdown();

  const sharedProps = {
    'aria-haspopup': 'menu' as const,
    'aria-expanded': open,
    onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
      setOpen(!open);
      onClick?.(e);
    },
  };

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, {
      ...sharedProps,
      ref: triggerRef,
      ...props,
    } as Record<string, unknown>);
  }

  return (
    <button ref={triggerRef} type="button" {...sharedProps} {...props}>
      {children}
    </button>
  );
});
DropdownMenuTrigger.displayName = 'DropdownMenuTrigger';

export interface DropdownMenuContentProps
  extends React.HTMLAttributes<HTMLDivElement> {
  align?: 'start' | 'end';
}

export function DropdownMenuContent({
  className,
  align = 'end',
  children,
  ...props
}: DropdownMenuContentProps) {
  const { open, contentRef } = useDropdown();
  if (!open) return null;
  return (
    <div
      ref={contentRef}
      role="menu"
      className={cn(
        'absolute z-50 mt-2 min-w-[12rem] origin-top overflow-hidden rounded-md border bg-card p-1 text-card-foreground shadow-lg animate-scale-in',
        align === 'end' ? 'right-0' : 'left-0',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export interface DropdownMenuItemProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  inset?: boolean;
  destructive?: boolean;
}

export const DropdownMenuItem = React.forwardRef<
  HTMLButtonElement,
  DropdownMenuItemProps
>(({ className, inset, destructive, onClick, ...props }, ref) => {
  const { setOpen } = useDropdown();
  return (
    <button
      ref={ref}
      type="button"
      role="menuitem"
      onClick={(e) => {
        onClick?.(e);
        setOpen(false);
      }}
      className={cn(
        'flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors',
        'focus:bg-muted hover:bg-muted disabled:pointer-events-none disabled:opacity-50',
        inset && 'pl-8',
        destructive ? 'text-danger hover:bg-danger/10' : 'text-foreground',
        className,
      )}
      {...props}
    />
  );
});
DropdownMenuItem.displayName = 'DropdownMenuItem';

export function DropdownMenuLabel({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('px-2 py-1.5 text-xs font-medium text-muted-foreground', className)}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="separator"
      className={cn('-mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  );
}
