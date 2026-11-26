import { describe, expect, it } from 'vitest';
import { CATALOG, runeTooltip } from './runes';
import { FUSIONS } from './fusions';
import { COLOR_BITS } from '../types';

describe('fusions', () => {
  it('has recipes whose ingredients and result exist', () => {
    expect(FUSIONS.length).toBeGreaterThanOrEqual(6);
    for (const r of FUSIONS) {
      expect(CATALOG[r.a], r.a).toBeDefined();
      expect(CATALOG[r.b], r.b).toBeDefined();
      expect(CATALOG[r.result], r.result).toBeDefined();
      expect(r.a).not.toBe('source');
      expect(r.b).not.toBe('source');
      expect(CATALOG[r.result].rarity).toBe('fused');
      expect(CATALOG[r.a].rarity).not.toBe('fused');
      expect(CATALOG[r.b].rarity).not.toBe('fused');
    }
  });

  it('has no duplicate recipes or results', () => {
    const pairs = FUSIONS.map((r) => [r.a, r.b].sort().join('+'));
    expect(new Set(pairs).size).toBe(pairs.length);
    const results = FUSIONS.map((r) => r.result);
    expect(new Set(results).size).toBe(results.length);
  });

  it('every fused rune has a recipe', () => {
    const fused = Object.values(CATALOG).filter((d) => d.rarity === 'fused').map((d) => d.id);
    expect(fused.sort()).toEqual(FUSIONS.map((r) => r.result).sort());
  });

  it('fused runes are placeable and well formed', () => {
    for (const d of Object.values(CATALOG).filter((x) => x.rarity === 'fused')) {
      expect(d.inputs.length, d.id).toBeGreaterThan(0);
      for (const c of d.inputs) expect(COLOR_BITS[c]).toBeGreaterThan(0);
      expect(d.shot || d.augments, d.id).toBeTruthy();
    }
  });
});

describe('socket bonuses', () => {
  const withBonus = Object.values(CATALOG).filter((d) => d.socketBonus);

  it('exist on a dozen or more runes', () => {
    expect(withBonus.length).toBeGreaterThanOrEqual(12);
  });

  it('have text, one condition and a valid reference', () => {
    for (const d of withBonus) {
      const b = d.socketBonus!;
      expect(b.text.trim().length, d.id).toBeGreaterThan(0);
      expect(b.mods.length, d.id).toBeGreaterThan(0);
      const conds = [b.color !== undefined, b.rune !== undefined, b.complex === true].filter(Boolean);
      expect(conds, d.id).toHaveLength(1);
      if (b.color) {
        expect(COLOR_BITS[b.color], d.id).toBeGreaterThan(0);
        expect(Object.values(CATALOG).some((x) => x.outputs.includes(b.color!)), d.id).toBe(true);
      }
      if (b.rune) {
        expect(CATALOG[b.rune], `${d.id} -> ${b.rune}`).toBeDefined();
        expect(CATALOG[b.rune].outputs.length, `${b.rune} must be a feeder`).toBeGreaterThan(0);
      }
    }
  });

  it('show in the tooltip', () => {
    for (const d of withBonus) expect(runeTooltip(d)).toContain(`Socket: ${d.socketBonus!.text}`);
    expect(runeTooltip(CATALOG.amplify)).not.toContain('Socket:');
  });
});
