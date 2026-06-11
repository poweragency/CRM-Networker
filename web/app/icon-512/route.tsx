import { ImageResponse } from 'next/og';
import { brandIcon } from '@/lib/brand-icon';

/** 512×512 PWA icon (rounded) — used for display + the launch splash. */
export const dynamic = 'force-dynamic';

export function GET() {
  return new ImageResponse(brandIcon(512, true), { width: 512, height: 512 });
}
