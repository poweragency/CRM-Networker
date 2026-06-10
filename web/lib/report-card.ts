import { RANK_LABELS, type MarketerRank } from '@/lib/types/db';
import type { CycleTeamReport } from '@/lib/data/reports';

/**
 * Hype, tech, Instagram-Story-format (1080×1920) achievement card for the end-of-
 * cycle report — rendered to a PNG on a canvas and downloaded directly (postable
 * to a story). Dark + high-tech, branded with a vivid per-rank accent. Each rank
 * carries its own hand-drawn emblem: a tech core (executive/consultant), a faceted
 * gemstone (sapphire / amethyst / ruby / emerald for the team-leader family) or a
 * brilliant diamond (vice-president family) with a growing gold crown at the top.
 */

type P = [number, number];
type RGB = [number, number, number];

/* ── Palette ─────────────────────────────────────────────────────────────── */

/** Vivid per-rank accent (h, s%, l%) — "colori più accesi". */
const ACCENT_HSL: Record<MarketerRank, [number, number, number]> = {
  cliente: [220, 10, 60],
  no_rank: [220, 10, 60],
  executive: [196, 96, 58],
  consultant: [330, 96, 64],
  team_leader: [222, 100, 62],
  advanced_team_leader: [278, 92, 66],
  senior_team_leader: [348, 92, 60],
  executive_team_leader: [152, 86, 48],
  vice_president: [190, 96, 66],
  senior_vice_president: [268, 92, 70],
  executive_vice_president: [45, 97, 60],
  global_director: [43, 100, 60],
};

type EmblemKind = 'tech' | 'gem' | 'diamond';
const EMBLEM: Record<MarketerRank, { kind: EmblemKind; crown: 0 | 1 | 2; colored?: boolean }> = {
  cliente: { kind: 'tech', crown: 0 },
  no_rank: { kind: 'tech', crown: 0 },
  executive: { kind: 'tech', crown: 0 },
  consultant: { kind: 'tech', crown: 0 },
  team_leader: { kind: 'gem', crown: 0 },
  advanced_team_leader: { kind: 'gem', crown: 0 },
  senior_team_leader: { kind: 'gem', crown: 0 },
  executive_team_leader: { kind: 'gem', crown: 0 },
  vice_president: { kind: 'diamond', crown: 0 },
  senior_vice_president: { kind: 'diamond', crown: 0, colored: true },
  executive_vice_president: { kind: 'diamond', crown: 1 },
  global_director: { kind: 'diamond', crown: 2 },
};

/* ── Colour helpers ──────────────────────────────────────────────────────── */

function hslToRgb(h: number, s: number, l: number): RGB {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
}
const rgbStr = (c: RGB) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
const rgba = (c: RGB, a: number) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;
const lighten = (c: RGB, t: number): RGB => [
  Math.round(c[0] + (255 - c[0]) * t),
  Math.round(c[1] + (255 - c[1]) * t),
  Math.round(c[2] + (255 - c[2]) * t),
];
const darken = (c: RGB, t: number): RGB => [
  Math.round(c[0] * (1 - t)),
  Math.round(c[1] * (1 - t)),
  Math.round(c[2] * (1 - t)),
];

/* ── Text / geometry helpers ─────────────────────────────────────────────── */

function pct(n: number, d: number): string {
  return d <= 0 ? '—' : `${Math.round((n / d) * 100)}%`;
}
function fmtDate(iso: string | null): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
    .format(new Date(iso))
    .replace('.', '');
}
const spaced = (s: string) => s.split('').join(' ');

function poly(ctx: CanvasRenderingContext2D, pts: P[]): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}
function seg(ctx: CanvasRenderingContext2D, a: P, b: P): void {
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
}
function tri(ctx: CanvasRenderingContext2D, a: P, b: P, c: P, fill: string): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.lineTo(c[0], c[1]);
  ctx.closePath();
  ctx.fill();
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
function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, glow: string): void {
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = glow;
  ctx.shadowBlur = 24;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
  ctx.restore();
}

/* ── Emblems ─────────────────────────────────────────────────────────────── */

function drawHalo(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, rgb: RGB): void {
  const fill = ctx.createRadialGradient(cx, cy, 10, cx, cy, R);
  fill.addColorStop(0, rgba(rgb, 0.18));
  fill.addColorStop(1, rgba(rgb, 0));
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.shadowColor = rgba(rgb, 0.9);
  ctx.shadowBlur = 55;
  ctx.lineWidth = 6;
  ctx.strokeStyle = rgba(rgb, 0.85);
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // HUD arcs (tech feel)
  ctx.lineWidth = 4;
  ctx.strokeStyle = rgba(rgb, 0.6);
  ctx.beginPath();
  ctx.arc(cx, cy, R + 20, -0.5, 0.7);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, R + 20, Math.PI - 0.5, Math.PI + 0.7);
  ctx.stroke();
}

function drawTechCore(ctx: CanvasRenderingContext2D, cx: number, cy: number, rgb: RGB, s: number): void {
  const hex: P[] = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + (i * Math.PI) / 3;
    hex.push([cx + Math.cos(a) * s, cy + Math.sin(a) * s]);
  }
  ctx.save();
  ctx.shadowColor = rgba(rgb, 0.95);
  ctx.shadowBlur = 70;
  const g = ctx.createLinearGradient(cx, cy - s, cx, cy + s);
  g.addColorStop(0, rgbStr(lighten(rgb, 0.45)));
  g.addColorStop(1, rgbStr(darken(rgb, 0.35)));
  ctx.fillStyle = g;
  poly(ctx, hex);
  ctx.fill();
  ctx.restore();

  const inner: P[] = hex.map(([x, y]) => [cx + (x - cx) * 0.58, cy + (y - cy) * 0.58]);
  ctx.strokeStyle = rgba(lighten(rgb, 0.55), 0.85);
  ctx.lineWidth = 3;
  poly(ctx, inner);
  ctx.stroke();

  ctx.strokeStyle = rgba(lighten(rgb, 0.3), 0.6);
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) seg(ctx, inner[i], hex[i]);
  ctx.stroke();

  for (const [x, y] of hex) {
    ctx.fillStyle = rgbStr(lighten(rgb, 0.45));
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  sparkle(ctx, cx, cy, s * 0.5, rgba(rgb, 0.9));
}

function drawGem(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  rgb: RGB,
  opts: { diamond?: boolean; colored?: boolean; tint?: RGB } = {},
): void {
  const tint = opts.tint ?? rgb;
  const top = cy - s * 0.8;
  const shoulderY = cy - s * 0.28;
  const bottom = cy + s * 1.06;
  const ht = s * 0.6;
  const hw = s;
  const outline: P[] = [
    [cx - ht, top],
    [cx + ht, top],
    [cx + hw, shoulderY],
    [cx, bottom],
    [cx - hw, shoulderY],
  ];

  ctx.save();
  ctx.shadowColor = rgba(tint, 0.95);
  ctx.shadowBlur = 85;
  const g = ctx.createLinearGradient(cx, top, cx, bottom);
  if (opts.diamond) {
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.45, '#dcebff');
    g.addColorStop(1, rgbStr(lighten(tint, 0.2)));
  } else {
    g.addColorStop(0, rgbStr(lighten(rgb, 0.6)));
    g.addColorStop(0.45, rgbStr(rgb));
    g.addColorStop(1, rgbStr(darken(rgb, 0.5)));
  }
  ctx.fillStyle = g;
  poly(ctx, outline);
  ctx.fill();
  ctx.restore();

  const tableY = cy - s * 0.34;
  const tlx = cx - ht * 0.72;
  const trx = cx + ht * 0.72;

  // Table facet (bright top).
  ctx.fillStyle = opts.diamond ? 'rgba(255,255,255,0.9)' : rgba(lighten(rgb, 0.7), 0.85);
  poly(ctx, [
    [cx - ht, top],
    [cx + ht, top],
    [trx, tableY],
    [tlx, tableY],
  ]);
  ctx.fill();

  // Colored diamond → iridescent facet tints.
  if (opts.colored) {
    tri(ctx, [cx - hw, shoulderY], [tlx, tableY], [cx, bottom], 'rgba(255, 70, 120, 0.28)');
    tri(ctx, [cx + hw, shoulderY], [trx, tableY], [cx, bottom], 'rgba(70, 160, 255, 0.28)');
    tri(ctx, [tlx, tableY], [trx, tableY], [cx, bottom], 'rgba(120, 255, 200, 0.22)');
  }

  // Facet lines.
  ctx.strokeStyle = opts.diamond ? 'rgba(255,255,255,0.55)' : rgba(lighten(rgb, 0.45), 0.5);
  ctx.lineWidth = 2;
  ctx.beginPath();
  seg(ctx, [tlx, tableY], [cx, bottom]);
  seg(ctx, [trx, tableY], [cx, bottom]);
  seg(ctx, [cx - hw, shoulderY], [tlx, tableY]);
  seg(ctx, [cx + hw, shoulderY], [trx, tableY]);
  seg(ctx, [cx - hw, shoulderY], [cx, bottom]);
  seg(ctx, [cx + hw, shoulderY], [cx, bottom]);
  seg(ctx, [cx - ht, top], [tlx, tableY]);
  seg(ctx, [cx + ht, top], [trx, tableY]);
  ctx.stroke();

  // Specular highlight + sparkles.
  tri(ctx, [cx - ht, top], [cx - ht * 0.25, top], [tlx, tableY], 'rgba(255,255,255,0.5)');
  sparkle(ctx, cx + s * 0.5, top - 2, s * 0.24, 'rgba(255,255,255,0.95)');
  sparkle(ctx, cx - s * 0.2, cy + s * 0.55, s * 0.13, 'rgba(255,255,255,0.8)');
}

function drawCrown(ctx: CanvasRenderingContext2D, cx: number, baseY: number, huge: boolean): void {
  const w = huge ? 300 : 200;
  const bandH = huge ? 36 : 26;
  const peakH = huge ? 78 : 52;
  const n = huge ? 5 : 3;
  const left = cx - w / 2;
  const step = w / n;

  const gold = ctx.createLinearGradient(0, baseY - bandH - peakH, 0, baseY);
  gold.addColorStop(0, '#fff0a8');
  gold.addColorStop(0.5, '#ffcf3a');
  gold.addColorStop(1, '#c98a16');

  ctx.save();
  ctx.shadowColor = 'rgba(255, 205, 60, 0.85)';
  ctx.shadowBlur = huge ? 55 : 38;
  ctx.fillStyle = gold;
  roundRectPath(ctx, left, baseY - bandH, w, bandH, bandH * 0.3);
  ctx.fill();
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x0 = left + i * step;
    ctx.moveTo(x0, baseY - bandH);
    ctx.lineTo(x0 + step / 2, baseY - bandH - peakH);
    ctx.lineTo(x0 + step, baseY - bandH);
    ctx.closePath();
  }
  ctx.fill();
  ctx.restore();

  // Peak jewels.
  for (let i = 0; i < n; i++) {
    const xm = left + i * step + step / 2;
    const py = baseY - bandH - peakH;
    const center = huge && i === Math.floor(n / 2);
    ctx.fillStyle = center ? '#ff3b6b' : '#ffe9a0';
    ctx.beginPath();
    ctx.arc(xm, py - 4, center ? 16 : huge ? 12 : 9, 0, Math.PI * 2);
    ctx.fill();
  }
  // Band gems (alternating ruby / sapphire).
  for (let i = 0; i < n; i++) {
    const xm = left + i * step + step / 2;
    ctx.fillStyle = i % 2 === 0 ? '#ff3b6b' : '#3b9bff';
    ctx.beginPath();
    ctx.arc(xm, baseY - bandH / 2, huge ? 9 : 7, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawEmblem(ctx: CanvasRenderingContext2D, cx: number, cy: number, rank: MarketerRank, rgb: RGB): void {
  const cfg = EMBLEM[rank];
  drawHalo(ctx, cx, cy, 150, rgb);
  if (cfg.kind === 'tech') {
    drawTechCore(ctx, cx, cy, rgb, 96);
  } else if (cfg.kind === 'gem') {
    drawGem(ctx, cx, cy + 4, 94, rgb);
  } else {
    drawGem(ctx, cx, cy + 16, 84, [220, 238, 255], { diamond: true, tint: rgb, colored: cfg.colored });
    if (cfg.crown >= 1) drawCrown(ctx, cx, cy - 46, cfg.crown === 2);
  }
}

/* ── Title fitting ───────────────────────────────────────────────────────── */

function fitTitle(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  baseSize: number,
): { lines: string[]; size: number } {
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
  let size = baseSize;
  let lines = wrap(size);
  const tooWide = (ls: string[], sz: number) => {
    ctx.font = `900 ${sz}px Arial, sans-serif`;
    return ls.some((l) => ctx.measureText(l).width > maxW);
  };
  while ((lines.length > 2 || tooWide(lines, size)) && size > 56) {
    size -= 4;
    lines = wrap(size);
  }
  return { lines, size };
}

/* ── Card ────────────────────────────────────────────────────────────────── */

export function downloadReportCard(opts: {
  rank: MarketerRank;
  cycleNumber: number;
  report: CycleTeamReport;
}): void {
  const { rank, cycleNumber, report } = opts;
  const color = hslToRgb(...ACCENT_HSL[rank]);

  const W = 1080;
  const H = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Background.
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#070810');
  bg.addColorStop(1, '#0f1320');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Tech grid.
  ctx.strokeStyle = 'rgba(255,255,255,0.028)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 90) seg(ctx, [x, 0], [x, H]);
  for (let y = 0; y <= H; y += 90) seg(ctx, [0, y], [W, y]);
  ctx.stroke();

  // Accent glows.
  const hero = ctx.createRadialGradient(W / 2, 470, 40, W / 2, 470, 820);
  hero.addColorStop(0, rgba(color, 0.4));
  hero.addColorStop(0.5, rgba(color, 0.12));
  hero.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = hero;
  ctx.fillRect(0, 0, W, H);
  const base = ctx.createRadialGradient(W / 2, H - 120, 40, W / 2, H - 120, 640);
  base.addColorStop(0, rgba(color, 0.14));
  base.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);

  // Glowing accent particles.
  const dots: P[] = [
    [120, 360], [980, 300], [200, 770], [900, 820],
    [140, 1180], [960, 1240], [110, 1520], [985, 1600], [70, 980], [1010, 1080],
  ];
  ctx.save();
  ctx.shadowColor = rgba(color, 0.9);
  ctx.shadowBlur = 18;
  for (const [x, y] of dots) {
    ctx.fillStyle = rgba(lighten(color, 0.3), 0.85);
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.textAlign = 'center';

  // Brand.
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '700 30px Arial, sans-serif';
  ctx.fillText(spaced('CRM NETWORKER'), W / 2, 150);

  // Emblem (per-rank gem / diamond / tech core).
  drawEmblem(ctx, W / 2, 440, rank, color);

  // Eyebrow.
  ctx.fillStyle = rgbStr(color);
  ctx.font = '800 40px Arial, sans-serif';
  ctx.fillText(spaced('RICONOSCIMENTO'), W / 2, 712);

  // Rank name (hero).
  const { lines, size } = fitTitle(ctx, RANK_LABELS[rank].toUpperCase(), W - 130, 134);
  ctx.save();
  ctx.shadowColor = rgba(color, 0.9);
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

  // Cycle chip.
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
  ctx.strokeStyle = rgba(color, 0.6);
  roundRectPath(ctx, chipX, chipY, chipW, chipH, chipH / 2);
  ctx.stroke();
  ctx.fillStyle = rgbStr(color);
  ctx.fillText(chipLabel, W / 2, chipY + 52);

  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = '500 28px Arial, sans-serif';
  ctx.fillText(`${fmtDate(report.startIso)} — ${fmtDate(report.endIso)}`, W / 2, chipY + chipH + 48);

  // Stats panel.
  const panelY = chipY + chipH + 96;
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '700 30px Arial, sans-serif';
  ctx.fillText(spaced('PERFORMANCE DEL TEAM'), W / 2, panelY);

  const overall = pct(report.reachedIscrizione, report.reachedBi);
  const tileY = panelY + 36;
  const tileW = (W - 80 - 36) / 2;
  const tileH = 226;
  const tiles = [
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
    ctx.font = '900 118px Arial, sans-serif';
    ctx.fillText(t.value, t.x + tileW / 2, tileY + 148);
    ctx.restore();
    ctx.fillStyle = rgbStr(color);
    ctx.font = '700 28px Arial, sans-serif';
    ctx.fillText(spaced(t.label), t.x + tileW / 2, tileY + 192);
  }

  // Funnel breakdown — people reached at each stage.
  const phases = [
    { label: 'B.INFO', value: report.reachedBi },
    { label: 'FUP', value: report.reachedFup },
    { label: 'CLOSING', value: report.reachedClosing },
    { label: 'NUOVO', value: report.reachedIscrizione },
  ];
  const stripY = tileY + tileH + 30;
  const gap = 22;
  const cellW = (W - 80 - 3 * gap) / 4;
  const cellH = 156;
  phases.forEach((p, i) => {
    const x = 40 + i * (cellW + gap);
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    roundRectPath(ctx, x, stripY, cellW, cellH, 24);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = rgba(color, 0.22);
    roundRectPath(ctx, x, stripY, cellW, cellH, 24);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 72px Arial, sans-serif';
    ctx.fillText(String(p.value), x + cellW / 2, stripY + 90);
    ctx.fillStyle = rgbStr(color);
    ctx.font = '800 26px Arial, sans-serif';
    ctx.fillText(p.label, x + cellW / 2, stripY + 132);
  });

  // Footer.
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '600 26px Arial, sans-serif';
  ctx.fillText(spaced('CRM NETWORKER · POWER AGENCY'), W / 2, H - 64);

  // Download.
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
