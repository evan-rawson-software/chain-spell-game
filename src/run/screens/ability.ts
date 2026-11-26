import { COLOR_HEX } from '../../types';
import type { App } from '../app';
import { ABILITIES } from '../abilities';
import { SCHOOLS } from '../../data/schools';
import { button, el } from '../ui';

/** Second step of a new run: pick the active ability (after the school). */
export function abilityScreen(app: App): void {
  const schoolId = app.schoolPending;
  if (!schoolId) { app.goto.school(); return; }
  const school = SCHOOLS.find((s) => s.id === schoolId);
  app.show((s) => {
    s.classList.add('rn-center');
    const box = el('div', 'rn-rewardbox', undefined, s);
    el('h2', 'rn-h2', 'Choose your ability', box);
    el('p', 'rn-sub', `One active ability for the whole run${school ? ` (${school.name})` : ''}. Use it in battle with Space, right-click or the HUD button (tap it on touch screens).`, box);
    if (app.dailyPending) el('p', 'rn-sub', `Daily run ${app.dailyPending}`, box);
    const cards = el('div', 'rn-cards', undefined, box);
    for (const ab of ABILITIES) {
      const card = el('button', 'rn-card rn-school rn-ability', undefined, cards);
      card.style.setProperty('--sc', COLOR_HEX.W);
      el('div', 'rn-card-name', ab.name, card);
      el('div', 'rn-card-rarity', `Cooldown ${ab.cooldown} s`, card);
      el('div', 'rn-card-desc', ab.description, card);
      card.addEventListener('click', () => app.goto.newRun(schoolId, ab.id));
    }
    const actions = el('div', 'rn-actions', undefined, box);
    button('Back', 'rn-btn', () => app.goto.school(), actions, 'uiBack');
  });
}
