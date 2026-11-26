import type { FloorDef } from '../types';
import { H, W, WARD_X, WARD_Y } from './model';
import { boltPoints, stormStrike } from './storm';

/**
 * Combat background (per act: I crypt, II frozen marsh, III storm spire): a dark flagstone arena. Static layers (stone, cracks, stains,
 * rune ring, vignette) are prerendered once per (floor kind, resolution); only drifting
 * fog and embers are drawn per frame. Everything is seeded so nothing flickers.
 */

type Kind = FloorDef['kind'];

interface Theme {
  /** base stone rgb */
  stone: [number, number, number];
  /** accent (rune ring, embers) */
  accent: string;
  ember: string;
  fog: string;
}

const THEMES: Record<Kind, Theme> = {
  normal: { stone: [34, 36, 52], accent: '#5a6cd8', ember: '#8fa6ff', fog: '120,130,220' },
  elite: { stone: [44, 34, 52], accent: '#9a5ad8', ember: '#d79bff', fog: '170,110,220' },
  boss: { stone: [52, 28, 38], accent: '#d8405a', ember: '#ff8a5a', fog: '230,80,90' },
};

/** Act looks (DESIGN.md, Acts and map). Act 1 keeps the kind themes above untouched. */
const ACT_THEMES: Record<2 | 3, { stone: [number, number, number]; accent: string; ember: string; fog: string }> = {
  2: { stone: [26, 46, 52], accent: '#3fc8b4', ember: '#a8f0e4', fog: '130,210,200' },
  3: { stone: [42, 30, 66], accent: '#a070ff', ember: '#d4b8ff', fog: '170,130,240' },
};

function themeFor(kind: Kind, act: number): Theme {
  const base = THEMES[kind];
  if (act !== 2 && act !== 3) return base;
  const a = ACT_THEMES[act];
  // elites and bosses keep a hint of their own colour
  const k = kind === 'normal' ? 0 : 0.3;
  const stone = a.stone.map((v, i) => Math.round(v * (1 - k) + base.stone[i] * k)) as [number, number, number];
  return { stone, accent: kind === 'normal' ? a.accent : base.accent, ember: a.ember, fog: a.fog };
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function renderStatic(kind: Kind, act: number, res: number): HTMLCanvasElement {
  const th = themeFor(kind, act);
  const cv = makeCanvas(W * res, H * res);
  const g = cv.getContext('2d')!;
  g.scale(res, res);
  const rand = rng((kind === 'boss' ? 913 : kind === 'elite' ? 517 : 101) + (act === 2 ? 5000 : act === 3 ? 9000 : 0));
  const [sr, sg, sb] = th.stone;
  const rgb = (m: number, a = 1): string =>
    `rgba(${Math.min(255, Math.round(sr * m))},${Math.min(255, Math.round(sg * m))},${Math.min(255, Math.round(sb * m))},${a})`;

  g.fillStyle = rgb(0.6);
  g.fillRect(0, 0, W, H);

  // flagstones: staggered rows of irregular widths
  const rowH = 64;
  for (let y = -10, row = 0; y < H; y += rowH, row++) {
    let x = -((row * 37) % 90) - 20;
    while (x < W) {
      const tw = 70 + rand() * 80;
      const th2 = rowH - 2 + (rand() - 0.5) * 4;
      const m = 0.82 + rand() * 0.38;
      g.fillStyle = rgb(m);
      g.fillRect(x + 1.5, y + 1.5, tw - 3, th2 - 3);
      // soft bevel: light top/left, dark bottom/right
      g.fillStyle = 'rgba(255,255,255,0.045)';
      g.fillRect(x + 1.5, y + 1.5, tw - 3, 1.5);
      g.fillRect(x + 1.5, y + 1.5, 1.5, th2 - 3);
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.fillRect(x + 1.5, y + th2 - 4.5, tw - 3, 3);
      g.fillRect(x + tw - 4.5, y + 1.5, 3, th2 - 3);
      // grain
      g.fillStyle = 'rgba(0,0,0,0.08)';
      for (let i = 0; i < 6; i++) g.fillRect(x + 4 + rand() * (tw - 10), y + 4 + rand() * (th2 - 10), 1 + rand() * 3, 1);
      x += tw;
    }
  }

  // stains / moss-like blotches
  for (let i = 0; i < 26; i++) {
    const x = rand() * W, y = rand() * H, r = 40 + rand() * 90;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const dark = rand() < 0.65;
    gr.addColorStop(0, dark ? 'rgba(0,0,0,0.16)' : `rgba(${th.fog},0.05)`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // cracks
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (let i = 0; i < 22; i++) {
    let x = rand() * W, y = rand() * H;
    let a = rand() * Math.PI * 2;
    const segs = 4 + Math.floor(rand() * 6);
    const pts: number[] = [x, y];
    for (let s = 0; s < segs; s++) {
      a += (rand() - 0.5) * 1.2;
      const l = 8 + rand() * 18;
      x += Math.cos(a) * l; y += Math.sin(a) * l;
      pts.push(x, y);
    }
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(pts[0], pts[1]);
    for (let k = 2; k < pts.length; k += 2) g.lineTo(pts[k], pts[k + 1]);
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(pts[0] + 1, pts[1] + 1);
    for (let k = 2; k < pts.length; k += 2) g.lineTo(pts[k] + 1, pts[k + 1] + 1);
    g.stroke();
  }

  if (act === 2) {
    // frozen marsh: icy sheen patches and pale cracks
    for (let i = 0; i < 14; i++) {
      const x = rand() * W, y = rand() * H, r = 50 + rand() * 90;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(170,235,240,0.11)');
      gr.addColorStop(1, 'rgba(170,235,240,0)');
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (let i = 0; i < 16; i++) {
      let x = rand() * W, y = rand() * H;
      let a = rand() * Math.PI * 2;
      const pts: number[] = [x, y];
      const segs = 4 + Math.floor(rand() * 5);
      for (let k = 0; k < segs; k++) {
        a += (rand() - 0.5) * 1.5;
        const l = 10 + rand() * 22;
        x += Math.cos(a) * l; y += Math.sin(a) * l;
        pts.push(x, y);
      }
      for (const [col, lw] of [['rgba(120,220,235,0.16)', 3.2], ['rgba(225,250,255,0.5)', 1]] as const) {
        g.strokeStyle = col; g.lineWidth = lw;
        g.beginPath(); g.moveTo(pts[0], pts[1]);
        for (let k = 2; k < pts.length; k += 2) g.lineTo(pts[k], pts[k + 1]);
        g.stroke();
      }
    }
  } else if (act === 3) {
    // storm spire: glowing violet fissures in the stone
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (let i = 0; i < 12; i++) {
      let x = rand() * W, y = rand() * H;
      let a = rand() * Math.PI * 2;
      const pts: number[] = [x, y];
      const segs = 3 + Math.floor(rand() * 5);
      for (let k = 0; k < segs; k++) {
        a += (rand() - 0.5) * 1.3;
        const l = 10 + rand() * 20;
        x += Math.cos(a) * l; y += Math.sin(a) * l;
        pts.push(x, y);
      }
      for (const [col, lw] of [['rgba(150,100,255,0.14)', 3.5], ['rgba(200,170,255,0.4)', 0.9]] as const) {
        g.strokeStyle = col; g.lineWidth = lw;
        g.beginPath(); g.moveTo(pts[0], pts[1]);
        for (let k = 2; k < pts.length; k += 2) g.lineTo(pts[k], pts[k + 1]);
        g.stroke();
      }
    }
  }

  // faint arena rune rings centred on the player's circle
  g.save();
  g.translate(WARD_X, WARD_Y);
  g.strokeStyle = th.accent;
  for (const [r, a, lw] of [[150, 0.16, 1.5], [158, 0.1, 1], [330, 0.1, 1.5], [338, 0.07, 1]] as const) {
    g.globalAlpha = a; g.lineWidth = lw;
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke();
  }
  g.globalAlpha = 0.12; g.lineWidth = 1.2;
  g.beginPath();
  for (let i = 0; i < 72; i++) {
    const a = (i * Math.PI * 2) / 72, r0 = i % 6 === 0 ? 142 : 147;
    g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); g.lineTo(Math.cos(a) * 150, Math.sin(a) * 150);
  }
  g.stroke();
  g.restore();
  g.globalAlpha = 1;

  // cool-to-warm light pool around the circle
  const pool = g.createRadialGradient(WARD_X, WARD_Y, 10, WARD_X, WARD_Y, 260);
  pool.addColorStop(0, th.accent + '30');
  pool.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = pool;
  g.fillRect(0, 0, 600, H);

  // vignette
  const v = g.createRadialGradient(W * 0.45, H / 2, H * 0.35, W * 0.45, H / 2, W * 0.72);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(2,3,10,0.78)');
  g.fillStyle = v;
  g.fillRect(0, 0, W, H);
  // keep the whole thing low contrast so sprites pop
  g.fillStyle = 'rgba(6,8,16,0.18)';
  g.fillRect(0, 0, W, H);
  return cv;
}

function renderFogSprite(fog: string): HTMLCanvasElement {
  const cv = makeCanvas(256, 256);
  const g = cv.getContext('2d')!;
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, `rgba(${fog},0.5)`);
  gr.addColorStop(1, `rgba(${fog},0)`);
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 256);
  return cv;
}

const EMBERS = 34;
const FOGS = 5;

interface Cache {
  kind: Kind;
  act: number;
  res: number;
  stat: HTMLCanvasElement;
  fog: HTMLCanvasElement;
}
let cache: Cache | null = null;

// deterministic ember / fog parameters (built once)
const er = rng(4242);
const emberP = Array.from({ length: EMBERS }, () => ({
  x: er() * W, y: er() * H, sp: 8 + er() * 18, sw: 6 + er() * 14, ph: er() * 6.28, r: 0.7 + er() * 1.3, a: 0.25 + er() * 0.5,
}));
const fogP = Array.from({ length: FOGS }, () => ({
  x: er() * W, y: 80 + er() * (H - 160), r: 150 + er() * 140, sp: 5 + er() * 8, ph: er() * 6.28,
}));

/**
 * @param res device pixels per world unit (dpr * scale); picks the prerender resolution
 */
export function drawArena(
  ctx: CanvasRenderingContext2D, floor: FloorDef, t: number, res: number, offX: number, viewW: number,
): void {
  const q = Math.min(2, Math.max(0.5, Math.ceil(res * 2) / 2));
  const act = floor.act === 2 || floor.act === 3 ? floor.act : 1;
  if (!cache || cache.kind !== floor.kind || cache.act !== act || cache.res !== q) {
    cache = { kind: floor.kind, act, res: q, stat: renderStatic(floor.kind, act, q), fog: renderFogSprite(themeFor(floor.kind, act).fog) };
  }
  const th = themeFor(floor.kind, act);
  // letterbox sides: plain dark stone so entering enemies read against it
  const [sr, sg, sb] = th.stone;
  ctx.fillStyle = `rgb(${Math.round(sr * 0.25)},${Math.round(sg * 0.25)},${Math.round(sb * 0.25)})`;
  ctx.fillRect(offX, 0, viewW, H);
  ctx.drawImage(cache.stat, 0, 0, W, H);

  // drifting fog (the marsh is thick with mist: bigger, denser, in two layers)
  const mist = act === 2;
  for (const f of fogP) {
    const k = mist ? 1.5 : 1;
    const x = ((f.x + t * f.sp * (mist ? 1.4 : 1)) % (W + 2 * f.r * k)) - f.r * k;
    const y = f.y + Math.sin(t * 0.2 + f.ph) * 20;
    ctx.globalAlpha = (mist ? 0.13 : 0.05) + (mist ? 0.04 : 0.025) * Math.sin(t * 0.3 + f.ph);
    ctx.drawImage(cache.fog, x - f.r * k, y - f.r * k, f.r * 2 * k, f.r * 2 * k);
    if (mist) {
      const x2 = W - (((f.x + t * f.sp * 0.7) % (W + 2 * f.r)) - f.r);
      ctx.globalAlpha = 0.08 + 0.03 * Math.sin(t * 0.4 + f.ph * 2);
      ctx.drawImage(cache.fog, x2 - f.r, H - y - f.r, f.r * 2, f.r * 2);
    }
  }

  // embers
  ctx.fillStyle = th.ember;
  ctx.globalCompositeOperation = 'lighter';
  for (const e of emberP) {
    const y = H + 10 - (((e.y + t * e.sp) % (H + 20)));
    const x = e.x + Math.sin(t * 0.7 + e.ph) * e.sw;
    ctx.globalAlpha = e.a * (0.5 + 0.5 * Math.sin(t * 2 + e.ph)) * Math.min(1, y / 80, (H - y) / 40 + 0.2);
    ctx.fillRect(x, y, e.r, e.r);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  // storm spire: occasional soft lightning in the background (none under reduced motion)
  if (act === 3 && !reducedMotion()) {
    const s = stormStrike(t);
    if (s) {
      ctx.fillStyle = `rgba(185,150,255,${s.level * 0.28})`;
      ctx.fillRect(offX, 0, viewW, H);
      const pts = boltPoints(s.epoch, W);
      ctx.save();
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.globalAlpha = Math.min(1, s.level * 1.4);
      ctx.strokeStyle = 'rgba(170,130,255,0.5)'; ctx.lineWidth = 6;
      ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
      ctx.strokeStyle = 'rgba(240,230,255,0.9)'; ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.restore();
    }
  }
}

let reduced: boolean | null = null;
function reducedMotion(): boolean {
  if (reduced === null) reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return reduced;
}
