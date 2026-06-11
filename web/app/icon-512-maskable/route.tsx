import { ImageResponse } from 'next/og';
import { brandIcon } from '@/lib/brand-icon';

/** 512×512 maskable icon — full-bleed dark canvas + rounded glowing logo. Used for
 *  the masked home icon AND (on launchers like MIUI) the launch splash. */
export const dynamic = 'force-dynamic';

export function GET() {
  return new ImageResponse(brandIcon(512, { solidBg: true }), { width: 512, height: 512 });
}
