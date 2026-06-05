'use client';

import * as React from 'react';
import { CheckCircle2, AlertTriangle, Info, Trophy, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { celebrate } from '@/lib/celebrate';

/**
 * Lightweight toast system (no external dep). Mount <Toaster /> once near the
 * app root, then call `useToast().toast(...)` anywhere below it. Used by the CRM
 * screens to surface optimistic/simulated mutation results — especially the
 * "modalità demo" simulated-success notices (RESILIENCE).
 */

export type ToastVariant = 'success' | 'error' | 'info' | 'achievement';

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** auto-dismiss after ms (default 4000; 0 = sticky). */
  duration?: number;
}

interface ToastItem extends Required<Omit<ToastOptions, 'description'>> {
  id: string;
  description?: string;
}

interface ToastContextValue {
  toast: (opts: ToastOptions) => string;
  dismiss: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

const VARIANT_META: Record<
  ToastVariant,
  { Icon: typeof Info; accent: string; iconColor: string; wrapCx?: string }
> = {
  success: { Icon: CheckCircle2, accent: 'border-success/40', iconColor: 'text-success' },
  error: { Icon: AlertTriangle, accent: 'border-danger/40', iconColor: 'text-danger' },
  info: { Icon: Info, accent: 'border-info/40', iconColor: 'text-info' },
  achievement: {
    Icon: Trophy,
    accent: 'border-warning/50',
    iconColor: 'text-warning',
    wrapCx: 'animate-pop bg-gradient-to-br from-warning/[0.12] to-card shadow-glow-warning',
  },
};

/** Provider — holds toast state and renders the stack. Mount once. */
export function Toaster({ children }: { children?: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const timers = React.useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const dismiss = React.useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = React.useCallback(
    (opts: ToastOptions) => {
      const id = Math.random().toString(36).slice(2);
      const item: ToastItem = {
        id,
        title: opts.title,
        description: opts.description,
        variant: opts.variant ?? 'info',
        duration: opts.duration ?? 4000,
      };
      setItems((prev) => [...prev, item]);
      // An achievement always rains confetti — one line per "win" at the call site.
      if (item.variant === 'achievement') celebrate();
      if (item.duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), item.duration),
        );
      }
      return id;
    },
    [dismiss],
  );

  React.useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((t) => clearTimeout(t));
      map.clear();
    };
  }, []);

  const value = React.useMemo<ToastContextValue>(
    () => ({ toast, dismiss }),
    [toast, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6"
        role="region"
        aria-label="Notifiche"
      >
        {items.map((t) => {
          const { Icon, accent, iconColor, wrapCx } = VARIANT_META[t.variant];
          return (
            <div
              key={t.id}
              role="status"
              className={cn(
                'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border bg-card p-4 text-card-foreground shadow-lg animate-scale-in',
                accent,
                wrapCx,
              )}
            >
              <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', iconColor)} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t.title}</p>
                {t.description && (
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {t.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="shrink-0 rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Chiudi notifica"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

/** Access the toast API. Returns a safe no-op shim if no provider is mounted. */
export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    return { toast: () => '', dismiss: () => undefined };
  }
  return ctx;
}
