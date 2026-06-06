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

interface VariantMeta {
  Icon: typeof Info;
  /** Border + accent rail tone. */
  accent: string;
  /** Accent rail (left edge) color. */
  rail: string;
  /** Icon color. */
  iconColor: string;
  /** Tinted disc behind the icon. */
  iconBg: string;
  /** Extra wrapper classes (gradient/glow for the prestige achievement toast). */
  wrapCx?: string;
  /** When true, a soft halo pulses behind the icon and a sheen sweeps the card. */
  prestige?: boolean;
}

const VARIANT_META: Record<ToastVariant, VariantMeta> = {
  success: {
    Icon: CheckCircle2,
    accent: 'border-success/30',
    rail: 'bg-success',
    iconColor: 'text-success',
    iconBg: 'bg-success/12',
  },
  error: {
    Icon: AlertTriangle,
    accent: 'border-danger/30',
    rail: 'bg-danger',
    iconColor: 'text-danger',
    iconBg: 'bg-danger/12',
  },
  info: {
    Icon: Info,
    accent: 'border-info/30',
    rail: 'bg-info',
    iconColor: 'text-info',
    iconBg: 'bg-info/12',
  },
  achievement: {
    Icon: Trophy,
    accent: 'border-warning/50',
    rail: 'bg-warning',
    iconColor: 'text-warning',
    iconBg: 'bg-warning/15',
    prestige: true,
    wrapCx:
      'animate-pop bg-gradient-to-br from-warning/[0.14] via-card to-card shadow-glow-warning ring-1 ring-warning/30',
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
          const { Icon, accent, rail, iconColor, iconBg, wrapCx, prestige } =
            VARIANT_META[t.variant];
          return (
            <div
              key={t.id}
              role="status"
              className={cn(
                'group/toast pointer-events-auto relative flex w-full max-w-sm items-start gap-3 overflow-hidden rounded-xl border bg-card/95 p-4 pl-6 text-card-foreground shadow-lg backdrop-blur-sm animate-slide-in-right',
                accent,
                wrapCx,
              )}
            >
              {/* Left accent rail — colored edge that anchors the variant tone. */}
              <span
                aria-hidden
                className={cn('absolute inset-y-0 left-0 w-1', rail)}
              />
              {/* Prestige sheen — a single gold sweep across the achievement card. */}
              {prestige && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-warning/20 to-transparent animate-sheen"
                />
              )}
              {/* Icon disc — tinted, with a pulsing halo for achievements. */}
              <span className="relative mt-0.5 inline-flex shrink-0">
                {prestige && (
                  <span
                    aria-hidden
                    className={cn(
                      'absolute -inset-1 rounded-full opacity-60 animate-glow-pulse',
                      iconBg,
                    )}
                  />
                )}
                <span
                  className={cn(
                    'relative inline-flex h-9 w-9 items-center justify-center rounded-full',
                    iconBg,
                  )}
                >
                  <Icon
                    className={cn(
                      'h-5 w-5',
                      iconColor,
                      prestige && 'animate-float',
                    )}
                    aria-hidden
                  />
                </span>
              </span>
              <div className="relative min-w-0 flex-1">
                <p className="text-sm font-semibold tracking-tight">{t.title}</p>
                {t.description && (
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {t.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="relative -mr-1 -mt-1 shrink-0 rounded-md p-1 text-muted-foreground transition-colors duration-base hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
