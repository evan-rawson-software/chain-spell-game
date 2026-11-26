import type { BattleHandle, BattleOptions } from '../contracts';
import type { EnemyKind } from '../types';
import { spawnEnemy, sweepDead, updateEnemies, updateEnemyProjectiles } from './enemies';
import { addTrauma, comboState, isLargeCast } from './juice';
import { ECHO_DELAY, echoDue, momentumLabel, momentumMul } from './keystones';
import { ELEMENT_COLOR, floatText, H, MUZZLE_X, MUZZLE_Y, W, newWorld, updateFx } from './model';
import { fireShot, updatePlayerProjectiles } from './projectiles';
import { render, type HudState } from './render';
import { createSpellStrip } from './spellstrip';
import { sfx } from '../audio';


type Phase = 'delay' | 'fight' | 'ending';

export function createGame(container: HTMLElement, opts: BattleOptions): BattleHandle {
  const { plan, floor, wardMaxHp, onEnd, graph, catalog } = opts;
  const canvas = document.createElement('canvas');
  canvas.className = 'battle-canvas';
  container.classList.add('battle-root');
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;

  const world = newWorld(wardMaxHp, opts.mods, plan.keystones);
  const largeCast = isLargeCast(plan.shots);
  const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const shakeMul = reducedMotion ? 0.3 : 1;
  // juice state (real-time seconds)
  let stopT = 0, stopBudget = 0.12, slowT = 0, flashT = 0;
  const FLASH_DUR = 0.45, SLOWMO_SCALE = 0.3;
  let shakeX = 0, shakeY = 0;
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
  let prevHp = world.wardHp;
  let bannerT = 0;
  const BANNER_DUR = 1.5;
  const casts: { i: number; t: number; mul: number; echo: boolean }[] = [];
  let castCount = 0;
  let simSpeed = 1;
  let lastCast = -99;
  let lastAim = { x: 500, y: 300 };
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
    sfx('waveStart');
  }

  /** Where the next cast should go: cursor if over the canvas, else nearest on-screen enemy, else null. */
  function aimPoint(): { x: number; y: number } | null {
    if (mouse.inside) return { x: mouse.x, y: mouse.y };
    let best: { x: number; y: number } | null = null;
    let bd = Infinity;
    for (const e of world.enemies) {
      if (e.dead || e.x - e.r >= W || e.x + e.r <= 0 || e.y < 0 || e.y > H) continue;
      const d = (e.x - MUZZLE_X) ** 2 + (e.y - MUZZLE_Y) ** 2;
      if (d < bd) { bd = d; best = { x: e.x, y: e.y }; }
    }
    return best;
  }

  /** Echo Glyph cue: a pulse and callout when queued, a second pulse when the echo volley fires. */
  function echoCue(fire: boolean): void {
    world.rings.push({ x: MUZZLE_X, y: MUZZLE_Y, r: 20, maxR: fire ? 95 : 70, t: 0, max: 0.4, color: '#c9a6ff' });
    if (fire) {
      world.rings.push({ x: MUZZLE_X, y: MUZZLE_Y, r: 10, maxR: 60, t: 0, max: 0.3, color: '#ffffff' });
      sfx('castFire', { pitch: 1.25 });
    } else {
      floatText(world, MUZZLE_X + 40, MUZZLE_Y - 60, 'ECHO', '#c9a6ff', 20, 1, true);
    }
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
        });
      }
      return;
    }

    if (world.mods.wardRegen > 0 && world.wardHp > 0) {
      world.wardHp = Math.min(world.wardMax, world.wardHp + world.mods.wardRegen * dt);
    }

    // casting
    charge = Math.min(castTime, charge + dt);
    if (hasShots && charge >= castTime) {
      const target = (mouseDown || wantFire > 0) ? { x: mouse.x, y: mouse.y } : aimPoint();
      if (target) {
        lastAim = target;
        charge = 0;
        wantFire = 0;
        lastCast = world.time;
        const mul = world.ks.momentum ? momentumMul(world.momentum) : 1;
        if (world.ks.momentum) world.momentum++;
        casts.push({ i: 0, t: 0, mul, echo: false });
        castCount++;
        if (world.ks.echo && echoDue(castCount)) {
          casts.push({ i: 0, t: ECHO_DELAY, mul, echo: true });
          echoCue(false);
        }
        sfx('castFire');
        if (largeCast) addTrauma(world, 0.2);
      }
    }
    for (const c of casts) {
      c.t -= dt;
      while (c.t <= 0 && c.i < plan.shots.length) {
        const a = aimPoint() ?? lastAim;
        lastAim = a;
        if (c.echo && c.i === 0) echoCue(true);
        fireShot(world, plan.shots[c.i], a.x, a.y, c.mul);
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
    ctx.translate(shakeX, shakeY);
    const total = floor.waves.length;
    const kindName = floor.kind === 'elite' ? 'Elite' : floor.kind === 'boss' ? 'Boss' : '';
    const bk = bannerT / BANNER_DUR;
    const bAlpha = bannerT <= 0 ? 0 : Math.max(0, Math.min(1, (1 - bk) / 0.2, bk / 0.3));
    const co = world.callout;
    const aim = (mouseDown || wantFire > 0) ? mouse : (aimPoint() ?? lastAim);
    const hud: HudState = {
      floor, waveIdx, waveTotal: total,
      banner: bAlpha > 0 ? {
        title: `Wave ${Math.min(waveIdx + 1, total)}`,
        sub: kindName ? `Floor ${floor.floor} — ${kindName}` : `Floor ${floor.floor}`,
        alpha: bAlpha,
      } : null,
      overlay: phase === 'ending' ? { text: won ? 'Floor cleared' : 'The ward has shattered', good: won } : null,
      charge, castTime, hasShots, mouse, orbColor, time: world.time,
      sinceCast: world.time - lastCast,
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
    if (flashT > 0) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = `rgba(255,255,255,${(0.6 * flashT) / FLASH_DUR})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

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
    const realDt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;

    // juice runs on real time: shake decay, hit-stop (rate-limited), slow motion, flash
    if (world.hitStopReq > 0) {
      const grant = Math.min(world.hitStopReq, stopBudget);
      stopBudget -= grant;
      stopT = Math.min(0.12, stopT + grant);
      world.hitStopReq = 0;
    }
    stopBudget = Math.min(0.12, stopBudget + realDt * 0.24);
    if (world.slowmoReq > 0) { slowT = Math.max(slowT, world.slowmoReq); world.slowmoReq = 0; }
    if (world.flashReq > 0) { flashT = FLASH_DUR * world.flashReq; world.flashReq = 0; }
    world.trauma = Math.max(0, world.trauma - realDt * 1.3);
    flashT = Math.max(0, flashT - realDt);
    const mag = world.trauma * world.trauma * 12 * shakeMul;
    shakeX = mag > 0.01 ? (Math.random() * 2 - 1) * mag : 0;
    shakeY = mag > 0.01 ? (Math.random() * 2 - 1) * mag : 0;

    let dt = realDt;
    if (stopT > 0) { stopT -= realDt; dt = 0; }
    else if (slowT > 0) dt = realDt * SLOWMO_SCALE;
    slowT = Math.max(0, slowT - realDt);
    // sub-step so a fast-forwarded frame stays stable (steps of at most 0.05 s)
    let rem = dt * simSpeed;
    while (rem > 1e-6) {
      const step = Math.min(0.05, rem);
      update(step);
      rem -= step;
    }
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
    debug: {
      win(): void { if (phase !== 'ending') finish(true); },
      lose(): void { if (phase !== 'ending') finish(false); },
      setSpeed(x: number): void { simSpeed = Math.max(0.25, Math.min(8, Number.isFinite(x) ? x : 1)); },
    },
  };
}
