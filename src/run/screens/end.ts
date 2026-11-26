import { sfx } from '../../audio';
import { CATALOG } from '../../data/runes';
import type { App } from '../app';
import { MAP_ROWS } from '../map';
import { clearRun } from '../state';
import { boonChip, button, el } from '../ui';

export function endScreen(app: App, won: boolean): void {
  const run = app.run;
  // On defeat the floor is the row being fought, so rows cleared = floor - 1.
  const cleared = won ? MAP_ROWS : Math.max(0, run.floor - 1);
  clearRun();
  sfx(won ? 'runVictory' : 'runDefeat');
  app.show((s) => {
    s.classList.add('rn-center');
    const box = el('div', 'rn-title', undefined, s);
    el('h1', `rn-logo ${won ? 'win' : 'lose'}`, won ? 'Victory!' : 'Defeated', box);

    const card = el('div', 'rn-sumcard', undefined, box);
    const stats = el('div', 'rn-stats', undefined, card);
    for (const [label, val] of [['Rows cleared', `${cleared}/${MAP_ROWS}`], ['Gold', String(run.gold)], ['Runes owned', String(run.owned.length)], ['Max mana', String(run.maxMana)]]) {
      const st = el('div', 'rn-statbox', undefined, stats);
      el('div', 'rn-statval', val, st);
      el('div', 'rn-statlabel', label, st);
    }
    const names = new Map<string, number>();
    for (const o of run.owned) {
      const d = CATALOG[o.defId]?.name ?? o.defId;
      const label = o.plus ? `${d}+` : d;
      names.set(label, (names.get(label) ?? 0) + 1);
    }
    const list = el('div', 'rn-runelist', undefined, card);
    for (const [label, n] of names) el('span', 'rn-chip', `${label}${n > 1 ? ` x${n}` : ''}`, list);
    if (run.boons.length) {
      const boons = el('div', 'rn-runelist', undefined, card);
      for (const id of run.boons) { const d = app.boons[id]; if (d) boonChip(d, boons); }
    }
    const row = el('div', 'rn-row', undefined, box);
    button('New Run', 'rn-btn primary', () => app.goto.school(), row);
    button('Title', 'rn-btn', () => app.goto.title(), row);
  });
}
