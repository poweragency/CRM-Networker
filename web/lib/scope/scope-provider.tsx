'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { BranchScope, ScopeParam } from '@/lib/types/db';

/**
 * URL-driven scope context (doc 08 §6.1 / ADR-008: scope lives in shareable URL
 * params). Reads `?scope=global|left|right` and optional `?root=<id>` from the
 * current URL and exposes `{ scope, setScope, rootId, setRootId }`. `setScope`
 * rewrites the query string (shallow, scroll-preserving) so the view is
 * bookmarkable and the back button works.
 *
 * Must be mounted inside a Suspense boundary by the consumer because it calls
 * `useSearchParams()` (Next.js static-export requirement).
 */

interface ScopeContextValue {
  /** Canonical uppercase scope used by data/analytics joins. */
  scope: BranchScope;
  /** Lowercase URL form (`?scope=`). */
  scopeParam: ScopeParam;
  setScope: (next: BranchScope | ScopeParam) => void;
  /** Optional re-rooting of the tree/branch view (`?root=`). */
  rootId: string | null;
  setRootId: (id: string | null) => void;
}

const ScopeContext = createContext<ScopeContextValue | null>(null);

const PARAM_TO_SCOPE: Record<ScopeParam, BranchScope> = {
  global: 'GLOBAL',
  left: 'LEFT',
  right: 'RIGHT',
};

function toScope(value: string | null): BranchScope {
  if (value === 'left') return 'LEFT';
  if (value === 'right') return 'RIGHT';
  return 'GLOBAL';
}

function toParam(scope: BranchScope): ScopeParam {
  return scope === 'LEFT' ? 'left' : scope === 'RIGHT' ? 'right' : 'global';
}

export function ScopeProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const scope = toScope(searchParams.get('scope'));
  const rootId = searchParams.get('root');

  const pushParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const setScope = useCallback(
    (next: BranchScope | ScopeParam) => {
      const param: ScopeParam =
        next === 'GLOBAL' || next === 'LEFT' || next === 'RIGHT'
          ? toParam(next)
          : next;
      pushParams((params) => {
        // 'global' is the default — keep the URL clean by omitting it.
        if (param === 'global') params.delete('scope');
        else params.set('scope', param);
      });
    },
    [pushParams],
  );

  const setRootId = useCallback(
    (id: string | null) => {
      pushParams((params) => {
        if (id) params.set('root', id);
        else params.delete('root');
        // Re-rooting resets to a Global view of the new node.
        params.delete('scope');
      });
    },
    [pushParams],
  );

  const value = useMemo<ScopeContextValue>(
    () => ({
      scope,
      scopeParam: toParam(scope),
      setScope,
      rootId,
      setRootId,
    }),
    [scope, setScope, rootId, setRootId],
  );

  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

/** Access the scope context. Throws if used outside <ScopeProvider>. */
export function useScope(): ScopeContextValue {
  const ctx = useContext(ScopeContext);
  if (!ctx) {
    throw new Error('useScope must be used within a <ScopeProvider>');
  }
  return ctx;
}

export { PARAM_TO_SCOPE };
