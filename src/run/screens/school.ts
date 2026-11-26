import { BOONS } from '../../data/boons';
import { CATALOG } from '../../data/runes';
import { SCHOOLS } from '../../data/schools';
import { COLOR_HEX } from '../../types';
import type { App } from '../app';
import { button, el } from '../ui';

export function schoolScreen(app: App): void {
  app.show((s) => {
    s.classList.add('rn-center');
    const box = el('div', 'rn-rewardbox', undefined, s);
    el('h2', 'rn-h2', 'Choose your school', box);
    el('p', 'rn-sub', 'Your school sets the starter runes, your first spell and a blessing.', box);
    if (app.dailyPending) el('p', 'rn-sub', `Daily run ${app.dailyPending}: the map and offers are the same for everyone today.`, box);
    const cards = el('div', 'rn-cards', undefined, box);
    for (const school of SCHOOLS) {
      const card = el('button', 'rn-card rn-school', undefined, cards);
      card.style.setProperty('--sc', COLOR_HEX[school.color]);
      el('div', 'rn-card-name', school.name, card);
      el('div', 'rn-card-desc', school.description, card);
      el('div', 'rn-school-label', 'Starter runes', card);
      const kit = el('div', 'rn-runelist left', undefined, card);
      for (const id of school.kit) el('span', 'rn-chip', CATALOG[id]?.name ?? id, kit);
      const boon = school.boon ? BOONS[school.boon] : undefined;
      if (boon) {
        el('div', 'rn-school-label', 'Starting blessing', card);
        const b = el('div', 'rn-school-boon', undefined, card);
        el('strong', undefined, boon.name, b);
        el('span', undefined, ` ${boon.description}`, b);
      }
      card.addEventListener('click', () => app.goto.newRun(school.id));
    }
    const actions = el('div', 'rn-actions', undefined, box);
    button('Back', 'rn-btn', () => { app.dailyPending = null; app.goto.title(); }, actions, 'uiBack');
  });
}
