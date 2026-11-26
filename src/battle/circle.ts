import { WARD_X, WARD_Y, type World } from './model';

/**
 * The player's animated ground magic circle. It is the player in combat:
 * dim and slowly turning at 0 charge, fully lit, fast and radiant at 1, with a
 * shockwave on each cast. Purely visual; the hit position stays at (WARD_X, WARD_Y).
 */

export interface CircleInput {
  time: number;
  /** 0..1 cast progress (the same value that drives the spell-strip playhead) */
  progress: number;
  hasShots: boolean;
  /** seconds since the spell last fired */
  sinceCast: number;
  /** element color of the next shot */
  color: string;
  /** where the next cast will be aimed (world coords) */
  aimX: number;
  aimY: number;
}

const R = 62;
const TAU = Math.PI * 2;
const GLYPHS = 20;
const ARCANE = '#9a8cff';

// persistent animation phases (integrated so speed changes never jump)
const st = { t: -1, a1: 0, a2: 0, a3: 0, orbit: 0, aim: 0 };

// small rune-like marks, built once. Each fits roughly a 8x8 box centered on the origin.
const GLYPH_PATHS: Path2D[] = (() => {
  const mk = (f: (p: Path2D) => void): Path2D => { const p = new Path2D(); f(p); return p; };
  return [
    mk((p) => { p.moveTo(0, -4); p.lineTo(0, 4); p.moveTo(-3, -1); p.lineTo(3, -1); }),
    mk((p) => { p.moveTo(-3, 4); p.lineTo(0, -4); p.lineTo(3, 4); p.moveTo(-2, 1); p.lineTo(2, 1); }),
    mk((p) => { p.moveTo(-3, -4); p.lineTo(3, -4); p.lineTo(-3, 4); p.lineTo(3, 4); }),
    mk((p) => { p.moveTo(-3, -4); p.lineTo(-3, 4); p.moveTo(-3, 0); p.lineTo(3, -4); p.moveTo(-3, 0); p.lineTo(3, 4); }),
    mk((p) => { p.moveTo(3.2, 0); p.arc(0, 0, 3.2, 0, TAU); p.moveTo(0, -4); p.lineTo(0, 4); }),
    mk((p) => { p.moveTo(-3, -4); p.lineTo(3, 0); p.lineTo(-3, 4); p.moveTo(0, -4); p.lineTo(0, 4); }),
  ];
})();

function angleDiff(a: number, b: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

function ngon(ctx: CanvasRenderingContext2D, n: number, r: number, rot: number): void {
  for (let i = 0; i <= n; i++) {
    const a = rot + (i * TAU) / n;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
}

function ring(ctx: CanvasRenderingContext2D, r: number, lw: number, alpha: number, color: string, glowMul: number): void {
  if (glowMul > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha * 0.22 * glowMul;
    ctx.lineWidth = lw * 3.2;
    ctx.strokeStyle = color;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.globalAlpha = alpha;
  ctx.lineWidth = lw;
  ctx.strokeStyle = color;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
}

export function drawMagicCircle(ctx: CanvasRenderingContext2D, w: World, h: CircleInput): void {
  // advance phases
  let dt = h.time - st.t;
  if (st.t < 0 || dt < 0 || dt > 0.25) dt = 0;
  st.t = h.time;
  const p = h.hasShots ? Math.max(0, Math.min(1, h.progress)) : 0;
  const p2 = p * p;
  st.a1 += (0.12 + 1.5 * p2 + 0.4 * p) * dt;
  st.a2 -= (0.2 + 2.2 * p2 + 0.6 * p) * dt;
  st.a3 += (0.3 + 3.2 * p2 + 0.8 * p) * dt;
  st.orbit += (0.7 + 4.5 * p2 + 1.2 * p) * dt;
  const aimA = Math.atan2(h.aimY - WARD_Y, h.aimX - WARD_X);
  st.aim += angleDiff(st.aim, aimA) * Math.min(1, dt * 14);

  const dead = w.wardHp <= 0;
  const hurt = w.wardFlash > 0;
  const lowHp = !dead && w.wardHp / w.wardMax < 0.3;
  const t = h.time;
  const col = hurt ? '#ff4a4a' : lowHp ? '#ff7a7a' : h.color;
  const base = hurt ? '#ff6666' : lowHp ? '#c88aa8' : ARCANE;

  // overall brightness: dim idle, brighter with charge, flicker when low on hp
  let k = 0.5 + 0.5 * p;
  if (lowHp) k *= 0.7 + 0.3 * Math.sin(t * 17) * Math.sin(t * 5.3);
  if (hurt) k = Math.min(1.4, k + 0.5);
  if (dead) k = 0.25;
  const lw = 1.2 + 1.6 * p;
  const castK = h.hasShots ? Math.max(0, 1 - h.sinceCast / 0.5) : 0; // post-cast afterglow

  ctx.save();
  ctx.translate(WARD_X, WARD_Y);

  // ground glow
  {
    const gr = R * (1.5 + 0.5 * p + 0.5 * castK);
    const g = ctx.createRadialGradient(0, 0, R * 0.2, 0, 0, gr);
    g.addColorStop(0, col);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (0.07 + 0.22 * p + 0.25 * castK) * k;
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, gr, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }

  // outer ring with tick marks (slow, clockwise)
  ctx.save();
  ctx.rotate(st.a1);
  ring(ctx, R, lw + 0.4, (0.5 + 0.4 * p) * k, base, 1 + p);
  ring(ctx, R - 6, 1, 0.4 * k, base, 0);
  ctx.globalAlpha = (0.45 + 0.4 * p) * k;
  ctx.strokeStyle = base; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 48; i++) {
    const a = (i * TAU) / 48, c = Math.cos(a), s = Math.sin(a);
    const r0 = i % 4 === 0 ? R - 10 : R - 6;
    ctx.moveTo(c * r0, s * r0); ctx.lineTo(c * (R - 1), s * (R - 1));
  }
  ctx.stroke();
  ctx.restore();

  // glyph band (counter-rotating); glyphs light up progressively with charge
  ctx.save();
  ctx.rotate(st.a2);
  const gr1 = R * 0.78;
  ring(ctx, R * 0.68, 1, 0.35 * k, base, 0);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const lit = p * GLYPHS;
  for (let i = 0; i < GLYPHS; i++) {
    const a = (i * TAU) / GLYPHS;
    const on = i < lit;
    // the glyph at the lit front fades in
    const f = on ? Math.min(1, lit - i) : 0;
    ctx.save();
    ctx.translate(Math.cos(a) * gr1, Math.sin(a) * gr1);
    ctx.rotate(a + Math.PI / 2);
    ctx.scale(0.9, 0.9);
    if (f > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (0.25 + 0.2 * Math.sin(t * 6 + i)) * f * k;
      ctx.strokeStyle = col; ctx.lineWidth = 4;
      ctx.stroke(GLYPH_PATHS[i % GLYPH_PATHS.length]);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = (0.55 + 0.45 * f) * k;
      ctx.strokeStyle = col; ctx.lineWidth = 1.5;
    } else {
      ctx.globalAlpha = 0.3 * k;
      ctx.strokeStyle = base; ctx.lineWidth = 1.1;
    }
    ctx.stroke(GLYPH_PATHS[i % GLYPH_PATHS.length]);
    ctx.restore();
  }
  ctx.restore();

  // inner hexagram + circle (clockwise, fastest)
  ctx.save();
  ctx.rotate(st.a3);
  const hexR = R * 0.6;
  ctx.lineJoin = 'miter';
  for (let pass = 0; pass < 2; pass++) {
    if (pass === 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.18 * p * k; ctx.lineWidth = lw * 3; }
    else { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = (0.5 + 0.45 * p) * k; ctx.lineWidth = lw; }
    ctx.strokeStyle = pass === 0 ? col : p > 0.5 ? col : base;
    ctx.beginPath();
    ngon(ctx, 3, hexR, -Math.PI / 2);
    ngon(ctx, 3, hexR, Math.PI / 2);
    ctx.stroke();
    if (pass === 1) ring(ctx, hexR * 0.5, 1, 0.55 * k, base, 0);
  }
  ctx.restore();

  // core
  {
    const cr = 4 + 5 * p + 6 * castK + Math.sin(t * (3 + 8 * p)) * (0.6 + 1.2 * p);
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, cr * 2.6);
    g.addColorStop(0, '#fff');
    g.addColorStop(0.3, col);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = (0.45 + 0.5 * p) * k;
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, cr * 2.6, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }

  // orbiting motes: more of them, and faster, as charge builds
  {
    const n = 3 + Math.floor(p * 9);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = col;
    for (let i = 0; i < n; i++) {
      const dir = i % 2 ? -1 : 1;
      const a = st.orbit * dir * (1 + (i % 3) * 0.25) + i * 2.39996;
      const rr = R * (0.45 + 0.55 * ((i * 0.618) % 1)) + Math.sin(t * 2 + i) * 2;
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      ctx.globalAlpha = (0.5 + 0.4 * p) * k;
      ctx.beginPath(); ctx.arc(x, y, 1.3 + p * 1.1, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.18 * k;
      ctx.beginPath(); ctx.arc(x, y, 3.5 + p * 2, 0, TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // rising light column + sparks near full charge
  if (p > 0.6 && !dead) {
    const q = (p - 0.6) / 0.4;
    const colH = 70 + 50 * q;
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(0, 0, 0, -colH);
    g.addColorStop(0, col);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.28 * q * k;
    ctx.fillStyle = g;
    const cw = 10 + 12 * q;
    ctx.fillRect(-cw / 2, -colH, cw, colH);
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 9; i++) {
      const ph = (t * (0.7 + 0.5 * q) + i / 9) % 1;
      const x = Math.sin(i * 12.9898 + 1.7) * R * 0.45 * (1 - ph * 0.5);
      ctx.globalAlpha = (1 - ph) * 0.8 * q * k;
      ctx.fillRect(x - 1, -ph * colH * 1.1, 2, 2 + 3 * q);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // facing notch on the outer ring: a bright arrowhead pointing where shots will go
  {
    ctx.save();
    ctx.rotate(st.aim);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5 * k + 0.2;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(R + 1, 0); ctx.lineTo(R - 7, -5); ctx.lineTo(R - 7, 5); ctx.closePath(); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(R + 3, 0); ctx.lineTo(R - 3, -2.5); ctx.lineTo(R - 3, 2.5); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // cast shockwave
  if (h.hasShots && h.sinceCast >= 0 && h.sinceCast < 0.7) {
    const a = h.sinceCast / 0.7;
    const e = 1 - (1 - a) * (1 - a); // ease-out
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = col;
    ctx.globalAlpha = (1 - a) * 0.9;
    ctx.lineWidth = 7 * (1 - a) + 1;
    ctx.beginPath(); ctx.arc(0, 0, R * (0.6 + 2.6 * e), 0, TAU); ctx.stroke();
    ctx.globalAlpha = (1 - a) * 0.5;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, R * (0.5 + 1.9 * e), 0, TAU); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }

  ctx.restore();
  ctx.globalAlpha = 1;
}
