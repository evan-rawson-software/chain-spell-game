import type { FloorDef, StatusKind } from '../types';
import { drawArena } from './arena';
import { drawMagicCircle } from './circle';
import { getSettings } from '../settings';
import {
  FOG_DIST, HAZARD_INFO, SHELL_BREAK_TIME, SHIELD_REGROW, STOMP_RANGE, TRAIT_INFO, defenseUp, fogAlpha, isBoss,
} from './rules';
import {
  ELEMENT_COLOR, H, MUZZLE_X, MUZZLE_Y, STATUS_COLOR, W, WARD_X, WARD_Y,
  type Enemy, type World,
} from './model';

export interface HudState {
  floor: FloorDef;
  waveIdx: number;
  waveTotal: number;
  banner: { title: string; sub: string; alpha: number } | null;
  overlay: { text: string; good: boolean } | null;
  charge: number;
  castTime: number;
  hasShots: boolean;
  mouse: { x: number; y: number; inside: boolean };
  orbColor: string;
  time: number;
  /** seconds since the spell last fired */
  sinceCast: number;
  /** HUD text/bar scale compensation (>=1) */
  ui: number;
  /** 0..1 damage vignette strength */
  hurt: number;
  /** world-x of the left edge and width of the visible area (letterbox included) */
  offX: number;
  viewW: number;
  /** device pixels per world unit */
  pxScale: number;
  /** where the next cast will be aimed (world coords) */
  aimX: number;
  aimY: number;
  /** last cast was large (bigger shockwave) */
  bigCast: boolean;
  /** combo counter (kills within 2 s of each other) */
  combo: { n: number; k: number } | null;
  /** multi-kill callout, k = 0..1 progress */
  callout: { text: string; color: string; k: number } | null;
  /** Momentum keystone readout, or null */
  momentum: string | null;
  /** Practice range: skip the battle HUD; only the aim reticle is drawn */
  practice?: boolean;
}

export function render(ctx: CanvasRenderingContext2D, w: World, h: HudState): void {
  drawArena(ctx, h.floor, h.time, h.pxScale, h.offX, h.viewW);
  if (w.hazard === 'fog') drawFog(ctx, h);
  drawMagicCircle(ctx, w, {
    time: h.time, progress: h.castTime > 0 ? h.charge / h.castTime : 0, hasShots: h.hasShots,
    sinceCast: h.sinceCast, color: h.orbColor, aimX: h.aimX, aimY: h.aimY, big: h.bigCast,
  });
  for (const e of w.enemies) {
    const a = w.hazard === 'fog' ? fogAlpha(Math.hypot(e.x - WARD_X, e.y - WARD_Y), w.time - e.lastHit) : 1;
    if (a <= 0) continue;
    ctx.globalAlpha = a;
    drawEnemy(ctx, e, h.time);
    ctx.globalAlpha = 1;
  }
  drawEnemyProjectiles(ctx, w);
  drawPlayerProjectiles(ctx, w);
  drawEffects(ctx, w);
  drawHazardOverlay(ctx, w, h);
  if (h.practice) drawAim(ctx, h);
  else drawHud(ctx, w, h);
}

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

interface Pose {
  /** color mapper: applies hit-flash / frozen tint */
  c: (col: string) => string;
  /** walk phase (radians), 0 while frozen */
  s: number;
  /** 0..1 attack animation */
  atk: number;
  t: number;
  id: number;
}

const OUT = 'rgba(10,8,18,0.85)';

function mixBlue(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  if (hex[0] !== '#' || hex.length !== 7 || Number.isNaN(n)) return '#9fd9ee';
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgb(${Math.round(r * 0.4 + 159 * 0.6)},${Math.round(g * 0.4 + 217 * 0.6)},${Math.round(b * 0.4 + 238 * 0.6)})`;
}

function ell(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string, stroke = true): void {
  ctx.fillStyle = fill;
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  if (stroke) ctx.stroke();
}

function poly(ctx: CanvasRenderingContext2D, pts: number[], fill: string, stroke = true): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath(); ctx.fill();
  if (stroke) ctx.stroke();
}

function feet(ctx: CanvasRenderingContext2D, r: number, spread: number, size: number, col: string, p: Pose): void {
  const a = Math.sin(p.s) * r * 0.25;
  ell(ctx, -spread * r + a, r * 0.85 - Math.max(0, Math.cos(p.s)) * 2, size * r, size * r * 0.55, col);
  ell(ctx, spread * r - a, r * 0.85 - Math.max(0, -Math.cos(p.s)) * 2, size * r, size * r * 0.55, col);
}

function dots(ctx: CanvasRenderingContext2D, x: number, y: number, gap: number, rad: number, col: string): void {
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.arc(x + gap, y, rad, 0, Math.PI * 2); ctx.fill();
}

function drawGrunt(ctx: CanvasRenderingContext2D, r: number, col: string, p: Pose): void {
  const skin = p.c(col), dark = p.c('#55702f');
  feet(ctx, r, 0.4, 0.34, dark, p);
  // club (front hand, swings on attack)
  ctx.save();
  ctx.translate(-r * 0.85, r * 0.2);
  ctx.rotate(-0.6 - p.atk * 1.4 + Math.sin(p.s) * 0.1);
  ctx.fillStyle = p.c('#8a6238');
  ctx.fillRect(-r * 0.12, -r * 1.05, r * 0.24, r * 1.1); ctx.strokeRect(-r * 0.12, -r * 1.05, r * 0.24, r * 1.1);
  ell(ctx, 0, -r * 1.05, r * 0.28, r * 0.34, p.c('#6b4a28'));
  ctx.restore();
  // ears
  poly(ctx, [-r * 0.7, -r * 0.45, -r * 1.2, -r * 0.8, -r * 0.55, -r * 0.1], skin);
  poly(ctx, [r * 0.7, -r * 0.45, r * 1.15, -r * 0.7, r * 0.55, -r * 0.1], skin);
  // body
  ell(ctx, 0, 0, r * 0.95, r * 0.88, skin);
  ell(ctx, 0, r * 0.25, r * 0.5, r * 0.4, p.c('#8fae5a'), false);
  dots(ctx, -r * 0.55, -r * 0.2, r * 0.38, Math.max(1.8, r * 0.14), '#ffe14a');
  dots(ctx, -r * 0.58, -r * 0.2, r * 0.38, r * 0.06, '#1a1a1a');
  // tusks
  poly(ctx, [-r * 0.5, r * 0.2, -r * 0.4, r * 0.5, -r * 0.3, r * 0.2], '#f4ecd0', false);
  poly(ctx, [-r * 0.05, r * 0.2, r * 0.05, r * 0.5, r * 0.15, r * 0.2], '#f4ecd0', false);
}

function drawRunner(ctx: CanvasRenderingContext2D, r: number, col: string, p: Pose): void {
  // speed streaks behind (right side)
  ctx.strokeStyle = 'rgba(255,230,160,0.45)'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    const yy = (i - 1) * r * 0.6, len = r * (1.2 + 0.5 * ((i + Math.floor(p.t * 10)) % 2));
    ctx.beginPath(); ctx.moveTo(r * 1.0, yy); ctx.lineTo(r * 1.0 + len, yy); ctx.stroke();
  }
  ctx.save();
  ctx.rotate(-0.3); // lean into the run
  const skin = p.c(col), dark = p.c('#9c7424');
  const a = Math.sin(p.s * 1.6) * r * 0.55;
  ctx.lineCap = 'round'; ctx.strokeStyle = OUT; ctx.lineWidth = r * 0.5;
  ctx.beginPath(); ctx.moveTo(-r * 0.1, r * 0.5); ctx.lineTo(-r * 0.1 + a, r * 1.0); ctx.moveTo(r * 0.2, r * 0.5); ctx.lineTo(r * 0.2 - a, r * 1.0); ctx.stroke();
  ctx.strokeStyle = dark; ctx.lineWidth = r * 0.34;
  ctx.beginPath(); ctx.moveTo(-r * 0.1, r * 0.5); ctx.lineTo(-r * 0.1 + a, r * 1.0); ctx.moveTo(r * 0.2, r * 0.5); ctx.lineTo(r * 0.2 - a, r * 1.0); ctx.stroke();
  ctx.strokeStyle = OUT; ctx.lineWidth = 1.5;
  poly(ctx, [r * 0.3, -r * 0.55, r * 1.35, -r * 0.9, r * 0.5, -r * 0.1], skin); // ears sweep back
  ell(ctx, 0, 0, r * 0.82, r * 0.7, skin);
  ell(ctx, 0, r * 0.2, r * 0.45, r * 0.3, p.c('#efd27a'), false);
  poly(ctx, [-r * 0.75, -r * 0.1, -r * 1.25, r * 0.12, -r * 0.7, r * 0.25], p.c('#e7b84a')); // snout
  dots(ctx, -r * 0.45, -r * 0.3, r * 0.3, Math.max(1.6, r * 0.16), '#ffffff');
  dots(ctx, -r * 0.5, -r * 0.3, r * 0.3, r * 0.07, '#1a1a1a');
  ctx.restore();
}

function drawBrute(ctx: CanvasRenderingContext2D, r: number, col: string, p: Pose): void {
  const skin = p.c(col), dark = p.c('#5e3a25'), pad = p.c('#6c6f7a');
  feet(ctx, r, 0.4, 0.3, dark, p);
  const swing = Math.sin(p.s) * r * 0.12 - p.atk * r * 0.5;
  ctx.lineCap = 'round';
  for (const sd of [-1, 1]) {
    const fx = sd * r * 0.95 + (sd < 0 ? swing : -swing * 0.5), fy = r * 0.5 + (sd < 0 ? -p.atk * r * 0.5 : 0);
    ctx.strokeStyle = OUT; ctx.lineWidth = r * 0.5; ctx.beginPath(); ctx.moveTo(sd * r * 0.7, -r * 0.2); ctx.lineTo(fx, fy); ctx.stroke();
    ctx.strokeStyle = skin; ctx.lineWidth = r * 0.36; ctx.beginPath(); ctx.moveTo(sd * r * 0.7, -r * 0.2); ctx.lineTo(fx, fy); ctx.stroke();
    ctx.lineWidth = 1.5; ctx.strokeStyle = OUT;
    ell(ctx, fx, fy, r * 0.26, r * 0.26, skin);
  }
  ell(ctx, 0, r * 0.1, r * 0.92, r * 0.85, skin);
  ctx.fillStyle = dark; ctx.fillRect(-r * 0.8, r * 0.45, r * 1.6, r * 0.18);
  ell(ctx, 0, r * 0.54, r * 0.14, r * 0.12, '#d8b24a', false);
  for (const sd of [-1, 1]) {
    ell(ctx, sd * r * 0.8, -r * 0.35, r * 0.4, r * 0.32, pad);
    poly(ctx, [sd * r * 0.65, -r * 0.6, sd * r * 0.8, -r * 0.98, sd * r * 0.95, -r * 0.6], p.c('#aab0bd'));
  }
  poly(ctx, [-r * 0.35, -r * 0.62, -r * 0.7, -r * 1.15, -r * 0.1, -r * 0.8], p.c('#e8dfc4'));
  poly(ctx, [r * 0.35, -r * 0.62, r * 0.7, -r * 1.15, r * 0.1, -r * 0.8], p.c('#e8dfc4'));
  ell(ctx, -r * 0.05, -r * 0.5, r * 0.46, r * 0.4, skin);
  dots(ctx, -r * 0.35, -r * 0.55, r * 0.3, Math.max(2, r * 0.07), '#ff5a3a');
  ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 2; // brow
  ctx.beginPath(); ctx.moveTo(-r * 0.5, -r * 0.7); ctx.lineTo(-r * 0.15, -r * 0.6); ctx.moveTo(r * 0.0, -r * 0.6); ctx.lineTo(r * 0.3, -r * 0.7); ctx.stroke();
}

function drawArcher(ctx: CanvasRenderingContext2D, r: number, col: string, p: Pose): void {
  const cloak = p.c(col), dark = p.c('#2f6a5a');
  feet(ctx, r, 0.3, 0.28, p.c('#3a3a3a'), p);
  // quiver on back
  ctx.save(); ctx.translate(r * 0.55, -r * 0.1); ctx.rotate(0.35);
  ctx.fillStyle = p.c('#7a5430'); ctx.fillRect(-r * 0.14, -r * 0.7, r * 0.28, r * 1.1); ctx.strokeRect(-r * 0.14, -r * 0.7, r * 0.28, r * 1.1);
  ctx.strokeStyle = '#e8dca8'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-r * 0.05, -r * 0.7); ctx.lineTo(-r * 0.1, -r * 1.0); ctx.moveTo(r * 0.06, -r * 0.7); ctx.lineTo(r * 0.12, -r * 0.98); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = OUT; ctx.lineWidth = 1.5;
  poly(ctx, [-r * 0.5, -r * 0.5, r * 0.5, -r * 0.5, r * 0.85, r * 0.9, -r * 0.85, r * 0.9], cloak);
  poly(ctx, [-r * 0.1, -r * 0.4, r * 0.1, -r * 0.4, r * 0.25, r * 0.9, -r * 0.25, r * 0.9], dark, false);
  // hood
  ctx.fillStyle = dark;
  ctx.beginPath(); ctx.moveTo(-r * 0.7, -r * 0.1); ctx.quadraticCurveTo(-r * 0.85, -r * 1.15, 0, -r * 1.2); ctx.quadraticCurveTo(r * 0.8, -r * 1.1, r * 0.6, -r * 0.1); ctx.closePath(); ctx.fill(); ctx.stroke();
  ell(ctx, -r * 0.15, -r * 0.55, r * 0.38, r * 0.34, '#0e1a18', false);
  dots(ctx, -r * 0.4, -r * 0.58, r * 0.24, Math.max(1.5, r * 0.09), '#e8f26a');
  // bow with string (pulls back a little while idle, snaps on shot)
  const pull = p.atk > 0 ? 0 : 0.5 + 0.5 * Math.sin(p.t * 2 + p.id);
  const bx = -r * 0.65;
  ctx.strokeStyle = OUT; ctx.lineWidth = 4.5;
  ctx.beginPath(); ctx.arc(bx + r * 0.35, 0, r * 1.05, Math.PI * 0.72, Math.PI * 1.28); ctx.stroke();
  ctx.strokeStyle = p.c('#a9743c'); ctx.lineWidth = 2.8;
  ctx.beginPath(); ctx.arc(bx + r * 0.35, 0, r * 1.05, Math.PI * 0.72, Math.PI * 1.28); ctx.stroke();
  const tipX = bx + r * 0.35 + Math.cos(Math.PI * 0.72) * r * 1.05, tipY = Math.sin(Math.PI * 0.72) * r * 1.05;
  ctx.strokeStyle = 'rgba(240,240,240,0.8)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(tipX, tipY); ctx.lineTo(bx + r * (0.3 + pull * 0.25), 0); ctx.lineTo(tipX, -tipY); ctx.stroke();
}

function drawShaman(ctx: CanvasRenderingContext2D, r: number, col: string, p: Pose): void {
  const robe = p.c(col), dark = p.c('#4a3478');
  ctx.save(); ctx.translate(0, Math.sin(p.t * 3 + p.id) * 1.5);
  const gx = -r * 1.0;
  ctx.strokeStyle = OUT; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(gx, r * 0.9); ctx.lineTo(gx, -r * 1.0); ctx.stroke();
  ctx.strokeStyle = p.c('#8a6238'); ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.moveTo(gx, r * 0.9); ctx.lineTo(gx, -r * 1.0); ctx.stroke();
  glow(ctx, gx, -r * 1.1, r * (0.9 + 0.2 * Math.sin(p.t * 6 + p.id) + p.atk), '#c58bff', 0.8);
  ctx.fillStyle = p.c('#e6c8ff'); ctx.beginPath(); ctx.arc(gx, -r * 1.1, r * 0.2, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = OUT; ctx.lineWidth = 1.5;
  const sw = Math.sin(p.s) * r * 0.1;
  ctx.fillStyle = robe;
  ctx.beginPath();
  ctx.moveTo(-r * 0.45, -r * 0.5);
  ctx.lineTo(-r * 0.95 + sw, r * 0.95);
  ctx.quadraticCurveTo(0, r * 0.75, r * 0.95 + sw, r * 0.95);
  ctx.lineTo(r * 0.45, -r * 0.5);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = dark; ctx.fillRect(-r * 0.7 + sw, r * 0.7, r * 1.4, r * 0.15);
  ell(ctx, gx, -r * 0.1, r * 0.17, r * 0.17, p.c('#cdb4e8'));
  ctx.fillStyle = dark;
  ctx.beginPath(); ctx.moveTo(-r * 0.6, -r * 0.35); ctx.quadraticCurveTo(-r * 0.7, -r * 1.15, 0, -r * 1.35); ctx.quadraticCurveTo(r * 0.7, -r * 1.1, r * 0.55, -r * 0.35); ctx.closePath(); ctx.fill(); ctx.stroke();
  ell(ctx, -r * 0.12, -r * 0.7, r * 0.34, r * 0.4, p.c('#efe6d8'));
  dots(ctx, -r * 0.25, -r * 0.75, r * 0.27, r * 0.09, '#c58bff');
  ctx.strokeStyle = '#7a3aaa'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-r * 0.22, -r * 0.5); ctx.lineTo(-r * 0.02, -r * 0.5); ctx.stroke();
  ctx.restore();
}

function drawKnight(ctx: CanvasRenderingContext2D, r: number, col: string, p: Pose): void {
  const steel = p.c(col), dark = p.c('#5a6272'), gold = p.c('#d8b24a');
  feet(ctx, r, 0.38, 0.3, dark, p);
  // plume
  ctx.fillStyle = p.c('#c23a3a');
  ctx.beginPath(); ctx.moveTo(0, -r * 1.0); ctx.quadraticCurveTo(r * 0.6, -r * 1.3 + Math.sin(p.t * 5) * 2, r * 0.9, -r * 0.7); ctx.quadraticCurveTo(r * 0.4, -r * 0.9, r * 0.1, -r * 0.7); ctx.closePath(); ctx.fill(); ctx.stroke();
  ell(ctx, 0, r * 0.15, r * 0.85, r * 0.8, steel);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, -r * 0.45); ctx.lineTo(0, r * 0.8); ctx.stroke();
  ctx.strokeStyle = OUT;
  ctx.fillStyle = p.c('#3d4452'); ctx.fillRect(-r * 0.8, r * 0.38, r * 1.6, r * 0.2);
  ell(ctx, r * 0.55, -r * 0.2, r * 0.32, r * 0.26, dark);
  // helmet with visor slit
  ell(ctx, -r * 0.05, -r * 0.55, r * 0.55, r * 0.5, steel);
  ctx.fillStyle = '#10121a'; ctx.fillRect(-r * 0.55, -r * 0.62, r * 0.6, r * 0.14);
  ctx.fillStyle = '#ff6a3a'; ctx.fillRect(-r * 0.45, -r * 0.6, r * 0.12, r * 0.1); ctx.fillRect(-r * 0.2, -r * 0.6, r * 0.12, r * 0.1);
  poly(ctx, [-r * 0.05, -r * 1.02, r * 0.1, -r * 1.02, r * 0.1, -r * 0.6, -r * 0.05, -r * 0.6], gold, false);
  // shield (front/left), raises on attack
  ctx.save(); ctx.translate(-r * 0.95, r * 0.1 - p.atk * r * 0.2);
  poly(ctx, [-r * 0.4, -r * 0.55, r * 0.4, -r * 0.55, r * 0.4, r * 0.15, 0, r * 0.8, -r * 0.4, r * 0.15], p.c('#3a56a0'));
  ctx.strokeStyle = gold; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-r * 0.3, -r * 0.4); ctx.lineTo(r * 0.3, -r * 0.4); ctx.lineTo(r * 0.3, r * 0.12); ctx.lineTo(0, r * 0.6); ctx.lineTo(-r * 0.3, r * 0.12); ctx.closePath(); ctx.stroke();
  ell(ctx, 0, -r * 0.05, r * 0.1, r * 0.1, gold, false);
  ctx.restore();
}

function drawLich(ctx: CanvasRenderingContext2D, r: number, col: string, p: Pose): void {
  const robe = p.c(col), bone = p.c('#e6e2d0');
  glow(ctx, 0, -r * 0.1, r * 1.9, '#7a3aff', 0.35 + 0.15 * Math.sin(p.t * 3));
  ctx.save(); ctx.translate(0, Math.sin(p.t * 2) * 2);
  // wispy tail
  ctx.fillStyle = p.c('#3a2455');
  ctx.beginPath(); ctx.moveTo(-r * 0.7, r * 0.5);
  for (let i = 0; i <= 6; i++) ctx.lineTo(-r * 0.7 + (r * 1.4 * i) / 6, r * 0.95 + (i % 2 ? r * 0.12 : 0) + Math.sin(p.t * 4 + i) * 2);
  ctx.lineTo(r * 0.7, r * 0.5); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = OUT; ctx.lineWidth = 2;
  ctx.fillStyle = robe;
  ctx.beginPath(); ctx.moveTo(-r * 0.45, -r * 0.45);
  ctx.quadraticCurveTo(-r * 1.0, r * 0.2, -r * 0.8, r * 0.85);
  ctx.lineTo(r * 0.8, r * 0.85); ctx.quadraticCurveTo(r * 1.0, r * 0.2, r * 0.45, -r * 0.45); ctx.closePath(); ctx.fill(); ctx.stroke();
  // ribcage
  ctx.strokeStyle = 'rgba(230,226,208,0.75)'; ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    const yy = -r * 0.2 + i * r * 0.2;
    ctx.beginPath(); ctx.moveTo(-r * 0.3 + i * 2, yy); ctx.quadraticCurveTo(0, yy + r * 0.12, r * 0.3 - i * 2, yy); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(0, -r * 0.3); ctx.lineTo(0, r * 0.55); ctx.stroke();
  ctx.strokeStyle = OUT; ctx.lineWidth = 2;
  poly(ctx, [-r * 0.75, -r * 0.2, -r * 0.95, -r * 0.85, -r * 0.35, -r * 0.4], p.c('#3a2455'));
  poly(ctx, [r * 0.75, -r * 0.2, r * 0.95, -r * 0.85, r * 0.35, -r * 0.4], p.c('#3a2455'));
  // floating hands
  const hy = Math.sin(p.t * 3) * 3 - p.atk * r * 0.2;
  for (const sd of [-1, 1]) {
    glow(ctx, sd * r * 1.05, r * 0.15 + hy * sd, r * 0.4, '#8cffb0', 0.5);
    ell(ctx, sd * r * 1.05, r * 0.15 + hy * sd, r * 0.16, r * 0.2, bone);
  }
  // skull
  ell(ctx, -r * 0.05, -r * 0.7, r * 0.42, r * 0.42, bone);
  ell(ctx, -r * 0.05, -r * 0.38, r * 0.26, r * 0.14, bone);
  ctx.fillStyle = '#0a0a14';
  ctx.beginPath(); ctx.ellipse(-r * 0.25, -r * 0.72, r * 0.1, r * 0.13, 0, 0, Math.PI * 2); ctx.ellipse(r * 0.15, -r * 0.72, r * 0.1, r * 0.13, 0, 0, Math.PI * 2); ctx.fill();
  glow(ctx, -r * 0.25, -r * 0.72, r * 0.25, '#8cffb0', 0.8); glow(ctx, r * 0.15, -r * 0.72, r * 0.25, '#8cffb0', 0.8);
  dots(ctx, -r * 0.25, -r * 0.72, r * 0.4, r * 0.04, '#8cffb0');
  ctx.strokeStyle = '#0a0a14'; ctx.lineWidth = 1.2;
  ctx.beginPath(); for (let i = -2; i <= 2; i++) { ctx.moveTo(-r * 0.05 + i * r * 0.07, -r * 0.4); ctx.lineTo(-r * 0.05 + i * r * 0.07, -r * 0.3); } ctx.stroke();
  // crown
  ctx.strokeStyle = OUT; ctx.lineWidth = 1.5;
  const cx0 = -r * 0.05, cy0 = -r * 1.0;
  poly(ctx, [cx0 - r * 0.42, cy0 + r * 0.08, cx0 - r * 0.42, cy0 - r * 0.2, cx0 - r * 0.22, cy0 - r * 0.02, cx0, cy0 - r * 0.26, cx0 + r * 0.22, cy0 - r * 0.02, cx0 + r * 0.42, cy0 - r * 0.2, cx0 + r * 0.42, cy0 + r * 0.08], p.c('#d8b24a'));
  ctx.fillStyle = '#8cffb0'; ctx.beginPath(); ctx.arc(cx0, cy0 - r * 0.02, r * 0.05, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, t: number): void {
  const r = e.r;
  const frozen = e.st.freeze > 0;
  const walk = frozen ? 0 : e.phase * 6;
  const bob = frozen || isBoss(e.kind) ? 0 : -Math.abs(Math.sin(walk)) * Math.min(3, r * 0.15);
  const x = e.x, y = e.y + bob;
  const lunge = e.attackAnim > 0 ? -Math.sin((e.attackAnim / 0.25) * Math.PI) * 8 : 0;
  const lean = frozen ? 0 : Math.sin(walk) * 0.05;
  const pose: Pose = {
    c: (col) => (e.flash > 0 ? '#ffffff' : frozen ? mixBlue(col) : col),
    s: walk, atk: e.attackAnim > 0 ? e.attackAnim / 0.25 : 0, t, id: e.id,
  };

  ctx.save();
  ctx.translate(lunge, 0);
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath(); ctx.ellipse(x, e.y + r * 0.95, r * 0.95, r * 0.28, 0, 0, Math.PI * 2); ctx.fill();

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(lean);
  ctx.lineJoin = 'round'; ctx.lineWidth = 1.5; ctx.strokeStyle = OUT;
  switch (e.kind) {
    case 'grunt': drawGrunt(ctx, r, e.cfg.color, pose); break;
    case 'runner': drawRunner(ctx, r, e.cfg.color, pose); break;
    case 'brute': drawBrute(ctx, r, e.cfg.color, pose); break;
    case 'archer': drawArcher(ctx, r, e.cfg.color, pose); break;
    case 'shaman': drawShaman(ctx, r, e.cfg.color, pose); break;
    case 'elite_knight': drawKnight(ctx, r, e.cfg.color, pose); break;
    case 'boss_lich': drawLich(ctx, r, e.cfg.color, pose); break;
    case 'shield_bearer': drawShieldBearer(ctx, r, e.cfg.color, pose); break;
    case 'splitter': drawSplitter(ctx, r, e.cfg.color, pose); break;
    case 'splitling': drawSplitling(ctx, r, e.cfg.color, pose); break;
    case 'cleanser': drawCleanser(ctx, r, e.cfg.color, pose); break;
    case 'armored': drawArmored(ctx, r, e.cfg.color, pose, defenseUp(e.kind, defState(e))); break;
    case 'swarmer': drawSwarmer(ctx, r, e.cfg.color, pose); break;
    case 'boss_golem': drawGolem(ctx, r, e.cfg.color, pose, e.shellBroken <= 0); break;
    case 'boss_hydra': drawHydra(ctx, r, e.cfg.color, pose, e.stage); break;
    case 'hydra_head': drawHydraHead(ctx, r, e.cfg.color, pose); break;
    case 'dummy': drawDummy(ctx, r, e.cfg.color, pose); break;
    default: ctx.fillStyle = pose.c(e.cfg.color); ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
  ctx.restore();

  drawEnemyOverlays(ctx, e, x, y, t);

  // status visuals
  const st = e.st;
  if (frozen) {
    ctx.fillStyle = 'rgba(190,235,255,0.35)';
    ctx.beginPath(); ctx.arc(x, y, r * 1.05, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#e9fbff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = 'rgba(233,251,255,0.9)';
    for (let i = 0; i < 4; i++) {
      const a = i * 1.6 + 0.4, px = x + Math.cos(a) * r * 0.95, py = y + Math.sin(a) * r * 0.95;
      ctx.beginPath(); ctx.moveTo(px, py - 5); ctx.lineTo(px + 2.5, py); ctx.lineTo(px, py + 5); ctx.lineTo(px - 2.5, py); ctx.closePath(); ctx.fill();
    }
  } else if (st.slow) {
    ctx.fillStyle = 'rgba(120,190,255,0.2)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(220,242,255,0.85)';
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x + (i - 1) * r * 0.6, y - r * 0.95 + Math.sin(t * 2 + i) * 2, 1.8, 0, Math.PI * 2); ctx.fill(); }
  }
  if (st.burn) {
    ctx.fillStyle = 'rgba(255,120,40,0.22)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 3; i++) {
      const fx = x + (i - 1) * r * 0.55, ph = (t * 3 + i * 0.37 + e.id * 0.13) % 1;
      const fy = y - r * 0.2 - ph * r * 0.9, fs = Math.max(3, r * 0.28) * (1 - ph * 0.6);
      ctx.fillStyle = ph < 0.5 ? '#ff7a2f' : '#ffc24a';
      ctx.beginPath(); ctx.moveTo(fx, fy - fs * 1.5); ctx.quadraticCurveTo(fx + fs, fy, fx, fy + fs * 0.6); ctx.quadraticCurveTo(fx - fs, fy, fx, fy - fs * 1.5); ctx.fill();
    }
  }
  if (st.poison.length) {
    ctx.fillStyle = 'rgba(110,210,70,0.18)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(150,240,100,0.9)'; ctx.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) {
      const ph = (t * 1.2 + i * 0.33 + e.id * 0.21) % 1;
      ctx.beginPath(); ctx.arc(x + (i - 1) * r * 0.55 + Math.sin(ph * 8) * 2, y + r * 0.2 - ph * r * 1.3, 2 + (1 - ph) * 2, 0, Math.PI * 2); ctx.stroke();
    }
  }
  if (st.wet) {
    ctx.fillStyle = 'rgba(90,170,255,0.9)';
    for (let i = 0; i < 3; i++) {
      const ph = (t * 1.6 + i * 0.33 + e.id * 0.17) % 1;
      const dx = x + (i - 1) * r * 0.6, dy = y - r * 0.7 + ph * r * 1.5;
      ctx.beginPath(); ctx.moveTo(dx, dy - 3); ctx.quadraticCurveTo(dx + 2.5, dy + 1, dx, dy + 3); ctx.quadraticCurveTo(dx - 2.5, dy + 1, dx, dy - 3); ctx.fill();
    }
  }
  if (st.weaken) { ctx.strokeStyle = STATUS_COLOR.weaken; ctx.setLineDash([4, 4]); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r + 5, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }

  // hp bar + icons (boss uses the top bar instead)
  const boss = isBoss(e.kind);
  const barY = y - r - (e.kind === 'shaman' ? 22 : 14) - (boss ? 24 : 0);
  if (!boss) {
    const bw = Math.max(26, r * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - bw / 2, barY, bw, 5);
    ctx.fillStyle = e.hp / e.maxHp > 0.4 ? '#58d36a' : '#e5484d';
    ctx.fillRect(x - bw / 2, barY, bw * Math.max(0, e.hp / e.maxHp), 5);
  }
  const icons: [StatusKind, string][] = [];
  if (st.burn) icons.push(['burn', '']);
  if (st.poison.length) icons.push(['poison', st.poison.length > 1 ? String(st.poison.length) : '']);
  if (st.slow) icons.push(['slow', '']);
  if (st.freeze > 0) icons.push(['freeze', '']);
  if (st.wet) icons.push(['wet', '']);
  if (st.weaken) icons.push(['weaken', '']);
  icons.forEach(([k, label], i) => {
    const ix = x - ((icons.length - 1) * 11) / 2 + i * 11;
    const iy = barY - 8;
    ctx.fillStyle = STATUS_COLOR[k];
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1;
    ctx.beginPath();
    if (k === 'wet') { ctx.moveTo(ix, iy - 5); ctx.quadraticCurveTo(ix + 5, iy + 1, ix, iy + 4); ctx.quadraticCurveTo(ix - 5, iy + 1, ix, iy - 5); }
    else if (k === 'burn') { ctx.moveTo(ix, iy - 5); ctx.lineTo(ix + 4, iy + 4); ctx.lineTo(ix - 4, iy + 4); ctx.closePath(); }
    else if (k === 'weaken') { ctx.rect(ix - 4, iy - 4, 8, 8); }
    else ctx.arc(ix, iy, 4, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    if (label) { ctx.fillStyle = '#000'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(label, ix, iy + 3); }
  });
}

function drawEnemyProjectiles(ctx: CanvasRenderingContext2D, w: World): void {
  for (const p of w.eprojs) {
    glow(ctx, p.x, p.y, p.r * 3, p.color, 0.6);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
  }
}

function drawPlayerProjectiles(ctx: CanvasRenderingContext2D, w: World): void {
  for (const p of w.pprojs) {
    const c = ELEMENT_COLOR[p.shot.element];
    glow(ctx, p.x, p.y, p.r * 3.2, c, 0.8);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.65, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = c; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.stroke();
  }
}

function drawEffects(ctx: CanvasRenderingContext2D, w: World): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of w.fx) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
  }
  for (const r of w.rings) {
    const k = r.t / r.max;
    ctx.globalAlpha = 1 - k;
    ctx.strokeStyle = r.color; ctx.lineWidth = 4 * (1 - k) + 1;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r + (r.maxR - r.r) * k, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = (1 - k) * 0.15;
    ctx.fillStyle = r.color; ctx.fill();
  }
  for (const a of w.arcs) {
    ctx.globalAlpha = 1 - a.t / a.max;
    ctx.strokeStyle = a.color; ctx.lineWidth = 3; ctx.lineJoin = 'round';
    ctx.beginPath(); a.pts.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y))); ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
  ctx.textAlign = 'center';
  const numScale = getSettings().numberSize;
  for (const t of w.texts) {
    const k = t.t / t.max;
    ctx.globalAlpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
    ctx.font = `bold ${t.num ? t.size * numScale : t.size}px sans-serif`;
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(t.text, t.x, t.y);
    if (t.glow) { ctx.save(); ctx.shadowColor = t.color; ctx.shadowBlur = 12; }
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x, t.y);
    if (t.glow) ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function bar(ctx: CanvasRenderingContext2D, x: number, y: number, bw: number, bh: number, frac: number, fill: string, back = 'rgba(0,0,0,0.55)'): void {
  ctx.fillStyle = back; ctx.fillRect(x, y, bw, bh);
  ctx.fillStyle = fill; ctx.fillRect(x, y, bw * Math.max(0, Math.min(1, frac)), bh);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, bw - 1, bh - 1);
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, align: CanvasTextAlign, color = '#e8e8f4'): void {
  ctx.font = `600 ${size}px sans-serif`;
  ctx.textAlign = align;
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function drawHud(ctx: CanvasRenderingContext2D, w: World, h: HudState): void {
  const u = h.ui;
  // ward HP
  const hpW = 240 * u, hpH = 20 * u;
  bar(ctx, 20, 16, hpW, hpH, w.wardHp / w.wardMax, '#d94452');
  label(ctx, `HP ${Math.ceil(w.wardHp)} / ${w.wardMax}`, 20 + hpW / 2, 16 + hpH * 0.78, 14 * u, 'center');
  // charge (the spell strip below shows detail)
  const frac = h.hasShots ? h.charge / h.castTime : 0;
  const ready = h.hasShots && h.charge >= h.castTime;
  const cy = 16 + hpH + 6;
  const pulse = 0.5 + 0.5 * Math.sin(h.time * 7);
  if (ready) { ctx.save(); ctx.shadowColor = '#ffe27a'; ctx.shadowBlur = (8 + 10 * pulse) * u; }
  bar(ctx, 20, cy, hpW, 10 * u, frac, ready ? '#ffe27a' : '#6aa8ff');
  if (ready) ctx.restore();
  if (h.hasShots) {
    label(ctx, ready ? 'READY' : `Charging ${Math.max(0, h.castTime - h.charge).toFixed(1)}s`, 20 + hpW + 10, cy + 10 * u, 13 * u, 'left', ready ? '#ffe27a' : '#b8c8ff');
  }

  // floor info
  const kind = h.floor.kind === 'normal' ? '' : ' - ' + (h.floor.kind === 'elite' ? 'Elite' : 'Boss');
  label(ctx, `Floor ${h.floor.floor}${kind}`, W / 2, 28 * u, 16 * u, 'center');
  label(ctx, `Wave ${Math.min(h.waveIdx + 1, h.waveTotal)}/${h.waveTotal}`, W - 20, 28 * u, 16 * u, 'right');

  // boss bar
  const boss = w.enemies.find(e => isBoss(e.kind) && !e.dead);
  if (boss) {
    const by = 40 * u;
    // Keep clear of the ward HP / charge block on the left and the wave / combo labels on the right.
    const left = Math.max(W / 2 - 220, 20 + hpW + 100 * u);
    const right = Math.min(W / 2 + 220, W - 20 - 110 * u);
    const bw = Math.max(120, right - left);
    const cx = left + bw / 2;
    const fill = boss.kind === 'boss_golem' ? '#a09680' : boss.kind === 'boss_hydra' ? '#3f9f5a' : '#8b3ad8';
    bar(ctx, left, by, bw, 16 * u, boss.hp / boss.maxHp, fill);
    if (boss.kind === 'boss_hydra') {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      for (const f of [0.33, 0.66]) ctx.fillRect(left + bw * f - 1, by, 2, 16 * u);
    }
    label(ctx, `${boss.cfg.name}  ${Math.ceil(boss.hp)} / ${boss.maxHp}`, cx, by + 13 * u, 12 * u, 'center');
    if (boss.kind === 'boss_golem') {
      const broken = boss.shellBroken > 0;
      label(ctx, broken ? `SHELL BROKEN ${boss.shellBroken.toFixed(1)}s` : 'SHELL -75% (Shatter / Combust / Overload breaks it)', cx, by + 32 * u, 12 * u, 'center', broken ? '#ffb35a' : '#c8c2b0');
    }
  }
  if (h.floor.hazard) {
    const hz = HAZARD_INFO[h.floor.hazard];
    label(ctx, `${hz.name}: ${hz.desc}`, 20, 76 * u, 13 * u, 'left', h.floor.hazard === 'rain' ? '#9cc4ff' : h.floor.hazard === 'heatwave' ? '#ffb070' : '#d4dce8');
  }

  // combo counter
  if (h.combo) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, h.combo.k * 2.5);
    label(ctx, `Combo ×${h.combo.n}`, W - 20, 54 * u, (16 + Math.min(10, h.combo.n * 0.4)) * u, 'right', h.combo.n >= 10 ? '#ffb347' : '#ffe9a8');
    ctx.restore();
  }

  // momentum readout (under the ward HP bar)
  if (h.momentum) label(ctx, h.momentum, 20, 56 * u, 14 * u, 'left', '#ffd37a');

  // multi-kill callout (center top)
  if (h.callout) {
    const k = h.callout.k;
    const pop = k < 0.12 ? 0.6 + (k / 0.12) * 0.55 : k < 0.22 ? 1.15 - ((k - 0.12) / 0.1) * 0.15 : 1;
    ctx.save();
    ctx.globalAlpha = k > 0.7 ? Math.max(0, 1 - (k - 0.7) / 0.3) : 1;
    ctx.translate(W / 2, 120 * u);
    ctx.scale(pop, pop);
    ctx.shadowColor = h.callout.color; ctx.shadowBlur = 22;
    label(ctx, h.callout.text, 0, 0, 46 * u, 'center', h.callout.color);
    ctx.restore();
  }

  // off-screen enemy markers on the right, top and bottom edges
  ctx.fillStyle = 'rgba(255,90,90,0.85)';
  for (const e of w.enemies) {
    if (e.dead) continue;
    if (e.y + e.r <= 0) {
      const x = Math.max(20, Math.min(W - 20, e.x));
      ctx.beginPath(); ctx.moveTo(x, 4); ctx.lineTo(x - 8, 16); ctx.lineTo(x + 8, 16); ctx.closePath(); ctx.fill();
    } else if (e.y - e.r >= H) {
      const x = Math.max(20, Math.min(W - 20, e.x));
      ctx.beginPath(); ctx.moveTo(x, H - 4); ctx.lineTo(x - 8, H - 16); ctx.lineTo(x + 8, H - 16); ctx.closePath(); ctx.fill();
    } else if (e.x - e.r >= W) {
      const y = Math.max(20, Math.min(H - 20, e.y));
      ctx.beginPath(); ctx.moveTo(W - 4, y); ctx.lineTo(W - 16, y - 8); ctx.lineTo(W - 16, y + 8); ctx.closePath(); ctx.fill();
    }
  }

  if (!h.hasShots) label(ctx, 'Spell has no damaging runes', W / 2, H - 34, 18 * u, 'center', '#ffb86b');
  else if (h.time < 6) label(ctx, (typeof matchMedia === 'function' && matchMedia('(hover: none)').matches ? 'Spell auto-casts - drag to aim' : 'Spell auto-casts - aim with the mouse'), W / 2, H - 12, 14 * u, 'center', '#c4c9ee');

  drawAim(ctx, h);
}

/** Aim line, crosshair and the damage vignette (the parts of the HUD the practice range keeps). */
function drawAim(ctx: CanvasRenderingContext2D, h: HudState): void {
  const u = h.ui;
  const ready = h.hasShots && h.charge >= h.castTime;
  if (h.mouse.inside && !h.overlay) {
    const { x, y } = h.mouse;
    ctx.save();
    ctx.setLineDash([6, 8]);
    ctx.strokeStyle = ready ? 'rgba(255,226,122,0.35)' : 'rgba(200,210,255,0.2)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(MUZZLE_X, MUZZLE_Y); ctx.lineTo(x, y); ctx.stroke();
    ctx.restore();
    const col = ready ? '#ffe27a' : '#e6ebff';
    const reticle = (): void => {
      ctx.beginPath(); ctx.arc(x, y, 10 * u, 0, Math.PI * 2);
      ctx.moveTo(x - 18 * u, y); ctx.lineTo(x - 6 * u, y); ctx.moveTo(x + 6 * u, y); ctx.lineTo(x + 18 * u, y);
      ctx.moveTo(x, y - 18 * u); ctx.lineTo(x, y - 6 * u); ctx.moveTo(x, y + 6 * u); ctx.lineTo(x, y + 18 * u);
      ctx.stroke();
    };
    ctx.lineWidth = 4.5; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; reticle();
    ctx.lineWidth = 2; ctx.strokeStyle = col; reticle();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 1.8 * u, 0, Math.PI * 2); ctx.fill();
  }

  // damage vignette (covers the full visible width)
  if (h.hurt > 0) {
    const cx = h.offX + h.viewW / 2, cy2 = H / 2;
    const g = ctx.createRadialGradient(cx, cy2, Math.min(h.viewW, W) * 0.3, cx, cy2, Math.max(h.viewW, W) * 0.62);
    g.addColorStop(0, 'rgba(220,20,30,0)');
    g.addColorStop(1, `rgba(220,20,30,${0.55 * h.hurt})`);
    ctx.fillStyle = g;
    ctx.fillRect(h.offX, 0, h.viewW, H);
  }

  if (h.banner && !h.overlay) {
    ctx.save();
    ctx.globalAlpha = h.banner.alpha;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(h.offX, 215, h.viewW, 100);
    label(ctx, h.banner.title, W / 2, 275, 48, 'center', '#fff3c4');
    label(ctx, h.banner.sub, W / 2, 304, 18, 'center', '#c8cdf0');
    ctx.restore();
  }
  if (h.overlay) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(h.offX, 0, h.viewW, H);
    label(ctx, h.overlay.text, W / 2, H / 2 + 14, 54, 'center', h.overlay.good ? '#ffe27a' : '#ff6b6b');
  }
}

function defState(e: Enemy): { frozen: boolean; weakened: boolean; shellBroken: number } {
  return { frozen: e.st.freeze > 0, weakened: !!e.st.weaken, shellBroken: e.shellBroken };
}

// ---------------------------------------------------------------- new enemies (all face left, -x)

function eyes(ctx: CanvasRenderingContext2D, x: number, y: number, gap: number, rad: number, col: string): void {
  dots(ctx, x, y, gap, rad, col);
  dots(ctx, x - rad * 0.3, y, gap, rad * 0.45, '#1a1a1a');
}

function drawShieldBearer(ctx: CanvasRenderingContext2D, r: number, col: string, p: Pose): void {
  const steel = p.c(col), dark = p.c('#34506f');
  feet(ctx, r, 0.4, 0.34, dark, p);
  ell(ctx, 0, 0, r * 0.9, r * 0.85, steel);
  ell(ctx, 0, r * 0.3, r * 0.5, r * 0.4, p.c('#86a8d0'), false);
  // helmet with a plume
  ell(ctx, -r * 0.05, -r * 0.55, r * 0.55, r * 0.45, p.c('#8aa2c0'));
  ctx.fillStyle = '#10141c'; ctx.fillRect(-r * 0.55, -r * 0.6, r * 0.8, r * 0.14);
  poly(ctx, [r * 0.1, -r * 0.95, r * 0.55, -r * 1.2, r * 0.35, -r * 0.7], p.c('#d6544a'));
  dots(ctx, -r * 0.4, -r * 0.55, r * 0.3, Math.max(1.4, r * 0.08), '#bfe6ff');
}

function drawSplitter(ctx: CanvasRenderingContext2D, r: number, col: string, p: Pose): void {
  const gel = p.c(col);
  const squish = Math.sin(p.t * 5 + p.id) * 0.06;
  ctx.save(); ctx.scale(1 + squish, 1 - squish);
  ell(ctx, 0, r * 0.1, r * 0.98, r * 0.85, gel);
  ctx.restore();
  // three embryos that will burst out
  const lobes: [number, number][] = [[-0.38, -0.12], [0.36, -0.05], [0, 0.38]];
  ctx.lineWidth = 1;
  for (const [lx, ly] of lobes) ell(ctx, lx * r, ly * r + r * 0.1, r * 0.3, r * 0.27, p.c('#e07ab5'));
  // crack line down the middle
  ctx.strokeStyle = 'rgba(255,235,250,0.8)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(0, -r * 0.8); ctx.lineTo(r * 0.12, -r * 0.2); ctx.lineTo(-r * 0.1, r * 0.4); ctx.lineTo(0, r * 0.9); ctx.stroke();
  ctx.setLineDash([]); ctx.lineWidth = 1.5; ctx.strokeStyle = OUT;
  eyes(ctx, -r * 0.55, -r * 0.35, r * 0.3, Math.max(1.8, r * 0.12), '#fff3a8');
}

function drawSplitling(ctx: CanvasRenderingContext2D, r: number, col: string, p: Pose): void {
  const hop = Math.abs(Math.sin(p.s * 1.3)) * r * 0.3;
  ctx.translate(0, -hop);
  ell(ctx, 0, 0, r * 0.95, r * 0.8, p.c(col));
  ell(ctx, 0, r * 0.3, r * 0.5, r * 0.3, p.c('#f5b3d6'), false);
  dots(ctx, -r * 0.5, -r * 0.15, r * 0.4, Math.max(1.4, r * 0.22), '#fff');
}

function drawCleanser(ctx: CanvasRenderingContext2D, r: number, col: string, p: Pose): void {
  const robe = p.c(col);
  // flowing robe
  poly(ctx, [-r * 0.5, -r * 0.3, r * 0.5, -r * 0.3, r * 1.0, r * 0.95, -r * 1.0, r * 0.95], robe);
  poly(ctx, [-r * 0.15, -r * 0.2, r * 0.15, -r * 0.2, r * 0.3, r * 0.95, -r * 0.3, r * 0.95], p.c('#d8b24a'), false);
  ell(ctx, 0, -r * 0.55, r * 0.42, r * 0.4, p.c('#f6e7c8'));
  dots(ctx, -r * 0.2, -r * 0.58, r * 0.28, Math.max(1.4, r * 0.08), '#222');
  // halo
  ctx.save();
  ctx.strokeStyle = '#fff6c0'; ctx.lineWidth = 2.5;
  ctx.shadowColor = '#fff6c0'; ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.ellipse(0, -r * 1.15, r * 0.5, r * 0.16, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  // cleansing orb in the front hand
  const bob = Math.sin(p.t * 3 + p.id) * 2;
  glow(ctx, -r * 0.95, r * 0.1 + bob, r * 0.7, '#fff6c0', 0.8);
  ell(ctx, -r * 0.95, r * 0.1 + bob, r * 0.22, r * 0.22, '#ffffff');
}

function drawArmored(ctx: CanvasRenderingContext2D, r: number, col: string, p: Pose, up: boolean): void {
  const plate = p.c(up ? '#aab4c4' : '#555b66'), plate2 = p.c(up ? '#8590a2' : '#3f444d');
  feet(ctx, r, 0.4, 0.34, p.c('#3a3d44'), p);
  ell(ctx, 0, 0, r * 0.95, r * 0.9, p.c(col));
  // overlapping plates
  poly(ctx, [-r * 0.9, -r * 0.2, -r * 0.2, -r * 0.8, r * 0.2, -r * 0.1, -r * 0.4, r * 0.5], plate);
  poly(ctx, [r * 0.9, -r * 0.2, r * 0.25, -r * 0.8, -r * 0.1, r * 0.1, r * 0.5, r * 0.6], plate2);
  poly(ctx, [-r * 0.6, r * 0.55, r * 0.6, r * 0.55, r * 0.45, r * 0.95, -r * 0.45, r * 0.95], plate);
  // rivets
  ctx.fillStyle = up ? '#e6ebf2' : '#777d88';
  for (const [rx, ry] of [[-0.55, -0.15], [-0.1, -0.5], [0.55, 0.0], [0, 0.75]]) {
    ctx.beginPath(); ctx.arc(rx * r, ry * r, Math.max(1.2, r * 0.07), 0, Math.PI * 2); ctx.fill();
  }
  // visored helm
  ell(ctx, -r * 0.05, -r * 0.6, r * 0.5, r * 0.42, plate);
  ctx.fillStyle = '#10141c'; ctx.fillRect(-r * 0.5, -r * 0.66, r * 0.75, r * 0.12);
  if (!up) { // cracks while vulnerable
    ctx.strokeStyle = 'rgba(255,200,120,0.9)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-r * 0.6, -r * 0.1); ctx.lineTo(-r * 0.3, r * 0.15); ctx.lineTo(-r * 0.4, r * 0.4);
    ctx.moveTo(r * 0.5, r * 0.0); ctx.lineTo(r * 0.2, r * 0.25); ctx.stroke();
  }
}

function drawSwarmer(ctx: CanvasRenderingContext2D, r: number, col: string, p: Pose): void {
  const buzz = Math.sin(p.t * 60 + p.id) * 0.5;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath(); ctx.ellipse(r * 0.1, -r * 0.9, r * 0.9, r * 0.35 * (1 + buzz), -0.5, 0, Math.PI * 2); ctx.fill();
  ell(ctx, r * 0.2, 0, r * 0.95, r * 0.7, p.c(col));
  ell(ctx, -r * 0.7, -r * 0.05, r * 0.55, r * 0.5, p.c('#8a2d1f'));
  dots(ctx, -r * 0.85, -r * 0.15, r * 0.35, Math.max(1, r * 0.2), '#ffe14a');
  poly(ctx, [r * 1.1, 0, r * 1.7, r * 0.1, r * 1.1, r * 0.3], p.c('#e8dfc4'), false); // stinger
}

function drawGolem(ctx: CanvasRenderingContext2D, r: number, col: string, p: Pose, shellUp: boolean): void {
  const stone = p.c(shellUp ? col : '#6d675c'), dark = p.c('#4f4a42');
  const stomp = p.atk * r * 0.2;
  feet(ctx, r, 0.45, 0.4, dark, p);
  // arms (boulder fists)
  for (const sd of [-1, 1]) {
    const fx = sd * r * 1.05, fy = r * 0.35 + (sd < 0 ? stomp : 0);
    ctx.strokeStyle = OUT; ctx.lineWidth = r * 0.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(sd * r * 0.65, -r * 0.3); ctx.lineTo(fx, fy); ctx.stroke();
    ctx.strokeStyle = stone; ctx.lineWidth = r * 0.38;
    ctx.beginPath(); ctx.moveTo(sd * r * 0.65, -r * 0.3); ctx.lineTo(fx, fy); ctx.stroke();
    ctx.lineWidth = 1.5; ctx.strokeStyle = OUT;
    ell(ctx, fx, fy, r * 0.3, r * 0.28, stone);
  }
  // torso
  poly(ctx, [-r * 0.8, -r * 0.5, -r * 0.4, -r * 0.9, r * 0.45, -r * 0.85, r * 0.85, -r * 0.45, r * 0.8, r * 0.5, r * 0.4, r * 0.9, -r * 0.45, r * 0.9, -r * 0.85, r * 0.45], stone);
  // glowing core + cracks
  const pulse = 0.5 + 0.5 * Math.sin(p.t * 4);
  glow(ctx, 0, r * 0.1, r * (shellUp ? 0.5 : 0.95), '#ff9a3a', shellUp ? 0.25 + pulse * 0.1 : 0.7 + pulse * 0.2);
  ctx.strokeStyle = shellUp ? 'rgba(255,170,80,0.45)' : '#ffb35a'; ctx.lineWidth = shellUp ? 1.2 : 2.2;
  ctx.beginPath();
  ctx.moveTo(-r * 0.2, -r * 0.7); ctx.lineTo(0, -r * 0.2); ctx.lineTo(-r * 0.3, r * 0.2); ctx.lineTo(-r * 0.1, r * 0.7);
  ctx.moveTo(r * 0.1, -r * 0.2); ctx.lineTo(r * 0.5, r * 0.1); ctx.lineTo(r * 0.4, r * 0.6);
  ctx.stroke();
  if (shellUp) {
    // heavy shell plates, bolted on
    const plate = p.c('#a8a294');
    poly(ctx, [-r * 0.9, -r * 0.35, -r * 0.35, -r * 0.8, -r * 0.1, -r * 0.1, -r * 0.55, r * 0.35, -r * 0.95, r * 0.15], plate);
    poly(ctx, [r * 0.9, -r * 0.35, r * 0.3, -r * 0.82, r * 0.05, -r * 0.05, r * 0.5, r * 0.45, r * 0.95, r * 0.2], plate);
    poly(ctx, [-r * 0.5, r * 0.45, r * 0.5, r * 0.45, r * 0.35, r * 0.88, -r * 0.35, r * 0.88], plate);
    ctx.fillStyle = '#d8d2c0';
    for (const [rx, ry] of [[-0.6, -0.4], [0.55, -0.4], [0, 0.65], [-0.7, 0.05], [0.7, 0.1]]) {
      ctx.beginPath(); ctx.arc(rx * r, ry * r, Math.max(2, r * 0.05), 0, Math.PI * 2); ctx.fill();
    }
  }
  // head
  poly(ctx, [-r * 0.4, -r * 0.8, -r * 0.2, -r * 1.2, r * 0.3, -r * 1.15, r * 0.4, -r * 0.8], stone);
  glow(ctx, -r * 0.1, -r * 0.95, r * 0.28, '#ff7a2f', 0.9);
  dots(ctx, -r * 0.2, -r * 0.97, r * 0.26, Math.max(2, r * 0.06), '#ffd08a');
}

function drawHydra(ctx: CanvasRenderingContext2D, r: number, col: string, p: Pose, stage: number): void {
  const scale = p.c(col), belly = p.c('#a8d890'), dark = p.c('#2b6a40');
  feet(ctx, r, 0.4, 0.34, dark, p);
  // back spikes
  for (let i = 0; i < 5; i++) {
    const sx = r * (-0.5 + i * 0.3);
    poly(ctx, [sx - r * 0.12, -r * 0.7, sx, -r * 1.05, sx + r * 0.12, -r * 0.7], p.c('#e2d8a0'));
  }
  ell(ctx, r * 0.15, 0, r * 1.0, r * 0.82, scale);
  ell(ctx, r * 0.1, r * 0.3, r * 0.65, r * 0.4, belly, false);
  // neck stubs: one more pair of sprouting necks per stage
  ctx.lineCap = 'round';
  for (let i = 0; i < stage * 2; i++) {
    const sd = i % 2 ? 1 : -1, k = Math.floor(i / 2);
    const bx = r * (0.1 + k * 0.35), by = sd * r * 0.55;
    const tx = bx - r * 0.2, ty = sd * r * 1.25 + Math.sin(p.t * 2 + i) * 3;
    ctx.strokeStyle = OUT; ctx.lineWidth = r * 0.34; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.strokeStyle = scale; ctx.lineWidth = r * 0.22; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.strokeStyle = OUT; ctx.lineWidth = 1.5;
  }
  // main head
  const jaw = p.atk * r * 0.2;
  poly(ctx, [-r * 0.55, -r * 0.25, -r * 1.35, -r * 0.05 - jaw * 0.3, -r * 0.55, r * 0.15], p.c('#58b070'));
  poly(ctx, [-r * 0.55, r * 0.1, -r * 1.2, r * 0.2 + jaw, -r * 0.5, r * 0.35], p.c('#4a9a60'));
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 3; i++) poly(ctx, [-r * (0.7 + i * 0.18), r * 0.1, -r * (0.65 + i * 0.18), r * 0.25, -r * (0.6 + i * 0.18), r * 0.1], '#fff', false);
  dots(ctx, -r * 0.65, -r * 0.2, r * 0.22, Math.max(2, r * 0.07), '#ffe14a');
}

function drawHydraHead(ctx: CanvasRenderingContext2D, r: number, col: string, p: Pose): void {
  const bob = Math.sin(p.t * 2.5 + p.id) * 2;
  ctx.fillStyle = p.c('#2b6a40');
  ell(ctx, r * 0.6, r * 0.9, r * 1.1, r * 0.45, p.c('#2b6a40')); // base mound
  ctx.save(); ctx.translate(0, bob);
  const jaw = p.atk * r * 0.4;
  ell(ctx, 0, 0, r * 0.85, r * 0.7, p.c(col));
  poly(ctx, [-r * 0.6, -r * 0.2, -r * 1.35, -r * 0.1 - jaw * 0.3, -r * 0.6, r * 0.1], p.c('#78c868'));
  poly(ctx, [-r * 0.6, r * 0.1, -r * 1.2, r * 0.2 + jaw, -r * 0.55, r * 0.4], p.c('#5ba850'));
  glow(ctx, -r * 1.1, r * 0.05, r * 0.5, '#b8ff5a', 0.5 + p.atk * 0.5); // acid
  dots(ctx, -r * 0.45, -r * 0.3, r * 0.3, Math.max(1.6, r * 0.14), '#ffe14a');
  ctx.restore();
}

function drawDummy(ctx: CanvasRenderingContext2D, r: number, col: string, p: Pose): void {
  ctx.fillStyle = p.c('#6b4a28'); ctx.fillRect(-r * 0.12, -r * 0.2, r * 0.24, r * 1.2); ctx.strokeRect(-r * 0.12, -r * 0.2, r * 0.24, r * 1.2);
  ctx.fillRect(-r * 0.9, -r * 0.1, r * 1.8, r * 0.2); ctx.strokeRect(-r * 0.9, -r * 0.1, r * 1.8, r * 0.2);
  ell(ctx, 0, -r * 0.55, r * 0.95, r * 0.95, p.c('#e8dfc4'));
  ell(ctx, 0, -r * 0.55, r * 0.65, r * 0.65, p.c('#c0392b'), false);
  ell(ctx, 0, -r * 0.55, r * 0.35, r * 0.35, p.c('#e8dfc4'), false);
  ell(ctx, 0, -r * 0.55, r * 0.15, r * 0.15, p.c(col), false);
}

/** Shield Bearer shield (bubble + plate) or the regrow ring while it is down; Cleanser pulse range. */
function drawEnemyOverlays(ctx: CanvasRenderingContext2D, e: Enemy, x: number, y: number, t: number): void {
  const r = e.r;
  if (e.cfg.shield) {
    if (e.shield) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 4 + e.id);
      ctx.save();
      ctx.fillStyle = `rgba(140,200,255,${0.14 + 0.06 * pulse})`;
      ctx.strokeStyle = `rgba(190,228,255,${0.7 + 0.2 * pulse})`; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x, y, r * 1.35, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      // kite shield plate on the near side
      const sx = x - r * 1.05;
      ctx.fillStyle = '#7fb4e8'; ctx.strokeStyle = '#e4f3ff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sx - r * 0.3, y - r * 0.7); ctx.lineTo(sx + r * 0.3, y - r * 0.7); ctx.lineTo(sx + r * 0.3, y + r * 0.1);
      ctx.lineTo(sx, y + r * 0.85); ctx.lineTo(sx - r * 0.3, y + r * 0.1); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#e4f3ff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(sx, y - r * 0.6); ctx.lineTo(sx, y + r * 0.6); ctx.moveTo(sx - r * 0.22, y - r * 0.1); ctx.lineTo(sx + r * 0.22, y - r * 0.1); ctx.stroke();
      ctx.restore();
    } else {
      // broken: faint regrow dial
      const k = Math.max(0, Math.min(1, (t - e.lastHit) / SHIELD_REGROW));
      ctx.save();
      ctx.strokeStyle = 'rgba(160,210,255,0.55)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(x, y, r * 1.35, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
      ctx.restore();
    }
    if (e.shieldFlash > 0) {
      ctx.save(); ctx.globalAlpha = Math.min(1, e.shieldFlash / 0.3);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(x, y, r * 1.5, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }
  if (e.cfg.pulse) {
    const soon = e.abilityCd < 0.7 && e.st.freeze <= 0;
    ctx.save();
    ctx.setLineDash([5, 7]);
    ctx.strokeStyle = soon ? 'rgba(255,246,192,0.75)' : 'rgba(255,246,192,0.2)';
    ctx.lineWidth = soon ? 2.5 : 1.5;
    ctx.beginPath(); ctx.arc(x, y, e.cfg.pulse.radius, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  if (e.cfg.stomp && e.abilityCd < 0.9 && e.st.freeze <= 0) {
    // stomp telegraph: the shockwave's reach
    const k = 1 - e.abilityCd / 0.9;
    ctx.save();
    ctx.setLineDash([10, 8]);
    ctx.strokeStyle = `rgba(255,120,70,${0.25 + 0.5 * k})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, STOMP_RANGE, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = `rgba(255,90,50,${0.05 * k})`; ctx.fill();
    ctx.restore();
  }
  if (e.kind === 'boss_golem' && e.shellBroken > 0) {
    ctx.save();
    ctx.strokeStyle = '#ffb35a'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x, y, r * 1.2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (e.shellBroken / SHELL_BREAK_TIME)); ctx.stroke();
    ctx.restore();
  }
  if (e.trait) {
    const info = TRAIT_INFO[e.trait];
    const pulse = 0.5 + 0.5 * Math.sin(t * 5);
    glow(ctx, x, y, r * 1.8, info.color, 0.18 + 0.12 * pulse);
    ctx.save();
    ctx.strokeStyle = info.color; ctx.lineWidth = 2; ctx.globalAlpha = 0.6 + 0.3 * pulse;
    if (e.trait === 'reflective') {
      ctx.beginPath(); ctx.arc(x, y, r + 7, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, r + 11, 0.3, 1.3); ctx.stroke();
    } else if (e.trait === 'hasted') {
      for (let i = 0; i < 3; i++) {
        const yy = y + (i - 1) * r * 0.7;
        ctx.beginPath(); ctx.moveTo(x + r * 1.1, yy); ctx.lineTo(x + r * (1.8 + 0.4 * ((i + Math.floor(t * 12)) % 2)), yy); ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(x, y, r + 6, 0, Math.PI * 2); ctx.stroke();
    } else if (e.trait === 'regenerating') {
      ctx.fillStyle = info.color;
      for (let i = 0; i < 3; i++) {
        const ph = (t * 0.9 + i / 3 + e.id * 0.1) % 1, px = x + (i - 1) * r * 0.7, py = y - r * 0.2 - ph * r * 1.2;
        ctx.fillRect(px - 1.5, py - 5, 3, 10); ctx.fillRect(px - 5, py - 1.5, 10, 3);
      }
      ctx.beginPath(); ctx.arc(x, y, r + 6, 0, Math.PI * 2); ctx.stroke();
    } else {
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(x, y, r + 7, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(info.label, x, y + r + 16);
    ctx.fillStyle = info.color; ctx.fillText(info.label, x, y + r + 16);
  }
}

// ---------------------------------------------------------------- hazard visuals

/** Fog bank over the far side of the arena (drawn before enemies so revealed enemies stand out). */
function drawFog(ctx: CanvasRenderingContext2D, h: HudState): void {
  // a bank beyond FOG_DIST from the ward: clear inside, thickening over the next ~110 px
  const g = ctx.createRadialGradient(WARD_X, WARD_Y, FOG_DIST - 40, WARD_X, WARD_Y, FOG_DIST + 70);
  g.addColorStop(0, 'rgba(200,210,225,0)');
  g.addColorStop(1, 'rgba(200,210,225,0.62)');
  ctx.fillStyle = g; ctx.fillRect(h.offX, 0, h.viewW, H);
  for (let i = 0; i < 7; i++) {
    const bx = WARD_X + FOG_DIST + 20 + ((i * 137 + h.time * 14) % 420) - 60, by = 40 + ((i * 83) % 520) + Math.sin(h.time * 0.5 + i) * 20;
    const rg = ctx.createRadialGradient(bx, by, 0, bx, by, 110);
    rg.addColorStop(0, 'rgba(235,240,248,0.5)');
    rg.addColorStop(1, 'rgba(235,240,248,0)');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(bx, by, 110, 0, Math.PI * 2); ctx.fill();
  }
}

/** Rain streaks / heat shimmer drawn over the field, under the HUD. */
function drawHazardOverlay(ctx: CanvasRenderingContext2D, w: World, h: HudState): void {
  const t = h.time;
  if (w.hazard === 'rain') {
    ctx.fillStyle = 'rgba(40,80,150,0.1)'; ctx.fillRect(h.offX, 0, h.viewW, H);
    ctx.strokeStyle = 'rgba(180,210,255,0.4)'; ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < 110; i++) {
      const x = h.offX + ((i * 97.3 + t * 140) % (h.viewW + 120)) - 60;
      const y = ((i * 53.7 + t * (620 + (i % 5) * 60)) % (H + 60)) - 30;
      ctx.moveTo(x, y); ctx.lineTo(x - 5, y + 16);
    }
    ctx.stroke();
  } else if (w.hazard === 'heatwave') {
    const g = ctx.createLinearGradient(0, H, 0, 0);
    g.addColorStop(0, 'rgba(255,110,30,0.22)');
    g.addColorStop(1, 'rgba(255,150,60,0.04)');
    ctx.fillStyle = g; ctx.fillRect(h.offX, 0, h.viewW, H);
    ctx.strokeStyle = 'rgba(255,200,130,0.18)'; ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const by = H - ((t * 40 + i * 100) % H);
      ctx.beginPath();
      for (let x = h.offX; x <= h.offX + h.viewW; x += 24) {
        const yy = by + Math.sin(x * 0.03 + t * 3 + i) * 5;
        if (x === h.offX) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    // warning edge just before the next ignition
    if (w.hazardT < 0.6) {
      ctx.fillStyle = `rgba(255,120,30,${0.18 * (1 - w.hazardT / 0.6)})`; ctx.fillRect(h.offX, 0, h.viewW, H);
    }
  }
}
