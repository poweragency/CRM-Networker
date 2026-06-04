export interface ConfigNoticeProps {
  variant?: 'card' | 'inline';
  className?: string;
}

/**
 * Demo / "configurazione mancante" notice. The app is LIVE (Supabase is
 * configured), so this renders nothing. Kept as a no-op component so the existing
 * call sites (`{demo && <ConfigNotice />}`) don't need to change.
 */
export function ConfigNotice(_props: ConfigNoticeProps): null {
  return null;
}
