import { sfx } from '../../audio';
import { CATALOG } from '../../data/runes';
import { SCHOOLS } from '../../data/schools';
import type { AbilityId } from '../../types';
import { abilityInfo } from '../abilities';
import type { App } from '../app';
import { actTitle } from '../floors';
import { HISTORY_MAX, clearHistory, loadHistory, type HistoryEntry } from '../history';
import { ENEMY_INFO, button, el } from '../ui';

/** Copy text: navigator.clipboard when allowed, else a selectable text field. */
export async function copyText(text: string, fallbackParent: HTMLElement): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to the manual field */ }
  let field = fallbackParent.querySelector<HTMLTextAreaElement>('textarea.rn-codefield');
  if (!field) {
    field = el('textarea', 'rn-codefield', undefined, fallbackParent);
    field.readOnly = true;
    field.rows = 2;
  }
  field.value = text;
  field.focus();
  field.select();
  try { if (document.execCommand('copy')) return true; } catch { /* ignore */ }
  return false;
}

const when = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

function entryCard(e: HistoryEntry, parent: HTMLElement): void {
  const card = el('div', `rn-sumcard compact rn-hist ${e.outcome}`, undefined, parent);
  const head = el('div', 'rn-histhead', undefined, card);
  const result = e.outcome === 'won' ? 'Victory' : e.outcome === 'lost' ? 'Defeated' : 'Abandoned';
  el('strong', `rn-histresult ${e.outcome}`, result, head);
  el('span', 'rn-note', when(e.date), head);
  const school = SCHOOLS.find((s) => s.id === e.school)?.name ?? e.school;
  const ab = abilityInfo(e.ability as AbilityId).name;
  const chips = el('div', 'rn-runelist left', undefined, card);
  const reach = e.outcome === 'won' ? 'Cleared all 3 acts' : `Reached act ${e.act}, row ${e.row}`;
  const boss = e.boss ? (ENEMY_INFO[e.boss]?.name ?? e.boss) : null;
  const top = e.topRune ? `${CATALOG[e.topRune.defId]?.name ?? e.topRune.defId} (${e.topRune.damage})` : null;
  const lines = [school, ab, reach, boss ? `Boss: ${boss}` : '', `${e.kills} kills`, `best hit ${e.bestHit}`, top ? `Top rune: ${top}` : '',
    e.daily ? `Daily ${e.daily}` : `Seed ${e.seed}`].filter(Boolean);
  for (const t of lines) el('span', 'rn-chip', t, chips);
  el('div', 'rn-note', actTitle(Math.max(1, Math.min(3, e.act))), card);
  if (e.code) {
    const row = el('div', 'rn-row', undefined, card);
    const status = el('span', 'rn-note', '', row);
    button('Copy spell code', 'rn-btn', () => {
      void copyText(e.code, card).then((ok) => { status.textContent = ok ? 'Copied!' : 'Select the code below and copy it.'; });
    }, row);
  }
}

export function historyScreen(app: App): void {
  app.show((s) => {
    s.classList.add('rn-center');
    const box = el('div', 'rn-sumscroll', undefined, s);
    el('h2', 'rn-h2', 'Run history', box).style.textAlign = 'center';
    el('p', 'rn-sub', `Your last ${HISTORY_MAX} runs, newest first. Spell codes can be imported in the rune editor.`, box).style.textAlign = 'center';
    const list = loadHistory();
    if (!list.length) el('p', 'rn-note', 'No runs recorded yet. Finish or abandon a run and it shows up here.', box);
    for (const e of list) entryCard(e, box);
    const row = el('div', 'rn-row', undefined, box);
    button('Back', 'rn-btn primary', () => app.goto.title(), row, 'uiBack');
    if (list.length) {
      const clear = button('Clear history', 'rn-btn danger', () => {
        if (clear.dataset.sure) { clearHistory(); sfx('uiBack'); app.goto.history(); return; }
        clear.dataset.sure = '1';
        clear.textContent = 'Really clear?';
      }, row);
    }
  });
}
