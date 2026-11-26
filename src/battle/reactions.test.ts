import { describe, expect, it } from 'vitest';
import {
  consumeStatuses, markTriggered, planReactions, reactionMult, readyPlans, REACTION_COOLDOWN,
  type ReactionKind,
} from './reactions';
import type { StatusState } from './model';
import type { Element } from '../types';

const newStatus = (): StatusState => ({ burn: null, poison: [], slow: null, freeze: 0, wet: null, weaken: null });

function st(p: Partial<StatusState> = {}): StatusState {
  return { ...newStatus(), ...p };
}
const kinds = (s: StatusState, el: Element): ReactionKind[] => planReactions(s, el).map(p => p.kind);
const one = (s: StatusState, el: Element, k: ReactionKind) => planReactions(s, el).find(p => p.kind === k);

describe('reaction table', () => {
  it('no statuses, no reactions', () => {
    for (const el of ['fire', 'frost', 'nature', 'lightning', 'arcane', 'storm', 'pure'] as Element[]) {
      expect(planReactions(st(), el)).toEqual([]);
    }
  });

  it('shatter: freeze + any non-frost hit = x2, consumes freeze', () => {
    for (const el of ['fire', 'nature', 'lightning', 'arcane', 'storm', 'pure'] as Element[]) {
      const p = one(st({ freeze: 2 }), el, 'shatter');
      expect(p?.mult).toBe(2);
      expect(p?.consume).toEqual(['freeze']);
    }
  });

  it('frost does not shatter', () => {
    expect(kinds(st({ freeze: 2 }), 'frost')).toEqual([]);
  });

  it('melt: slow + fire = x1.5, consumes slow; not for other elements', () => {
    const s = st({ slow: { p: 0.3, t: 2 } });
    const p = one(s, 'fire', 'melt');
    expect(p?.mult).toBe(1.5);
    expect(p?.consume).toEqual(['slow']);
    expect(kinds(s, 'frost')).toEqual([]);
    expect(kinds(s, 'nature')).toEqual([]);
  });

  it('steam: burn + frost makes a cloud and consumes burn', () => {
    const p = one(st({ burn: { dps: 5, t: 2 } }), 'frost', 'steam');
    expect(p?.mult).toBe(1);
    expect(p?.extra).toEqual({ type: 'cloud', radius: 80, wet: { p: 0.5, t: 3 }, slow: { p: 0.3, t: 2 } });
    expect(p?.consume).toEqual(['burn']);
  });

  it('combust: poison + fire = remaining poison x1.5, consumes poison', () => {
    const s = st({ poison: [{ dps: 4, t: 3 }, { dps: 2, t: 5 }] }); // 12 + 10 = 22
    const p = one(s, 'fire', 'combust');
    expect(p?.extra).toEqual({ type: 'combust', radius: 80, damage: 33 });
    expect(p?.consume).toEqual(['poison']);
    expect(kinds(s, 'frost')).toEqual([]);
  });

  it('wildfire: burn + nature spreads the burn, consumes nothing', () => {
    const p = one(st({ burn: { dps: 6, t: 2.5 } }), 'nature', 'wildfire');
    expect(p?.extra).toEqual({ type: 'spread', radius: 100, burn: { dps: 6, t: 2.5 } });
    expect(p?.consume).toEqual([]);
  });

  it('electrocute: wet + lightning arcs at 50% within 180, consumes wet', () => {
    const p = one(st({ wet: { p: 0.5, t: 3 } }), 'lightning', 'electrocute');
    expect(p?.extra).toEqual({ type: 'arcs', radius: 180, frac: 0.5 });
    expect(p?.consume).toEqual(['wet']);
    expect(kinds(st({ wet: { p: 0.5, t: 3 } }), 'storm')).toEqual([]);
  });

  it('overload: burn + lightning blasts r70 for 40%, consumes burn', () => {
    const p = one(st({ burn: { dps: 3, t: 2 } }), 'lightning', 'overload');
    expect(p?.extra).toEqual({ type: 'blast', radius: 70, frac: 0.4 });
    expect(p?.consume).toEqual(['burn']);
  });

  it('unravel: needs 2+ status kinds, +25% per kind, consumes all', () => {
    expect(kinds(st({ burn: { dps: 3, t: 2 } }), 'arcane')).toEqual([]);
    const two = st({ burn: { dps: 3, t: 2 }, slow: { p: 0.3, t: 2 } });
    expect(one(two, 'arcane', 'unravel')?.mult).toBeCloseTo(1.5);
    const three = st({ burn: { dps: 3, t: 2 }, slow: { p: 0.3, t: 2 }, weaken: { p: 0.2, t: 2 } });
    const p = one(three, 'arcane', 'unravel')!;
    expect(p.mult).toBeCloseTo(1.75);
    expect(p.consume.sort()).toEqual(['burn', 'slow', 'weaken']);
    // several poison stacks are still one kind
    expect(kinds(st({ poison: [{ dps: 1, t: 1 }, { dps: 1, t: 1 }] }), 'arcane')).toEqual([]);
    // non-arcane never unravels
    expect(kinds(two, 'pure')).not.toContain('unravel');
  });

  it('several reactions can fire on one hit', () => {
    const s = st({ freeze: 1, slow: { p: 0.3, t: 2 } });
    expect(kinds(s, 'fire')).toEqual(['shatter', 'melt']);
    expect(reactionMult(planReactions(s, 'fire'))).toBeCloseTo(3);
  });
});

describe('multiplier and consumption', () => {
  it('reactionDamageMul scales only the bonus portion', () => {
    const plans = planReactions(st({ freeze: 1 }), 'fire'); // x2
    expect(reactionMult(plans, 1)).toBe(2);
    expect(reactionMult(plans, 1.5)).toBe(2.5);
    expect(reactionMult(plans, 0)).toBe(1);
    expect(reactionMult([], 3)).toBe(1);
  });

  it('consumeStatuses clears the named statuses only', () => {
    const s = st({
      burn: { dps: 1, t: 1 }, poison: [{ dps: 1, t: 1 }], slow: { p: 0.3, t: 1 }, freeze: 2,
      wet: { p: 0.5, t: 1 }, weaken: { p: 0.2, t: 1 },
    });
    consumeStatuses(s, ['freeze', 'burn']);
    expect(s.freeze).toBe(0);
    expect(s.burn).toBeNull();
    expect(s.poison.length).toBe(1);
    expect(s.slow).not.toBeNull();
    consumeStatuses(s, ['poison', 'slow', 'wet', 'weaken']);
    expect(s).toEqual(newStatus());
  });
});

describe('cooldown', () => {
  it('blocks the same kind briefly, then allows it again', () => {
    const plans = planReactions(st({ burn: { dps: 5, t: 3 } }), 'nature');
    const reactAt: Record<string, number> = {};
    expect(readyPlans(plans, reactAt, 1)).toHaveLength(1);
    markTriggered(plans, reactAt, 1);
    expect(readyPlans(plans, reactAt, 1 + REACTION_COOLDOWN / 2)).toHaveLength(0);
    expect(readyPlans(plans, reactAt, 1 + REACTION_COOLDOWN + 0.001)).toHaveLength(1);
  });
});
