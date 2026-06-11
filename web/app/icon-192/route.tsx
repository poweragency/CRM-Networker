import { ImageResponse } from 'next/og';
import { brandIcon } from '@/lib/brand-icon';

/** 192×192 PWA icon (referenced by the web manifest). */
export const dynamic = 'force-dynamic';

export function GET() {
  return new ImageResponse(brandIcon(192), { width: 192, height: 192 });
}
