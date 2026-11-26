import { sfx } from '../../audio';
import { DEFAULT_SETTINGS, getSettings, setSettings, type Settings } from '../../settings';
import type { Color } from '../../types';
import type { App } from '../app';
import { button, el, pips } from '../ui';

interface SliderDef { key: 'master' | 'sfx' | 'music' | 'shake' | 'numberSize'; label: string; min: number; max: number; step: number; fmt: (v: number) => string }

const pct = (v: number): string => `${Math.round(v * 100)}%`;
const SLIDERS: SliderDef[] = [
  { key: 'master', label: 'Master volume', min: 0, max: 1, step: 0.05, fmt: pct },
  { key: 'sfx', label: 'Sound effects', min: 0, max: 1, step: 0.05, fmt: pct },
  { key: 'music', label: 'Music', min: 0, max: 1, step: 0.05, fmt: pct },
  { key: 'shake', label: 'Screen shake', min: 0, max: 1, step: 0.05, fmt: pct },
  { key: 'numberSize', label: 'Damage-number size', min: 0.75, max: 1.5, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
];

/** Settings (DESIGN.md, Settings). Changes apply immediately; Back returns to where the player came from. */
export function settingsScreen(app: App): void {
  const back = app.settingsBack ?? (() => app.goto.title());
  app.show((s) => {
    s.classList.add('rn-center');
    const box = el('div', 'rn-rewardbox rn-settings', undefined, s);
    el('h2', 'rn-h2', 'Settings', box);
    const panel = el('div', 'rn-panel rn-setpanel', undefined, box);
    const cur = getSettings();
    for (const def of SLIDERS) {
      const row = el('label', 'rn-setrow', undefined, panel);
      el('span', 'rn-setlabel', def.label, row);
      const input = el('input', 'rn-slider', undefined, row);
      input.type = 'range';
      input.min = String(def.min);
      input.max = String(def.max);
      input.step = String(def.step);
      input.value = String(cur[def.key]);
      const val = el('span', 'rn-setval', def.fmt(cur[def.key]), row);
      input.addEventListener('input', () => {
        const v = Number(input.value);
        setSettings({ [def.key]: v } as Partial<Settings>);
        val.textContent = def.fmt(getSettings()[def.key]);
      });
      // A short blip on release so the sound sliders can be judged.
      if (def.key === 'master' || def.key === 'sfx') input.addEventListener('change', () => sfx('uiClick'));
    }

    const cb = el('label', 'rn-setrow rn-setcheck', undefined, panel);
    const box2 = el('input', undefined, undefined, cb);
    box2.type = 'checkbox';
    box2.checked = cur.colorblind;
    el('span', 'rn-setlabel', 'Colorblind mode', cb);
    el('span', 'rn-note', 'Draws a shape on every color pip and socket', cb);
    const preview = el('div', 'rn-setpreview', undefined, panel);
    const drawPreview = (): void => {
      preview.innerHTML = '';
      el('span', 'rn-note', 'Colors:', preview);
      pips(['R', 'G', 'B', 'Y', 'P', 'T', 'W'] as Color[], preview);
    };
    drawPreview();
    box2.addEventListener('change', () => { setSettings({ colorblind: box2.checked }); drawPreview(); sfx('uiClick'); });

    const actions = el('div', 'rn-actions', undefined, box);
    button('Reset to defaults', 'rn-btn', () => { setSettings({ ...DEFAULT_SETTINGS }); settingsScreen(app); }, actions);
    button('Back', 'rn-btn primary', () => { app.settingsBack = null; back(); }, actions, 'uiBack');
  });
}
