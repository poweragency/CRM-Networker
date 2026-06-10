import { RANK_LABELS, type MarketerRank } from '@/lib/types/db';
import type { CycleTeamReport } from '@/lib/data/reports';

/**
 * Hype, Instagram-Story-format (1080×1920) achievement card for the end-of-cycle
 * report — rendered to a PNG on a canvas and downloaded directly (postable to a
 * story). Dark theme, branded with the chosen rank's colour (glow + accents).
 * Built with the native Canvas API (no PDF lib) so we get gradients/shadows.
 */

/** Dark-theme rank accent colours (globals.css `.dark` `--rank-*`), as HSL. */
const RANK_DARK_HSL: Record<MarketerRank, [number, number, number]> = {
  cliente: [220, 9, 60],
  no_rank: [220, 9, 60],
  executive: [217, 12, 65],
  consultant: [330, 75, 70],
  team_leader: [200, 85, 65],
  advanced_team_leader: [275, 70, 70],
  senior_team_leader: [0, 75, 64],
  executive_team_leader: [145, 55, 55],
  vice_president: [45, 90, 60],
  senior_vice_president: [28, 88, 62],
  executive_vice_president: [270, 70, 70],
  global_director: [232, 60, 68],
};

type RGB = [number, number, number];

function hslToRgb(h: number, s: number, l: number): RGB {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
}

const rgbStr = (c: RGB) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
const rgba = (c: RGB, a: number) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;

/** Mix a colour toward white by `t` (0..1). */
function lighten(c: RGB, t: number): RGB {
  return [
    Math.round(c[0] + (255 - c[0]) * t),
    Math.round(c[1] + (255 - c[1]) * t),
    Math.round(c[2] + (255 - c[2]) * t),
  ];
}

function pct(n: number, d: number): string {
  if (d <= 0) return '—';
  return `${Math.round((n / d) * 100)}%`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
    .format(new Date(iso))
    .replace('.', '');
}

/** Manual letter-spacing (canvas `letterSpacing` isn't universally typed). */
function spaced(s: string): string {
  return s.split('').join(' ');
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Fit a bold uppercase title into ≤2 lines within maxW; returns lines + size. */
function fitTitle(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  baseSize: number,
): { lines: string[]; size: number } {
  let size = baseSize;
  const wrap = (sz: number): string[] => {
    ctx.font = `900 ${sz}px Arial, sans-serif`;
    const words = text.split(' ');
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(test).width > maxW && cur) {
        lines.push(cur);
        cur = w;
      } else {
        cur = test;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  };
  let lines = wrap(size);
  while ((lines.length > 2 || lines.some((l) => measure(ctx, l, size) > maxW)) && size > 56) {
    size -= 4;
    lines = wrap(size);
  }
  return { lines, size };
}

function measure(ctx: CanvasRenderingContext2D, text: string, size: number): number {
  ctx.font = `900 ${size}px Arial, sans-serif`;
  return ctx.measureText(text).width;
}

export function downloadReportCard(opts: {
  rank: MarketerRank;
  cycleNumber: number;
  report: CycleTeamReport;
}): void {
  const { rank, cycleNumber, report } = opts;
  const color = hslToRgb(...RANK_DARK_HSL[rank]);

  const W = 1080;
  const H = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // ── Background ────────────────────────────────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#090b12');
  bg.addColorStop(1, '#11131d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const hero = ctx.createRadialGradient(W / 2, 470, 40, W / 2, 470, 820);
  hero.addColorStop(0, rgba(color, 0.34));
  hero.addColorStop(0.5, rgba(color, 0.1));
  hero.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = hero;
  ctx.fillRect(0, 0, W, H);

  const base = ctx.createRadialGradient(W / 2, H - 120, 40, W / 2, H - 120, 620);
  base.addColorStop(0, rgba(color, 0.12));
  base.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);

  // Confetti-ish accent dots for hype.
  const dots: Array<[number, number, number]> = [
    [120, 360, 7], [980, 300, 9], [200, 760, 5], [900, 820, 6],
    [150, 1180, 6], [950, 1240, 7], [110, 1520, 5], [980, 1600, 8],
  ];
  for (const [x, y, r] of dots) {
    ctx.fillStyle = rgba(color, 0.5);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.textAlign = 'center';

  // ── Brand ─────────────────────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '700 30px Arial, sans-serif';
  ctx.fillText(spaced('CRM NETWORKER'), W / 2, 150);

  // ── Emblem (glowing ring + trophy) ────────────────────────────────────────
  const cx = W / 2;
  const cy = 430;
  const rr = 155;
  ctx.save();
  ctx.shadowColor = rgba(color, 0.95);
  ctx.shadowBlur = 90;
  ctx.lineWidth = 9;
  ctx.strokeStyle = rgbStr(color);
  ctx.beginPath();
  ctx.arc(cx, cy, rr, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = rgba(color, 0.1);
  ctx.beginPath();
  ctx.arc(cx, cy, rr, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = '160px Arial, sans-serif';
  ctx.fillText('🏆', cx, cy + 58);

  // ── Eyebrow ───────────────────────────────────────────────────────────────
  ctx.fillStyle = rgbStr(color);
  ctx.font = '800 40px Arial, sans-serif';
  ctx.fillText(spaced('RICONOSCIMENTO'), W / 2, 712);

  // ── Rank name (hero) ──────────────────────────────────────────────────────
  const { lines, size } = fitTitle(ctx, RANK_LABELS[rank].toUpperCase(), W - 130, 134);
  ctx.save();
  ctx.shadowColor = rgba(color, 0.85);
  ctx.shadowBlur = 55;
  ctx.fillStyle = '#ffffff';
  ctx.font = `900 ${size}px Arial, sans-serif`;
  const lineH = size * 1.04;
  let ty = 812 + size * 0.7;
  for (const line of lines) {
    ctx.fillText(line, W / 2, ty);
    ty += lineH;
  }
  ctx.restore();

  // ── Cycle chip ────────────────────────────────────────────────────────────
  const chipY = ty + 8;
  const chipLabel = `CICLO ${cycleNumber}`;
  ctx.font = '800 38px Arial, sans-serif';
  const chipW = ctx.measureText(chipLabel).width + 90;
  const chipH = 76;
  const chipX = (W - chipW) / 2;
  ctx.fillStyle = rgba(color, 0.16);
  roundRectPath(ctx, chipX, chipY, chipW, chipH, chipH / 2);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = rgba(color, 0.55);
  roundRectPath(ctx, chipX, chipY, chipW, chipH, chipH / 2);
  ctx.stroke();
  ctx.fillStyle = rgbStr(color);
  ctx.fillText(chipLabel, W / 2, chipY + 52);

  const range = `${fmtDate(report.startIso)} — ${fmtDate(report.endIso)}`;
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = '500 28px Arial, sans-serif';
  ctx.fillText(range, W / 2, chipY + chipH + 48);

  // ── Stats panel ───────────────────────────────────────────────────────────
  const panelY = chipY + chipH + 96;
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '700 30px Arial, sans-serif';
  ctx.fillText(spaced('PERFORMANCE DEL TEAM'), W / 2, panelY);

  // Two hero stat tiles.
  const overall = pct(report.reachedIscrizione, report.reachedBi);
  const tileY = panelY + 36;
  const tileW = (W - 80 - 36) / 2;
  const tileH = 230;
  const tiles: Array<{ x: number; value: string; label: string }> = [
    { x: 40, value: String(report.total), label: 'PROSPECT TOTALI' },
    { x: 40 + tileW + 36, value: overall, label: 'CONVERSIONE' },
  ];
  for (const t of tiles) {
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    roundRectPath(ctx, t.x, tileY, tileW, tileH, 28);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = rgba(color, 0.35);
    roundRectPath(ctx, t.x, tileY, tileW, tileH, 28);
    ctx.stroke();
    ctx.save();
    ctx.shadowColor = rgba(color, 0.6);
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 120px Arial, sans-serif';
    ctx.fillText(t.value, t.x + tileW / 2, tileY + 150);
    ctx.restore();
    ctx.fillStyle = rgbStr(color);
    ctx.font = '700 28px Arial, sans-serif';
    ctx.fillText(spaced(t.label), t.x + tileW / 2, tileY + 196);
  }

  // Per-phase strip.
  const phases = [
    { label: 'BIZ → FOLLOW', value: pct(report.reachedFup, report.reachedBi) },
    { label: 'FOLLOW → CLOSE', value: pct(report.reachedClosing, report.reachedFup) },
    { label: 'CLOSE → ISCR.', value: pct(report.reachedIscrizione, report.reachedClosing) },
  ];
  const stripY = tileY + tileH + 34;
  const cellW = (W - 80 - 2 * 24) / 3;
  const cellH = 168;
  phases.forEach((p, i) => {
    const x = 40 + i * (cellW + 24);
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    roundRectPath(ctx, x, stripY, cellW, cellH, 24);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    roundRectPath(ctx, x, stripY, cellW, cellH, 24);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 64px Arial, sans-serif';
    ctx.fillText(p.value, x + cellW / 2, stripY + 88);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '700 22px Arial, sans-serif';
    ctx.fillText(p.label, x + cellW / 2, stripY + 134);
  });

  // ── Hype tagline ──────────────────────────────────────────────────────────
  const tagY = stripY + cellH + 130;
  ctx.save();
  ctx.shadowColor = rgba(color, 0.8);
  ctx.shadowBlur = 40;
  const grad = ctx.createLinearGradient(W / 2 - 360, 0, W / 2 + 360, 0);
  grad.addColorStop(0, rgbStr(lighten(color, 0.25)));
  grad.addColorStop(1, rgbStr(color));
  ctx.fillStyle = grad;
  ctx.font = '900 70px Arial, sans-serif';
  ctx.fillText('LIVELLO SBLOCCATO 🔥', W / 2, tagY);
  ctx.restore();

  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = '600 26px Arial, sans-serif';
  ctx.fillText(spaced('CRM NETWORKER · POWER AGENCY'), W / 2, H - 70);

  // ── Download ──────────────────────────────────────────────────────────────
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `riconoscimento-ciclo-${cycleNumber}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, 'image/png');
}

/** Ranks selectable in the report dialog — from Executive up (not cliente/no rank). */
export const REPORT_RANKS: MarketerRank[] = [
  'executive',
  'consultant',
  'team_leader',
  'advanced_team_leader',
  'senior_team_leader',
  'executive_team_leader',
  'vice_president',
  'senior_vice_president',
  'executive_vice_president',
  'global_director',
];
