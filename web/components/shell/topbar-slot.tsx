'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';

/**
 * TopbarSlot — portals its children into the topbar's central slot
 * (`#topbar-search-slot`). A page mounts this to surface a contextual control
 * (e.g. the marketer search) in the top navbar; because it renders only while
 * that page is mounted, the control is visible on that screen alone. No logic
 * moves — the children keep their own state where they're declared.
 */

export const TOPBAR_SLOT_ID = 'topbar-search-slot';

export function TopbarSlot({ children }: { children: React.ReactNode }) {
  const [el, setEl] = React.useState<HTMLElement | null>(null);

  React.useEffect(() => {
    setEl(document.getElementById(TOPBAR_SLOT_ID));
  }, []);

  if (!el) return null;
  return createPortal(children, el);
}
