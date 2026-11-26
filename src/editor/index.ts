import './editor.css';
import { COLOR_HEX, COLOR_SHAPE } from '../types';
import type { Color, Element, KeystoneId, Modifier, OutputRef, RuneDef, RuneInstance, SpellGraph } from '../types';
import type { EditorHandle, EditorOptions, MountEditor, Placement } from '../contracts';
import {
  compileSpell, decodeSpell, defOf as resolveDef, encodeSpell, findPlacements, openOutputs, placeRune, removeRune,
  socketBonusActive, validateSpell,
} from '../spell';
import { getSettings, onSettings } from '../settings';
import { runeTooltip } from '../data/runes';
import { sfx } from '../audio';
import { mountPractice } from '../battle';
import type { PracticeHandle } from '../contracts';

const CARD_W = 190;
const SOCK0 = 34;
const ROW = 30;
const BODY_H = 78;
const BONUS_H = 18;
const COL_GAP = 100;
const ROW_GAP = 26;
const PAD_X = 36;
const PAD_Y = 44;
const RARITY_COLOR: Record<string, string> = {
  starter: '#8d86a6', common: '#b9c0cc', uncommon: '#46a758', rare: '#f5c518', fused: '#14b8a6',
};
const MAX_GHOSTS = 12;
const SVGNS = 'http://www.w3.org/2000/svg';

const ELEMENT_COLOR: Record<Element, Color> = {
  fire: 'R', frost: 'B', nature: 'G', lightning: 'Y', arcane: 'P', storm: 'T', pure: 'W',
};
const COLOR_NAME: Record<Color, string> = {
  R: 'Red', G: 'Green', B: 'Blue', Y: 'Yellow', P: 'Purple', T: 'Teal', W: 'White',
};
const isComplex = (c: Color): boolean => c === 'Y' || c === 'P' || c === 'T' || c === 'W';

const touchOnly = (): boolean => typeof matchMedia === 'function' && matchMedia('(hover: none)').matches;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K, cls?: string, text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function pip(c: Color): HTMLElement {
  const cb = getSettings().colorblind;
  const p = h('span', `re-pip${cb ? ' cb' : ''}`, cb ? COLOR_SHAPE[c] : c);
  p.style.setProperty('--pc', COLOR_HEX[c]);
  p.title = COLOR_NAME[c];
  return p;
}

function nodeHeight(def: RuneDef): number {
  return Math.max(BODY_H + (def.socketBonus ? BONUS_H : 0), SOCK0 + Math.max(def.inputs.length, def.outputs.length, 1) * ROW + 6);
}
const sockY = (i: number): number => SOCK0 + i * ROW + ROW / 2;

const STAT_LABEL: Record<string, string> = {
  damage: 'damage', speed: 'speed', aoeRadius: 'AoE radius', count: 'projectiles', spreadDeg: 'spread',
  pierce: 'pierce', homing: 'homing', chain: 'chain', statusPotency: 'status power',
  statusDuration: 'status duration', castTime: 'cast time', manaCost: 'mana cost',
};
function modText(m: Modifier): string {
  const label = `${m.element ? `${m.element} ` : ''}${STAT_LABEL[m.stat] ?? m.stat}`;
  const sign = (n: number): string => (n >= 0 ? '+' : '-');
  if (m.op === 'increased') return `${sign(m.value)}${fmt(Math.abs(Math.round(m.value * 100)))}% ${label}`;
  if (m.op === 'more') return `x${fmt(Math.round((1 + m.value) * 100) / 100)} ${label}`;
  return `${sign(m.value)}${fmt(Math.abs(m.value))} ${label}`;
}
const KEYSTONE_RULE: Record<KeystoneId, { name: string; short: string }> = {
  echo: { name: 'Echo', short: 'Every 3rd cast fires twice' },
  death_split: { name: 'Death Split', short: 'Kills split into 2 homing shards' },
  everlasting: { name: 'Everlasting', short: 'Reactions keep statuses' },
  chain_reaction: { name: 'Chain Reaction', short: 'Reactions can trigger reactions' },
  frostfire: { name: 'Frostfire', short: 'Fire hits slow, frost hits burn' },
  momentum: { name: 'Momentum', short: '+10% damage per cast, resets on hit' },
};
/** One-line effect summary for a rune card. */
function summarize(def: RuneDef): string {
  if (def.keystone) return KEYSTONE_RULE[def.keystone].short;
  const parts: string[] = [];
  if (def.shot) {
    const s = def.shot;
    parts.push(`${fmt(s.damage)} ${s.element}${s.count > 1 ? ` x${s.count}` : ''}`);
    if (s.aoeRadius > 0) parts.push('AoE');
    if (s.pierce > 0) parts.push('pierce');
    if (s.chain > 0) parts.push('chain');
    if (s.homing > 0) parts.push('homing');
    for (const st of s.statuses) parts.push(st.kind);
  }
  for (const m of def.augments ?? []) parts.push(modText(m));
  for (const m of def.globals ?? []) parts.push(`all: ${modText(m)}`);
  if (def.outputs.length) {
    const outs = def.outputs.join(' \u00B7 ');
    if (parts.length === 0) {
      return def.inputs.length === 0 ? `Emits ${outs}` : `Splits ${def.inputs.join('+')} into ${def.outputs.join(', ')}`;
    }
    return `\u2192 ${outs} \u00B7 ${parts.slice(0, 2).join(' \u00B7 ')}`;
  }
  if (parts.length === 0) return def.description.split(/[.\n]/)[0];
  return parts.slice(0, 3).join(' \u00B7 ');
}
function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

let practiceMemo = false; // fallback when localStorage is unavailable

export const mountEditor: MountEditor = (container: HTMLElement, opts: EditorOptions): EditorHandle => {
  const { catalog } = opts;
  let graph: SpellGraph = opts.graph;
  let selectedInv: string | null = null;
  let selectedNode: string | null = null;
  let notice: { text: string; kind: 'warn' | 'info' } | null = null;
  let destroyed = false;

  const root = h('div', 're-root');
  const main = h('div', 're-main');
  const canvas = h('div', 're-canvas');
  const layer = h('div', 're-layer');
  const controls = h('div', 're-ctl');
  const side = h('div', 're-side');
  main.appendChild(canvas);
  // narrow portrait layout: graph on top, a tab bar and a bottom sheet for Inventory / Stats
  const tabBar = h('div', 're-tabs');
  const TABS: [string, string][] = [['spell', 'Spell'], ['inv', 'Inventory'], ['stats', 'Stats']];
  const tabBtns = TABS.map(([id, label]) => {
    const b = h('button', 're-tab', label) as HTMLButtonElement;
    b.type = 'button';
    b.addEventListener('click', () => setTab(id));
    tabBar.appendChild(b);
    return b;
  });
  function setTab(id: string): void {
    root.dataset.tab = id;
    tabBtns.forEach((b, i) => b.classList.toggle('active', TABS[i][0] === id));
  }
  root.append(main, tabBar, side);
  setTab('spell');
  container.appendChild(root);

  const tooltip = h('div', 're-tooltip');
  tooltip.style.display = 'none';
  container.appendChild(tooltip);

  const defOf = (inst: RuneInstance): RuneDef | undefined => resolveDef(catalog, inst);
  const isForged = (def: RuneDef): boolean => def.name.endsWith('+');

  // ---------------------------------------------------------- tooltips
  const hideTip = (): void => { tooltip.style.display = 'none'; };
  function attachTip(el: HTMLElement, def: RuneDef): void {
    const move = (e: MouseEvent): void => {
      const w = tooltip.offsetWidth || 300;
      const hgt = tooltip.offsetHeight || 100;
      let x = e.clientX + 16;
      let y = e.clientY + 16;
      if (x + w > window.innerWidth - 8) x = e.clientX - w - 12;
      if (y + hgt > window.innerHeight - 8) y = e.clientY - hgt - 12;
      tooltip.style.left = `${Math.max(4, x)}px`;
      tooltip.style.top = `${Math.max(4, y)}px`;
    };
    el.addEventListener('mouseenter', (e) => {
      if (touchOnly()) return; // emulated mouseenter after a tap would leave the tooltip stuck
      tooltip.textContent = runeTooltip(def);
      tooltip.style.display = 'block';
      move(e);
    });
    el.addEventListener('mousemove', move);
    el.addEventListener('mouseleave', hideTip);
  }

  // ---------------------------------------------------------- selection
  function clearSelection(): void {
    selectedInv = null;
    selectedNode = null;
    notice = null;
  }

  // ---------------------------------------------------------- undo / redo
  const HISTORY_CAP = 100;
  const undoStack: SpellGraph[] = [];
  const redoStack: SpellGraph[] = [];
  let undoBtn: HTMLButtonElement | null = null;
  let redoBtn: HTMLButtonElement | null = null;
  function syncHistoryButtons(): void {
    if (undoBtn) undoBtn.disabled = undoStack.length === 0;
    if (redoBtn) redoBtn.disabled = redoStack.length === 0;
  }

  function applyGraph(g: SpellGraph): void {
    if (g === graph) return;
    undoStack.push(graph);
    if (undoStack.length > HISTORY_CAP) undoStack.shift();
    redoStack.length = 0;
    graph = g;
    syncHistoryButtons();
    opts.onChange(g);
    syncPractice();
  }

  function stepHistory(from: SpellGraph[], to: SpellGraph[]): void {
    const g = from.pop();
    if (!g) return;
    to.push(graph);
    graph = g;
    clearSelection();
    sfx('undo');
    syncHistoryButtons();
    opts.onChange(g);
    syncPractice();
    render();
  }
  const undo = (): void => stepHistory(undoStack, redoStack);
  const redo = (): void => stepHistory(redoStack, undoStack);

  function removeNode(uid: string): void {
    if (uid === graph.rootUid) return;
    try {
      applyGraph(removeRune(graph, uid));
      sfx('runeRemove');
    } catch (err) {
      notice = { text: String(err instanceof Error ? err.message : err), kind: 'warn' };
      sfx('uiError');
    }
    if (selectedNode) selectedNode = null;
    selectedInv = null;
    render();
  }

  // ---------------------------------------------------------- practice pane
  const PRACTICE_KEY = 'chain-spell-practice';
  const loadPractice = (): boolean => {
    try { return localStorage.getItem(PRACTICE_KEY) === '1'; } catch { return practiceMemo; }
  };
  let practiceOn = loadPractice();
  let practiceHandle: PracticeHandle | null = null;
  let practiceDivider: HTMLElement | null = null;
  let practicePane: HTMLElement | null = null;
  let practiceMsg: HTMLElement | null = null;
  /** An imported spell being previewed in the practice pane (the editor graph is untouched). */
  let previewGraph: SpellGraph | null = null;
  let previewBanner: HTMLElement | null = null;
  let previewUse: HTMLButtonElement | null = null;
  let previewNote: HTMLElement | null = null;

  function showPracticeError(text: string): void {
    if (!practiceMsg) return;
    practiceMsg.textContent = `Spell invalid: ${text}`;
    practiceMsg.style.display = 'block';
  }

  function applyPracticeSpell(g: SpellGraph, maxMana: number): void {
    if (!practiceHandle || !practiceMsg || destroyed) return;
    const v = validateSpell(g, catalog, maxMana);
    if (v.errors.length > 0) { showPracticeError(v.errors[0]); return; }
    practiceMsg.style.display = 'none';
    try {
      practiceHandle.setSpell(compileSpell(g, catalog, opts.extraGlobals), g);
    } catch (err) {
      showPracticeError(err instanceof Error ? err.message : String(err));
    }
  }

  function syncPractice(): void {
    if (previewGraph) return; // an imported spell is showing; Close returns to the current one
    applyPracticeSpell(graph, opts.maxMana);
  }

  /** Map an imported spell onto distinct owned instances (forged nodes need forged copies). */
  function mapOwned(imp: SpellGraph): { graph?: SpellGraph; error?: string } {
    const placedUids = new Set(graph.nodes.map((n) => n.uid));
    const pool = [...opts.owned].sort((a, b) => Number(placedUids.has(b.uid)) - Number(placedUids.has(a.uid)));
    const used = new Set<string>();
    const uidMap = new Map<string, string>();
    const missing = new Map<string, number>();
    const nodes: RuneInstance[] = [];
    for (const n of imp.nodes) {
      if (n.uid === imp.rootUid) {
        const r = graph.nodes.find((x) => x.uid === graph.rootUid) ?? opts.root;
        uidMap.set(n.uid, r.uid);
        nodes.push(r);
        continue;
      }
      const hit = pool.find((o) => !used.has(o.uid) && o.defId === n.defId && !!o.plus === !!n.plus);
      if (!hit) {
        const label = defOf(n)?.name ?? n.defId;
        missing.set(label, (missing.get(label) ?? 0) + 1);
        continue;
      }
      used.add(hit.uid);
      uidMap.set(n.uid, hit.uid);
      nodes.push(hit);
    }
    if (missing.size > 0) {
      const list = [...missing].map(([name, c]) => (c > 1 ? `${name} \u00D7${c}` : name)).join(', ');
      return { error: `Missing runes: ${list}` };
    }
    const m = (uid: string): string => uidMap.get(uid) ?? uid;
    const ng: SpellGraph = {
      rootUid: m(imp.rootUid),
      nodes,
      links: imp.links.map((l) => ({ ...l, from: { ...l.from, uid: m(l.from.uid) }, toUid: m(l.toUid) })),
    };
    const v = validateSpell(ng, catalog, opts.maxMana);
    if (v.manaUsed > opts.maxMana) return { error: `Needs ${fmt(v.manaUsed)} mana (you have ${fmt(opts.maxMana)})` };
    if (v.errors.length > 0) return { error: v.errors[0] };
    return { graph: ng };
  }

  function refreshBanner(): void {
    if (!previewBanner || !previewUse || !previewNote) return;
    if (!previewGraph) { previewBanner.style.display = 'none'; practiceMsg?.classList.remove('with-banner'); return; }
    previewBanner.style.display = 'flex';
    practiceMsg?.classList.add('with-banner');
    const m = mapOwned(previewGraph);
    previewUse.disabled = !m.graph;
    previewUse.title = m.graph ? 'Replace your spell with this one' : (m.error ?? '');
    previewNote.textContent = m.error ?? '';
  }

  function stopPreview(): void {
    previewGraph = null;
    refreshBanner();
    syncPractice();
  }

  function useImported(): void {
    if (!previewGraph) return;
    const m = mapOwned(previewGraph);
    if (!m.graph) return;
    applyGraph(m.graph);
    stopPreview();
    clearSelection();
    sfx('runePlace');
    toast('Imported spell applied');
    render();
  }

  function startPreview(g: SpellGraph): void {
    if (!practiceHandle) {
      openPractice();
      practiceBtn.classList.toggle('active', practiceHandle !== null);
      requestAnimationFrame(() => { if (!destroyed) fitView(true); });
    }
    if (!practiceHandle) { notice = { text: 'Could not open the practice range.', kind: 'warn' }; render(); return; }
    previewGraph = g;
    applyPracticeSpell(g, Infinity);
    refreshBanner();
  }

  // ---------------------------------------------------------- toast, share and import
  let toastEl: HTMLElement | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  function toast(text: string): void {
    toastEl?.remove();
    if (toastTimer) clearTimeout(toastTimer);
    toastEl = h('div', 're-toast', text);
    container.appendChild(toastEl);
    toastTimer = setTimeout(() => { toastEl?.remove(); toastEl = null; }, 1700);
  }

  const pop = h('div', 're-pop');
  let popMode: 'share' | 'import' | null = null;
  pop.addEventListener('click', (e) => e.stopPropagation());
  pop.addEventListener('wheel', (e) => e.stopPropagation());
  pop.addEventListener('pointerdown', (e) => e.stopPropagation());
  function closePop(): void {
    popMode = null;
    pop.remove();
  }
  function openPop(mode: 'share' | 'import', code?: string): void {
    popMode = mode;
    pop.replaceChildren();
    const input = h('input', 're-pop-input') as HTMLInputElement;
    input.type = 'text';
    input.spellcheck = false;
    input.autocomplete = 'off';
    const err = h('div', 're-pop-err');
    if (mode === 'share') {
      pop.appendChild(h('div', 're-pop-title', 'Share code'));
      pop.appendChild(h('div', 're-muted', 'Copy this code (Ctrl+C) and send it to a friend.'));
      input.readOnly = true;
      input.value = code ?? '';
      pop.appendChild(input);
    } else {
      pop.appendChild(h('div', 're-pop-title', 'Import a spell'));
      pop.appendChild(h('div', 're-muted', 'Paste a share code to preview it in the practice range.'));
      input.placeholder = 'CS1.\u2026';
      const tryImport = (): void => {
        const text = input.value.trim();
        err.textContent = '';
        if (!text) return;
        let g: SpellGraph | null = null;
        try { g = decodeSpell(text, catalog); } catch { g = null; }
        if (!g) { err.textContent = 'Not a valid spell code (or it uses runes this build does not know).'; return; }
        closePop();
        startPreview(g);
      };
      input.addEventListener('input', tryImport);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryImport(); });
      pop.appendChild(input);
      pop.appendChild(err);
    }
    canvas.appendChild(pop);
    input.focus();
    if (mode === 'share') input.select();
  }

  async function doShare(): Promise<void> {
    let code = '';
    try { code = encodeSpell(graph); } catch { toast('Could not encode this spell'); return; }
    try {
      await navigator.clipboard.writeText(code);
      closePop();
      toast('Copied');
    } catch {
      openPop('share', code);
    }
  }

  function closePractice(): void {
    practiceHandle?.destroy();
    practiceHandle = null;
    practiceDivider?.remove();
    practicePane?.remove();
    practiceDivider = practicePane = practiceMsg = null;
    previewGraph = null;
    previewBanner = previewUse = previewNote = null;
  }

  function openPractice(): void {
    if (practiceHandle || destroyed) return;
    let plan: ReturnType<typeof compileSpell>;
    try { plan = compileSpell(graph, catalog, opts.extraGlobals); } catch { return; }
    practiceDivider = h('div', 're-divider');
    practicePane = h('div', 're-practice');
    const mount = h('div', 're-practice-mount');
    practiceMsg = h('div', 're-practice-msg');
    practiceMsg.style.display = 'none';
    previewBanner = h('div', 're-preview');
    previewBanner.style.display = 'none';
    previewUse = h('button', 're-preview-btn use', 'Use') as HTMLButtonElement;
    previewUse.type = 'button';
    previewUse.addEventListener('click', useImported);
    const closeBtn = h('button', 're-preview-btn', 'Close') as HTMLButtonElement;
    closeBtn.type = 'button';
    closeBtn.addEventListener('click', stopPreview);
    previewNote = h('span', 're-preview-note');
    previewBanner.append(h('b', undefined, 'Previewing imported spell'), previewUse, closeBtn, previewNote);
    practicePane.append(mount, practiceMsg, previewBanner);
    main.append(practiceDivider, practicePane);
    practiceHandle = mountPractice(mount, { plan, graph, catalog, ability: opts.ability });
    const v = validateSpell(graph, catalog, opts.maxMana);
    if (v.errors.length > 0) showPracticeError(v.errors[0]);
  }

  function setPractice(on: boolean): void {
    practiceOn = on;
    practiceMemo = on;
    try { localStorage.setItem(PRACTICE_KEY, on ? '1' : '0'); } catch { /* ignore */ }
    if (on) openPractice(); else closePractice();
    practiceBtn.classList.toggle('active', practiceHandle !== null);
    requestAnimationFrame(() => { if (!destroyed) fitView(true); }); // canvas changed size
  }

  // ---------------------------------------------------------- pan / zoom
  const MIN_SCALE = 0.35;
  const MAX_SCALE = 2;
  const view = { x: 0, y: 0, scale: 1 };
  let worldSize = { w: 0, h: 0 };
  let fitted = false;
  let suppressClick = false;

  const zoomLabel = h('span', 're-ctl-zoom', '100%');
  const mkBtn = (label: string, title: string, fn: () => void): HTMLButtonElement => {
    const b = h('button', 're-ctl-btn', label) as HTMLButtonElement;
    b.type = 'button';
    b.title = title;
    b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    return b;
  };
  const zoomAtCenter = (f: number): void => zoomAt(canvas.clientWidth / 2, canvas.clientHeight / 2, view.scale * f);
  undoBtn = mkBtn('\u21B6', 'Undo (Ctrl+Z)', undo);
  redoBtn = mkBtn('\u21B7', 'Redo (Ctrl+Shift+Z / Ctrl+Y)', redo);
  const practiceBtn = mkBtn('▶ Practice', 'Toggle the practice range (P)', () => setPractice(!practiceOn));
  practiceBtn.classList.add('re-ctl-practice');
  const shareBtn = mkBtn('Share', 'Copy a share code for this spell', () => { void doShare(); });
  const importBtn = mkBtn('Import', 'Paste a share code to preview a spell', () => {
    if (popMode === 'import') closePop(); else openPop('import');
  });
  shareBtn.classList.add('re-ctl-text');
  importBtn.classList.add('re-ctl-text');
  controls.append(
    practiceBtn, shareBtn, importBtn, h('span', 're-ctl-sep'),
    undoBtn, redoBtn, h('span', 're-ctl-sep'),
    mkBtn('−', 'Zoom out', () => zoomAtCenter(1 / 1.25)),
    zoomLabel,
    mkBtn('+', 'Zoom in', () => zoomAtCenter(1.25)),
    mkBtn('Fit', 'Fit the whole spell in view', () => fitView(true)),
  );

  function applyView(): void {
    layer.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    canvas.style.setProperty('--gs', `${26 * view.scale}px`);
    canvas.style.setProperty('--gx', `${view.x}px`);
    canvas.style.setProperty('--gy', `${view.y}px`);
    zoomLabel.textContent = `${Math.round(view.scale * 100)}%`;
    // touch: keep the remove button a usable size when the graph is zoomed out
    canvas.style.setProperty('--ixs', String(Math.max(1, Math.min(2.4, 0.95 / view.scale))));
  }
  function zoomAt(cx: number, cy: number, target: number): void {
    const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, target));
    const k = s / view.scale;
    view.x = cx - (cx - view.x) * k;
    view.y = cy - (cy - view.y) * k;
    view.scale = s;
    applyView();
  }
  function fitView(force: boolean): void {
    const vw = canvas.clientWidth;
    const vh = canvas.clientHeight;
    if (vw < 50 || vh < 50 || worldSize.w <= 0) return; // not laid out yet; ResizeObserver retries
    if (!force && fitted) return;
    const pad = 24;
    const s = Math.min(1, Math.max(MIN_SCALE, Math.min((vw - pad * 2) / worldSize.w, (vh - pad * 2 - 40) / worldSize.h)));
    view.scale = s;
    view.x = (vw - worldSize.w * s) / 2;
    view.y = Math.max(pad, (vh - worldSize.h * s) / 2);
    fitted = true;
    applyView();
  }
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { if (!fitted) fitView(false); }) : null;
  ro?.observe(canvas);

  const pointers = new Map<number, { x: number; y: number }>();
  let panId: number | null = null;
  let panStart = { x: 0, y: 0, vx: 0, vy: 0 };
  let dragging = false;
  let pinch: { dist: number; scale: number } | null = null;
  const isBackground = (t: EventTarget | null): boolean =>
    !(t instanceof Element) || !t.closest('.re-card, .re-ctl, .re-notice, .re-pop');
  const local = (e: PointerEvent | WheelEvent): { x: number; y: number } => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const pinchDist = (): number => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  let lastPointerType = 'mouse';
  /** Touch pointer currently reordering a card (kept out of pan/pinch tracking). */
  const canPan = (e: PointerEvent): boolean =>
    e.pointerType === 'touch'
      ? !(e.target instanceof Element && e.target.closest('.re-x, .re-ctl, .re-notice, .re-pop'))
      : isBackground(e.target);
  canvas.addEventListener('pointerdown', (e) => {
    lastPointerType = e.pointerType;
    if (e.target instanceof Element && e.target.closest('.re-ctl')) return;
    const middle = e.button === 1;
    if (e.button !== 0 && !middle) return;
    if (middle) e.preventDefault();
    if (e.pointerType === 'mouse') {
      // a mouse has one pointer: drop any stale entry (e.g. released outside the window)
      pointers.clear();
      pinch = null;
      dragging = false;
      canvas.classList.remove('panning');
      if (!middle && !isBackground(e.target)) return;
    }
    pointers.set(e.pointerId, local(e));
    if (pointers.size === 2) {
      // second finger: switch to pinch zoom
      panId = null;
      pinch = { dist: pinchDist() || 1, scale: view.scale };
      dragging = true;
      for (const id of pointers.keys()) { try { canvas.setPointerCapture(id); } catch { /* ignore */ } }
      return;
    }
    if (pointers.size === 1 && (middle || canPan(e))) {
      panId = e.pointerId;
      const p = local(e);
      panStart = { x: p.x, y: p.y, vx: view.x, vy: view.y };
      dragging = false;
      if (middle) {
        dragging = true;
        try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        canvas.classList.add('panning');
      }
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, pinch.scale * (pinchDist() / pinch.dist));
      hideTip();
      return;
    }
    if (panId !== e.pointerId) return;
    if (!dragging) {
      if (Math.hypot(p.x - panStart.x, p.y - panStart.y) < 4) return;
      dragging = true;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      canvas.classList.add('panning');
    }
    view.x = panStart.vx + (p.x - panStart.x);
    view.y = panStart.vy + (p.y - panStart.y);
    applyView();
  });
  const endPointer = (e: PointerEvent): void => {
    if (!pointers.delete(e.pointerId)) return;
    if (dragging) {
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
    }
    if (pointers.size < 2) pinch = null;
    if (panId === e.pointerId) panId = null;
    if (pointers.size === 0) {
      dragging = false;
      canvas.classList.remove('panning');
    } else if (pointers.size === 1 && dragging) {
      // continue panning with the remaining finger
      const [id, p] = [...pointers.entries()][0];
      panId = id;
      panStart = { x: p.x, y: p.y, vx: view.x, vy: view.y };
    }
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = local(e);
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    zoomAt(p.x, p.y, view.scale * Math.exp(-e.deltaY * unit * (e.ctrlKey ? 0.01 : 0.0015)));
    hideTip();
  }, { passive: false });
  canvas.addEventListener('auxclick', (e) => { if (e.button === 1) e.preventDefault(); });

  // ---------------------------------------------------------- render
  function levelsOf(): Record<string, number> {
    const lv: Record<string, number> = { [graph.rootUid]: 0 };
    for (let pass = 0; pass <= graph.nodes.length; pass++) {
      let changed = false;
      for (const l of graph.links) {
        const from = lv[l.from.uid];
        if (from === undefined) continue;
        if ((lv[l.toUid] ?? -1) < from + 1) { lv[l.toUid] = from + 1; changed = true; }
      }
      if (!changed) break;
    }
    return lv;
  }

  function makeSocket(cls: string, color: Color, x: number, y: number): HTMLElement {
    const cb = getSettings().colorblind;
    const s = h('div', `re-sock ${cls}${isComplex(color) ? ' complex' : ''}${cb ? ' cb' : ''}`, cb ? COLOR_SHAPE[color] : color);
    s.style.setProperty('--sc', COLOR_HEX[color]);
    s.style.left = `${x}px`;
    s.style.top = `${y}px`;
    s.title = COLOR_NAME[color];
    return s;
  }

  function cardAccent(def: RuneDef): string {
    if (def.shot) return COLOR_HEX[ELEMENT_COLOR[def.shot.element]];
    if (def.outputs[0]) return COLOR_HEX[def.outputs[0]];
    return 'var(--accent)';
  }

  function buildCard(
    def: RuneDef, x: number, y: number, ghost: boolean, linkedIn?: Set<number>, openOut?: Set<number>, bonusOn?: boolean,
  ): HTMLElement {
    const card = h('div', `re-card ${ghost ? 're-ghost' : 're-node'}${isForged(def) ? ' forged' : ''}${def.keystone ? ' keystone' : ''}${def.rarity === 'fused' ? ' fused' : ''}`);
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
    card.style.width = `${CARD_W}px`;
    card.style.height = `${nodeHeight(def)}px`;
    card.style.setProperty('--rc', cardAccent(def));
    card.appendChild(h('div', 're-name', def.keystone ? `◆ ${def.name}` : def.name));
    const sum = h('div', 're-sum', summarize(def));
    sum.title = summarize(def);
    card.appendChild(sum);
    const meta = h('div', 're-meta');
    const mc = h('span', 're-chip re-chip-mana', `\u25C6 ${fmt(def.mana)}`);
    mc.title = `${fmt(def.mana)} mana`;
    const tc = h('span', 're-chip re-chip-time', `\u25F7 ${def.castTime > 0 ? '+' : ''}${fmt(def.castTime)}s`);
    tc.title = `${fmt(def.castTime)}s cast time`;
    meta.append(mc, tc);
    if (def.rarity === 'fused') meta.appendChild(h('span', 're-chip re-chip-fused', 'Fused'));
    card.appendChild(meta);
    if (def.socketBonus) {
      const line = h('div', `re-bonus ${bonusOn ? 'on' : 'off'}`, `⚡ ${def.socketBonus.text}`);
      const state = ghost ? (bonusOn ? 'Would be active if placed here.' : 'Would not be active here.') : (bonusOn ? 'Active.' : 'Inactive.');
      line.title = `Socket bonus: ${def.socketBonus.text}
${state}`;
      card.appendChild(line);
    }
    if (ghost) card.appendChild(h('div', 're-place', 'Click to place'));
    def.inputs.forEach((c, i) => {
      const filled = !ghost && linkedIn?.has(i);
      card.appendChild(makeSocket(filled ? '' : 'empty-in', c, 0, sockY(i)));
    });
    def.outputs.forEach((c, i) => {
      const open = !ghost && openOut?.has(i);
      card.appendChild(makeSocket(ghost ? 'hollow' : open ? 'hollow open' : '', c, CARD_W, sockY(i)));
    });
    return card;
  }

  // ---------------------------------------------------------- reorder within a level
  let cardDragged = false;

  /** Move `uid` to position `idx` among the nodes of its level; links are untouched. */
  function reorderWithinLevel(g: SpellGraph, uid: string, lv: Record<string, number>, idx: number): SpellGraph {
    const level = lv[uid] ?? 0;
    const peers = g.nodes.filter((n) => (lv[n.uid] ?? 0) === level);
    const moving = peers.find((n) => n.uid === uid);
    if (!moving) return g;
    const order = peers.filter((n) => n.uid !== uid);
    order.splice(Math.max(0, Math.min(order.length, idx)), 0, moving);
    if (order.every((n, i) => n.uid === peers[i].uid)) return g;
    let k = 0;
    const nodes = g.nodes.map((n) => ((lv[n.uid] ?? 0) === level ? order[k++] : n));
    return { ...g, nodes };
  }

  function attachReorder(
    card: HTMLElement, uid: string, lv: Record<string, number>,
    pos: Map<string, { x: number; y: number; def: RuneDef }>, world: HTMLElement,
  ): void {
    const me = pos.get(uid);
    if (!me) return;
    const level = lv[uid] ?? 0;
    const peers = graph.nodes.filter((n) => n.uid !== uid && (lv[n.uid] ?? 0) === level && pos.has(n.uid));
    if (peers.length === 0) return; // nothing to reorder against
    const myH = nodeHeight(me.def);
    let start: { x: number; y: number; id: number } | null = null;
    let active = false;
    let armed = false; // touch: reorder starts only after a short hold, so a swipe pans instead
    let holdTimer = 0;
    let indicator: HTMLElement | null = null;
    const targetOf = (dy: number): number => {
      const c = me.y + dy / view.scale + myH / 2;
      let i = 0;
      for (const p of peers) {
        const pp = pos.get(p.uid)!;
        if (pp.y + nodeHeight(pp.def) / 2 < c) i++;
      }
      return i;
    };
    const reset = (): void => {
      clearTimeout(holdTimer);
      armed = false;
      card.classList.remove('re-armed');
      start = null;
      active = false;
      indicator?.remove();
      indicator = null;
      card.classList.remove('re-dragging');
      card.style.transform = '';
    };
    card.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || (e.target instanceof Element && e.target.closest('.re-x'))) return;
      start = { x: e.clientX, y: e.clientY, id: e.pointerId };
      if (e.pointerType === 'touch') {
        const id = e.pointerId;
        clearTimeout(holdTimer);
        holdTimer = window.setTimeout(() => {
          if (!start || start.id !== id || dragging || pointers.size !== 1) return;
          armed = true;
          pointers.delete(id); // reorder owns this finger: no pan / pinch
          panId = null;
          card.classList.add('re-armed');
          try { navigator.vibrate?.(12); } catch { /* ignore */ }
        }, 350);
      }
    });
    card.addEventListener('pointermove', (e) => {
      if (!start || e.pointerId !== start.id) return;
      const dy = e.clientY - start.y;
      if (e.pointerType === 'touch' && !armed) {
        if (Math.hypot(e.clientX - start.x, dy) > 8) { clearTimeout(holdTimer); start = null; }
        return;
      }
      if (!active) {
        if (Math.hypot(e.clientX - start.x, dy) < 5) return;
        active = true;
        cardDragged = true;
        hideTip();
        try { card.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        card.classList.add('re-dragging');
        indicator = h('div', 're-drop');
        indicator.style.left = `${me.x - 8}px`;
        indicator.style.width = `${CARD_W + 16}px`;
        world.appendChild(indicator);
      }
      card.style.transform = `translateY(${dy / view.scale}px)`;
      const target = targetOf(dy);
      const before = peers[target - 1];
      const after = peers[target];
      let y: number;
      if (before) { const b = pos.get(before.uid)!; y = b.y + nodeHeight(b.def) + ROW_GAP / 2; }
      else if (after) y = pos.get(after.uid)!.y - ROW_GAP / 2;
      else y = me.y;
      indicator!.style.top = `${y - 2}px`;
    });
    card.addEventListener('pointerup', (e) => {
      if (!start || e.pointerId !== start.id) return;
      if (e.pointerType === 'touch' && !armed) { reset(); return; }
      const was = active;
      const idx = was ? targetOf(e.clientY - start.y) : 0;
      reset();
      if (!was) return;
      setTimeout(() => { cardDragged = false; }, 0);
      const ng = reorderWithinLevel(graph, uid, lv, idx);
      if (ng !== graph) {
        const before = validateSpell(graph, catalog, opts.maxMana).errors.length;
        const after = validateSpell(ng, catalog, opts.maxMana).errors.length;
        if (after > before) {
          notice = { text: 'That order makes the spell invalid.', kind: 'warn' };
          sfx('uiError');
        } else {
          applyGraph(ng);
          sfx('runePlace');
        }
      }
      render();
    });
    card.addEventListener('pointercancel', () => {
      if (active) setTimeout(() => { cardDragged = false; }, 0);
      reset();
    });
  }

  function bezier(x1: number, y1: number, x2: number, y2: number): string {
    const dx = Math.max(40, Math.abs(x2 - x1) / 2);
    return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
  }

  function render(): void {
    if (destroyed) return;
    hideTip();

    const levels = levelsOf();
    const open = openOutputs(graph, catalog);
    const openKey = new Map<string, Set<number>>();
    for (const o of open) {
      if (!openKey.has(o.uid)) openKey.set(o.uid, new Set());
      openKey.get(o.uid)!.add(o.output);
    }
    const linkedIn = new Map<string, Set<number>>();
    for (const l of graph.links) {
      if (!linkedIn.has(l.toUid)) linkedIn.set(l.toUid, new Set());
      linkedIn.get(l.toUid)!.add(l.toInput);
    }

    // selected inventory rune -> placements
    const selInst = selectedInv ? opts.owned.find((o) => o.uid === selectedInv) : undefined;
    const selDef = selInst ? defOf(selInst) : undefined;
    let placements: Placement[] = [];
    let extraGhosts = 0;
    let infoMsg: { text: string; kind: 'warn' | 'info' } | null = notice;
    if (selDef) {
      try {
        placements = findPlacements(graph, catalog, selDef);
      } catch (err) {
        placements = [];
        infoMsg = { text: String(err instanceof Error ? err.message : err), kind: 'warn' };
      }
      if (!infoMsg) {
        if (placements.length === 0) {
          infoMsg = {
            text: `No open outputs match ${selDef.inputs.map((c) => COLOR_NAME[c]).join(' + ')}. Right-click a placed rune (or hover it and click \u00D7) to free its output.`,
            kind: 'warn',
          };
        } else if (placements.length > MAX_GHOSTS) {
          extraGhosts = placements.length - MAX_GHOSTS;
          infoMsg = { text: `Showing ${MAX_GHOSTS} of ${placements.length} placements; free up or fill outputs to narrow them.`, kind: 'info' };
          placements = placements.slice(0, MAX_GHOSTS);
        } else {
          infoMsg = { text: `Click a ghost to place ${selDef.name}. Esc to cancel.`, kind: 'info' };
        }
      }
    }
    void extraGhosts;

    // layout
    const pos = new Map<string, { x: number; y: number; def: RuneDef }>();
    const colY: number[] = [];
    let maxLevel = 0;
    const colX = (lv: number): number => PAD_X + lv * (CARD_W + COL_GAP);
    for (const n of graph.nodes) {
      const def = defOf(n);
      if (!def) continue;
      const lv = levels[n.uid] ?? 0;
      maxLevel = Math.max(maxLevel, lv);
      const y = colY[lv] ?? PAD_Y;
      pos.set(n.uid, { x: colX(lv), y, def });
      colY[lv] = y + nodeHeight(def) + ROW_GAP;
    }
    const ghostPos: { x: number; y: number; p: Placement }[] = [];
    if (selDef) {
      for (const p of placements) {
        const lv = p.level;
        maxLevel = Math.max(maxLevel, lv);
        const y = colY[lv] ?? PAD_Y;
        ghostPos.push({ x: colX(lv), y, p });
        colY[lv] = y + nodeHeight(selDef) + ROW_GAP;
      }
    }
    const worldW = colX(maxLevel + 1) - COL_GAP + PAD_X;
    const worldH = Math.max(280, ...colY.map((v) => v ?? 0)) + PAD_Y - ROW_GAP;

    const world = h('div', 're-world');
    world.style.width = `${worldW}px`;
    world.style.height = `${worldH}px`;
    worldSize = { w: worldW, h: worldH };

    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('width', String(worldW));
    svg.setAttribute('height', String(worldH));
    world.appendChild(svg);

    for (let lv = 0; lv <= maxLevel; lv++) {
      const lab = h('div', 're-col-label', `Level ${lv}`);
      lab.style.left = `${colX(lv)}px`;
      lab.style.width = `${CARD_W}px`;
      world.appendChild(lab);
    }

    const outPoint = (ref: OutputRef): { x: number; y: number; color: Color } | null => {
      const p = pos.get(ref.uid);
      if (!p) return null;
      const color = p.def.outputs[ref.output];
      if (!color) return null;
      return { x: p.x + CARD_W, y: p.y + sockY(ref.output), color };
    };

    for (const l of graph.links) {
      const a = outPoint(l.from);
      const to = pos.get(l.toUid);
      if (!a || !to) continue;
      const path = document.createElementNS(SVGNS, 'path');
      path.setAttribute('class', 're-link');
      path.setAttribute('d', bezier(a.x + 7, a.y, to.x - 7, to.y + sockY(l.toInput)));
      path.setAttribute('stroke', COLOR_HEX[a.color]);
      svg.appendChild(path);
    }

    // ghost links
    const ghostLinks: SVGPathElement[][] = [];
    ghostPos.forEach((g) => {
      const arr: SVGPathElement[] = [];
      g.p.inputs.forEach((refs, i) => {
        for (const ref of refs) {
          const a = outPoint(ref);
          if (!a) continue;
          const path = document.createElementNS(SVGNS, 'path');
          path.setAttribute('class', 're-link ghost');
          path.setAttribute('d', bezier(a.x + 7, a.y, g.x - 7, g.y + sockY(i)));
          path.setAttribute('stroke', COLOR_HEX[a.color]);
          svg.appendChild(path);
          arr.push(path);
        }
      });
      ghostLinks.push(arr);
    });

    // node cards
    for (const n of graph.nodes) {
      const p = pos.get(n.uid);
      if (!p) continue;
      let bonusOn = false;
      if (p.def.socketBonus) { try { bonusOn = socketBonusActive(graph, catalog, n.uid); } catch { bonusOn = false; } }
      const card = buildCard(p.def, p.x, p.y, false, linkedIn.get(n.uid), openKey.get(n.uid), bonusOn);
      const isRoot = n.uid === graph.rootUid;
      if (isRoot) card.classList.add('root');
      if (selectedNode === n.uid) card.classList.add('selected');
      attachTip(card, p.def);
      if (!isRoot) {
        const x = h('button', 're-x', '\u00D7');
        x.title = 'Remove this rune (and anything that depends on it)';
        x.setAttribute('aria-label', `Remove ${p.def.name}`);
        x.addEventListener('mouseenter', hideTip);
        x.addEventListener('click', (e) => { e.stopPropagation(); removeNode(n.uid); });
        card.appendChild(x);
      }
      if (!isRoot) attachReorder(card, n.uid, levels, pos, world);
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        if (cardDragged) return;
        selectedInv = null;
        selectedNode = selectedNode === n.uid ? null : n.uid;
        notice = null;
        render();
      });
      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isRoot && lastPointerType !== 'touch') removeNode(n.uid);
      });
      world.appendChild(card);
    }

    // ghost cards
    if (selDef && selInst) {
      ghostPos.forEach((g, gi) => {
        let wouldOn = false;
        if (selDef.socketBonus) {
          try { wouldOn = socketBonusActive(placeRune(graph, catalog, selInst, g.p), catalog, selInst.uid); } catch { wouldOn = false; }
        }
        const card = buildCard(selDef, g.x, g.y, true, undefined, undefined, wouldOn);
        attachTip(card, selDef);
        card.addEventListener('mouseenter', () => ghostLinks[gi].forEach((p) => p.classList.add('hl')));
        card.addEventListener('mouseleave', () => ghostLinks[gi].forEach((p) => p.classList.remove('hl')));
        card.addEventListener('click', (e) => {
          e.stopPropagation();
          try {
            const ng = placeRune(graph, catalog, selInst, g.p);
            selectedInv = null;
            selectedNode = null;
            notice = null;
            applyGraph(ng);
            sfx('runePlace');
          } catch (err) {
            notice = { text: String(err instanceof Error ? err.message : err), kind: 'warn' };
            sfx('uiError');
          }
          render();
        });
        world.appendChild(card);
      });
    }

    layer.replaceChildren(world);
    canvas.replaceChildren(layer, controls);
    if (infoMsg) canvas.appendChild(h('div', `re-notice ${infoMsg.kind}`, infoMsg.text));
    const hint = h('div', 're-hint');
    const hintItems: [string, string][] = [
      ['Place', 'click a rune in the inventory, then a ghost slot'],
      ['Remove', 'right-click a placed rune or hit its \u00D7'],
      ['Reorder', 'drag a rune up/down its level (sets firing order)'],
      ['Undo', 'Ctrl+Z'],
      ['Cancel', 'Esc'],
    ];
    for (const [k, v] of hintItems) {
      const it = h('span', 're-hint-item');
      it.append(h('b', undefined, k), document.createTextNode(` ${v}`));
      hint.appendChild(it);
    }
    canvas.appendChild(hint);
    if (popMode) canvas.appendChild(pop);

    if (!fitted) fitView(false);
    renderSide();
  }

  // ---------------------------------------------------------- sidebar
  function renderSide(): void {
    const prevTop = side.scrollTop;
    side.replaceChildren();

    // selected node details
    const selN = selectedNode ? graph.nodes.find((n) => n.uid === selectedNode) : undefined;
    const selNDef = selN ? defOf(selN) : undefined;
    if (selN && selNDef) {
      const box = h('div', 're-box re-details');
      box.appendChild(h('div', 're-dtitle', selNDef.name));
      box.appendChild(h('pre', undefined, runeTooltip(selNDef)));
      if (selN.uid !== graph.rootUid) {
        const btn = h('button', 're-btn-danger', 'Remove');
        btn.title = 'Removes this rune and everything that depends on it';
        btn.addEventListener('click', () => removeNode(selN.uid));
        box.appendChild(btn);
      } else {
        box.appendChild(h('div', 're-muted', 'The Source rune cannot be removed.'));
      }
      box.dataset.sec = 'stats';
      side.appendChild(box);
    }

    // stats
    const stats = h('div');
    stats.dataset.sec = 'stats';
    stats.appendChild(h('h3', undefined, 'Spell'));
    const sbox = h('div', 're-box');
    const v = validateSpell(graph, catalog, opts.maxMana);
    const over = v.manaUsed > opts.maxMana;
    const mrow = h('div', 're-stat-row');
    mrow.appendChild(h('span', undefined, 'Mana'));
    mrow.appendChild(h('span', over ? 're-bad' : 're-val', `${fmt(v.manaUsed)} / ${fmt(opts.maxMana)}${over ? ' \u2014 over budget' : ''}`));
    sbox.appendChild(mrow);
    const bar = h('div', `re-bar${over ? ' over' : ''}`);
    const fill = h('div');
    fill.style.width = `${Math.min(100, opts.maxMana > 0 ? (v.manaUsed / opts.maxMana) * 100 : 100)}%`;
    bar.appendChild(fill);
    sbox.appendChild(bar);

    let plan: ReturnType<typeof compileSpell> | null = null;
    try { plan = compileSpell(graph, catalog, opts.extraGlobals); } catch { plan = null; }
    const crow = h('div', 're-stat-row');
    crow.appendChild(h('span', undefined, 'Cast time'));
    crow.appendChild(h('span', 're-val', `${fmt(plan ? plan.castTime : v.castTime)}s`));
    sbox.appendChild(crow);

    if (v.errors.length) {
      const ul = h('ul', 're-errors');
      for (const e of v.errors) ul.appendChild(h('li', undefined, e));
      sbox.appendChild(ul);
    }
    stats.appendChild(sbox);

    if (plan && plan.keystones.length) {
      stats.appendChild(h('h3', undefined, 'Keystones'));
      const kbox = h('div', 're-box re-keystones');
      for (const k of plan.keystones) {
        const r = KEYSTONE_RULE[k];
        const row = h('div', 're-keystone-row');
        row.appendChild(h('b', undefined, `◆ ${r.name}`));
        row.appendChild(h('span', undefined, r.short));
        kbox.appendChild(row);
      }
      stats.appendChild(kbox);
    }

    stats.appendChild(h('h3', undefined, 'Shots'));
    const shotBox = h('div', 're-box');
    if (!plan || plan.shots.length === 0) {
      shotBox.appendChild(h('div', 're-muted', 'No terminal runes yet. Attach a damage rune to fire something.'));
    } else {
      plan.shots.forEach((s, i) => {
        const row = h('div', 're-shot');
        const dot = h('span', 're-dot');
        dot.style.setProperty('--dc', COLOR_HEX[ELEMENT_COLOR[s.element]]);
        const body = h('div');
        const title = h('div');
        title.className = 're-shot-title';
        title.appendChild(h('b', undefined, `${i + 1}. ${s.runeName}`));
        const dmg = h('span', 're-dmg', `${fmt(Math.round(s.damage * 10) / 10)} ${s.element}${s.count > 1 ? ` \u00D7${s.count}` : ''}`);
        dmg.style.setProperty('--dc', COLOR_HEX[ELEMENT_COLOR[s.element]]);
        title.appendChild(dmg);
        body.appendChild(title);
        const tags: string[] = [];
        if (s.aoeRadius > 0) tags.push(`AoE ${fmt(s.aoeRadius)}`);
        if (s.pierce > 0) tags.push(`pierce ${s.pierce}`);
        if (s.chain > 0) tags.push(`chain ${s.chain}`);
        if (s.homing > 0) tags.push('homing');
        for (const st of s.statuses) tags.push(`${st.kind} ${fmt(Math.round(st.potency * 100) / 100)} / ${fmt(Math.round(st.duration * 10) / 10)}s`);
        if (tags.length) {
          const t = h('div', 're-tags');
          for (const tg of tags) t.appendChild(h('span', 're-tag', tg));
          body.appendChild(t);
        }
        row.append(dot, body);
        shotBox.appendChild(row);
      });
    }
    stats.appendChild(shotBox);
    side.appendChild(stats);

    // inventory
    const placed = new Set(graph.nodes.map((n) => n.uid));
    const inv = opts.owned.filter((o) => !placed.has(o.uid) && defOf(o));
    const invWrap = h('div');
    invWrap.dataset.sec = 'inv';
    invWrap.appendChild(h('h3', undefined, `Inventory (${inv.length})`));
    if (inv.length === 0) {
      invWrap.appendChild(h('div', 're-muted', 'All owned runes are in the spell. Win floors to earn more.'));
    }
    const sortKey = (o: RuneInstance): string => {
      const d = defOf(o)!;
      return `${d.inputs.join('')}|${d.name}|${o.uid}`;
    };
    const groups: [string, RuneInstance[]][] = [
      ['Branching runes', inv.filter((o) => defOf(o)!.outputs.length > 0)],
      ['Terminal runes', inv.filter((o) => defOf(o)!.outputs.length === 0)],
    ];
    for (const [title, list] of groups) {
      if (!list.length) continue;
      list.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
      const g = h('div', 're-inv-group');
      g.appendChild(h('div', 're-muted', title));
      const grid = h('div', 're-inv-grid');
      for (const o of list) {
        const d = defOf(o)!;
        const card = h('div', `re-inv-card${selectedInv === o.uid ? ' selected' : ''}${o.plus ? ' forged' : ''}${d.keystone ? ' keystone' : ''}${d.rarity === 'fused' ? ' fused' : ''}`);
        card.style.setProperty('--rar', RARITY_COLOR[d.rarity] ?? RARITY_COLOR.common);
        card.appendChild(h('div', 'n', d.keystone ? `◆ ${d.name}` : d.name));
        card.appendChild(h('div', 's', summarize(d)));
        if (d.socketBonus) {
          const sb = h('div', 're-bonus inv', `⚡ ${d.socketBonus.text}`);
          sb.title = `Socket bonus: ${d.socketBonus.text}`;
          card.appendChild(sb);
        }
        const pips = h('div', 're-pips');
        pips.appendChild(h('span', 're-io', 'In'));
        d.inputs.forEach((c) => pips.appendChild(pip(c)));
        pips.appendChild(h('span', 're-io', 'Out'));
        if (d.outputs.length === 0) pips.appendChild(h('span', 're-arrow', '\u25CF'));
        d.outputs.forEach((c) => pips.appendChild(pip(c)));
        card.appendChild(pips);
        const foot = h('div', 'm');
        foot.appendChild(h('span', 're-chip re-chip-mana', `\u25C6 ${fmt(d.mana)}`));
        foot.appendChild(h('span', 're-rar', d.rarity === 'fused' ? 'Fused' : d.rarity));
        card.appendChild(foot);
        if (selectedInv === o.uid) card.appendChild(h('div', 're-sel-badge', 'Selected'));
        attachTip(card, d);
        card.addEventListener('click', (e) => {
          e.stopPropagation();
          selectedNode = null;
          notice = null;
          selectedInv = selectedInv === o.uid ? null : o.uid;
          if (selectedInv) { sfx('runePick'); setTab('spell'); } // portrait: back to the graph to place it
          render();
        });
        grid.appendChild(card);
      }
      g.appendChild(grid);
      invWrap.appendChild(g);
    }
    side.appendChild(invWrap);
    side.scrollTop = prevTop;
  }

  // ---------------------------------------------------------- global events
  canvas.addEventListener('click', () => {
    if (suppressClick) return;
    if (selectedInv || selectedNode || notice) {
      clearSelection();
      render();
    }
  });
  const onKey = (e: KeyboardEvent): void => {
    const t = e.target;
    const typing = t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    if (!typing && (e.ctrlKey || e.metaKey) && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'z' || k === 'y') {
        e.preventDefault();
        if (k === 'y' || e.shiftKey) redo(); else undo();
        return;
      }
    }
    if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'p') {
      setPractice(!practiceOn);
      return;
    }
    if (e.key === 'Escape' && popMode) { closePop(); return; }
    if (e.key === 'Escape' && (selectedInv || selectedNode || notice)) {
      clearSelection();
      render();
    }
  };
  document.addEventListener('keydown', onKey);
  const offSettings = onSettings(() => { if (!destroyed) render(); });

  syncHistoryButtons();
  render();
  if (practiceOn) setPractice(true);

  return {
    destroy(): void {
      destroyed = true;
      closePractice();
      document.removeEventListener('keydown', onKey);
      offSettings();
      if (toastTimer) clearTimeout(toastTimer);
      toastEl?.remove();
      ro?.disconnect();
      root.remove();
      tooltip.remove();
    },
  };
};
