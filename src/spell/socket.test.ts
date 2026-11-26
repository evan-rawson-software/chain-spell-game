import { describe, expect, it } from 'vitest';
import type { RuneCatalog, RuneDef, ShotBase, SpellGraph } from '../types';
import { CATALOG, ROOT_UID, SOURCE_ID } from '../data/runes';
import { compileSpell, decodeSpell, defOf, encodeSpell, engine, socketBonusActive, upgradeDef, validateSpell } from './index';

const shot = (over: Partial<ShotBase> = {}): ShotBase => ({
  element: 'fire', damage: 10, speed: 100, size: 5, aoeRadius: 0, count: 1, spreadDeg: 0,
  pierce: 0, homing: 0, chain: 0, statuses: [], ...over,
});
const def = (id: string, over: Partial<RuneDef>): RuneDef => ({
  id, name: id, description: '', rarity: 'common', inputs: [], outputs: [], mana: 1, castTime: 0.1, ...over,
});

const CAT: RuneCatalog = {
  source: def('source', { outputs: ['R', 'B'], mana: 0, castTime: 0.5 }),
  amp: def('amp', { inputs: ['R'], outputs: ['R', 'P'], augments: [{ stat: 'damage', op: 'increased', value: 0.3 }] }),
  byRune: def('byRune', {
    inputs: ['R'], shot: shot(),
    socketBonus: { rune: 'amp', mods: [{ stat: 'damage', op: 'flat', value: 5 }, { stat: 'count', op: 'flat', value: 1 }], text: 'x' },
  }),
  byColor: def('byColor', {
    inputs: ['B'], shot: shot(),
    socketBonus: { color: 'B', mods: [{ stat: 'damage', op: 'flat', value: 7 }], text: 'x' },
  }),
  byComplex: def('byComplex', {
    inputs: ['P'], shot: shot(),
    socketBonus: { complex: true, mods: [{ stat: 'damage', op: 'flat', value: 9 }], text: 'x' },
  }),
  brancher: def('brancher', {
    inputs: ['R'], outputs: ['R'], augments: [{ stat: 'pierce', op: 'flat', value: 1 }],
    socketBonus: { color: 'R', mods: [{ stat: 'damage', op: 'flat', value: 5 }], text: 'x' },
  }),
  sink: def('sink', { inputs: ['R'], shot: shot() }),
};

const root = { uid: 'root', defId: 'source' };
const g = (nodes: SpellGraph['nodes'], links: SpellGraph['links']): SpellGraph => ({ rootUid: 'root', nodes: [root, ...nodes], links });
const link = (from: string, output: number, toUid: string, toInput = 0) => ({ from: { uid: from, output }, toUid, toInput });

describe('socket bonuses', () => {
  it('rune condition matches the feeding rune defId', () => {
    const fed = g([{ uid: 'a', defId: 'amp' }, { uid: 't', defId: 'byRune' }], [link('root', 0, 'a'), link('a', 0, 't')]);
    expect(socketBonusActive(fed, CAT, 't')).toBe(true);
    const direct = g([{ uid: 't', defId: 'byRune' }], [link('root', 0, 't')]);
    expect(socketBonusActive(direct, CAT, 't')).toBe(false);
    expect(engine.socketBonusActive(fed, CAT, 't')).toBe(true);
    expect(socketBonusActive(fed, CAT, 'missing')).toBe(false);
    expect(socketBonusActive(fed, CAT, 'a')).toBe(false); // no bonus
  });

  it('color condition needs the exact output color', () => {
    const fed = g([{ uid: 't', defId: 'byColor' }], [link('root', 1, 't')]);
    expect(socketBonusActive(fed, CAT, 't')).toBe(true);
    const viaP = g([{ uid: 'a', defId: 'amp' }, { uid: 't', defId: 'byColor' }], [link('root', 0, 'a'), link('a', 1, 't')]);
    expect(socketBonusActive(viaP, CAT, 't')).toBe(false); // P feeds B but is not exactly B
  });

  it('complex condition matches Y/P/T/W outputs only', () => {
    const viaP = g([{ uid: 'a', defId: 'amp' }, { uid: 't', defId: 'byComplex' }], [link('root', 0, 'a'), link('a', 1, 't')]);
    expect(socketBonusActive(viaP, CAT, 't')).toBe(true);
    expect(compileSpell(viaP, CAT).shots[0].damage).toBeCloseTo((10 + 9) * 1.3);
  });

  it('terminal bonus modifies its own shot only when active', () => {
    const on = g([{ uid: 'a', defId: 'amp' }, { uid: 't', defId: 'byRune' }], [link('root', 0, 'a'), link('a', 0, 't')]);
    const s = compileSpell(on, CAT).shots[0];
    expect(s.damage).toBeCloseTo((10 + 5) * 1.3);
    expect(s.count).toBe(2);
    const off = g([{ uid: 't', defId: 'byRune' }], [link('root', 0, 't')]);
    expect(compileSpell(off, CAT).shots[0].damage).toBe(10);
  });

  it('branching bonus becomes augments for descendants only', () => {
    const on = g([{ uid: 'b', defId: 'brancher' }, { uid: 's', defId: 'sink' }], [link('root', 0, 'b'), link('b', 0, 's')]);
    const s = compileSpell(on, CAT).shots[0];
    expect(s.damage).toBe(15);
    expect(s.pierce).toBe(1);
    const sibling = g(
      [{ uid: 'b', defId: 'brancher' }, { uid: 's', defId: 'sink' }, { uid: 'o', defId: 'byColor' }],
      [link('root', 0, 'b'), link('b', 0, 's'), link('root', 1, 'o')],
    );
    const o = compileSpell(sibling, CAT).shots.find((x) => x.sourceUid === 'o')!;
    expect(o.damage).toBe(17); // 10 + 7 own bonus, none from the unrelated brancher
  });

  it('forging scales bonus mods like augments', () => {
    const up = upgradeDef(CAT.byRune);
    expect(up.socketBonus!.mods[0].value).toBe(7.5);
    expect(up.socketBonus!.mods[1].value).toBe(2); // flat count +1 -> +2
    expect(defOf(CAT, { uid: 'x', defId: 'byRune', plus: true })!.socketBonus!.mods[1].value).toBe(2);
    expect(CAT.byRune.socketBonus!.mods[0].value).toBe(5); // original untouched
    const on = g([{ uid: 'a', defId: 'amp' }, { uid: 't', defId: 'byRune', plus: true }], [link('root', 0, 'a'), link('a', 0, 't')]);
    expect(compileSpell(on, CAT).shots[0].count).toBe(3);
  });
});

describe('share codes', () => {
  it('data constants match the literals used by the spell module', () => {
    expect(ROOT_UID).toBe('root');
    expect(SOURCE_ID).toBe('source');
    const bare: SpellGraph = { rootUid: ROOT_UID, nodes: [{ uid: ROOT_UID, defId: SOURCE_ID }], links: [] };
    expect(decodeSpell(encodeSpell(bare), CATALOG)!.rootUid).toBe(ROOT_UID);
  });

  it('round-trips a graph with forged runes, merges and multi-input links', () => {
    const graph: SpellGraph = {
      rootUid: ROOT_UID,
      nodes: [
        { uid: ROOT_UID, defId: 'source' },
        { uid: 'u9', defId: 'bloom', plus: true },
        { uid: 'u3', defId: 'prism_merge' },
        { uid: 'u5', defId: 'arcane_missile' },
        { uid: 'u6', defId: 'thorn_shot' },
      ],
      links: [
        link(ROOT_UID, 0, 'u3', 0), link(ROOT_UID, 1, 'u3', 1),
        link('u3', 0, 'u5'), link(ROOT_UID, 2, 'u9'), link('u9', 0, 'u6'),
      ],
    };
    // note: prism_merge needs R + B; root outputs are R, B, G
    const code = encodeSpell(graph);
    expect(code).toMatch(/^CS1\.[A-Za-z0-9_-]+$/);
    const back = decodeSpell(code, CATALOG);
    expect(back).not.toBeNull();
    expect(back!.nodes.map((n) => n.uid)).toEqual(['root', 's0', 's1', 's2', 's3']);
    expect(back!.nodes.map((n) => n.defId)).toEqual(['source', 'bloom', 'prism_merge', 'arcane_missile', 'thorn_shot']);
    expect(back!.nodes[1].plus).toBe(true);
    expect(back!.nodes[2].plus).toBeUndefined();
    expect(back!.links).toHaveLength(5);
    expect(encodeSpell(back!)).toBe(code);
    expect(compileSpell(back!, CATALOG).shots.length).toBe(compileSpell(graph, CATALOG).shots.length);
  });

  it('rejects garbage, bad prefixes and malformed payloads', () => {
    const enc = (v: unknown) => 'CS1.' + btoa(JSON.stringify(v)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
    const bad = [
      '', 'hello', 'CS1.', 'CS1.!!!', 'CS2.abc', 'CS1.a', enc('x'), enc([]), enc([[], 5]), enc({}),
      enc([[['nope', 0]], []]),
      enc([[['amplify', 2]], []]),
      enc([[['source', 0]], []]),
      enc([[['fireball', 0]], [[0, 0, 5, 0]]]),
      enc([[['fireball', 0]], [[0, 0, 0, 0]]]),
      enc([[['fireball', 0]], [[0, 0, 1]]]),
      enc([[['fireball', 0]], [[0, -1, 1, 0]]]),
      enc([[['fireball', 0]], [[0, 1.5, 1, 0]]]),
      enc([[['fireball', 0]], []]),
      enc([[['fireball', 0]], [[0, 9, 1, 0]]]),
      enc([[['frost_bolt', 0]], [[0, 0, 1, 0]]]),
      enc([[['amplify', 0], ['amplify', 0]], [[2, 0, 1, 0], [1, 0, 2, 0]]]),
    ];
    for (const b of bad) expect(decodeSpell(b, CATALOG), b).toBeNull();
    expect(decodeSpell(undefined as unknown as string, CATALOG)).toBeNull();
    expect(decodeSpell('CS1.' + 'A'.repeat(30000), CATALOG)).toBeNull();
  });

  it('ignores mana overruns (the caller checks the budget)', () => {
    const nodes: SpellGraph['nodes'] = [{ uid: ROOT_UID, defId: 'source' }];
    const links: SpellGraph['links'] = [];
    let prev = ROOT_UID;
    for (let i = 0; i < 6; i++) {
      nodes.push({ uid: `n${i}`, defId: 'amplify' });
      links.push(link(prev, 0, `n${i}`));
      prev = `n${i}`;
    }
    nodes.push({ uid: 'f', defId: 'fireball' });
    links.push(link(prev, 0, 'f'));
    const graph = { rootUid: ROOT_UID, nodes, links };
    expect(validateSpell(graph, CATALOG, 5).valid).toBe(false);
    expect(decodeSpell(encodeSpell(graph), CATALOG)).not.toBeNull();
  });
});
