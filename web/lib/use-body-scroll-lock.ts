'use client';

import * as React from 'react';

/**
 * Reference-counted body scroll lock.
 *
 * Multiple overlapping locks (e.g. a Modal that opens a ConfirmDialog, or a sheet
 * left mounted while another opens) all share ONE counter, and the page becomes
 * scrollable again only once the LAST lock releases. This replaces the previous
 * per-component pattern of capturing `document.body.style.overflow` and restoring
 * it on cleanup: when two locks nested, the inner one captured `prev = 'hidden'`
 * and restored 'hidden' on close, leaving the whole page unscrollable until a
 * full refresh (the bug where the dashboard couldn't scroll after navigating
 * away from a screen that had a dialog open).
 */
let lockCount = 0;

export function useBodyScrollLock(active: boolean): void {
  React.useEffect(() => {
    if (!active) return;
    lockCount += 1;
    document.body.style.overflow = 'hidden';
    return () => {
      lockCount = Math.max(0, lockCount - 1);
      // Only the last lock to release restores scrolling, so nested/overlapping
      // locks can never leave a stale 'hidden' behind.
      if (lockCount === 0) document.body.style.overflow = '';
    };
  }, [active]);
}
