/**
 * Active ability in a running battle or the practice range: cooldown state, applying the ability to
 * the World (visuals, sfx, damage), and the clickable HUD button. Decisions live in ability.ts.
 */
import type { AbilityId } from '../types';
import {
  ABILITY_INFO, OVERCAST_CHARGE_MUL, PULSE_RADIUS, PULSE_SLOW, cooldownAfterUse, cooldownFrac, detonateParts,
  pulseCatches, pulseKnock, tickCooldown,
} from './ability';
import type { Caster, Point } from './core';
import { damageEnemy } from './enemies';
import { addTrauma, requestHitStop } from './juice';
import { MUZZLE_X, MUZZLE_Y, WARD_X, WARD_Y, burst, floatText, type World } from './model';
import { activeStatuses, consumeStatuses } from './reactions';
import { sfx } from './sound';
import { applyStatus } from './status';
import { hazardSlowMul } from './rules';

export interface AbilityController {
  readonly id: AbilityId;
  /** Seconds of cooldown left (0 = ready). */
  readonly left: number;
  readonly ready: boolean;
  /** 0..1 cooldown progress (1 = ready). */
  readonly frac: number;
  /** World time of the last use, for the button flash. */
  readonly lastUse: number;
  update(dt: number): void;
  /** Try to use it: false if on cooldown or it would do nothing (a Detonate with no statuses). */
  use(w: World, caster: Caster, aim: Point | null): boolean;
}

export function createAbility(id: AbilityId): AbilityController {
  let left = 0; // a fight starts with the ability ready
  let lastUse = -99;
  const ctl: AbilityController = {
    id,
    get left() { return left; },
    get ready() { return left <= 0; },
    get frac() { return cooldownFrac(id, left); },
    get lastUse() { return lastUse; },
    update(dt: number): void { left = tickCooldown(left, dt); },
    use(w, caster, aim): boolean {
      if (left > 0) return false;
      const ok = id === 'overcast' ? overcast(w, caster, aim)
        : id === 'ward_pulse' ? wardPulse(w)
        : detonate(w);
      if (!ok) { sfx('uiError'); return false; }
      left = cooldownAfterUse(id);
      lastUse = w.time;
      return true;
    },
  };
  return ctl;
}

function callout(w: World, text: string, color: string): void {
  w.callout = { text, color, t: 0, max: 1.3 };
}

function overcast(w: World, caster: Caster, aim: Point | null): boolean {
  const color = ABILITY_INFO.overcast.color;
  if (!caster.castNow(w, aim ?? caster.lastAim, OVERCAST_CHARGE_MUL)) {
    floatText(w, MUZZLE_X + 40, MUZZLE_Y - 60, 'NO SHOTS', '#ffb86b', 18, 1, true);
    return false;
  }
  const rings: [number, number, number, string][] = [[20, 170, 0.45, color], [10, 110, 0.35, '#ffffff'], [30, 240, 0.6, '#ff8a3a']];
  for (const [r0, r1, t, c] of rings) {
    w.rings.push({ x: MUZZLE_X, y: MUZZLE_Y, r: r0, maxR: r1, t: 0, max: t, color: c });
  }
  burst(w, MUZZLE_X, MUZZLE_Y, color, 40, 340, 0.6, 3);
  addTrauma(w, 0.55);
  requestHitStop(w, 0.05);
  callout(w, 'OVERCAST', color);
  floatText(w, MUZZLE_X + 40, MUZZLE_Y - 64, 'NEXT CHARGE SLOWED', '#ffb870', 14, 1.2, true);
  sfx('castFire', { pitch: 0.7 });
  sfx('reaction', { pitch: 1.5 });
  return true;
}

function wardPulse(w: World): boolean {
  const color = ABILITY_INFO.ward_pulse.color;
  for (const e of w.enemies) {
    if (e.dead) continue;
    const k = pulseKnock(e.x, e.y, e.r, WARD_X, WARD_Y);
    if (!k.hit) continue;
    if (e.cfg.speed > 0) { e.kbX += k.dx; e.kbY += k.dy; } // fixed turrets and dummies stay put
    applyStatus(e, { kind: 'slow', potency: PULSE_SLOW.p, duration: PULSE_SLOW.t }, { slowMul: hazardSlowMul(w.hazard) });
    burst(w, e.x, e.y, color, 6, 160, 0.4, 2.2);
  }
  let shots = 0;
  for (const p of w.eprojs) {
    if (p.dead || !pulseCatches(p.x, p.y, WARD_X, WARD_Y)) continue;
    p.dead = true;
    shots++;
    burst(w, p.x, p.y, p.color, 5, 110, 0.3, 2);
  }
  w.rings.push({ x: WARD_X, y: WARD_Y, r: 30, maxR: PULSE_RADIUS, t: 0, max: 0.55, color });
  w.rings.push({ x: WARD_X, y: WARD_Y, r: 20, maxR: PULSE_RADIUS * 0.7, t: 0, max: 0.4, color: '#ffffff' });
  w.rings.push({ x: WARD_X, y: WARD_Y, r: 10, maxR: PULSE_RADIUS * 1.05, t: 0, max: 0.7, color: '#3a8cff' });
  burst(w, WARD_X, WARD_Y, color, 44, 420, 0.6, 3);
  addTrauma(w, 0.6);
  callout(w, 'WARD PULSE', color);
  if (shots > 0) floatText(w, WARD_X + 120, WARD_Y - 70, `${shots} SHOT${shots > 1 ? 'S' : ''} DESTROYED`, '#ffffff', 14, 1.1, true);
  sfx('explosion', { pitch: 0.85 });
  sfx('hitFrost', { pitch: 0.8 });
  return true; // always usable: it doubles as a panic button
}

function detonate(w: World): boolean {
  const color = ABILITY_INFO.detonate.color;
  const rdm = w.mods.reactionDamageMul;
  let hit = 0;
  for (const e of w.enemies) {
    if (e.dead) continue;
    const parts = detonateParts(e.st, rdm);
    if (!parts.length) continue;
    hit++;
    // consume first so the Wet / Weaken bonuses do not double-dip; it never triggers reactions
    consumeStatuses(e.st, activeStatuses(e.st));
    const x = e.x, y = e.y, r = e.r;
    for (const part of parts) damageEnemy(w, e, part.damage, part.element, false, { reaction: true });
    w.rings.push({ x, y, r: r * 0.6, maxR: r * 2.6 + 30, t: 0, max: 0.45, color });
    w.rings.push({ x, y, r: r * 0.3, maxR: r * 1.6, t: 0, max: 0.3, color: '#ffffff' });
    burst(w, x, y, color, 22, 260, 0.55, 3);
  }
  if (hit === 0) {
    floatText(w, WARD_X + 70, WARD_Y - 60, 'NO STATUSES', '#ffb86b', 18, 1, true);
    return false;
  }
  addTrauma(w, Math.min(0.9, 0.4 + hit * 0.08));
  requestHitStop(w, 0.06);
  callout(w, `DETONATE ×${hit}`, color);
  sfx('explosion', { pitch: 0.7 });
  sfx('shatter');
  return true;
}

// ---------------------------------------------------------------- HUD button

export const BUTTON_W = 168;
export const BUTTON_H = 44;

export interface ButtonBox { x: number; y: number; w: number; h: number }

export function inButton(b: ButtonBox, px: number, py: number): boolean {
  return px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h;
}

/** Draws the ability button in screen space: name, cooldown sweep, key hint. */
export function drawAbilityButton(ctx: CanvasRenderingContext2D, b: ButtonBox, a: AbilityController, time: number): void {
  const info = ABILITY_INFO[a.id];
  const ready = a.ready;
  const pulse = 0.5 + 0.5 * Math.sin(time * 6);
  const since = time - a.lastUse;
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  if (ready) { ctx.shadowColor = info.color; ctx.shadowBlur = 8 + 8 * pulse; }
  ctx.fillStyle = 'rgba(10,12,26,0.82)';
  rrect(ctx, b.x, b.y, b.w, b.h, 8); ctx.fill();
  ctx.shadowBlur = 0;
  // cooldown sweep: the filled part grows left to right as it recharges
  ctx.save();
  rrect(ctx, b.x, b.y, b.w, b.h, 8); ctx.clip();
  ctx.fillStyle = ready ? info.color + '33' : info.color + '55';
  ctx.fillRect(b.x, b.y, b.w * a.frac, b.h);
  if (!ready) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(b.x + b.w * a.frac, b.y, b.w * (1 - a.frac), b.h);
  }
  if (since >= 0 && since < 0.4) {
    ctx.fillStyle = `rgba(255,255,255,${0.5 * (1 - since / 0.4)})`;
    ctx.fillRect(b.x, b.y, b.w, b.h);
  }
  ctx.restore();
  ctx.lineWidth = ready ? 2 : 1.2;
  ctx.strokeStyle = ready ? info.color : 'rgba(200,205,240,0.4)';
  rrect(ctx, b.x, b.y, b.w, b.h, 8); ctx.stroke();

  ctx.textAlign = 'left';
  ctx.font = '700 15px system-ui, sans-serif';
  ctx.fillStyle = ready ? '#ffffff' : '#a8aed0';
  ctx.fillText(info.name, b.x + 12, b.y + 20);
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillStyle = ready ? info.color : '#8a90b8';
  ctx.fillText(ready ? 'READY' : `${a.left.toFixed(1)}s`, b.x + 12, b.y + 36);
  // key hint
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  rrect(ctx, b.x + b.w - 62, b.y + 8, 54, 20, 5); ctx.fill();
  ctx.fillStyle = '#d6dcff';
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(typeof matchMedia === 'function' && matchMedia('(hover: none)').matches ? 'TAP' : 'SPACE', b.x + b.w - 35, b.y + 22);
  ctx.restore();
}

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** True when a key event should be ignored by the ability hotkey (typing in a field, held key). */
export function ignoreHotkey(ev: KeyboardEvent): boolean {
  if (ev.repeat) return true;
  const t = ev.target as HTMLElement | null;
  if (!t || typeof t.tagName !== 'string') return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || t.isContentEditable === true;
}
