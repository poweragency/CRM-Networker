import { ImageResponse } from 'next/og';
import { brandIcon } from '@/lib/brand-icon';

/** 512×512 maskable icon (full-bleed) — the launcher masks it for the home screen. */
export const dynamic = 'force-dynamic';

export function GET() {
  return new ImageResponse(brandIcon(512), { width: 512, height: 512 });
}
