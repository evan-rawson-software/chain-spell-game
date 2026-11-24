import { describe, expect, it } from 'vitest';
import { COLOR_BITS } from '../types';
import type { Color } from '../types';
import { CATALOG, ROOT_UID, SOURCE_ID, STARTER_KIT, runeTooltip, starterGraph } from './runes';

const defs = Object.values(CATALOG);

describe('rune catalog', () => {
  it('ids match keys and sizes are sane', () => {
    for (const [k, d] of Object.entries(CATALOG)) expect(d.id).toBe(k);
    expect(defs.length).toBeGreaterThanOrEqual(30);
    expect(CATALOG[SOURCE_ID].inputs).toHaveLength(0);
  });

  it('input/output counts', () => {
    for (const d of defs) {
      expect(d.outputs.length).toBeLessThanOrEqual(2);
      if (d.id !== SOURCE_ID) expect(d.inputs.length).toBeGreaterThanOrEqual(1);
      expect(d.mana).toBeGreaterThanOrEqual(0);
      expect(d.mana).toBeLessThanOrEqual(4);
      expect(d.description.length).toBeGreaterThan(10);
    }
  });

  it('terminals have shot or globals; branchers have neither', () => {
    for (const d of defs) {
      if (d.id === SOURCE_ID) continue;
      if (d.outputs.length === 0) {
        expect(d.shot || d.globals, d.id).toBeTruthy();
        expect(d.augments, d.id).toBeUndefined();
      } else {
        expect(d.shot, d.id).toBeUndefined();
        expect(d.globals, d.id).toBeUndefined();
        expect(d.augments?.length, `${d.id} should do more than route colors`).toBeGreaterThan(0);
      }
    }
  });

  it('rarities are populated', () => {
    const n = (r: string) => defs.filter((d) => d.rarity === r).length;
    expect(n('starter')).toBe(4);
    expect(n('common')).toBeGreaterThanOrEqual(10);
    expect(n('uncommon')).toBeGreaterThanOrEqual(8);
    expect(n('rare')).toBeGreaterThanOrEqual(5);
  });

  it('every input color is producible', () => {
    const produced = new Set<Color>();
    for (const d of defs) d.outputs.forEach((c) => produced.add(c));
    for (const p of ['R', 'G', 'B'] as Color[]) expect(produced.has(p), p).toBe(true);
    const primaryBits = (['R', 'G', 'B'] as Color[]).reduce((m, c) => (produced.has(c) ? m | COLOR_BITS[c] : m), 0);
    for (const d of defs) {
      for (const c of d.inputs) {
        const ok = produced.has(c) || (COLOR_BITS[c] & primaryBits) === COLOR_BITS[c];
        expect(ok, `${d.id} input ${c}`).toBe(true);
      }
    }
  });

  it('starter kit and graph', () => {
    for (const id of STARTER_KIT) expect(CATALOG[id]).toBeDefined();
    const owned = STARTER_KIT.map((defId, i) => ({ uid: `u${i}`, defId }));
    const g = starterGraph(owned);
    expect(g.rootUid).toBe(ROOT_UID);
    expect(g.nodes.map((n) => n.defId)).toEqual([SOURCE_ID, 'amplify', 'frost_bolt', 'fireball']);
    expect(g.links).toHaveLength(3);
    const uid = (d: string) => owned.find((o) => o.defId === d)!.uid;
    expect(g.links).toContainEqual({ from: { uid: ROOT_UID, output: 0 }, toUid: uid('amplify'), toInput: 0 });
    expect(g.links).toContainEqual({ from: { uid: ROOT_UID, output: 1 }, toUid: uid('frost_bolt'), toInput: 0 });
    expect(g.links).toContainEqual({ from: { uid: uid('amplify'), output: 0 }, toUid: uid('fireball'), toInput: 0 });
    const mana = g.nodes.reduce((s, n) => s + CATALOG[n.defId].mana, 0);
    expect(mana).toBeLessThanOrEqual(8);
  });

  it('tooltips render', () => {
    expect(runeTooltip(CATALOG.amplify)).toContain('+30% damage to descendants');
    expect(runeTooltip(CATALOG.catalyst)).toContain('Fire shots +25% damage (whole spell)');
    for (const d of defs) expect(runeTooltip(d).length).toBeGreaterThan(5);
  });
});
