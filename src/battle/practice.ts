/**
 * Practice range (DESIGN.md, "Practice range"): the battle simulation against training dummies.
 * Shares the cast scheduler and frame loop with the real battle (core.ts) and renders with the
 * same render(); only the world setup, input, layout and stats HUD are practice-specific.
 */
import type { PracticeHandle, PracticeOptions } from '../contracts';
import type { CastPlan, FloorDef, SpellGraph } from '../types';
import { getSettings, onSettings } from '../settings';
import { BUTTON_H, BUTTON_W, createAbility, drawAbilityButton, ignoreHotkey, inButton, type AbilityController, type ButtonBox } from './abilityfx';
import { createCaster, createLoop, type LoopOptions, type Point } from './core';
import { spawnEnemy, sweepDead, updateEnemies } from './enemies';
import { comboState } from './juice';
import { keystoneFlags, momentumLabel } from './keystones';
import { ELEMENT_COLOR, MUZZLE_X, MUZZLE_Y, W, newWorld, updateFx, type Enemy } from './model';
import { updatePlayerProjectiles } from './projectiles';
import { render, type HudState } from './render';
import { setSoundFilter } from './sound';

const PRACTICE_FLOOR: FloorDef = { floor: 1, kind: 'normal', waves: [], hpScale: 1, act: 1 };
/** Dummy HP: big enough to read the bar draining, refilled when it falls under REFILL_BELOW. */
const DUMMY_HP = 20000;
const REFILL_BELOW = 0.35;
/** World height shown (centered on the ward line), so a short container still sees the dummies. */
const VIEW_H = 320;
const WINDOW = 5;

interface DummySpec { x: number; y: number; strafe?: { amp: number; period: number } }
const DUMMIES: DummySpec[] = [
  { x: 300, y: 250 },
  { x: 490, y: 350 },
  { x: 690, y: 300, strafe: { amp: 100, period: 7 } },
];

export function createPractice(container: HTMLElement, opts: PracticeOptions): PracticeHandle {
  // the spell strip is not drawn here (the editor already shows the graph), so graph/catalog go unused
  let plan = opts.plan;
  // the run passes its ability so it can be tried here (PracticeOptions may not declare it yet)
  const abilityId = opts.ability;
  const ability: AbilityController | null = abilityId ? createAbility(abilityId) : null;
  const abilityBox: ButtonBox = { x: 8, y: 0, w: BUTTON_W, h: BUTTON_H };
  const shakeFor = (): number => (reducedMotion ? 0.15 : 0.5) * getSettings().shake;

  const canvas = document.createElement('canvas');
  canvas.className = 'battle-canvas';
  container.classList.add('practice-root');
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;

  const world = newWorld(1000, undefined, plan.keystones);
  const caster = createCaster(plan);
  const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // keep sounds quiet: only reactions are audible, at reduced volume
  setSoundFilter((name, o) =>
    name === 'reaction' || name === 'shatter' || name === 'explosion' ? { ...o, volume: (o?.volume ?? 1) * 0.4 } : null);

  // dummies
  const dummies: { e: Enemy; spec: DummySpec }[] = [];
  function spawnDummy(spec: DummySpec): Enemy {
    const e = spawnEnemy(world, 'dummy', 1, { x: spec.x, y: spec.y }, { hp: DUMMY_HP });
    e.phase = 0;
    return e;
  }
  for (const spec of DUMMIES) dummies.push({ e: spawnDummy(spec), spec });

  // stats
  let nameByUid = new Map<string, string>();
  let history: { t: number; total: number }[] = [];
  let statsStart = 0;
  function indexNames(): void {
    nameByUid = new Map();
    for (const s of plan.shots) nameByUid.set(s.sourceUid, s.runeName);
  }
  indexNames();
  function totalDamage(): number {
    let n = 0;
    for (const k in world.runeDamage) n += world.runeDamage[k];
    return n;
  }
  function tally(): { name: string; dmg: number }[] {
    const by = new Map<string, number>();
    for (const [uid, dmg] of Object.entries(world.runeDamage)) {
      const name = nameByUid.get(uid);
      if (name) by.set(name, (by.get(name) ?? 0) + dmg);
    }
    return [...by].map(([name, dmg]) => ({ name, dmg })).sort((a, b) => b.dmg - a.dmg);
  }
  function resetStats(): void {
    world.runeDamage = {};
    world.reactionCounts = {};
    world.reactions = 0;
    world.bestHit = 0;
    history = [];
    statsStart = world.time;
  }

  // layout
  let cssW = 1, cssH = 1, dpr = 1, scale = 1, offX = 0, offY = 0;
  function resize(): void {
    cssW = Math.max(1, container.clientWidth);
    cssH = Math.max(1, container.clientHeight);
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    scale = Math.min(cssW / W, cssH / VIEW_H);
    offX = (cssW - W * scale) / 2;
    offY = cssH / 2 - MUZZLE_Y * scale;
    abilityBox.y = cssH - BUTTON_H - 8;
  }
  resize();
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  ro?.observe(container);
  window.addEventListener('resize', resize);

  // input: aim at the cursor while it is over the canvas
  const mouse = { x: 500, y: 300, inside: false };
  const onMove = (ev: PointerEvent): void => {
    const r = canvas.getBoundingClientRect();
    mouse.x = (ev.clientX - r.left - offX) / scale;
    mouse.y = (ev.clientY - r.top - offY) / scale;
    mouse.inside = true;
  };
  const onLeave = (): void => { mouse.inside = false; };
  function useAbility(fromButton = false): void {
    if (!ability) return;
    const nearest = ((): Point | null => {
      let best: Point | null = null;
      let bd = Infinity;
      for (const e of world.enemies) {
        if (e.dead) continue;
        const d = (e.x - MUZZLE_X) ** 2 + (e.y - MUZZLE_Y) ** 2;
        if (d < bd) { bd = d; best = { x: e.x, y: e.y }; }
      }
      return best;
    })();
    ability.use(world, caster, fromButton ? nearest : aimPoint());
  }
  let lastType = 'mouse';
  const onUp = (ev: PointerEvent): void => { if (ev.pointerType === 'touch') mouse.inside = false; };
  const onDown = (ev: PointerEvent): void => {
    lastType = ev.pointerType;
    if (ev.pointerType === 'touch') onMove(ev);
    if (ev.button !== 0 || !ability) return;
    const r = canvas.getBoundingClientRect();
    if (inButton(abilityBox, ev.clientX - r.left, ev.clientY - r.top)) useAbility(true);
  };
  const onCtx = (ev: Event): void => { ev.preventDefault(); if (lastType !== 'touch') useAbility(); };
  const onKey = (ev: KeyboardEvent): void => {
    if (!ability || (ev.code !== 'Space' && ev.key !== ' ') || ignoreHotkey(ev)) return;
    ev.preventDefault();
    useAbility();
  };
  window.addEventListener('keydown', onKey);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  canvas.addEventListener('contextmenu', onCtx);

  function aimPoint(): Point | null {
    if (mouse.inside) return { x: mouse.x, y: mouse.y };
    let best: Point | null = null;
    let bd = Infinity;
    for (const e of world.enemies) {
      if (e.dead) continue;
      const d = (e.x - MUZZLE_X) ** 2 + (e.y - MUZZLE_Y) ** 2;
      if (d < bd) { bd = d; best = { x: e.x, y: e.y }; }
    }
    return best;
  }

  function update(dt: number): void {
    world.time += dt;
    world.wardFlash = Math.max(0, world.wardFlash - dt);
    world.wardHp = world.wardMax; // nothing attacks, but never let the ward drop

    ability?.update(dt);
    caster.update(world, dt, aimPoint, null);

    for (const d of dummies) {
      if (d.e.dead) { d.e = spawnDummy(d.spec); continue; }
      if (d.spec.strafe && d.e.st.freeze <= 0) {
        d.e.y = d.spec.y + Math.sin((world.time / d.spec.strafe.period) * Math.PI * 2) * d.spec.strafe.amp;
      }
    }
    updateEnemies(world, dt, 1);
    updatePlayerProjectiles(world, dt);
    updateFx(world, dt);
    for (const d of dummies) if (!d.e.dead && d.e.hp < d.e.maxHp * REFILL_BELOW) d.e.hp = d.e.maxHp;
    sweepDead(world);

    history.push({ t: world.time, total: totalDamage() });
    while (history.length > 1 && history[0].t < world.time - WINDOW) history.shift();
  }

  function dps(): number {
    if (history.length < 2) return 0;
    const a = history[0], b = history[history.length - 1];
    const span = Math.max(1, Math.min(WINDOW, b.t - Math.max(a.t, statsStart)));
    return (b.total - a.total) / span;
  }

  const fmt = (n: number): string => Math.round(n).toLocaleString('en-US');

  function drawStats(): void {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textBaseline = 'alphabetic';
    const pad = 8;
    const box = (x: number, y: number, w: number, h: number): void => {
      ctx.fillStyle = 'rgba(8,10,22,0.62)';
      ctx.fillRect(x, y, w, h);
    };
    const total = totalDamage();
    // left: dps, total, momentum
    const ml = world.ks.momentum ? momentumLabel(world.momentum) : null;
    const lh = 15;
    const lines = 2 + (ml ? 1 : 0);
    box(pad, pad, 150, lines * lh + 12);
    ctx.textAlign = 'left';
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillStyle = '#ffe9a8';
    ctx.fillText(`DPS (${WINDOW}s)  ${fmt(dps())}`, pad + 8, pad + 8 + 11);
    ctx.fillStyle = '#d6dcff';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(`Total  ${fmt(total)}`, pad + 8, pad + 8 + 11 + lh);
    if (ml) { ctx.fillStyle = '#ffd37a'; ctx.fillText(ml, pad + 8, pad + 8 + 11 + lh * 2); }

    // right: per-shot tally
    const rows = tally().slice(0, 6);
    if (rows.length) {
      const w = 200;
      const x = cssW - w - pad;
      box(x, pad, w, rows.length * lh + 12);
      ctx.font = '12px system-ui, sans-serif';
      rows.forEach((r, i) => {
        const y = pad + 8 + 11 + i * lh;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#c4c9ee';
        let name = r.name;
        while (name.length > 3 && ctx.measureText(name).width > w - 80) name = name.slice(0, -2) + '…';
        ctx.fillText(name, x + 8, y);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`${fmt(r.dmg)}  ${total > 0 ? Math.round((r.dmg / total) * 100) : 0}%`, x + w - 8, y);
      });
    }
    if (!caster.hasShots) {
      ctx.textAlign = 'center';
      ctx.font = '600 16px system-ui, sans-serif';
      ctx.fillStyle = '#ffb86b';
      ctx.fillText('No shots — add a terminal rune', cssW / 2, cssH - 14);
    }
    ctx.textAlign = 'left';
  }

  function draw(): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#05060c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offX, dpr * offY);
    ctx.save();
    ctx.beginPath(); ctx.rect(-offX / scale, -offY / scale, cssW / scale, cssH / scale); ctx.clip();
    ctx.translate(loop.shake.x, loop.shake.y);
    const co = world.callout;
    const aim = mouse.inside ? mouse : (aimPoint() ?? caster.lastAim);
    const hud: HudState = {
      floor: PRACTICE_FLOOR, waveIdx: 0, waveTotal: 0, banner: null, overlay: null,
      charge: caster.charge, castTime: caster.castTime, hasShots: caster.hasShots, mouse,
      orbColor: caster.hasShots ? ELEMENT_COLOR[plan.shots[0].element] : '#9aa0c8',
      time: world.time, sinceCast: world.time - caster.lastCast,
      ui: Math.max(1, Math.min(1.7, 1 / scale)), hurt: 0,
      offX: -offX / scale, viewW: cssW / scale, pxScale: dpr * scale, aimX: aim.x, aimY: aim.y,
      bigCast: caster.largeCast, combo: comboState(world), momentum: null,
      callout: co ? { text: co.text, color: co.color, k: co.t / co.max } : null,
      practice: true,
    };
    render(ctx, world, hud);
    ctx.restore();
    drawStats();
    if (ability) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); drawAbilityButton(ctx, abilityBox, ability, world.time); }
  }

  const loopOpts: LoopOptions = { world, update, draw, hitStop: false, shakeMul: shakeFor() };
  const offSettings = onSettings(() => { loopOpts.shakeMul = shakeFor(); });
  const loop = createLoop(loopOpts);
  let destroyed = false;

  return {
    setSpell(p: CastPlan, _graph: SpellGraph): void {
      if (destroyed) return;
      plan = p;
      caster.setPlan(p);
      world.ks = keystoneFlags(p.keystones);
      world.momentum = 0;
      world.pprojs = [];
      world.arcs = [];
      indexNames();
      resetStats();
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      loop.destroy();
      offSettings();
      window.removeEventListener('keydown', onKey);
      canvas.removeEventListener('pointerdown', onDown);
      ro?.disconnect();
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('contextmenu', onCtx);
      canvas.remove();
      container.classList.remove('practice-root');
      setSoundFilter(null);
    },
  };
}
