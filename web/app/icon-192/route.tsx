import { ImageResponse } from 'next/og';
import { brandIcon } from '@/lib/brand-icon';

/** 192×192 PWA icon (rounded) — used for display + the launch splash. */
export const dynamic = 'force-dynamic';

export function GET() {
  return new ImageResponse(brandIcon(192, true), { width: 192, height: 192 });
}
