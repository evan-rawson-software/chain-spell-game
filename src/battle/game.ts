import type { BattleHandle, BattleOptions } from '../contracts';
import type { EnemyKind } from '../types';
import { enemyVisible, spawnEnemy, sweepDead, updateEnemies, updateEnemyProjectiles } from './enemies';
import { comboState } from './juice';
import { createCaster, createLoop, FLASH_DUR, type LoopOptions } from './core';
import { BUTTON_H, BUTTON_W, createAbility, drawAbilityButton, ignoreHotkey, inButton, type AbilityController, type ButtonBox } from './abilityfx';
import { getSettings, onSettings } from '../settings';
import { momentumLabel } from './keystones';
import { ELEMENT_COLOR, H, MUZZLE_X, MUZZLE_Y, W, newWorld, updateFx } from './model';
import { updatePlayerProjectiles } from './projectiles';
import { render, type HudState } from './render';
import { createSpellStrip } from './spellstrip';
import { sfx } from './sound';
import { HAZARD_INFO } from './rules';


type Phase = 'delay' | 'fight' | 'ending';

export function createGame(container: HTMLElement, opts: BattleOptions): BattleHandle {
  const { plan, floor, wardMaxHp, onEnd, graph, catalog } = opts;
  const canvas = document.createElement('canvas');
  canvas.className = 'battle-canvas';
  container.classList.add('battle-root');
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;

  const world = newWorld(wardMaxHp, opts.mods, plan.keystones, { hazard: floor.hazard, eliteTrait: floor.eliteTrait });
  const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const shakeFor = (): number => (reducedMotion ? 0.3 : 1) * getSettings().shake;
  const ability: AbilityController | null = opts.ability ? createAbility(opts.ability) : null;
  const abilityBox: ButtonBox = { x: 0, y: 0, w: BUTTON_W, h: BUTTON_H };
  const caster = createCaster(plan);
  const hasShots = caster.hasShots;
  const largeCast = caster.largeCast;
  const flashes = caster.flashes;
  const orbColor = hasShots ? ELEMENT_COLOR[plan.shots[0].element] : '#9aa0c8';

  // layout
  const strip = createSpellStrip(graph, catalog, plan);
  let cssW = 1, cssH = 1, dpr = 1, scale = 1, offX = 0, offY = 0;
  let stripX = 0, stripY = 0, stripW = 1, stripH = 1;
  let portrait = false; // tall phone screen: arena is width-limited, so drop the strip for room
  function resize(): void {
    cssW = Math.max(1, container.clientWidth);
    cssH = Math.max(1, container.clientHeight);
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    // reserve a band at the bottom for the spell strip (render transform only; world stays W x H)
    portrait = cssH > cssW * 1.15 && cssW < 700;
    stripH = portrait ? 0 : Math.max(cssH < 480 ? 56 : 84, Math.min(130, cssH * 0.16));
    const playH = Math.max(1, cssH - (portrait ? BUTTON_H + 28 : stripH + 8));
    scale = Math.min(cssW / W, playH / H);
    offX = (cssW - W * scale) / 2;
    offY = (playH - H * scale) / 2;
    stripW = Math.min(cssW - 16, 1100);
    stripX = (cssW - stripW) / 2;
    stripY = cssH - stripH - 6;
    if (!portrait) strip.layout(ctx, stripW, stripH);
    abilityBox.x = portrait ? 8 : stripX;
    abilityBox.y = portrait ? cssH - BUTTON_H - 10 : stripY - BUTTON_H - 8;
  }
  resize();
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  ro?.observe(container);
  window.addEventListener('resize', resize);

  // input
  const mouse = { x: 500, y: 300, inside: false };
  let mouseDown = false;
  let wantFire = 0;
  function toWorld(ev: PointerEvent): void {
    const r = canvas.getBoundingClientRect();
    mouse.x = (ev.clientX - r.left - offX) / scale;
    mouse.y = (ev.clientY - r.top - offY) / scale;
  }
  /** `fromButton`: the cursor is over the HUD, so Overcast aims at the nearest enemy instead. */
  function useAbility(fromButton = false): void {
    if (!ability || phase === 'ending') return;
    ability.use(world, caster, fromButton ? nearestTarget() : aimPoint());
  }
  let lastType = 'mouse';
  const onDown = (ev: PointerEvent): void => {
    if (ev.button !== 0) return;
    lastType = ev.pointerType;
    if (ability) {
      const r = canvas.getBoundingClientRect();
      if (inButton(abilityBox, ev.clientX - r.left, ev.clientY - r.top)) { useAbility(true); return; }
    }
    toWorld(ev);
    mouse.inside = true;
    mouseDown = true;
    wantFire = 0.3;
    try { canvas.setPointerCapture(ev.pointerId); } catch { /* ignore */ }
  };
  const onMove = (ev: PointerEvent): void => { toWorld(ev); mouse.inside = true; };
  // a lifted finger stops steering: fall back to auto-aim at the nearest enemy
  const onUp = (ev?: PointerEvent): void => { mouseDown = false; if (ev && ev.pointerType === 'touch') mouse.inside = false; };
  const onLeave = (): void => { mouse.inside = false; };
  const onCtx = (ev: Event): void => { ev.preventDefault(); if (lastType !== 'touch') useAbility(); };
  const onKey = (ev: KeyboardEvent): void => {
    if (ev.code !== 'Space' && ev.key !== ' ') return;
    if (ignoreHotkey(ev)) return;
    ev.preventDefault();
    useAbility();
  };
  window.addEventListener('keydown', onKey);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('contextmenu', onCtx);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);

  // state
  let phase: Phase = 'delay';
  let delayT = 1.5;
  let waveIdx = 0;
  let waveT = 0;
  let queue: { t: number; kind: EnemyKind; from: 'right' | 'top' | 'bottom' }[] = [];
  let hurtT = 0;
  let prevHp = world.wardHp;
  let bannerT = 0;
  const BANNER_DUR = 1.5;
  let endT = 0;
  let won = false;
  let ended = false;
  let elapsed = 0;
  let destroyed = false;
  let loop: ReturnType<typeof createLoop> | null = null;

  function startWave(): void {
    queue = [];
    for (const g of floor.waves[waveIdx].groups) {
      for (let i = 0; i < g.count; i++) queue.push({ t: g.at + i * g.interval, kind: g.kind, from: g.from ?? 'right' });
    }
    queue.sort((a, b) => a.t - b.t);
    waveT = 0;
    phase = 'fight';
    bannerT = BANNER_DUR;
    sfx('waveStart');
  }

  /** Where the next cast should go: cursor if over the canvas, else nearest on-screen enemy, else null. */
  function aimPoint(): { x: number; y: number } | null {
    if (mouse.inside) return { x: mouse.x, y: mouse.y };
    return nearestTarget();
  }

  function nearestTarget(): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bd = Infinity;
    for (const e of world.enemies) {
      if (e.dead || !enemyVisible(world, e) || e.x - e.r >= W || e.x + e.r <= 0 || e.y < 0 || e.y > H) continue;
      const d = (e.x - MUZZLE_X) ** 2 + (e.y - MUZZLE_Y) ** 2;
      if (d < bd) { bd = d; best = { x: e.x, y: e.y }; }
    }
    return best;
  }

  function finish(victory: boolean): void {
    won = victory;
    phase = 'ending';
    endT = 1.5;
    caster.clearCasts();
    mouseDown = false;
  }

  function update(dt: number): void {
    world.time += dt;
    world.wardFlash = Math.max(0, world.wardFlash - dt);
    hurtT = Math.max(0, hurtT - dt);
    bannerT = Math.max(0, bannerT - dt);
    if (world.wardHp < prevHp) hurtT = 0.5;
    prevHp = world.wardHp;
    if (phase !== 'ending') elapsed += dt;
    wantFire = Math.max(0, wantFire - dt);

    if (phase === 'ending') {
      updatePlayerProjectiles(world, dt);
      updateFx(world, dt);
      endT -= dt;
      if (endT <= 0 && !ended) {
        ended = true;
        onEnd({
          won, kills: world.kills, damageTaken: Math.round(world.damageTaken), durationSec: elapsed,
          reactions: world.reactions, bestHit: Math.round(world.bestHit),
          runeDamage: Object.fromEntries(Object.entries(world.runeDamage).map(([k, v]) => [k, Math.round(v)])),
          reactionCounts: { ...world.reactionCounts },
        });
      }
      return;
    }

    if (world.mods.wardRegen > 0 && world.wardHp > 0) {
      world.wardHp = Math.min(world.wardMax, world.wardHp + world.mods.wardRegen * dt);
    }

    ability?.update(dt);

    // casting
    const forced = (mouseDown || wantFire > 0) ? { x: mouse.x, y: mouse.y } : null;
    caster.update(world, dt, aimPoint, forced);
    if (caster.firedLastUpdate) wantFire = 0;

    // waves
    if (phase === 'delay') {
      delayT -= dt;
      if (delayT <= 0) {
        if (waveIdx >= floor.waves.length) finish(true);
        else startWave();
      }
    } else if (phase === 'fight') {
      waveT += dt;
      while (queue.length && queue[0].t <= waveT) {
        const q = queue.shift()!;
        spawnEnemy(world, q.kind, floor.hpScale, undefined, { from: q.from });
      }
    }

    updateEnemies(world, dt, floor.hpScale);
    updatePlayerProjectiles(world, dt);
    updateEnemyProjectiles(world, dt);
    updateFx(world, dt);
    sweepDead(world);

    if (world.wardHp <= 0) { finish(false); return; }
    if (phase === 'fight' && queue.length === 0 && world.enemies.length === 0) {
      waveIdx++;
      if (waveIdx >= floor.waves.length) finish(true);
      else { phase = 'delay'; delayT = 2; }
    }
  }

  function draw(): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#05060c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offX, dpr * offY);
    ctx.save();
    // clip vertically to the world; sideways overflow stays visible so entering enemies show
    ctx.beginPath(); ctx.rect(-offX / scale, 0, cssW / scale, H); ctx.clip();
    ctx.translate(loop!.shake.x, loop!.shake.y);
    const total = floor.waves.length;
    const kindName = floor.kind === 'elite' ? 'Elite' : floor.kind === 'boss' ? 'Boss' : '';
    const bk = bannerT / BANNER_DUR;
    const bAlpha = bannerT <= 0 ? 0 : Math.max(0, Math.min(1, (1 - bk) / 0.2, bk / 0.3));
    const co = world.callout;
    const aim = (mouseDown || wantFire > 0) ? mouse : (aimPoint() ?? caster.lastAim);
    const hud: HudState = {
      floor, waveIdx, waveTotal: total,
      banner: bAlpha > 0 ? {
        title: `Wave ${Math.min(waveIdx + 1, total)}`,
        sub: (kindName ? `Floor ${floor.floor} — ${kindName}` : `Floor ${floor.floor}`)
          + (floor.hazard ? ` — ${HAZARD_INFO[floor.hazard].name}: ${HAZARD_INFO[floor.hazard].desc}` : ''),
        alpha: bAlpha,
      } : null,
      overlay: phase === 'ending' ? { text: won ? 'Floor cleared' : 'The ward has shattered', good: won } : null,
      charge: caster.charge, castTime: caster.castTime, hasShots, mouse, orbColor, time: world.time,
      sinceCast: world.time - caster.lastCast,
      ui: Math.max(1, Math.min(1.7, 1 / scale)),
      hurt: Math.min(1, hurtT / 0.5),
      offX: -offX / scale, viewW: cssW / scale, pxScale: dpr * scale, aimX: aim.x, aimY: aim.y,
      bigCast: largeCast, combo: comboState(world),
      momentum: world.ks.momentum ? momentumLabel(world.momentum) : null,
      callout: co ? { text: co.text, color: co.color, k: co.t / co.max } : null,
    };
    render(ctx, world, hud);
    ctx.restore();

    // white flash (elite / boss death)
    const flashT = loop!.flashT;
    if (flashT > 0) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = `rgba(255,255,255,${(0.6 * flashT) / FLASH_DUR})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // spell strip in screen space
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!portrait) strip.draw(ctx, stripX, stripY, {
      progress: caster.charge / caster.castTime,
      ready: caster.charge >= caster.castTime,
      hasShots,
      remaining: caster.castTime - caster.charge,
      time: world.time,
      flashes,
    });
    if (ability) drawAbilityButton(ctx, abilityBox, ability, world.time);
    if (portrait) {
      ctx.fillStyle = 'rgba(196,201,238,0.75)';
      ctx.font = '13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Rotate your device for a bigger arena', cssW / 2, offY + H * scale + 24);
    }
  }

  if (floor.waves.length === 0) { delayT = 0.5; }
  const loopOpts: LoopOptions = { world, update, draw, shakeMul: shakeFor(), done: () => ended };
  const offSettings = onSettings(() => { loopOpts.shakeMul = shakeFor(); });
  loop = createLoop(loopOpts);

  return {
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      loop?.destroy();
      offSettings();
      window.removeEventListener('keydown', onKey);
      ro?.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('contextmenu', onCtx);
      canvas.remove();
      container.classList.remove('battle-root');
    },
    debug: {
      win(): void { if (phase !== 'ending') finish(true); },
      lose(): void { if (phase !== 'ending') finish(false); },
      setSpeed(x: number): void { if (loop) loop.simSpeed = Math.max(0.25, Math.min(8, Number.isFinite(x) ? x : 1)); },
    },
  };
}
