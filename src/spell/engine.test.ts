import { describe, expect, it } from 'vitest';
import type { Color, RuneCatalog, RuneDef, ShotBase, SpellGraph } from '../types';
import type { Placement } from '../contracts';
import {
  colorsCombine, compileSpell, engine, findPlacements, openOutputs, placeRune, removeRune, validateSpell,
  upgradeDef, defOf,
} from './index';

const shot = (over: Partial<ShotBase> = {}): ShotBase => ({
  element: 'fire', damage: 10, speed: 100, size: 5, aoeRadius: 0, count: 1, spreadDeg: 0,
  pierce: 0, homing: 0, chain: 0, statuses: [], ...over,
});

const def = (id: string, over: Partial<RuneDef>): RuneDef => ({
  id, name: id, description: '', rarity: 'common', inputs: [], outputs: [], mana: 1, castTime: 0.1, ...over,
});

const CAT: RuneCatalog = {
  source: def('source', { inputs: [], outputs: ['R', 'B'], mana: 0, castTime: 0.5 }),
  amp: def('amp', {
    inputs: ['R'], outputs: ['R'], mana: 2,
    augments: [{ stat: 'damage', op: 'increased', value: 0.3 }],
  }),
  bamp: def('bamp', {
    inputs: ['B'], outputs: ['B'],
    augments: [{ stat: 'damage', op: 'increased', value: 0.2 }],
  }),
  dup: def('dup', { inputs: ['R'], outputs: ['R', 'R'] }),
  mixer: def('mixer', {
    inputs: ['R', 'B'], outputs: ['P'],
    augments: [{ stat: 'damage', op: 'more', value: 1 }],
  }),
  mixerP: def('mixerP', { inputs: ['P'], outputs: ['P'] }),
  fire: def('fire', { inputs: ['R'], shot: shot({ damage: 40 }) }),
  frost: def('frost', { inputs: ['B'], shot: shot({ element: 'frost', damage: 25 }) }),
  arc: def('arc', { inputs: ['P'], shot: shot({ element: 'arcane', damage: 10 }) }),
  triple: def('triple', { inputs: ['R', 'R', 'B'], shot: shot({ damage: 5 }) }),
  white: def('white', { inputs: ['W'], shot: shot({ element: 'pure' }) }),
  thorn: def('thorn', { inputs: ['G'], shot: shot({ element: 'nature' }) }),
  catalyst: def('catalyst', {
    inputs: ['R'],
    globals: [{ stat: 'damage', op: 'increased', value: 0.5 }],
  }),
  fireOnly: def('fireOnly', {
    inputs: ['R'], outputs: ['R'],
    augments: [{ stat: 'damage', op: 'flat', value: 100, element: 'fire' }],
  }),
  sourceG: def('sourceG', { inputs: [], outputs: ['R', 'G'], mana: 0, castTime: 0.5 }),
  quick: def('quick', {
    inputs: ['R'], outputs: ['R'], castTime: -5,
  }),
  thrift: def('thrift', {
    inputs: ['R'], outputs: ['R'], mana: 1,
    augments: [{ stat: 'manaCost', op: 'flat', value: -1 }],
  }),
  slower: def('slower', {
    inputs: ['R'], outputs: ['R'], castTime: 0.2,
    augments: [{ stat: 'castTime', op: 'more', value: 1 }],
  }),
  multi: def('multi', {
    inputs: ['R'],
    shot: shot({
      count: 2, statuses: [{ kind: 'burn', potency: 4, duration: 3 }],
    }),
    globals: [{ stat: 'count', op: 'flat', value: 1.4 }, { stat: 'statusPotency', op: 'increased', value: 0.5 },
      { stat: 'statusDuration', op: 'flat', value: 1 }],
  }),
  freeMana: def('freeMana', {
    inputs: ['B'], mana: 0,
    globals: [{ stat: 'manaCost', op: 'flat', value: -5 }],
  }),
};

const rootGraph = (rootDef = 'source'): SpellGraph => ({
  rootUid: 'root', nodes: [{ uid: 'root', defId: rootDef }], links: [],
});

/** Place the first placement matching a predicate (default: first). */
function add(g: SpellGraph, uid: string, defId: string, pick?: (p: Placement) => boolean): SpellGraph {
  const ps = findPlacements(g, CAT, CAT[defId]);
  const p = pick ? ps.find(pick) : ps[0];
  if (!p) throw new Error(`no placement for ${defId}`);
  return placeRune(g, CAT, { uid, defId }, p);
}
const from = (uid: string, output = 0) => (p: Placement) =>
  p.inputs.some((g) => g.some((r) => r.uid === uid && r.output === output));

describe('colorsCombine', () => {
  it('combines complex colors', () => {
    expect(colorsCombine(['R', 'B'], 'P')).toBe(true);
    expect(colorsCombine(['B', 'R'], 'P')).toBe(true);
    expect(colorsCombine(['Y', 'B'], 'W')).toBe(true);
    expect(colorsCombine(['R', 'G', 'B'], 'W')).toBe(true);
    expect(colorsCombine(['R', 'G'], 'Y')).toBe(true);
    expect(colorsCombine(['G', 'B'], 'T')).toBe(true);
  });
  it('rejects bad combos', () => {
    expect(colorsCombine(['R', 'R'], 'P')).toBe(false);
    expect(colorsCombine(['R'], 'R')).toBe(false);
    expect(colorsCombine([], 'R')).toBe(false);
    expect(colorsCombine(['R', 'B'], 'W')).toBe(false);
    expect(colorsCombine(['P', 'R'], 'W')).toBe(false); // overlap
    expect(colorsCombine(['R', 'G'], 'P')).toBe(false); // G not subset of P
  });
});

describe('openOutputs & placements', () => {
  it('lists open outputs of the root with level 0', () => {
    const o = openOutputs(rootGraph(), CAT);
    expect(o).toEqual([
      { uid: 'root', output: 0, color: 'R', level: 0 },
      { uid: 'root', output: 1, color: 'B', level: 0 },
    ]);
  });

  it('single-color placements are strict', () => {
    const ps = findPlacements(rootGraph(), CAT, CAT.fire);
    expect(ps).toHaveLength(1);
    expect(ps[0]).toEqual({ inputs: [[{ uid: 'root', output: 0 }]], level: 1 });
    expect(findPlacements(rootGraph(), CAT, CAT.frost)[0].inputs[0][0].output).toBe(1);
  });

  it('returns [] for a def with no inputs and for impossible colors', () => {
    expect(findPlacements(rootGraph(), CAT, CAT.source)).toEqual([]);
    expect(findPlacements(rootGraph(), CAT, CAT.white)).toEqual([]);
  });

  it('a P output feeds R or B inputs (its components) but not G or W', () => {
    let g = add(rootGraph(), 'a', 'amp');
    g = add(g, 'b', 'bamp');
    g = add(g, 'm', 'mixer');
    const open = openOutputs(g, CAT).filter((o) => o.uid === 'm');
    expect(open[0].color).toBe('P');
    const fromM = (p: Placement) => p.inputs.some((grp) => grp.length === 1 && grp[0].uid === 'm');
    expect(findPlacements(g, CAT, CAT.fire).some(fromM)).toBe(true);
    expect(findPlacements(g, CAT, CAT.frost).some(fromM)).toBe(true);
    expect(findPlacements(g, CAT, CAT.arc).some(fromM)).toBe(true);
    expect(findPlacements(g, CAT, CAT.thorn).some(fromM)).toBe(false);
    expect(findPlacements(g, CAT, CAT.white).some(fromM)).toBe(false);
    // and the resulting graph validates
    g = add(g, 'f', 'fire', fromM);
    expect(validateSpell(g, CAT, 99).valid).toBe(true);
  });

  it('merges R + B on the same level into a P input', () => {
    const ps = findPlacements(rootGraph(), CAT, CAT.arc);
    expect(ps).toHaveLength(1);
    expect(ps[0].level).toBe(1);
    expect(ps[0].inputs[0]).toEqual([{ uid: 'root', output: 0 }, { uid: 'root', output: 1 }]);
  });

  it('does not merge outputs across different levels', () => {
    // level 0: root R (used by amp), B open. level 1: amp R open. R(l1)+B(l0) must not be offered.
    const g = add(rootGraph(), 'a', 'amp');
    const ps = findPlacements(g, CAT, CAT.arc);
    expect(ps).toHaveLength(0);
  });

  it('enumerates all assignments for multi-input terminals', () => {
    let g = add(rootGraph(), 'd', 'dup'); // level1: R,R
    g = add(g, 'b', 'bamp'); // level1: B
    const ps = findPlacements(g, CAT, CAT.triple);
    // R,R swaps are the same placement (identical input colors are interchangeable) x one B
    expect(ps).toHaveLength(1);
    for (const p of ps) {
      expect(p.level).toBe(2);
      expect(p.inputs).toHaveLength(3);
      const used = p.inputs.flat().map((r) => `${r.uid}#${r.output}`);
      expect(new Set(used).size).toBe(3);
    }
    const placed = placeRune(g, CAT, { uid: 't', defId: 'triple' }, ps[0]);
    expect(validateSpell(placed, CAT, 99).valid).toBe(true);
  });

  it('white from Y(=R+G)... : combos of 3 primaries and 2 mixed colors', () => {
    const cat: RuneCatalog = {
      ...CAT,
      src3: def('src3', { outputs: ['R', 'G'], mana: 0 }),
      toB: def('toB', { inputs: ['R'], outputs: ['Y'] }),
    };
    // R,G open on level 0 -> W needs B; not possible. Y needs R+G
    const g: SpellGraph = { rootUid: 'root', nodes: [{ uid: 'root', defId: 'sourceG' }], links: [] };
    const y = def('yy', { inputs: ['Y'], shot: shot() });
    expect(findPlacements(g, { ...cat, sourceG: CAT.sourceG }, y)).toHaveLength(1);
    expect(findPlacements(g, cat, CAT.white)).toHaveLength(0);
  });

  it('three primaries make W', () => {
    const cat: RuneCatalog = {
      s3: def('s3', { outputs: [], mana: 0 }),
    };
    void cat;
    const split = def('split3', { inputs: ['R'], outputs: ['R', 'G'] });
    const catalog: RuneCatalog = {
      ...CAT, split3: split,
      rgb: def('rgb', { inputs: [], outputs: ['R', 'G'] }),
    };
    // level1: R,G from split3 ; level... need B too: use bamp at level 1
    let g = rootGraph();
    const place = (uid: string, id: string, pick?: (p: Placement) => boolean) => {
      const ps = findPlacements(g, catalog, catalog[id]);
      g = placeRune(g, catalog, { uid, defId: id }, pick ? ps.find(pick)! : ps[0]);
    };
    place('s', 'split3');
    place('b', 'bamp');
    const ps = findPlacements(g, catalog, CAT.white);
    expect(ps.length).toBe(1);
    expect(ps[0].inputs[0]).toHaveLength(3);
  });

  it('dedupes combined-input ordering and caps at 300', () => {
    const ps = findPlacements(rootGraph(), CAT, CAT.arc);
    expect(ps).toHaveLength(1);
    // cap: many open R outputs with a def needing many R inputs
    const wide = def('wide', { inputs: ['R', 'R', 'R', 'R', 'R', 'R'], shot: shot() });
    const big: RuneCatalog = { ...CAT, wide, many: def('many', { inputs: [], outputs: ['R', 'R'] }) };
    let g: SpellGraph = { rootUid: 'root', nodes: [{ uid: 'root', defId: 'many' }], links: [] };
    // grow with dup runes to produce lots of open R outputs on one level
    const a = findPlacements(g, big, big.dup)[0];
    g = placeRune(g, big, { uid: 'd1', defId: 'dup' }, a);
    const b = findPlacements(g, big, big.dup).find((p) => p.inputs[0][0].uid === 'root')!;
    g = placeRune(g, big, { uid: 'd2', defId: 'dup' }, b);
    // level1 now has 4 open R; add more via dup on level 1 would change level; just ensure cap logic OK
    expect(findPlacements(g, big, wide).length).toBeLessThanOrEqual(300);
    const six = def('six', { inputs: ['R', 'R', 'R', 'R'], shot: shot() });
    // 4 open R outputs into 4 interchangeable R inputs: one placement, not 4! = 24
    expect(findPlacements(g, big, six)).toHaveLength(1);
  });
});

describe('placeRune', () => {
  it('does not mutate the original graph and adds links', () => {
    const g = rootGraph();
    const p = findPlacements(g, CAT, CAT.arc)[0];
    const g2 = placeRune(g, CAT, { uid: 'x', defId: 'arc' }, p);
    expect(g.nodes).toHaveLength(1);
    expect(g.links).toHaveLength(0);
    expect(g2.nodes).toHaveLength(2);
    expect(g2.links).toEqual([
      { from: { uid: 'root', output: 0 }, toUid: 'x', toInput: 0 },
      { from: { uid: 'root', output: 1 }, toUid: 'x', toInput: 0 },
    ]);
  });

  it('throws on illegal placements', () => {
    const g = add(rootGraph(), 'f', 'fire');
    const reuse = { inputs: [[{ uid: 'root', output: 0 }]], level: 1 };
    expect(() => placeRune(g, CAT, { uid: 'f2', defId: 'fire' }, reuse)).toThrow();
    expect(() => placeRune(g, CAT, { uid: 'f', defId: 'frost' }, { inputs: [[{ uid: 'root', output: 1 }]], level: 1 })).toThrow();
    expect(() => placeRune(g, CAT, { uid: 'z', defId: 'frost' }, { inputs: [[{ uid: 'root', output: 0 }]], level: 1 })).toThrow();
    expect(() => placeRune(g, CAT, { uid: 'z', defId: 'nope' }, { inputs: [], level: 1 })).toThrow();
  });
});

describe('removeRune', () => {
  it('cascades to descendants and their links', () => {
    let g = add(rootGraph(), 'a', 'amp');
    g = add(g, 'f', 'fire');
    g = add(g, 'fr', 'frost');
    const r = removeRune(g, 'a');
    expect(r.nodes.map((n) => n.uid)).toEqual(['root', 'fr']);
    expect(r.links).toHaveLength(1);
    expect(r.links[0].toUid).toBe('fr');
    expect(g.nodes).toHaveLength(4); // immutable
  });

  it('removes a merged node when either parent is removed', () => {
    let g = add(rootGraph(), 'a', 'amp');
    g = add(g, 'b', 'bamp');
    g = add(g, 'm', 'mixer');
    g = add(g, 'arc', 'arc');
    const r = removeRune(g, 'b');
    expect(r.nodes.map((n) => n.uid)).toEqual(['root', 'a']);
    expect(r.links).toHaveLength(1);
  });

  it('throws for root', () => {
    expect(() => removeRune(rootGraph(), 'root')).toThrow();
  });
});

describe('validateSpell', () => {
  const link = (uid: string, output: number, toUid: string, toInput = 0) => ({ from: { uid, output }, toUid, toInput });

  it('accepts a valid spell with levels, mana, castTime', () => {
    let g = add(rootGraph(), 'a', 'amp');
    g = add(g, 'f', 'fire');
    const v = validateSpell(g, CAT, 10);
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
    expect(v.levels).toEqual({ root: 0, a: 1, f: 2 });
    expect(v.manaUsed).toBe(0 + 2 + 1);
    expect(v.castTime).toBeCloseTo(0.5 + 0.1 + 0.1);
  });

  it('flags mana over budget', () => {
    const g = add(add(rootGraph(), 'a', 'amp'), 'f', 'fire');
    const v = validateSpell(g, CAT, 2);
    expect(v.valid).toBe(false);
    expect(v.errors.join('|')).toMatch(/Mana over budget/);
  });

  it('flags unknown def, duplicate uid, missing root', () => {
    const g: SpellGraph = {
      rootUid: 'root',
      nodes: [{ uid: 'x', defId: 'zzz' }, { uid: 'x', defId: 'fire' }],
      links: [],
    };
    const e = validateSpell(g, CAT, 99).errors.join('|');
    expect(e).toMatch(/Unknown rune "zzz"/);
    expect(e).toMatch(/Duplicate rune uid "x"/);
    expect(e).toMatch(/Root rune/);
  });

  it('flags unsatisfied inputs', () => {
    const g: SpellGraph = { rootUid: 'root', nodes: [{ uid: 'root', defId: 'source' }, { uid: 'f', defId: 'fire' }], links: [] };
    expect(validateSpell(g, CAT, 99).errors.join('|')).toMatch(/not connected/);
  });

  it('flags color mismatch', () => {
    const g: SpellGraph = {
      rootUid: 'root',
      nodes: [{ uid: 'root', defId: 'source' }, { uid: 'f', defId: 'fire' }],
      links: [link('root', 1, 'f')],
    };
    expect(validateSpell(g, CAT, 99).errors.join('|')).toMatch(/Color mismatch/);
  });

  it('flags a bad combination (R+R into P)', () => {
    const g: SpellGraph = {
      rootUid: 'root',
      nodes: [{ uid: 'root', defId: 'source' }, { uid: 'd', defId: 'dup' }, { uid: 'x', defId: 'arc' }],
      links: [link('root', 0, 'd'), link('d', 0, 'x'), link('d', 1, 'x')],
    };
    expect(validateSpell(g, CAT, 99).errors.join('|')).toMatch(/Color mismatch/);
  });

  it('flags output used twice', () => {
    const g: SpellGraph = {
      rootUid: 'root',
      nodes: [{ uid: 'root', defId: 'source' }, { uid: 'f', defId: 'fire' }, { uid: 'f2', defId: 'fire' }],
      links: [link('root', 0, 'f'), link('root', 0, 'f2')],
    };
    expect(validateSpell(g, CAT, 99).errors.join('|')).toMatch(/used 2 times/);
  });

  it('flags mixed levels', () => {
    // amp (l1) R output + root B output (l0) into a P input
    const g: SpellGraph = {
      rootUid: 'root',
      nodes: [{ uid: 'root', defId: 'source' }, { uid: 'a', defId: 'amp' }, { uid: 'x', defId: 'arc' }],
      links: [link('root', 0, 'a'), link('a', 0, 'x'), link('root', 1, 'x')],
    };
    expect(validateSpell(g, CAT, 99).errors.join('|')).toMatch(/mixed levels/);
  });

  it('flags links to missing nodes / outputs / inputs', () => {
    const g: SpellGraph = {
      rootUid: 'root',
      nodes: [{ uid: 'root', defId: 'source' }, { uid: 'f', defId: 'fire' }],
      links: [link('ghost', 0, 'f'), link('root', 0, 'ghost2'), link('root', 5, 'f'), link('root', 0, 'f', 3)],
    };
    const e = validateSpell(g, CAT, 99).errors.join('|');
    expect(e).toMatch(/missing source rune "ghost"/);
    expect(e).toMatch(/missing target rune "ghost2"/);
    expect(e).toMatch(/missing output 5/);
    expect(e).toMatch(/missing input 3/);
  });

  it('flags cycles', () => {
    const g: SpellGraph = {
      rootUid: 'root',
      nodes: [{ uid: 'root', defId: 'source' }, { uid: 'a', defId: 'amp' }, { uid: 'b', defId: 'amp' }],
      links: [link('a', 0, 'b'), link('b', 0, 'a')],
    };
    expect(validateSpell(g, CAT, 99).errors.join('|')).toMatch(/cycle/);
  });

  it('applies mana reduction from ancestors and global terminals', () => {
    // thrift: mana 1, augment -1 to descendants. fire under it: 1 - 1 = 0.
    let g = add(rootGraph(), 't', 'thrift');
    g = add(g, 'f', 'fire');
    expect(validateSpell(g, CAT, 99).manaUsed).toBe(1 + 0);
    // global -5 on every node; min 0 per node
    let g2 = add(rootGraph(), 'b', 'bamp'); // mana 1
    g2 = add(g2, 'fm', 'freeMana');
    // root 0->0, bamp 1->0, freeMana 0->0
    expect(validateSpell(g2, CAT, 99).manaUsed).toBe(0);
  });

  it('cast time: modifiers from any rune, min 0.15', () => {
    let g = add(rootGraph(), 'q', 'quick');
    expect(validateSpell(g, CAT, 99).castTime).toBeCloseTo(0.15);
    g = add(rootGraph(), 's', 'slower');
    // base 0.5 + 0.2 = 0.7, x2
    expect(validateSpell(g, CAT, 99).castTime).toBeCloseTo(1.4);
    expect(compileSpell(g, CAT).castTime).toBeCloseTo(1.4);
  });
});

describe('compileSpell', () => {
  it('starter-like spell: shots in DFS order with augments applied', () => {
    let g = add(rootGraph(), 'a', 'amp');
    g = add(g, 'f', 'fire');
    g = add(g, 'fr', 'frost');
    const plan = compileSpell(g, CAT);
    expect(plan.stagger).toBe(0.1);
    expect(plan.shots.map((s) => s.sourceUid)).toEqual(['f', 'fr']);
    expect(plan.shots[0].damage).toBeCloseTo(52); // 40 * 1.3
    expect(plan.shots[0].runeName).toBe('fire');
    expect(plan.shots[1].damage).toBe(25); // amp doesn't touch sibling branch
    expect(plan.manaUsed).toBe(2 + 1 + 1);
  });

  it('order: by node (display) order then by output index, depth-first', () => {
    // frost (fed by output 1) is listed before amp (output 0), so it fires first
    const g: SpellGraph = {
      rootUid: 'root',
      nodes: [
        { uid: 'root', defId: 'source' }, { uid: 'fr', defId: 'frost' },
        { uid: 'a', defId: 'amp' }, { uid: 'f', defId: 'fire' },
      ],
      links: [
        { from: { uid: 'root', output: 1 }, toUid: 'fr', toInput: 0 },
        { from: { uid: 'root', output: 0 }, toUid: 'a', toInput: 0 },
        { from: { uid: 'a', output: 0 }, toUid: 'f', toInput: 0 },
      ],
    };
    expect(compileSpell(g, CAT).shots.map((s) => s.sourceUid)).toEqual(['fr', 'f']);
    // reorder the level: amp before frost -> amp's subtree fires first
    const g2: SpellGraph = { ...g, nodes: [g.nodes[0], g.nodes[2], g.nodes[1], g.nodes[3]] };
    expect(compileSpell(g2, CAT).shots.map((s) => s.sourceUid)).toEqual(['f', 'fr']);
  });

  it('diamond merge counts shared ancestors once, and emits terminal once', () => {
    const cat: RuneCatalog = {
      ...CAT,
      source: def('source', {
        outputs: ['R', 'B'], mana: 0, castTime: 0.5,
        augments: [{ stat: 'damage', op: 'flat', value: 5 }],
      }),
    };
    let g = rootGraph();
    const put = (uid: string, id: string) => {
      g = placeRune(g, cat, { uid, defId: id }, findPlacements(g, cat, cat[id])[0]);
    };
    put('a', 'amp'); // R l1
    put('b', 'bamp'); // B l1
    put('m', 'mixer'); // P l2: x2 more
    put('x', 'arc');
    const plan = compileSpell(g, cat);
    expect(plan.shots).toHaveLength(1);
    // (10 + 5) * (1 + .3 + .2) * 2 = 45
    expect(plan.shots[0].damage).toBeCloseTo(45);
  });

  it('multi-input terminal gets all parents augments (union)', () => {
    let g = add(rootGraph(), 'd', 'dup');
    g = add(g, 'b', 'bamp');
    g = add(g, 't', 'triple');
    const plan = compileSpell(g, CAT);
    expect(plan.shots).toHaveLength(1);
    expect(plan.shots[0].damage).toBeCloseTo(5 * 1.2);
  });

  it('element-filtered modifiers only apply to matching shots', () => {
    // root R -> fireOnly -> fire ; and fireOnly is the only ancestor => fire gets +100
    let g = add(rootGraph(), 'o', 'fireOnly');
    g = add(g, 'f', 'fire');
    g = add(g, 'fr', 'frost', from('root', 1));
    const plan = compileSpell(g, CAT);
    expect(plan.shots.find((s) => s.sourceUid === 'f')!.damage).toBe(140);
    expect(plan.shots.find((s) => s.sourceUid === 'fr')!.damage).toBe(25);
    // mismatching element on the same branch
    const cat2: RuneCatalog = {
      ...CAT,
      fireOnly: def('fireOnly', {
        inputs: ['B'], outputs: ['B'],
        augments: [{ stat: 'damage', op: 'flat', value: 100, element: 'fire' }],
      }),
    };
    let h = rootGraph();
    h = placeRune(h, cat2, { uid: 'o', defId: 'fireOnly' }, findPlacements(h, cat2, cat2.fireOnly)[0]);
    h = placeRune(h, cat2, { uid: 'fr', defId: 'frost' }, findPlacements(h, cat2, cat2.frost)[0]);
    expect(compileSpell(h, cat2).shots[0].damage).toBe(25);
  });

  it('global terminals affect all shots and produce no shot themselves', () => {
    let g = add(rootGraph(), 'a', 'amp');
    g = add(g, 'c', 'catalyst');
    g = add(g, 'fr', 'frost');
    const plan = compileSpell(g, CAT);
    expect(plan.shots.map((s) => s.sourceUid)).toEqual(['fr']);
    expect(plan.shots[0].damage).toBeCloseTo(25 * 1.5);
  });

  it('stacking: (base+flat) * (1+sum inc) * product(1+more)', () => {
    const cat: RuneCatalog = {
      ...CAT,
      m1: def('m1', {
        inputs: ['R'], outputs: ['R'],
        augments: [
          { stat: 'damage', op: 'flat', value: 10 },
          { stat: 'damage', op: 'increased', value: 0.3 },
          { stat: 'damage', op: 'increased', value: 0.2 },
          { stat: 'damage', op: 'more', value: 0.5 },
          { stat: 'damage', op: 'more', value: -0.2 },
          { stat: 'speed', op: 'flat', value: -9999 },
        ],
      }),
    };
    let g = rootGraph();
    for (const [uid, id] of [['m', 'm1'], ['f', 'fire']] as const) {
      g = placeRune(g, cat, { uid, defId: id }, findPlacements(g, cat, cat[id])[0]);
    }
    const s = compileSpell(g, cat).shots[0];
    expect(s.damage).toBeCloseTo((40 + 10) * 1.5 * 1.5 * 0.8);
    expect(s.speed).toBe(0); // clamped
  });

  it('count rounds with min 1; status scalers apply', () => {
    let g = add(rootGraph(), 'm', 'multi');
    const plan = compileSpell(g, CAT);
    const s = plan.shots[0];
    expect(s.count).toBe(3); // 2 + 1.4 = 3.4 -> 3
    expect(s.statuses[0].potency).toBeCloseTo(6); // 4 * 1.5
    expect(s.statuses[0].duration).toBeCloseTo(6); // 3 * (1+1)
    // original catalog untouched
    expect(CAT.multi.shot!.statuses[0].potency).toBe(4);

    const cat: RuneCatalog = {
      ...CAT,
      shrink: def('shrink', { inputs: ['R'], shot: shot({ count: 1 }), globals: [{ stat: 'count', op: 'flat', value: -5 }] }),
    };
    g = rootGraph();
    g = placeRune(g, cat, { uid: 's', defId: 'shrink' }, findPlacements(g, cat, cat.shrink)[0]);
    expect(compileSpell(g, cat).shots[0].count).toBe(1);
  });

  it('matches validateSpell on mana/castTime and handles a root-only spell', () => {
    const g = rootGraph();
    const plan = compileSpell(g, CAT);
    expect(plan.shots).toEqual([]);
    expect(plan.castTime).toBeCloseTo(0.5);
    expect(plan.manaUsed).toBe(0);
    let h = add(add(rootGraph(), 'a', 'amp'), 'f', 'fire');
    h = add(h, 'fr', 'frost');
    const v = validateSpell(h, CAT, 99);
    const p = compileSpell(h, CAT);
    expect(p.castTime).toBeCloseTo(v.castTime);
    expect(p.manaUsed).toBe(v.manaUsed);
  });

  it('engine object exposes every function', () => {
    for (const k of ['colorsCombine', 'openOutputs', 'findPlacements', 'placeRune', 'removeRune', 'validateSpell', 'compileSpell'] as const) {
      expect(typeof engine[k]).toBe('function');
    }
    const _c: Color = 'R';
    expect(_c).toBe('R');
  });
});

describe('forging', () => {
  const F: RuneCatalog = {
    source: CAT.source,
    shotRune: def('shotRune', {
      inputs: ['R'], mana: 2, rarity: 'common',
      shot: shot({ damage: 40, statuses: [{ kind: 'burn', potency: 6, duration: 3 }, { kind: 'freeze', potency: 0, duration: 1 }] }),
    }),
    cheap: def('cheap', { inputs: ['R'], mana: 0, shot: shot() }),
    aug: def('aug', {
      inputs: ['R'], outputs: ['R'],
      augments: [
        { stat: 'damage', op: 'increased', value: 0.4 },
        { stat: 'damage', op: 'more', value: -0.25 },
        { stat: 'count', op: 'flat', value: 2 },
        { stat: 'castTime', op: 'increased', value: -0.2 },
        { stat: 'castTime', op: 'flat', value: 0.4 },
      ],
    }),
    sigil: def('sigil', { inputs: ['R'], globals: [{ stat: 'damage', op: 'increased', value: 0.2, element: 'fire' }] }),
  };

  it('upgrades shot, mana and modifiers without mutating', () => {
    const snap = JSON.stringify(F.shotRune);
    const u = upgradeDef(F.shotRune);
    expect(JSON.stringify(F.shotRune)).toBe(snap);
    expect(u.name).toBe('shotRune+');
    expect(u.mana).toBe(1);
    expect(u.shot!.damage).toBe(60);
    expect(u.shot!.statuses[0].potency).toBe(7.5);
    expect(u.shot!.statuses[1].potency).toBe(0);
    expect(u.inputs).toEqual(F.shotRune.inputs);
    expect(u.outputs).toEqual(F.shotRune.outputs);
    expect(u.castTime).toBe(F.shotRune.castTime);
    expect(u.description).toContain('Forged');
  });
  it('mana never goes below 0', () => {
    expect(upgradeDef(F.cheap).mana).toBe(0);
  });
  it('scales beneficial mods, keeps detrimental, flat count gets +1', () => {
    const m = upgradeDef(F.aug).augments!;
    expect(m[0].value).toBeCloseTo(0.6);
    expect(m[1].value).toBe(-0.25);
    expect(m[2].value).toBe(3);
    expect(m[3].value).toBeCloseTo(-0.3);
    expect(m[4].value).toBe(0.4);
    expect(upgradeDef(F.sigil).globals![0]).toMatchObject({ value: 0.3, element: 'fire' });
  });
  it('leaves the Source alone', () => {
    const src = def('source', { rarity: 'starter', outputs: ['R'], mana: 0 });
    expect(upgradeDef(src)).toBe(src);
  });
  it('defOf resolves plus instances', () => {
    expect(defOf(F, { uid: 'a', defId: 'shotRune' })).toBe(F.shotRune);
    expect(defOf(F, { uid: 'a', defId: 'shotRune', plus: true })!.name).toBe('shotRune+');
    expect(defOf(F, { uid: 'a', defId: 'nope' })).toBeUndefined();
  });
  it('a plus instance changes compile damage and mana', () => {
    const mk = (plus: boolean): SpellGraph => ({
      rootUid: 'root',
      nodes: [{ uid: 'root', defId: 'source' }, { uid: 's', defId: 'shotRune', plus }],
      links: [{ from: { uid: 'root', output: 0 }, toUid: 's', toInput: 0 }],
    });
    expect(compileSpell(mk(false), F).shots[0].damage).toBe(40);
    expect(compileSpell(mk(true), F).shots[0].damage).toBe(60);
    expect(validateSpell(mk(false), F, 9).manaUsed).toBe(2);
    expect(validateSpell(mk(true), F, 9).manaUsed).toBe(1);
  });
  it('forged augment affects descendants', () => {
    const mk = (plus: boolean): SpellGraph => ({
      rootUid: 'root',
      nodes: [{ uid: 'root', defId: 'source' }, { uid: 'a', defId: 'aug', plus }, { uid: 's', defId: 'cheap' }],
      links: [
        { from: { uid: 'root', output: 0 }, toUid: 'a', toInput: 0 },
        { from: { uid: 'a', output: 0 }, toUid: 's', toInput: 0 },
      ],
    });
    expect(compileSpell(mk(true), F).shots[0].count).toBe(4);
    expect(compileSpell(mk(false), F).shots[0].count).toBe(3);
  });
});

describe('extraGlobals', () => {
  const g: SpellGraph = {
    rootUid: 'root',
    nodes: [{ uid: 'root', defId: 'source' }, { uid: 'f', defId: 'fire' }, { uid: 'i', defId: 'frost' }],
    links: [
      { from: { uid: 'root', output: 0 }, toUid: 'f', toInput: 0 },
      { from: { uid: 'root', output: 1 }, toUid: 'i', toInput: 0 },
    ],
  };
  it('applies to every shot', () => {
    const base = compileSpell(g, CAT);
    const plan = compileSpell(g, CAT, [{ stat: 'damage', op: 'increased', value: 0.5 }]);
    expect(plan.shots[0].damage).toBeCloseTo(base.shots[0].damage * 1.5);
    expect(plan.shots[1].damage).toBeCloseTo(base.shots[1].damage * 1.5);
  });
  it('respects element filters', () => {
    const base = compileSpell(g, CAT);
    const plan = compileSpell(g, CAT, [{ stat: 'damage', op: 'increased', value: 0.2, element: 'fire' }]);
    expect(plan.shots[0].damage).toBeCloseTo(base.shots[0].damage * 1.2);
    expect(plan.shots[1].damage).toBe(base.shots[1].damage);
  });
  it('ignores castTime and manaCost mods', () => {
    const base = compileSpell(g, CAT);
    const plan = compileSpell(g, CAT, [{ stat: 'castTime', op: 'more', value: 5 }, { stat: 'manaCost', op: 'flat', value: -9 }]);
    expect(plan.castTime).toBe(base.castTime);
    expect(plan.manaUsed).toBe(base.manaUsed);
  });
});
