import type { App } from '../app';
import { actTitle } from '../floors';
import { button, el } from '../ui';

const FLAVOR = [
  'Cold stone and older things. Something old waits at the bottom of the stair.',
  'Mist rolls over frozen reeds. Whatever is out there is learning your spell.',
  'Lightning walks the tower. This is the last climb.',
];

/** Short title card that opens each act. Continue goes to the act's map. */
export function actScreen(app: App): void {
  const act = app.run.act;
  app.show((s) => {
    s.classList.add('rn-center', 'rn-actcard');
    const box = el('div', 'rn-title', undefined, s);
    el('div', 'rn-actnum', `Act ${act} of 3`, box);
    el('h1', 'rn-logo rn-acttitle', actTitle(act), box);
    el('p', 'rn-pitch', FLAVOR[act - 1] ?? '', box);
    const go = button('Continue', 'rn-btn primary big', () => app.goto.map(), box);
    go.focus();
    const key = (e: KeyboardEvent): void => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go.click(); } };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
}
