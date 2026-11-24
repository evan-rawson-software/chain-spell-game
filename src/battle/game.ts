import type { BattleHandle, BattleOptions } from '../contracts';
import type { EnemyKind } from '../types';
import { spawnEnemy, sweepDead, updateEnemies, updateEnemyProjectiles } from './enemies';
import { ELEMENT_COLOR, H, W, newWorld, updateFx } from './model';
import { fireShot, updatePlayerProjectiles } from './projectiles';
import { render, type HudState } from './render';
import { createSpellStrip } from './spellstrip';


type Phase = 'delay' | 'fight' | 'ending';

export function createGame(container: HTMLElement, opts: BattleOptions): BattleHandle {
  const { plan, floor, wizardMaxHp, onEnd, graph, catalog } = opts;
  const canvas = document.createElement('canvas');
  canvas.className = 'battle-canvas';
  container.classList.add('battle-root');
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;

  const world = newWorld(wizardMaxHp);
  const castTime = Math.max(0.05, plan.castTime);
  const stagger = Math.max(0, plan.stagger);
  const hasShots = plan.shots.length > 0;
  const orbColor = hasShots ? ELEMENT_COLOR[plan.shots[0].element] : '#9aa0c8';

  // layout
  const strip = createSpellStrip(graph, catalog, plan);
  const flashes = new Map<string, number>();
  let cssW = 1, cssH = 1, dpr = 1, scale = 1, offX = 0, offY = 0;
  let stripX = 0, stripY = 0, stripW = 1, stripH = 1;
  function resize(): void {
    cssW = Math.max(1, container.clientWidth);
    cssH = Math.max(1, container.clientHeight);
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    // reserve a band at the bottom for the spell strip (render transform only; world stays W x H)
    stripH = Math.max(84, Math.min(130, cssH * 0.16));
    const playH = Math.max(1, cssH - stripH - 8);
    scale = Math.min(cssW / W, playH / H);
    offX = (cssW - W * scale) / 2;
    offY = (playH - H * scale) / 2;
    stripW = Math.min(cssW - 16, 1100);
    stripX = (cssW - stripW) / 2;
    stripY = cssH - stripH - 6;
    strip.layout(ctx, stripW, stripH);
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
  const onDown = (ev: PointerEvent): void => {
    if (ev.button !== 0) return;
    toWorld(ev);
    mouseDown = true;
    wantFire = 0.3;
    try { canvas.setPointerCapture(ev.pointerId); } catch { /* ignore */ }
  };
  const onMove = (ev: PointerEvent): void => { toWorld(ev); mouse.inside = true; };
  const onUp = (): void => { mouseDown = false; };
  const onLeave = (): void => { mouse.inside = false; };
  const onCtx = (ev: Event): void => ev.preventDefault();
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
  let queue: { t: number; kind: EnemyKind }[] = [];
  let charge = 0;
  let hurtT = 0;
  let prevHp = world.wizHp;
  let bannerT = 0;
  const BANNER_DUR = 1.5;
  const casts: { i: number; t: number }[] = [];
  let endT = 0;
  let won = false;
  let ended = false;
  let elapsed = 0;
  let paused = document.hidden;
  let destroyed = false;
  let raf = 0;
  let last = 0;

  function startWave(): void {
    queue = [];
    for (const g of floor.waves[waveIdx].groups) {
      for (let i = 0; i < g.count; i++) queue.push({ t: g.at + i * g.interval, kind: g.kind });
    }
    queue.sort((a, b) => a.t - b.t);
    waveT = 0;
    phase = 'fight';
    bannerT = BANNER_DUR;
  }

  function finish(victory: boolean): void {
    won = victory;
    phase = 'ending';
    endT = 1.5;
    casts.length = 0;
    mouseDown = false;
  }

  function update(dt: number): void {
    world.time += dt;
    world.wizFlash = Math.max(0, world.wizFlash - dt);
    hurtT = Math.max(0, hurtT - dt);
    bannerT = Math.max(0, bannerT - dt);
    if (world.wizHp < prevHp) hurtT = 0.5;
    prevHp = world.wizHp;
    if (phase !== 'ending') elapsed += dt;
    wantFire = Math.max(0, wantFire - dt);

    if (phase === 'ending') {
      updatePlayerProjectiles(world, dt);
      updateFx(world, dt);
      endT -= dt;
      if (endT <= 0 && !ended) {
        ended = true;
        onEnd({ won, kills: world.kills, damageTaken: Math.round(world.damageTaken), durationSec: elapsed });
      }
      return;
    }

    // casting
    charge = Math.min(castTime, charge + dt);
    if (hasShots && charge >= castTime && (mouseDown || wantFire > 0)) {
      charge = 0;
      wantFire = 0;
      casts.push({ i: 0, t: 0 });
    }
    for (const c of casts) {
      c.t -= dt;
      while (c.t <= 0 && c.i < plan.shots.length) {
        fireShot(world, plan.shots[c.i], mouse.x, mouse.y);
        flashes.set(plan.shots[c.i].sourceUid, world.time);
        c.i++;
        c.t += stagger;
      }
    }
    for (let i = casts.length - 1; i >= 0; i--) if (casts[i].i >= plan.shots.length) casts.splice(i, 1);

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
        spawnEnemy(world, queue.shift()!.kind, floor.hpScale);
      }
    }

    updateEnemies(world, dt, floor.hpScale);
    updatePlayerProjectiles(world, dt);
    updateEnemyProjectiles(world, dt);
    updateFx(world, dt);
    sweepDead(world);

    if (world.wizHp <= 0) { finish(false); return; }
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
    const total = floor.waves.length;
    const kindName = floor.kind === 'elite' ? 'Elite' : floor.kind === 'boss' ? 'Boss' : '';
    const bk = bannerT / BANNER_DUR;
    const bAlpha = bannerT <= 0 ? 0 : Math.max(0, Math.min(1, (1 - bk) / 0.2, bk / 0.3));
    const hud: HudState = {
      floor, waveIdx, waveTotal: total,
      banner: bAlpha > 0 ? {
        title: `Wave ${Math.min(waveIdx + 1, total)}`,
        sub: kindName ? `Floor ${floor.floor} — ${kindName}` : `Floor ${floor.floor}`,
        alpha: bAlpha,
      } : null,
      overlay: phase === 'ending' ? { text: won ? 'Floor cleared' : 'The wizard has fallen', good: won } : null,
      charge, castTime, hasShots, mouse, orbColor, time: world.time,
      ui: Math.max(1, Math.min(1.7, 1 / scale)),
      hurt: Math.min(1, hurtT / 0.5),
      offX: -offX / scale, viewW: cssW / scale,
    };
    render(ctx, world, hud);
    ctx.restore();

    // spell strip in screen space
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    strip.draw(ctx, stripX, stripY, {
      progress: castTime > 0 ? charge / castTime : 0,
      ready: charge >= castTime,
      hasShots,
      remaining: castTime - charge,
      time: world.time,
      flashes,
    });
  }

  function frame(now: number): void {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    if (paused) { last = 0; return; }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    update(dt);
    draw();
    if (ended) { cancelAnimationFrame(raf); raf = 0; }
  }

  const onVis = (): void => { paused = document.hidden; last = 0; };
  document.addEventListener('visibilitychange', onVis);
  if (floor.waves.length === 0) { delayT = 0.5; }
  raf = requestAnimationFrame(frame);

  return {
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      if (raf) cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.removeEventListener('visibilitychange', onVis);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('contextmenu', onCtx);
      canvas.remove();
      container.classList.remove('battle-root');
    },
  };
}
