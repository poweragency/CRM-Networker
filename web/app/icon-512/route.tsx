import { ImageResponse } from 'next/og';
import { brandIcon } from '@/lib/brand-icon';

/** 512×512 icon — full-bleed dark + rounded glowing logo (no transparency → no
 *  white plate; blends on the dark splash to show a rounded glowing logo). */
export const dynamic = 'force-dynamic';

export function GET() {
  return new ImageResponse(brandIcon(512, { solidBg: true }), { width: 512, height: 512 });
}
