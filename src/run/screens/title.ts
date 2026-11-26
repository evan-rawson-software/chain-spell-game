import { COLOR_HEX } from '../../types';
import type { App } from '../app';
import { MAP_ROWS } from '../map';
import { loadRun } from '../state';
import { button, el } from '../ui';

export function titleScreen(app: App): void {
  app.show((s) => {
    s.classList.add('rn-center', 'rn-titlescreen');
    const bg = el('div', 'rn-orbs', undefined, s);
    bg.setAttribute('aria-hidden', 'true');
    const glyphs = ['R', 'G', 'B', 'Y', 'P', 'T', 'W'] as const;
    glyphs.forEach((c, i) => {
      const o = el('span', 'rn-orb', c, bg);
      o.style.setProperty('--c', COLOR_HEX[c]);
      o.style.setProperty('--i', String(i));
    });
    const box = el('div', 'rn-title', undefined, s);
    el('h1', 'rn-logo', 'Chain Spell', box);
    el('p', 'rn-pitch',
      'Wire runes into a branching spell graph, then unleash it on waves of enemies in real time. '
      + 'Choose your path across ten rows. One circle. Build something terrible and wonderful.', box);
    const how = el('ol', 'rn-how', undefined, box);
    ['Build a spell from runes', 'Aim and cast against waves', 'Pick your path: battles, shops, forges, shrines'].forEach((t, i) => {
      const li = el('li', undefined, undefined, how);
      el('span', 'rn-how-n', String(i + 1), li);
      el('span', undefined, t, li);
    });
    const row = el('div', 'rn-row', undefined, box);
    const saved = loadRun();
    if (saved) {
      button(`Continue run (row ${Math.min(saved.run.floor, MAP_ROWS)})`, 'rn-btn primary', () => {
        app.setRun(saved.run);
        app.visited = saved.visited;
        app.sold = saved.sold;
        app.goto.resume(saved.phase);
      }, row);
    }
    button('New Run', saved ? 'rn-btn' : 'rn-btn primary', () => app.goto.school(), row);
  });
}
