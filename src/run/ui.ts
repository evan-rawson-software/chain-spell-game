import { CATALOG, runeTooltip } from '../data/runes';
import { upgradeDef, defOf } from '../spell';
import { sfx, type SfxName } from '../audio';
import { getSettings } from '../settings';
import { COLOR_HEX, COLOR_SHAPE } from '../types';
import type { BoonDef, EliteTraitId, EnemyKind, HazardId, MapNodeKind, RuneDef, RuneInstance } from '../types';
import type { NodePreview } from './floors';
import type { App } from './app';
import { MAP_ROWS } from './map';
import { recordRunEnd } from './history';
import { effectiveWardHp, clearRun } from './state';

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, cls?: string, text?: string, parent?: HTMLElement,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.appendChild(e);
  return e;
}

export function button(label: string, cls: string, onClick: () => void, parent?: HTMLElement, sound: SfxName = 'uiClick'): HTMLButtonElement {
  const b = el('button', cls, label, parent);
  b.addEventListener('click', () => { sfx(sound); onClick(); });
  return b;
}

const COLOR_LABEL: Record<string, string> = {
  R: 'Red', G: 'Green', B: 'Blue', Y: 'Yellow (red + green)', P: 'Purple (red + blue)', T: 'Teal (green + blue)', W: 'White (all colors)',
};

/** Color pips; with colorblind mode on every pip carries its COLOR_SHAPE glyph. */
export function pips(colors: RuneDef['inputs'], parent: HTMLElement): void {
  const wrap = el('span', 'rn-pips', undefined, parent);
  const shapes = getSettings().colorblind;
  for (const c of colors) {
    const p = el('span', 'rn-pip', undefined, wrap);
    p.style.background = COLOR_HEX[c];
    p.title = COLOR_LABEL[c] ?? c;
    if (shapes) {
      p.textContent = COLOR_SHAPE[c];
      p.classList.add('letter', 'shape');
      p.style.color = c === 'W' || c === 'Y' || c === 'G' ? '#111' : '#fff';
    } else if (c === 'Y' || c === 'P' || c === 'T' || c === 'W') {
      p.textContent = c;
      p.classList.add('letter');
      p.style.color = c === 'W' || c === 'Y' ? '#111' : '#fff';
    }
  }
}

export function fmtCast(t: number): string {
  const v = Math.round(t * 100) / 100;
  return `${v > 0 ? '+' : ''}${v}s`;
}

export function fmtTime(sec: number): string {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const RARITY_LABEL: Record<string, string> = { starter: 'Starter', common: 'Common', uncommon: 'Uncommon', rare: 'Rare', fused: 'Fused' };

/** A rune card (as on the reward screen). `tag` 'button' makes it clickable. */
export function runeCard(def: RuneDef, parent: HTMLElement, tag: 'button' | 'div' = 'button'): HTMLElement {
  const card = el(tag, 'rn-card', undefined, parent);
  card.classList.add(def.rarity);
  el('div', 'rn-card-name', def.name, card);
  el('div', 'rn-card-rarity', RARITY_LABEL[def.rarity] ?? def.rarity, card);
  const io = el('div', 'rn-card-io', undefined, card);
  el('span', 'rn-io-label', 'In', io);
  pips(def.inputs, io);
  el('span', 'rn-io-label', 'Out', io);
  if (def.outputs.length) pips(def.outputs, io); else el('span', 'rn-io-none', 'none', io);
  const effects = runeTooltip(def).split('\n').slice(3).join('\n');
  el('div', 'rn-card-desc', effects || 'No extra effect. Useful for routing colors.', card);
  const stats = el('div', 'rn-card-stats', undefined, card);
  el('span', 'rn-stat mana', `Mana ${def.mana}`, stats);
  el('span', `rn-stat cast ${def.castTime > 0 ? 'bad' : def.castTime < 0 ? 'good' : ''}`, `Cast ${fmtCast(def.castTime)}`, stats);
  return card;
}

/** A blessing or curse card with a title and description. */
export function boonCard(def: BoonDef, parent: HTMLElement, tag: 'button' | 'div' = 'button'): HTMLElement {
  const card = el(tag, `rn-card rn-boon-card ${def.kind}`, undefined, parent);
  el('div', 'rn-card-name', def.name, card);
  el('div', 'rn-card-rarity', def.kind === 'blessing' ? 'Blessing' : 'Curse', card);
  el('div', 'rn-card-desc', def.description, card);
  return card;
}

/** Small pill for a held blessing / curse. */
export function boonChip(def: BoonDef, parent: HTMLElement): HTMLElement {
  const c = el('span', `rn-boonchip ${def.kind}`, def.name, parent);
  c.title = `${def.kind === 'blessing' ? 'Blessing' : 'Curse'}: ${def.description}`;
  return c;
}

export const NODE_INFO: Record<MapNodeKind, { glyph: string; label: string; desc: string }> = {
  battle: { glyph: '⚔', label: 'Battle', desc: 'Prepare, then fight. Win gold, 2 of 5 runes and +2 max mana.' },
  elite: { glyph: '★', label: 'Elite', desc: 'A tougher fight with an Elite Knight. Win more gold, rarer runes, +3 max mana and a blessing.' },
  shop: { glyph: '$', label: 'Shop', desc: 'Spend gold on runes, forging, or removing a curse. +1 max mana.' },
  forge: { glyph: '⚒', label: 'Forge', desc: 'Upgrade one owned rune for free. +1 max mana.' },
  shrine: { glyph: '✦', label: 'Shrine', desc: 'Pick a blessing, or take a Dark Bargain. +1 max mana.' },
  event: { glyph: '?', label: 'Event', desc: 'A short choice with a tradeoff. +1 max mana.' },
  treasure: { glyph: '◆', label: 'Treasure', desc: 'Pick 1 of 3 rare runes, at least one a keystone. +1 max mana.' },
  rest: { glyph: '☾', label: 'Rest', desc: '+10 max ward HP, or forge one rune for free. +1 max mana.' },
  boss: { glyph: '☠', label: 'Boss', desc: "The act's boss. Acts I and II give an elite-style reward; beating the third boss wins the run." },
};

/** Map preview texts (DESIGN.md: Enemies, Hazards, Elite traits, Bosses). */
export const ENEMY_INFO: Partial<Record<EnemyKind, { name: string; glyph: string; rule: string }>> = {
  shield_bearer: { name: 'Shield Bearer', glyph: '◈', rule: 'A shield absorbs the first hit; regrows after 4 s. Use many small hits.' },
  splitter: { name: 'Splitter', glyph: '⑂', rule: 'Splits into 3 Splitlings on death. Use area damage.' },
  cleanser: { name: 'Cleanser', glyph: '✚', rule: 'Every 4 s strips statuses within 150. Burst it first.' },
  armored: { name: 'Armored', glyph: '▣', rule: 'Takes 60% less damage unless frozen or weakened.' },
  swarmer: { name: 'Swarmer', glyph: '∴', rule: 'Arrives in packs of 8-12, tiny and fast. Pierce or chain.' },
  boss_lich: { name: 'Lich King', glyph: '☠', rule: 'Ranged volleys and summons.' },
  boss_golem: { name: 'Stone Golem', glyph: '☠', rule: 'Shell cuts damage 75% (Shatter, Combust or Overload breaks it); stomps hurt the ward.' },
  boss_hydra: { name: 'Hydra', glyph: '☠', rule: 'Grows 2 Hydra Heads at 66% and 33% HP.' },
};
export const HAZARD_INFO: Record<HazardId, { name: string; glyph: string; rule: string }> = {
  rain: { name: 'Rain', glyph: '≋', rule: 'Every enemy is permanently Wet; fire damage -25%.' },
  heatwave: { name: 'Heatwave', glyph: '≈', rule: 'Every 5 s all enemies start Burning; slows are half as strong.' },
  fog: { name: 'Fog', glyph: '░', rule: 'Enemies beyond x = 650 are hidden until hit.' },
};
export const TRAIT_INFO: Record<EliteTraitId, { name: string; glyph: string; rule: string }> = {
  hasted: { name: 'Hasted', glyph: '»', rule: 'Elites move 40% faster.' },
  reflective: { name: 'Reflective', glyph: '↺', rule: '15% of damage they take hits the ward (max 5 per hit).' },
  regenerating: { name: 'Regenerating', glyph: '+', rule: 'Elites heal 2% max HP/s after 2 s without being hit.' },
  burn_immune: { name: 'Burn-immune', glyph: '⊘', rule: 'No burn on elites; fire damage -50%.' },
};

export interface PreviewLine { glyph: string; kind: string; name: string; rule: string }
/** Preview lines for a node's featured enemy, hazard, trait and boss. */
export function previewLines(p: NodePreview): PreviewLine[] {
  const out: PreviewLine[] = [];
  const e = p.featured ? ENEMY_INFO[p.featured] : undefined;
  if (e) out.push({ glyph: e.glyph, kind: 'Featured enemy', name: e.name, rule: e.rule });
  const h = p.hazard ? HAZARD_INFO[p.hazard] : undefined;
  if (h) out.push({ glyph: h.glyph, kind: 'Hazard', name: h.name, rule: h.rule });
  const t = p.trait ? TRAIT_INFO[p.trait] : undefined;
  if (t) out.push({ glyph: t.glyph, kind: 'Elite trait', name: t.name, rule: t.rule });
  const b = p.boss ? ENEMY_INFO[p.boss] : undefined;
  if (b) out.push({ glyph: b.glyph, kind: 'Boss', name: b.name, rule: b.rule });
  return out;
}

/** Stat chips (gold, mana, ward HP) and the held boons. */
export function runStats(app: App, parent: HTMLElement): void {
  const run = app.run;
  const totals = app.totals();
  const gold = el('span', 'rn-stchip gold', `● ${run.gold} gold`, parent);
  gold.title = 'Gold';
  const mana = el('span', 'rn-stchip mana', `Mana ${run.maxMana}`, parent);
  mana.title = 'Max mana (spell budget)';
  const ward = el('span', 'rn-stchip ward', `Ward ${effectiveWardHp(run, totals)} HP`, parent);
  ward.title = 'Ward HP (resets every battle)';
  if (run.daily) {
    const d = el('span', 'rn-stchip daily', 'Daily', parent);
    d.title = `Daily run ${run.daily}: same map and offers for everyone today`;
  }
  const boons = el('span', 'rn-boons', undefined, parent);
  for (const id of run.boons) {
    const d = app.boons[id];
    if (d) boonChip(d, boons);
  }
}

/** Abandon-run control with an inline confirmation. */
export function abandonControl(app: App, parent: HTMLElement): void {
  const wrap = el('span', 'rn-abandon', undefined, parent);
  const render = (confirming: boolean): void => {
    wrap.innerHTML = '';
    if (!confirming) {
      button('Abandon run', 'rn-btn danger', () => render(true), wrap);
    } else {
      el('span', 'rn-note', 'Abandon this run?', wrap);
      button('Yes', 'rn-btn danger solid', () => {
        if (app.run.stats.battles > 0) recordRunEnd(app.run, 'abandoned');
        clearRun();
        app.goto.title();
      }, wrap);
      button('No', 'rn-btn', () => render(false), wrap);
    }
  };
  render(false);
}

/** Standard top bar. Returns the left and right clusters. */
export function topBar(app: App, screen: HTMLElement, heading: string, tag?: 'elite' | 'boss'): { bar: HTMLElement; left: HTMLElement; right: HTMLElement } {
  const bar = el('div', 'rn-topbar rn-wrap', undefined, screen);
  const left = el('div', 'rn-topleft', undefined, bar);
  el('span', 'rn-floor', heading, left);
  if (tag) el('span', `rn-tag ${tag}`, tag === 'elite' ? 'Elite' : 'Boss', left);
  runStats(app, left);
  const right = el('div', 'rn-topright', undefined, bar);
  return { bar, left, right };
}

export const rowLabel = (row: number, act: number): string => `Act ${act} · Row ${row}/${MAP_ROWS}`;

/** The ⚙ button: opens the settings screen and returns to `back` afterwards. */
export function gearButton(app: App, parent: HTMLElement, back: () => void): HTMLButtonElement {
  const b = button('⚙', 'rn-btn rn-gear', () => app.openSettings(back), parent);
  b.title = 'Settings';
  b.setAttribute('aria-label', 'Settings');
  return b;
}


/** Compact selectable list of owned runes. */
export function runePicker(
  parent: HTMLElement, runes: RuneInstance[], inGraph: Set<string>, selected: string | null, onPick: (uid: string) => void,
): void {
  const list = el('div', 'rn-picker', undefined, parent);
  for (const inst of runes) {
    const def = defOf(CATALOG, inst);
    if (!def) continue;
    const b = el('button', `rn-pick ${def.rarity}${inst.uid === selected ? ' selected' : ''}`, undefined, list);
    el('span', 'rn-pick-name', def.name, b);
    el('span', 'rn-pick-sub', inGraph.has(inst.uid) ? 'in spell' : 'inventory', b);
    b.addEventListener('click', () => { sfx('uiClick'); onPick(inst.uid); });
  }
}

/** Side-by-side "current -> forged" cards for an owned rune. */
export function forgePreview(inst: RuneInstance, parent: HTMLElement): void {
  const def = defOf(CATALOG, inst);
  if (!def) return;
  const row = el('div', 'rn-forgeprev', undefined, parent);
  const a = runeCard(def, row, 'div');
  a.classList.add('static');
  el('span', 'rn-forgearrow', '→', row);
  const b = runeCard(upgradeDef(def), row, 'div');
  b.classList.add('static', 'forged');
}

/** Like runePicker, but several runes can be selected; `canPick` greys out ineligible ones. */
export function runePickerMulti(
  parent: HTMLElement, runes: RuneInstance[], inGraph: Set<string>, selected: string[],
  canPick: (inst: RuneInstance) => boolean, onToggle: (uid: string) => void,
): void {
  const list = el('div', 'rn-picker', undefined, parent);
  for (const inst of runes) {
    const def = defOf(CATALOG, inst);
    if (!def) continue;
    const on = selected.includes(inst.uid);
    const b = el('button', `rn-pick ${def.rarity}${on ? ' selected' : ''}`, undefined, list);
    el('span', 'rn-pick-name', def.name, b);
    el('span', 'rn-pick-sub', inGraph.has(inst.uid) ? 'in spell' : 'inventory', b);
    b.disabled = !on && !canPick(inst);
    b.addEventListener('click', () => { sfx('uiClick'); onToggle(inst.uid); });
  }
}
