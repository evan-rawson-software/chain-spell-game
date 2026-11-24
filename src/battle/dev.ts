import type { CastPlan, FloorDef, ResolvedShot } from '../types';

function shot(p: Partial<ResolvedShot> & Pick<ResolvedShot, 'element' | 'runeName'>): ResolvedShot {
  return {
    damage: 20, speed: 500, size: 7, aoeRadius: 0, count: 1, spreadDeg: 0, pierce: 0, homing: 0, chain: 0,
    statuses: [], sourceUid: p.runeName, ...p,
  };
}

/** Hand-written sample spell for testing the arena in isolation. */
export function demoPlan(): CastPlan {
  return {
    castTime: 0.9,
    manaUsed: 8,
    stagger: 0.1,
    shots: [
      shot({ element: 'fire', runeName: 'Fireball', damage: 52, size: 9, aoeRadius: 55, statuses: [{ kind: 'burn', potency: 8, duration: 3 }] }),
      shot({ element: 'frost', runeName: 'Frost Bolt', damage: 25, speed: 620, size: 6, pierce: 1, statuses: [{ kind: 'slow', potency: 0.4, duration: 3 }, { kind: 'wet', potency: 0.5, duration: 4 }] }),
      shot({ element: 'lightning', runeName: 'Chain Lightning', damage: 30, speed: 800, size: 5, chain: 3, homing: 2 }),
      shot({ element: 'nature', runeName: 'Thorn Spray', damage: 10, speed: 460, size: 5, count: 3, spreadDeg: 30, statuses: [{ kind: 'poison', potency: 5, duration: 5 }] }),
    ],
  };
}

export function demoFloor(kind: 'normal' | 'elite' | 'boss' = 'normal'): FloorDef {
  if (kind === 'boss') {
    return {
      floor: 10, kind, hpScale: 1,
      waves: [
        { groups: [{ kind: 'grunt', count: 5, at: 0, interval: 1 }] },
        { groups: [{ kind: 'boss_lich', count: 1, at: 0, interval: 1 }, { kind: 'runner', count: 4, at: 4, interval: 2 }] },
      ],
    };
  }
  if (kind === 'elite') {
    return {
      floor: 5, kind, hpScale: 1.3,
      waves: [
        { groups: [{ kind: 'grunt', count: 6, at: 0, interval: 0.8 }, { kind: 'archer', count: 2, at: 2, interval: 3 }] },
        { groups: [{ kind: 'elite_knight', count: 1, at: 0, interval: 1 }, { kind: 'shaman', count: 2, at: 3, interval: 3 }] },
      ],
    };
  }
  return {
    floor: 2, kind, hpScale: 1.1,
    waves: [
      { groups: [{ kind: 'grunt', count: 5, at: 0, interval: 1.2 }] },
      { groups: [{ kind: 'grunt', count: 4, at: 0, interval: 1 }, { kind: 'runner', count: 4, at: 2, interval: 0.8 }] },
      { groups: [{ kind: 'brute', count: 2, at: 0, interval: 3 }, { kind: 'archer', count: 2, at: 1, interval: 2 }, { kind: 'shaman', count: 1, at: 4, interval: 1 }] },
    ],
  };
}
