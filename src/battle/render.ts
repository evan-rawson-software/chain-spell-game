import type { FloorDef, StatusKind } from '../types';
import {
  ELEMENT_COLOR, H, MUZZLE_X, MUZZLE_Y, STATUS_COLOR, W, WIZ_X, WIZ_Y,
  type Enemy, type World,
} from './model';

export interface HudState {
  floor: FloorDef;
  waveIdx: number;
  waveTotal: number;
  banner: string | null;
  overlay: { text: string; good: boolean } | null;
  charge: number;
  castTime: number;
  hasShots: boolean;
  mouse: { x: number; y: number; inside: boolean };
  orbColor: string;
  time: number;
}

const stars = Array.from({ length: 70 }, () => ({ x: Math.random() * W, y: Math.random() * H * 0.9, r: Math.random() * 1.4 + 0.3, p: Math.random() * 6 }));

export function render(ctx: CanvasRenderingContext2D, w: World, h: HudState): void {
  drawBackground(ctx, h.time);
  drawWizard(ctx, w, h);
  for (const e of w.enemies) drawEnemy(ctx, e, h.time);
  drawEnemyProjectiles(ctx, w);
  drawPlayerProjectiles(ctx, w);
  drawEffects(ctx, w);
  drawHud(ctx, w, h);
}

function drawBackground(ctx: CanvasRenderingContext2D, t: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0d1022');
  g.addColorStop(0.6, '#171a33');
  g.addColorStop(1, '#241d38');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  for (const s of stars) {
    ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t * 1.5 + s.p);
    ctx.fillStyle = '#cfd8ff';
    ctx.fillRect(s.x, s.y, s.r, s.r);
  }
  ctx.globalAlpha = 1;
  // ground band
  ctx.fillStyle = 'rgba(255,255,255,0.025)';
  for (let y = 40; y < H; y += 80) ctx.fillRect(0, y, W, 1);
  const rg = ctx.createRadialGradient(WIZ_X, WIZ_Y + 30, 10, WIZ_X, WIZ_Y + 30, 160);
  rg.addColorStop(0, 'rgba(120,100,220,0.28)');
  rg.addColorStop(1, 'rgba(120,100,220,0)');
  ctx.fillStyle = rg;
  ctx.fillRect(0, WIZ_Y - 140, 260, 340);
}

function drawWizard(ctx: CanvasRenderingContext2D, w: World, h: HudState): void {
  const x = WIZ_X, y = WIZ_Y;
  const dead = w.wizHp <= 0;
  ctx.save();
  if (dead) ctx.globalAlpha = 0.5;
  // robe
  ctx.fillStyle = w.wizFlash > 0 ? '#ffffff' : '#3b3f93';
  ctx.beginPath();
  ctx.moveTo(x, y - 12); ctx.lineTo(x + 24, y + 36); ctx.lineTo(x - 24, y + 36); ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#5a60c4';
  ctx.beginPath();
  ctx.moveTo(x, y - 12); ctx.lineTo(x + 8, y + 36); ctx.lineTo(x - 8, y + 36); ctx.closePath();
  ctx.fill();
  // head
  ctx.fillStyle = '#f0d2b0';
  ctx.beginPath(); ctx.arc(x, y - 20, 9, 0, Math.PI * 2); ctx.fill();
  // hat
  ctx.fillStyle = w.wizFlash > 0 ? '#ffffff' : '#2a2d6e';
  ctx.beginPath();
  ctx.moveTo(x - 15, y - 25); ctx.lineTo(x + 15, y - 25); ctx.lineTo(x + 4, y - 58); ctx.closePath();
  ctx.fill();
  // staff
  ctx.strokeStyle = '#8a6a44';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x + 28, y + 38); ctx.lineTo(MUZZLE_X - 4, MUZZLE_Y + 6); ctx.stroke();
  // orb
  const pulse = 0.8 + 0.2 * Math.sin(h.time * 5) + (h.hasShots ? (h.charge / h.castTime) * 0.6 : 0);
  glow(ctx, MUZZLE_X, MUZZLE_Y, 16 * pulse, h.orbColor, 0.7);
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(MUZZLE_X, MUZZLE_Y, 4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
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

function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, t: number): void {
  const bob = Math.sin(e.phase * 6) * 2;
  const x = e.x, y = e.y + bob, r = e.r;
  const lunge = e.attackAnim > 0 ? -Math.sin((e.attackAnim / 0.25) * Math.PI) * 8 : 0;
  ctx.save();
  ctx.translate(lunge, 0);
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(x, e.y + r * 0.9, r * 0.9, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();

  const frozen = e.st.freeze > 0;
  ctx.fillStyle = e.flash > 0 ? '#ffffff' : frozen ? '#9fd9ee' : e.cfg.color;
  // kind decoration behind body
  if (e.kind === 'brute') {
    ctx.beginPath(); ctx.moveTo(x - r * 0.7, y - r * 0.6); ctx.lineTo(x - r * 1.0, y - r * 1.3); ctx.lineTo(x - r * 0.3, y - r * 0.9); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + r * 0.7, y - r * 0.6); ctx.lineTo(x + r * 1.0, y - r * 1.3); ctx.lineTo(x + r * 0.3, y - r * 0.9); ctx.fill();
  }
  if (e.kind === 'shaman') {
    ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x, y - r * 1.8); ctx.lineTo(x + r, y); ctx.fill();
  }
  if (e.kind === 'boss_lich') {
    glow(ctx, x, y, r * 2.2, '#7a3aff', 0.35 + 0.15 * Math.sin(t * 3));
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath(); ctx.moveTo(x + i * r * 0.35 - 7, y - r * 0.85); ctx.lineTo(x + i * r * 0.35, y - r * 1.5 + Math.abs(i) * 6); ctx.lineTo(x + i * r * 0.35 + 7, y - r * 0.85); ctx.fill();
    }
  }
  // body
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2; ctx.stroke();
  if (e.kind === 'elite_knight') {
    ctx.fillStyle = e.flash > 0 ? '#fff' : '#6c7585';
    ctx.fillRect(x - r * 0.8, y - r * 0.3, r * 1.6, r * 0.28);
    ctx.fillStyle = '#d8b24a';
    ctx.beginPath(); ctx.moveTo(x, y - r - 10); ctx.lineTo(x + 5, y - r + 2); ctx.lineTo(x - 5, y - r + 2); ctx.fill();
  }
  if (e.kind === 'archer') {
    ctx.strokeStyle = '#a9743c'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x - r - 2, y, r * 0.9, -1.1, 1.1); ctx.stroke();
  }
  // eyes
  const eye = e.kind === 'boss_lich' ? '#8cffb0' : e.kind === 'shaman' ? '#ffd9ff' : '#1a1a1a';
  ctx.fillStyle = eye;
  const er = Math.max(1.6, r * 0.12);
  ctx.beginPath(); ctx.arc(x - r * 0.4, y - r * 0.15, er, 0, Math.PI * 2); ctx.arc(x - r * 0.05, y - r * 0.15, er, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // status tints
  if (frozen) {
    ctx.fillStyle = 'rgba(200,240,255,0.45)';
    ctx.beginPath(); ctx.arc(x, y, r + 2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#e9fbff'; ctx.lineWidth = 2; ctx.stroke();
  }
  if (e.st.burn) {
    ctx.fillStyle = 'rgba(255,120,40,0.28)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    glow(ctx, x + Math.sin(t * 12 + e.id) * 4, y - r * 0.6, r * 0.8, '#ff7a2f', 0.5);
  }
  if (e.st.poison.length) { ctx.fillStyle = 'rgba(110,210,70,0.25)'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
  if (e.st.weaken) { ctx.strokeStyle = STATUS_COLOR.weaken; ctx.setLineDash([4, 4]); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r + 5, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }

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
  const st = e.st;
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
  // wizard HP
  bar(ctx, 20, 20, 240, 18, w.wizHp / w.wizMax, '#d94452');
  label(ctx, `HP ${Math.ceil(w.wizHp)} / ${w.wizMax}`, 140, 34, 13, 'center');
  // charge
  const frac = h.hasShots ? h.charge / h.castTime : 0;
  const ready = h.hasShots && h.charge >= h.castTime;
  bar(ctx, 20, 46, 240, 12, frac, ready ? '#ffe27a' : '#6aa8ff');
  label(ctx, h.hasShots ? (ready ? 'READY' : `Charging ${Math.max(0, h.castTime - h.charge).toFixed(1)}s`) : '', 140, 56, 10, 'center', '#10121c');
  label(ctx, `Cast time ${h.castTime.toFixed(2)}s`, 20, 74, 11, 'left', '#b8bdd8');

  // floor info
  const kind = h.floor.kind === 'normal' ? '' : ' - ' + (h.floor.kind === 'elite' ? 'Elite' : 'Boss');
  label(ctx, `Floor ${h.floor.floor}${kind}`, W / 2, 28, 16, 'center');
  label(ctx, `Wave ${Math.min(h.waveIdx + 1, h.waveTotal)}/${h.waveTotal}`, W - 20, 28, 16, 'right');

  // boss bar
  const boss = w.enemies.find(e => e.kind === 'boss_lich' && !e.dead);
  if (boss) {
    bar(ctx, W / 2 - 220, 40, 440, 16, boss.hp / boss.maxHp, '#8b3ad8');
    label(ctx, `${boss.cfg.name}  ${Math.ceil(boss.hp)} / ${boss.maxHp}`, W / 2, 53, 12, 'center');
  }

  if (!h.hasShots) label(ctx, 'Spell has no damaging runes', W / 2, H - 30, 18, 'center', '#ffb86b');
  else if (h.time < 6) label(ctx, 'Click or hold to cast toward the cursor', W / 2, H - 24, 14, 'center', '#9aa0c8');

  // crosshair
  if (h.mouse.inside && !h.overlay) {
    const { x, y } = h.mouse;
    ctx.strokeStyle = ready ? 'rgba(255,226,122,0.9)' : 'rgba(200,210,255,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.moveTo(x - 15, y); ctx.lineTo(x - 5, y); ctx.moveTo(x + 5, y); ctx.lineTo(x + 15, y);
    ctx.moveTo(x, y - 15); ctx.lineTo(x, y - 5); ctx.moveTo(x, y + 5); ctx.lineTo(x, y + 15);
    ctx.stroke();
  }

  if (h.banner && !h.overlay) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 230, W, 80);
    label(ctx, h.banner, W / 2, 285, 44, 'center', '#fff3c4');
  }
  if (h.overlay) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, H);
    label(ctx, h.overlay.text, W / 2, H / 2 + 14, 54, 'center', h.overlay.good ? '#ffe27a' : '#ff6b6b');
  }
}
