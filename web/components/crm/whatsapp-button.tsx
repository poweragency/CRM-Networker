'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

/**
 * WhatsAppButton — a one-tap "scrivi su WhatsApp" link for a phone number. Used
 * on prospects (via the linked contact) and team members. Normalizes the number
 * to wa.me digits (drops +, spaces, punctuation) and opens the chat in a new
 * tab. Stops click propagation so it works inside clickable rows/cards. Renders
 * nothing when there's no usable number. The glyph is the WhatsApp brand mark
 * (lucide has no brand icons) tinted WhatsApp green.
 */

function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
      focusable="false"
    >
      <path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 0 0 1.515 5.26l-.999 3.648 3.673-.957zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
    </svg>
  );
}

export interface WhatsAppButtonProps {
  phone: string | null | undefined;
  /** Recipient name, used in the accessible label. */
  name?: string | null;
  /** Optional prefilled message. */
  message?: string;
  className?: string;
  /** Show the label text next to the icon (default: icon only). */
  withLabel?: boolean;
}

export function WhatsAppButton({
  phone,
  name,
  message,
  className,
  withLabel = false,
}: WhatsAppButtonProps) {
  const t = useTranslations('crm');
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;

  const href = `https://wa.me/${digits}${
    message ? `?text=${encodeURIComponent(message)}` : ''
  }`;
  const label = name ? t('whatsapp_to', { name }) : t('whatsapp');

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-md text-[#25D366] transition-colors hover:bg-[#25D366]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        withLabel ? 'h-9 px-2.5 text-sm font-medium' : 'h-9 w-9',
        className,
      )}
    >
      <WhatsAppGlyph className={withLabel ? 'h-4 w-4' : 'h-[18px] w-[18px]'} />
      {withLabel && <span>{t('whatsapp')}</span>}
    </a>
  );
}
