'use client';

import * as React from 'react';
import { Crosshair, Maximize2, Minus, Plus, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { formatNumber, formatPercent } from '@/lib/utils';
import {
  RANK_LABELS,
  RANK_ORDER,
  type BranchScope,
  type MarketerRank,
  type PlacementLeg,
  type TreeNode,
} from '@/lib/types/db';
import { NODE_HEIGHT, NODE_WIDTH, layoutTree } from './layout';

/** Imperative handle used by the toolbar / search jump. */
export interface GenealogyCanvasHandle {
  fitView: () => void;
  centerOn: (id: string) => void;
}

/** Props for the genealogy canvas (the cinematic renderer is the only one). */
export interface GenealogyCanvasProps {
  /** Every loaded node (full cache). */
  nodes: TreeNode[];
  /** Id the layout is rooted at for the active scope. */
  layoutRootId: string;
  scope: BranchScope;
  expanded: ReadonlySet<string>;
  selectedId: string | null;
  onSelect: (node: TreeNode) => void;
  onToggle: (node: TreeNode) => void;
  hasChildren: (node: TreeNode) => boolean;
  /** Node id whose empty legs render as "+" add-slots (null = none). */
  addSlotsForId: string | null;
  /** Open the add-member dialog for an empty (parent, leg) slot. */
  onAddSlot: (parentId: string, leg: PlacementLeg) => void;
  /** Ids classified as SPILLOVER (in your leg but recruited from outside your line). */
  spilloverIds?: ReadonlySet<string>;
  /** Dim spillover nodes so your own sponsorship line stands out. */
  dimSpillover?: boolean;
}

/**
 * Cinematic tree viewer — a single-`<canvas>` renderer for the binary genealogy.
 *
 * WHY a canvas (and not React Flow): React Flow mounts a DOM node per card and
 * gets heavy past a few hundred. An org can register ~1000 people, so the
 * cinematic mode draws the WHOLE loaded org on one canvas — thousands of shapes
 * at 60fps — with three scale-driven defenses so it never "explodes":
 *   1. Viewport culling — only nodes whose box intersects the screen are drawn.
 *   2. Level-of-detail (LOD) — far out, a node is a glowing dot (no text/avatar);
 *      mid, a name chip; close, the full card. Text is the expensive part, so it
 *      is only painted when readable.
 *   3. Idle = zero work — the rAF loop runs only while the camera is easing or the
 *      user is interacting; once settled it stops (no battery drain, no ambient
 *      animation churn).
 *
 * Geometry is shared with the classic canvas via {@link layoutTree} (same
 * d3-hierarchy binary layout), so a node sits in the exact same place in both
 * modes. The component is a pure presenter: it owns the camera + paint, the
 * parent owns the data and the selection/detail panel.
 */

// ── LOD thresholds (camera zoom) ────────────────────────────────────────────
const LOD_DOT = 0.3; // below → dots only
const LOD_CARD = 0.6; // at/above → full card; between → name chip

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 1.6;
const CULL_MARGIN = 96; // px of slack around the viewport for culling
const EASE = 0.2; // camera interpolation factor per frame

const PRESTIGE_FROM = RANK_ORDER.indexOf('vice_president');
function isPrestige(rank: MarketerRank): boolean {
  return RANK_ORDER.indexOf(rank) >= PRESTIGE_FROM;
}

/** CSS custom-property names resolved once so org theming carries to accents. */
const THEME_VARS = {
  primary: '--primary',
  success: '--success',
  warning: '--warning',
  danger: '--danger',
  info: '--info',
  global: '--branch-global',
  left: '--branch-left',
  right: '--branch-right',
  // Rank tokens — so a rank reads with the SAME color it has everywhere else.
  rankExecutive: '--rank-executive',
  rankConsultant: '--rank-consultant',
  rankTeamLeader: '--rank-team-leader',
  rankAdvancedTeamLeader: '--rank-advanced-team-leader',
  rankSeniorTeamLeader: '--rank-senior-team-leader',
  rankExecutiveTeamLeader: '--rank-executive-team-leader',
  rankVicePresident: '--rank-vice-president',
  rankSeniorVicePresident: '--rank-senior-vice-president',
  rankExecutiveVicePresident: '--rank-executive-vice-president',
  rankGlobalDirector: '--rank-global-director',
} as const;
type ThemeKey = keyof typeof THEME_VARS;
type Palette = Record<ThemeKey, string>;

const FALLBACK: Palette = {
  primary: '250 84% 60%',
  success: '142 64% 45%',
  warning: '38 92% 52%',
  danger: '0 72% 55%',
  info: '210 90% 58%',
  global: '250 84% 62%',
  left: '265 70% 62%',
  right: '170 70% 46%',
  rankExecutive: '217 12% 65%',
  rankConsultant: '330 75% 70%',
  rankTeamLeader: '200 85% 65%',
  rankAdvancedTeamLeader: '275 70% 70%',
  rankSeniorTeamLeader: '0 75% 64%',
  rankExecutiveTeamLeader: '145 55% 55%',
  rankVicePresident: '45 90% 60%',
  rankSeniorVicePresident: '28 88% 62%',
  rankExecutiveVicePresident: '270 70% 70%',
  rankGlobalDirector: '232 60% 68%',
};

/** Map each rank to its palette color key (cliente/no_rank stay neutral). */
const RANK_COLOR_KEY: Record<MarketerRank, ThemeKey | null> = {
  cliente: null,
  no_rank: null,
  executive: 'rankExecutive',
  consultant: 'rankConsultant',
  team_leader: 'rankTeamLeader',
  advanced_team_leader: 'rankAdvancedTeamLeader',
  senior_team_leader: 'rankSeniorTeamLeader',
  executive_team_leader: 'rankExecutiveTeamLeader',
  vice_president: 'rankVicePresident',
  senior_vice_president: 'rankSeniorVicePresident',
  executive_vice_president: 'rankExecutiveVicePresident',
  global_director: 'rankGlobalDirector',
};

function rankColor(rank: MarketerRank, pal: Palette): string {
  const key = RANK_COLOR_KEY[rank];
  return key ? hsl(pal[key], 1) : 'rgba(255,255,255,0.55)';
}

/** Rank color as a raw "H S% L%" triplet (so callers can apply their own alpha).
 *  cliente/no_rank fall back to a neutral grey. */
function rankTriplet(rank: MarketerRank, pal: Palette): string {
  const key = RANK_COLOR_KEY[rank];
  return key ? pal[key] : '0 0% 70%';
}

function readPalette(el: HTMLElement): Palette {
  const cs = getComputedStyle(el);
  const out = {} as Palette;
  (Object.keys(THEME_VARS) as ThemeKey[]).forEach((k) => {
    const v = cs.getPropertyValue(THEME_VARS[k]).trim();
    out[k] = v || FALLBACK[k];
  });
  return out;
}

/** `hsl()` from a "H S% L%" triplet, with optional alpha (CSS Color 4 syntax). */
function hsl(triplet: string, a = 1): string {
  return a >= 1 ? `hsl(${triplet})` : `hsl(${triplet} / ${a})`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, rad);
    return;
  }
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

/** Lucide `Users` icon (v0.452 path data) stroked on the canvas at a given size,
 *  so the team total carries the SAME glyph as the side panel / sidebar. */
const USERS_PATHS = [
  'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2',
  'M22 21v-2a4 4 0 0 0-3-3.87',
  'M16 3.13a4 4 0 0 1 0 7.75',
];
function drawUsersIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color: string,
): void {
  const s = size / 24;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(s, s);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (typeof Path2D === 'function') {
    for (const d of USERS_PATHS) ctx.stroke(new Path2D(d));
    const circle = new Path2D();
    circle.arc(9, 7, 4, 0, Math.PI * 2);
    ctx.stroke(circle);
  }
  ctx.restore();
}

/** A small rounded count pill (label + value), returns the next x cursor (px). */
function drawCountPill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  h: number,
  label: string,
  value: number,
  color: string,
): number {
  ctx.font = `600 ${h * 0.55}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const txt = `${label} ${formatNumber(value)}`;
  const pw = ctx.measureText(txt).width + h * 0.7;
  roundRect(ctx, x, y, pw, h, h * 0.3);
  ctx.fillStyle = hsl(color, 0.18);
  ctx.fill();
  ctx.fillStyle = hsl(color, 1);
  ctx.fillText(txt, x + h * 0.35, y + h / 2);
  return x + pw + h * 0.3;
}

function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) {
    t = t.slice(0, -1);
  }
  return `${t}…`;
}

interface Camera {
  x: number;
  y: number;
  zoom: number;
}

interface PosEntry {
  x: number;
  y: number;
}

interface CinematicData {
  positioned: ReturnType<typeof layoutTree>['positioned'];
  addSlots: ReturnType<typeof layoutTree>['addSlots'];
  edges: ReturnType<typeof layoutTree>['edges'];
  posById: Map<string, PosEntry>;
  bbox: { minX: number; minY: number; maxX: number; maxY: number } | null;
}

function buildData(
  nodes: TreeNode[],
  layoutRootId: string,
  addSlotsForId: string | null,
): CinematicData {
  // Cinematic mode flies over the WHOLE loaded org, so every loaded node is
  // treated as expanded (geometry-only — the parent's collapse state drives the
  // classic mode, not this one).
  const fullExpanded = new Set(nodes.map((n) => n.id));
  const { positioned, addSlots, edges } = layoutTree(
    nodes,
    layoutRootId,
    fullExpanded,
    addSlotsForId,
  );

  const posById = new Map<string, PosEntry>();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of positioned) {
    posById.set(p.node.id, { x: p.x, y: p.y });
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + NODE_WIDTH);
    maxY = Math.max(maxY, p.y + NODE_HEIGHT);
  }
  for (const s of addSlots) posById.set(s.id, { x: s.x, y: s.y });

  return {
    positioned,
    addSlots,
    edges,
    posById,
    bbox: Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null,
  };
}

function CinematicInner(
  {
    nodes,
    layoutRootId,
    scope,
    selectedId,
    onSelect,
    addSlotsForId,
    onAddSlot,
    spilloverIds,
    dimSpillover,
  }: GenealogyCanvasProps,
  ref: React.Ref<GenealogyCanvasHandle>,
) {
  const t = useTranslations('genealogia');
  const containerRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  const camRef = React.useRef<Camera>({ x: 0, y: 0, zoom: 0.6 });
  const targetRef = React.useRef<Camera>({ x: 0, y: 0, zoom: 0.6 });
  const rafRef = React.useRef<number | null>(null);
  const sizeRef = React.useRef({ w: 0, h: 0, dpr: 1 });
  const paletteRef = React.useRef<Palette>(FALLBACK);

  // Latest props mirrored into refs so the imperative paint/handlers never close
  // over stale values (the rAF loop and DOM listeners are set up once).
  const dataRef = React.useRef<CinematicData>({
    positioned: [],
    addSlots: [],
    edges: [],
    posById: new Map(),
    bbox: null,
  });
  const selectedRef = React.useRef<string | null>(selectedId);
  const onSelectRef = React.useRef(onSelect);
  const onAddSlotRef = React.useRef(onAddSlot);
  const spilloverRef = React.useRef<ReadonlySet<string> | undefined>(spilloverIds);
  const dimSpilloverRef = React.useRef<boolean>(dimSpillover ?? false);
  selectedRef.current = selectedId;
  onSelectRef.current = onSelect;
  onAddSlotRef.current = onAddSlot;
  spilloverRef.current = spilloverIds;
  dimSpilloverRef.current = dimSpillover ?? false;

  const data = React.useMemo(
    () => buildData(nodes, layoutRootId, addSlotsForId),
    [nodes, layoutRootId, addSlotsForId],
  );
  const empty = data.positioned.length === 0;

  // ── Paint ────────────────────────────────────────────────────────────────
  const draw = React.useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const { w: W, h: H, dpr } = sizeRef.current;
    if (W === 0 || H === 0) return;
    const cam = camRef.current;
    const pal = paletteRef.current;
    const { positioned, edges, addSlots, posById } = dataRef.current;
    const sel = selectedRef.current;
    const zoom = cam.zoom;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // Deep "stage" backdrop (always dark for the cinematic feel) + faint aurora
    // tinted with the org's branch colors + a vignette so the tree reads as a
    // lit, recessed space. Cheap: a handful of gradients per frame.
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0c0e17');
    bg.addColorStop(1, '#05060c');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const aurora = (cx: number, cy: number, r: number, color: string) => {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, hsl(color, 0.16));
      g.addColorStop(1, hsl(color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    };
    aurora(W * 0.22, H * 0.12, Math.max(W, H) * 0.55, pal.left);
    aurora(W * 0.82, H * 0.18, Math.max(W, H) * 0.5, pal.right);

    const proj = (wx: number, wy: number): [number, number] => [
      (wx - cam.x) * zoom + W / 2,
      (wy - cam.y) * zoom + H / 2,
    ];

    // ── Edges (drawn under nodes) ──
    ctx.lineCap = 'round';
    for (const e of edges) {
      const a = posById.get(e.source);
      const b = posById.get(e.target);
      if (!a || !b) continue;
      const isAdd = e.target.includes('__add_');
      const [x1, y1] = proj(a.x + NODE_WIDTH / 2, a.y + NODE_HEIGHT);
      const [x2, y2] = proj(b.x + NODE_WIDTH / 2, b.y);
      // Cull edges fully off one side of the viewport.
      if (
        (x1 < -CULL_MARGIN && x2 < -CULL_MARGIN) ||
        (x1 > W + CULL_MARGIN && x2 > W + CULL_MARGIN) ||
        (y1 < -CULL_MARGIN && y2 < -CULL_MARGIN) ||
        (y1 > H + CULL_MARGIN && y2 > H + CULL_MARGIN)
      ) {
        continue;
      }
      const colorKey =
        e.leg === 'LEFT' ? pal.left : e.leg === 'RIGHT' ? pal.right : pal.global;
      const touches = sel != null && (e.source === sel || e.target === sel);
      const dim = sel != null && !touches && !isAdd;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      const my = (y1 + y2) / 2;
      ctx.bezierCurveTo(x1, my, x2, my, x2, y2);
      ctx.lineWidth = touches ? 2.4 : 1.4;
      ctx.strokeStyle = hsl(colorKey, isAdd ? 0.3 : dim ? 0.16 : touches ? 0.9 : 0.5);
      if (isAdd) ctx.setLineDash([5, 5]);
      ctx.stroke();
      if (isAdd) ctx.setLineDash([]);
    }

    // ── Add-slots ("+" affordances) ──
    for (const s of addSlots) {
      const [cx, cy] = proj(s.x + NODE_WIDTH / 2, s.y + NODE_HEIGHT / 2);
      const r = 16 * zoom;
      if (cx < -r || cx > W + r || cy < -r || cy > H + r) continue;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = hsl(pal.primary, 0.7);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = hsl(pal.primary, 0.95);
      ctx.lineWidth = Math.max(1.5, 2.2 * zoom);
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.4, cy);
      ctx.lineTo(cx + r * 0.4, cy);
      ctx.moveTo(cx, cy - r * 0.4);
      ctx.lineTo(cx, cy + r * 0.4);
      ctx.stroke();
    }

    // ── Nodes (LOD by zoom) ──
    const sw = NODE_WIDTH * zoom;
    const sh = NODE_HEIGHT * zoom;
    const mode: 'dot' | 'chip' | 'card' =
      zoom < LOD_DOT ? 'dot' : zoom < LOD_CARD ? 'chip' : 'card';

    for (const p of positioned) {
      const [sx, sy] = proj(p.x, p.y);
      if (
        sx + sw < -CULL_MARGIN ||
        sx > W + CULL_MARGIN ||
        sy + sh < -CULL_MARGIN ||
        sy > H + CULL_MARGIN
      ) {
        continue;
      }
      const n = p.node;
      const isSel = n.id === sel;
      const isSpill = spilloverRef.current?.has(n.id) ?? false;
      const prestige = isPrestige(n.rank);
      const legKey =
        p.branchLeg === 'LEFT'
          ? pal.left
          : p.branchLeg === 'RIGHT'
            ? pal.right
            : pal.global;
      const accent = prestige ? pal.warning : legKey;
      // Depth recession: deeper nodes fade a touch (pseudo-3D), unless selected.
      const depthFade = isSel ? 1 : Math.max(0.6, 1 - p.depth * 0.05);
      // "Focus my line": fade spillover nodes so the organic line stands out.
      const dimFactor = dimSpilloverRef.current && isSpill && !isSel ? 0.4 : 1;

      if (mode === 'dot') {
        // Zoomed-out dots carry the RANK color so a leader spots who's where.
        const rt = rankTriplet(n.rank, pal);
        const r = Math.max(2.5, Math.min(9, 7 * zoom)) * (isSel ? 1.5 : 1);
        if (isSel) {
          ctx.shadowColor = hsl(rt, 0.9);
          ctx.shadowBlur = 18;
        }
        ctx.beginPath();
        ctx.arc(sx + sw / 2, sy + sh / 2, r, 0, Math.PI * 2);
        ctx.fillStyle = hsl(rt, depthFade);
        ctx.globalAlpha = depthFade * dimFactor;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        if (isSel) {
          ctx.lineWidth = 2;
          ctx.strokeStyle = 'rgba(255,255,255,0.95)';
          ctx.stroke();
        }
        continue;
      }

      // chip + card share local-coordinate drawing (0..NODE_WIDTH / HEIGHT).
      const L = (lx: number) => sx + lx * zoom;
      const T = (ly: number) => sy + ly * zoom;
      const S = (v: number) => v * zoom;

      // Recede deep nodes in the overview (dot/chip); keep full opacity up close.
      ctx.globalAlpha = (mode === 'card' ? 1 : depthFade) * dimFactor;

      // Selected node gets a soft glow halo (one node → shadowBlur is cheap).
      if (isSel) {
        ctx.shadowColor = hsl(accent, 0.8);
        ctx.shadowBlur = 26;
      }
      // Card body (dark glass).
      roundRect(ctx, sx, sy, sw, sh, S(14));
      ctx.fillStyle = isSel ? 'rgba(24,27,38,0.96)' : 'rgba(17,19,27,0.92)';
      ctx.fill();
      ctx.shadowBlur = 0;

      // Top sheen — card mode only (a per-node gradient; skipped when many chips
      // are on screen so the close-up detail never costs us the wide view).
      if (mode === 'card') {
        const sheen = ctx.createLinearGradient(0, sy, 0, sy + sh);
        sheen.addColorStop(0, 'rgba(255,255,255,0.07)');
        sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
        sheen.addColorStop(1, 'rgba(0,0,0,0.28)');
        roundRect(ctx, sx, sy, sw, sh, S(14));
        ctx.fillStyle = sheen;
        ctx.fill();
      }

      // Border / selection ring — spillover gets a dashed info-blue outline.
      roundRect(ctx, sx, sy, sw, sh, S(14));
      if (isSpill && !isSel) {
        ctx.lineWidth = 1.6;
        ctx.setLineDash([S(6), S(4)]);
        ctx.strokeStyle = hsl(pal.info, 0.85);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.lineWidth = isSel ? 2.4 : 1;
        ctx.strokeStyle = isSel
          ? hsl(accent, 0.95)
          : prestige
            ? hsl(pal.warning, 0.4)
            : 'rgba(255,255,255,0.1)';
        ctx.stroke();
      }

      // Branch rail (left).
      ctx.fillStyle = hsl(accent, 0.95);
      roundRect(ctx, sx, sy, S(4), sh, S(2));
      ctx.fill();

      // Avatar disc + initials.
      const avX = L(34);
      const avY = T(36);
      const avR = S(18);
      ctx.beginPath();
      ctx.arc(avX, avY, avR, 0, Math.PI * 2);
      ctx.fillStyle = hsl(accent, 0.9);
      ctx.fill();
      ctx.lineWidth = Math.max(1, S(2));
      ctx.strokeStyle =
        n.status === 'active' ? hsl(pal.success, 0.9) : 'rgba(255,255,255,0.2)';
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = `600 ${S(15)}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(initials(n.display_name), avX, avY);

      // Name.
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,255,255,0.96)';
      ctx.font = `600 ${S(15)}px ui-sans-serif, system-ui, sans-serif`;
      ctx.fillText(fitText(ctx, n.display_name, S(180)), L(60), T(28));

      if (mode === 'card') {
        // Spillover tag (top-right) — recruited from outside your line.
        if (isSpill) {
          const tag = t('spillover').toUpperCase();
          ctx.font = `700 ${S(8)}px ui-sans-serif, system-ui, sans-serif`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          const padX = S(5);
          const tagH = S(13);
          const tagW = ctx.measureText(tag).width + padX * 2;
          const tagX = L(NODE_WIDTH - 12) - tagW;
          const tagY = T(9);
          roundRect(ctx, tagX, tagY, tagW, tagH, tagH / 2);
          ctx.fillStyle = hsl(pal.info, 0.18);
          ctx.fill();
          ctx.fillStyle = hsl(pal.info, 1);
          ctx.fillText(tag, tagX + padX, tagY + tagH / 2);
        }

        // Rank label — colored with the rank's own token (as everywhere else).
        ctx.fillStyle = rankColor(n.rank, pal);
        ctx.font = `700 ${S(11)}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(fitText(ctx, RANK_LABELS[n.rank], S(168)), L(60), T(48));

        // Counts row — TEAM (people icon + total) first, then LEFT, then RIGHT.
        const pillH = S(20);
        const pillTop = T(70);
        const rowMid = T(80);
        let rx = L(16);
        const tiSize = S(15);
        drawUsersIcon(ctx, rx + tiSize / 2, rowMid, tiSize, 'rgba(255,255,255,0.7)');
        rx += tiSize + S(4);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.font = `700 ${S(12)}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const teamTxt = formatNumber(n.team_size);
        ctx.fillText(teamTxt, rx, rowMid);
        rx += ctx.measureText(teamTxt).width + S(10);
        rx = drawCountPill(ctx, rx, pillTop, pillH, 'L', n.left_count, pal.left);
        drawCountPill(ctx, rx, pillTop, pillH, 'R', n.right_count, pal.right);

        // Divider + KPI strip.
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(L(0), T(102));
        ctx.lineTo(L(NODE_WIDTH), T(102));
        ctx.stroke();

        const kpi = (lx: number, value: string, label: string, color: string) => {
          ctx.fillStyle = hsl(color, 1);
          ctx.font = `700 ${S(15)}px ui-sans-serif, system-ui, sans-serif`;
          ctx.fillText(value, L(lx), T(122));
          ctx.fillStyle = 'rgba(255,255,255,0.45)';
          ctx.font = `600 ${S(9)}px ui-sans-serif, system-ui, sans-serif`;
          ctx.fillText(label.toUpperCase(), L(lx), T(138));
        };
        kpi(16, formatNumber(n.kpis.prospects), t('kpi_prospects'), pal.info);
        kpi(
          132,
          formatPercent(n.kpis.conversion_rate, 0),
          t('kpi_conversion'),
          pal.warning,
        );
      }

      ctx.globalAlpha = 1;
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }, [t]);

  // ── Camera animation loop (runs only while easing) ─────────────────────────
  const scheduleFrame = React.useCallback(() => {
    if (rafRef.current != null) return;
    const step = () => {
      const cam = camRef.current;
      const tgt = targetRef.current;
      cam.x += (tgt.x - cam.x) * EASE;
      cam.y += (tgt.y - cam.y) * EASE;
      cam.zoom += (tgt.zoom - cam.zoom) * EASE;
      const settled =
        Math.abs(tgt.x - cam.x) < 0.4 &&
        Math.abs(tgt.y - cam.y) < 0.4 &&
        Math.abs(tgt.zoom - cam.zoom) < 0.0008;
      if (settled) {
        cam.x = tgt.x;
        cam.y = tgt.y;
        cam.zoom = tgt.zoom;
      }
      draw();
      if (settled) {
        rafRef.current = null;
      } else {
        rafRef.current = requestAnimationFrame(step);
      }
    };
    rafRef.current = requestAnimationFrame(step);
  }, [draw]);

  const clampZoom = (z: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));

  const fitView = React.useCallback(() => {
    const { bbox } = dataRef.current;
    const { w: W, h: H } = sizeRef.current;
    if (!bbox || W === 0 || H === 0) return;
    const bw = bbox.maxX - bbox.minX;
    const bh = bbox.maxY - bbox.minY;
    const pad = 80;
    const z = clampZoom(
      Math.min((W - pad * 2) / bw, (H - pad * 2) / bh, MAX_ZOOM),
    );
    targetRef.current = {
      x: (bbox.minX + bbox.maxX) / 2,
      y: (bbox.minY + bbox.maxY) / 2,
      zoom: z,
    };
    scheduleFrame();
  }, [scheduleFrame]);

  const centerOn = React.useCallback(
    (id: string) => {
      const p = dataRef.current.posById.get(id);
      if (!p) return;
      targetRef.current = {
        x: p.x + NODE_WIDTH / 2,
        y: p.y + NODE_HEIGHT / 2,
        zoom: clampZoom(Math.max(camRef.current.zoom, 0.75)),
      };
      scheduleFrame();
    },
    [scheduleFrame],
  );

  React.useImperativeHandle(ref, () => ({ fitView, centerOn }), [
    fitView,
    centerOn,
  ]);

  const zoomBy = React.useCallback(
    (factor: number) => {
      const cam = camRef.current;
      targetRef.current = {
        x: cam.x,
        y: cam.y,
        zoom: clampZoom(targetRef.current.zoom * factor),
      };
      scheduleFrame();
    },
    [scheduleFrame],
  );

  // Keep the data ref fresh + re-fit when the tree root/scope changes. The very
  // first fit is owned by the sizing effect (it needs a measured, non-zero box);
  // here we only re-fit on a *subsequent* root/scope switch.
  const fitKey = `${layoutRootId}:${scope}`;
  const lastFit = React.useRef<string>('');
  React.useEffect(() => {
    dataRef.current = data;
    if (lastFit.current && lastFit.current !== fitKey) {
      lastFit.current = fitKey;
      // Defer one frame so the size is measured before fitting.
      const id = window.requestAnimationFrame(() => fitView());
      return () => window.cancelAnimationFrame(id);
    }
    scheduleFrame();
    return undefined;
  }, [data, fitKey, fitView, scheduleFrame]);

  // Redraw when the selection or spillover marking/focus changes.
  React.useEffect(() => {
    scheduleFrame();
  }, [selectedId, spilloverIds, dimSpillover, scheduleFrame]);

  // ── Sizing (DPR-aware, capped at 2 for fill-rate) ──────────────────────────
  React.useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      sizeRef.current = { w: rect.width, h: rect.height, dpr };
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      if (
        !lastFit.current &&
        rect.width > 0 &&
        rect.height > 0 &&
        dataRef.current.bbox
      ) {
        lastFit.current = fitKey;
        fitView();
      } else {
        scheduleFrame();
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitView, scheduleFrame]);

  // ── Theme palette (resolve once; re-resolve on dark/light class flips) ─────
  React.useEffect(() => {
    const el = containerRef.current ?? document.documentElement;
    paletteRef.current = readPalette(el);
    scheduleFrame();
    const mo = new MutationObserver(() => {
      paletteRef.current = readPalette(el);
      scheduleFrame();
    });
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style'],
    });
    return () => mo.disconnect();
  }, [scheduleFrame]);

  // ── Pointer interaction (pan / pinch / tap / wheel / dbl-tap) ──────────────
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const pointers = new Map<number, { x: number; y: number }>();
    let dragging = false;
    let moved = false;
    let downX = 0;
    let downY = 0;
    let pinchDist = 0;

    const toWorld = (sx: number, sy: number): [number, number] => {
      const cam = camRef.current;
      const { w: W, h: H } = sizeRef.current;
      return [(sx - W / 2) / cam.zoom + cam.x, (sy - H / 2) / cam.zoom + cam.y];
    };

    const hitTest = (sx: number, sy: number) => {
      const [wx, wy] = toWorld(sx, sy);
      const { positioned, addSlots } = dataRef.current;
      // Top-most first (later draw = visually on top).
      for (let i = positioned.length - 1; i >= 0; i--) {
        const p = positioned[i];
        if (
          wx >= p.x &&
          wx <= p.x + NODE_WIDTH &&
          wy >= p.y &&
          wy <= p.y + NODE_HEIGHT
        ) {
          return { kind: 'node' as const, node: p.node };
        }
      }
      for (let i = addSlots.length - 1; i >= 0; i--) {
        const s = addSlots[i];
        if (
          wx >= s.x &&
          wx <= s.x + NODE_WIDTH &&
          wy >= s.y &&
          wy <= s.y + NODE_HEIGHT
        ) {
          return { kind: 'add' as const, slot: s };
        }
      }
      return null;
    };

    const rectOf = () => canvas.getBoundingClientRect();

    const onPointerDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      const r = rectOf();
      pointers.set(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top });
      if (pointers.size === 1) {
        dragging = true;
        moved = false;
        downX = e.clientX - r.left;
        downY = e.clientY - r.top;
        canvas.style.cursor = 'grabbing';
      } else if (pointers.size === 2) {
        const pts = [...pointers.values()];
        pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      const r = rectOf();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      const prev = pointers.get(e.pointerId)!;
      pointers.set(e.pointerId, { x: px, y: py });

      if (pointers.size >= 2) {
        // Pinch-zoom anchored to the gesture midpoint.
        const pts = [...pointers.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (pinchDist > 0) {
          const cam = camRef.current;
          const mx = (pts[0].x + pts[1].x) / 2;
          const my = (pts[0].y + pts[1].y) / 2;
          const [wx, wy] = toWorld(mx, my);
          const nz = clampZoom(cam.zoom * (dist / pinchDist));
          const { w: W, h: H } = sizeRef.current;
          cam.zoom = nz;
          cam.x = wx - (mx - W / 2) / nz;
          cam.y = wy - (my - H / 2) / nz;
          targetRef.current = { x: cam.x, y: cam.y, zoom: cam.zoom };
          draw();
        }
        pinchDist = dist;
        moved = true;
        return;
      }

      if (!dragging) return;
      const dx = px - prev.x;
      const dy = py - prev.y;
      if (Math.abs(px - downX) > 4 || Math.abs(py - downY) > 4) moved = true;
      const cam = camRef.current;
      cam.x -= dx / cam.zoom;
      cam.y -= dy / cam.zoom;
      targetRef.current = { x: cam.x, y: cam.y, zoom: cam.zoom };
      draw();
    };

    const onPointerUp = (e: PointerEvent) => {
      const r = rectOf();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      const wasMoved = moved;
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchDist = 0;
      if (pointers.size === 0) {
        dragging = false;
        canvas.style.cursor = 'grab';
      }
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* pointer already released */
      }
      // A tap (no drag) selects the node under the cursor / opens an add-slot.
      if (!wasMoved) {
        const hit = hitTest(px, py);
        if (hit?.kind === 'node') onSelectRef.current(hit.node);
        else if (hit?.kind === 'add')
          onAddSlotRef.current(hit.slot.parentId, hit.slot.leg);
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = rectOf();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      const cam = camRef.current;
      const [wx, wy] = toWorld(mx, my);
      const factor = Math.exp(-e.deltaY * 0.0015);
      const nz = clampZoom(cam.zoom * factor);
      const { w: W, h: H } = sizeRef.current;
      cam.zoom = nz;
      cam.x = wx - (mx - W / 2) / nz;
      cam.y = wy - (my - H / 2) / nz;
      targetRef.current = { x: cam.x, y: cam.y, zoom: cam.zoom };
      draw();
    };

    const onDblClick = (e: MouseEvent) => {
      const r = rectOf();
      const hit = hitTest(e.clientX - r.left, e.clientY - r.top);
      if (hit?.kind === 'node') {
        const p = dataRef.current.posById.get(hit.node.id);
        if (p) {
          targetRef.current = {
            x: p.x + NODE_WIDTH / 2,
            y: p.y + NODE_HEIGHT / 2,
            zoom: clampZoom(Math.max(camRef.current.zoom * 1.4, LOD_CARD + 0.1)),
          };
          scheduleFrame();
        }
      } else {
        zoomBy(1.4);
      }
    };

    canvas.style.cursor = 'grab';
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('dblclick', onDblClick);
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('dblclick', onDblClick);
    };
  }, [draw, scheduleFrame, zoomBy]);

  // Stop any pending frame on unmount.
  React.useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-[#06070d]"
    >
      <canvas ref={canvasRef} className="absolute inset-0 touch-none" />

      {/* Camera controls (HTML overlay → accessible + crisp). */}
      <div className="absolute bottom-3 left-3 z-10 flex flex-col gap-1.5">
        <CtrlButton label={t('fit_view')} onClick={fitView}>
          <Maximize2 className="h-4 w-4" aria-hidden />
        </CtrlButton>
        <CtrlButton label="Zoom +" onClick={() => zoomBy(1.3)}>
          <Plus className="h-4 w-4" aria-hidden />
        </CtrlButton>
        <CtrlButton label="Zoom −" onClick={() => zoomBy(1 / 1.3)}>
          <Minus className="h-4 w-4" aria-hidden />
        </CtrlButton>
        {selectedId && (
          <CtrlButton
            label={t('locate')}
            onClick={() => centerOn(selectedId)}
          >
            <Crosshair className="h-4 w-4" aria-hidden />
          </CtrlButton>
        )}
      </div>

      {empty && (
        <div className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center">
          <div className="glass animate-scale-in rounded-2xl border border-border/60 px-8 py-7 text-center shadow-xl ring-1 ring-white/5">
            <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/20">
              <Users className="h-6 w-6" aria-hidden />
            </span>
            <p className="text-sm font-semibold text-foreground">
              {t('empty_title')}
            </p>
            <p className="mt-1.5 max-w-[16rem] text-xs leading-relaxed text-muted-foreground">
              {t('empty_body')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function CtrlButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 bg-card/85 text-muted-foreground shadow-lg backdrop-blur transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </button>
  );
}

export const GenealogyCanvasCinematic = React.forwardRef<
  GenealogyCanvasHandle,
  GenealogyCanvasProps
>(CinematicInner);
