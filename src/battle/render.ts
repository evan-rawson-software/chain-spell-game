import type { FloorDef, StatusKind } from '../types';
import { drawArena } from './arena';
import { drawMagicCircle } from './circle';
import {
  ELEMENT_COLOR, H, MUZZLE_X, MUZZLE_Y, STATUS_COLOR, W,
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
}

export function render(ctx: CanvasRenderingContext2D, w: World, h: HudState): void {
  drawArena(ctx, h.floor, h.time, h.pxScale, h.offX, h.viewW);
  drawMagicCircle(ctx, w, {
    time: h.time, progress: h.castTime > 0 ? h.charge / h.castTime : 0, hasShots: h.hasShots,
    sinceCast: h.sinceCast, color: h.orbColor, aimX: h.aimX, aimY: h.aimY,
  });
  for (const e of w.enemies) drawEnemy(ctx, e, h.time);
  drawEnemyProjectiles(ctx, w);
  drawPlayerProjectiles(ctx, w);
  drawEffects(ctx, w);
  drawHud(ctx, w, h);
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
  const bob = frozen || e.kind === 'boss_lich' ? 0 : -Math.abs(Math.sin(walk)) * Math.min(3, r * 0.15);
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
    default: ctx.fillStyle = pose.c(e.cfg.color); ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
  ctx.restore();

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
  const boss = e.kind === 'boss_lich';
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
  for (const t of w.texts) {
    const k = t.t / t.max;
    ctx.globalAlpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
    ctx.font = `bold ${t.size}px sans-serif`;
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(t.text, t.x, t.y);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x, t.y);
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
  // wizard HP
  const hpW = 240 * u, hpH = 20 * u;
  bar(ctx, 20, 16, hpW, hpH, w.wizHp / w.wizMax, '#d94452');
  label(ctx, `HP ${Math.ceil(w.wizHp)} / ${w.wizMax}`, 20 + hpW / 2, 16 + hpH * 0.78, 14 * u, 'center');
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
  const boss = w.enemies.find(e => e.kind === 'boss_lich' && !e.dead);
  if (boss) {
    const by = 40 * u;
    bar(ctx, W / 2 - 220, by, 440, 16 * u, boss.hp / boss.maxHp, '#8b3ad8');
    label(ctx, `${boss.cfg.name}  ${Math.ceil(boss.hp)} / ${boss.maxHp}`, W / 2, by + 13 * u, 12 * u, 'center');
  }

  // off-screen enemy markers on the right edge
  ctx.fillStyle = 'rgba(255,90,90,0.85)';
  for (const e of w.enemies) {
    if (e.dead || e.x - e.r < W) continue;
    const y = Math.max(20, Math.min(H - 20, e.y));
    ctx.beginPath(); ctx.moveTo(W - 4, y); ctx.lineTo(W - 16, y - 8); ctx.lineTo(W - 16, y + 8); ctx.closePath(); ctx.fill();
  }

  if (!h.hasShots) label(ctx, 'Spell has no damaging runes', W / 2, H - 34, 18 * u, 'center', '#ffb86b');
  else if (h.time < 6) label(ctx, 'Spell auto-casts - aim with the mouse', W / 2, H - 12, 14 * u, 'center', '#c4c9ee');

  // aim line + crosshair
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
