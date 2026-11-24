import './editor.css';
import { COLOR_HEX } from '../types';
import type { Color, Element, OutputRef, RuneDef, RuneInstance, SpellGraph } from '../types';
import type { EditorHandle, EditorOptions, MountEditor, Placement } from '../contracts';
import {
  compileSpell, findPlacements, openOutputs, placeRune, removeRune, validateSpell,
} from '../spell';
import { runeTooltip } from '../data/runes';

const CARD_W = 156;
const HEAD = 30;
const ROW = 24;
const COL_GAP = 90;
const ROW_GAP = 22;
const PAD_X = 28;
const PAD_Y = 34;
const MAX_GHOSTS = 12;
const SVGNS = 'http://www.w3.org/2000/svg';

const ELEMENT_COLOR: Record<Element, Color> = {
  fire: 'R', frost: 'B', nature: 'G', lightning: 'Y', arcane: 'P', storm: 'T', pure: 'W',
};
const COLOR_NAME: Record<Color, string> = {
  R: 'Red', G: 'Green', B: 'Blue', Y: 'Yellow', P: 'Purple', T: 'Teal', W: 'White',
};
const isComplex = (c: Color): boolean => c === 'Y' || c === 'P' || c === 'T' || c === 'W';

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K, cls?: string, text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function pip(c: Color): HTMLElement {
  const p = h('span', 're-pip', isComplex(c) ? c : '');
  p.style.setProperty('--pc', COLOR_HEX[c]);
  p.title = COLOR_NAME[c];
  return p;
}

function nodeHeight(def: RuneDef): number {
  return HEAD + Math.max(def.inputs.length, def.outputs.length, 1) * ROW + 8;
}
const sockY = (i: number): number => HEAD + i * ROW + ROW / 2;

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

export const mountEditor: MountEditor = (container: HTMLElement, opts: EditorOptions): EditorHandle => {
  const { catalog } = opts;
  let graph: SpellGraph = opts.graph;
  let selectedInv: string | null = null;
  let selectedNode: string | null = null;
  let notice: { text: string; kind: 'warn' | 'info' } | null = null;
  let destroyed = false;

  const root = h('div', 're-root');
  const canvas = h('div', 're-canvas');
  const side = h('div', 're-side');
  root.append(canvas, side);
  container.appendChild(root);

  const tooltip = h('div', 're-tooltip');
  tooltip.style.display = 'none';
  container.appendChild(tooltip);

  const defOf = (inst: RuneInstance): RuneDef | undefined => catalog[inst.defId];

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

  function applyGraph(g: SpellGraph): void {
    graph = g;
    opts.onChange(g);
  }

  function removeNode(uid: string): void {
    if (uid === graph.rootUid) return;
    try {
      applyGraph(removeRune(graph, uid));
    } catch (err) {
      notice = { text: String(err instanceof Error ? err.message : err), kind: 'warn' };
    }
    if (selectedNode) selectedNode = null;
    selectedInv = null;
    render();
  }

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
    const s = h('div', `re-sock ${cls}`, isComplex(color) ? color : '');
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

  function buildCard(def: RuneDef, x: number, y: number, ghost: boolean, linkedIn?: Set<number>, openOut?: Set<number>): HTMLElement {
    const card = h('div', `re-card ${ghost ? 're-ghost' : 're-node'}`);
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
    card.style.width = `${CARD_W}px`;
    card.style.height = `${nodeHeight(def)}px`;
    card.style.setProperty('--rc', cardAccent(def));
    card.appendChild(h('div', 're-name', def.name));
    card.appendChild(h('div', 're-meta', `${def.mana} mana · ${fmt(def.castTime)}s`));
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

  function bezier(x1: number, y1: number, x2: number, y2: number): string {
    const dx = Math.max(40, Math.abs(x2 - x1) / 2);
    return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
  }

  function render(): void {
    if (destroyed) return;
    hideTip();
    const prevL = canvas.scrollLeft;
    const prevT = canvas.scrollTop;

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
          infoMsg = { text: `No open outputs match ${selDef.inputs.map((c) => COLOR_NAME[c]).join(' + ')}`, kind: 'warn' };
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
    const worldH = Math.max(420, ...colY.map((v) => v ?? 0)) + PAD_Y;

    const world = h('div', 're-world');
    world.style.width = `${worldW}px`;
    world.style.height = `${worldH}px`;

    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('width', String(worldW));
    svg.setAttribute('height', String(worldH));
    world.appendChild(svg);

    for (let lv = 0; lv <= maxLevel; lv++) {
      const lab = h('div', 're-col-label', `Level ${lv}`);
      lab.style.left = `${colX(lv)}px`;
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
      const card = buildCard(p.def, p.x, p.y, false, linkedIn.get(n.uid), openKey.get(n.uid));
      const isRoot = n.uid === graph.rootUid;
      if (isRoot) card.classList.add('root');
      if (selectedNode === n.uid) card.classList.add('selected');
      attachTip(card, p.def);
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedInv = null;
        selectedNode = selectedNode === n.uid ? null : n.uid;
        notice = null;
        render();
      });
      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isRoot) removeNode(n.uid);
      });
      world.appendChild(card);
    }

    // ghost cards
    if (selDef && selInst) {
      ghostPos.forEach((g, gi) => {
        const card = buildCard(selDef, g.x, g.y, true);
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
          } catch (err) {
            notice = { text: String(err instanceof Error ? err.message : err), kind: 'warn' };
          }
          render();
        });
        world.appendChild(card);
      });
    }

    canvas.replaceChildren();
    if (infoMsg) canvas.appendChild(h('div', `re-notice ${infoMsg.kind}`, infoMsg.text));
    canvas.appendChild(world);
    canvas.appendChild(h('div', 're-hint', 'Click a rune in the inventory to place it · right-click a placed rune to remove'));
    canvas.scrollLeft = prevL;
    canvas.scrollTop = prevT;

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
      side.appendChild(box);
    }

    // stats
    const stats = h('div');
    stats.appendChild(h('h3', undefined, 'Spell'));
    const sbox = h('div', 're-box');
    const v = validateSpell(graph, catalog, opts.maxMana);
    const over = v.manaUsed > opts.maxMana;
    const mrow = h('div', 're-stat-row');
    mrow.appendChild(h('span', undefined, 'Mana'));
    mrow.appendChild(h('span', over ? 're-bad' : '', `${fmt(v.manaUsed)} / ${fmt(opts.maxMana)}`));
    sbox.appendChild(mrow);
    const bar = h('div', `re-bar${over ? ' over' : ''}`);
    const fill = h('div');
    fill.style.width = `${Math.min(100, opts.maxMana > 0 ? (v.manaUsed / opts.maxMana) * 100 : 100)}%`;
    bar.appendChild(fill);
    sbox.appendChild(bar);

    let plan: ReturnType<typeof compileSpell> | null = null;
    try { plan = compileSpell(graph, catalog); } catch { plan = null; }
    const crow = h('div', 're-stat-row');
    crow.appendChild(h('span', undefined, 'Cast time'));
    crow.appendChild(h('span', undefined, `${fmt(plan ? plan.castTime : v.castTime)}s`));
    sbox.appendChild(crow);

    if (v.errors.length) {
      const ul = h('ul', 're-errors');
      for (const e of v.errors) ul.appendChild(h('li', undefined, e));
      sbox.appendChild(ul);
    }
    stats.appendChild(sbox);

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
        title.appendChild(h('b', undefined, `${i + 1}. ${s.runeName}`));
        title.appendChild(document.createTextNode(` — ${fmt(Math.round(s.damage * 10) / 10)} ${s.element}${s.count > 1 ? ` ×${s.count}` : ''}`));
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
    invWrap.appendChild(h('h3', undefined, `Inventory (${inv.length})`));
    if (inv.length === 0) {
      invWrap.appendChild(h('div', 're-muted', 'All owned runes are in the spell.'));
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
        const card = h('div', `re-inv-card${selectedInv === o.uid ? ' selected' : ''}`);
        card.appendChild(h('div', 'n', d.name));
        const pips = h('div', 're-pips');
        d.inputs.forEach((c) => pips.appendChild(pip(c)));
        pips.appendChild(h('span', 're-arrow', '→'));
        if (d.outputs.length === 0) pips.appendChild(h('span', 're-arrow', '●'));
        d.outputs.forEach((c) => pips.appendChild(pip(c)));
        card.appendChild(pips);
        card.appendChild(h('div', 'm', `${d.mana} mana · ${fmt(d.castTime)}s`));
        attachTip(card, d);
        card.addEventListener('click', (e) => {
          e.stopPropagation();
          selectedNode = null;
          notice = null;
          selectedInv = selectedInv === o.uid ? null : o.uid;
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
    if (selectedInv || selectedNode || notice) {
      clearSelection();
      render();
    }
  });
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && (selectedInv || selectedNode || notice)) {
      clearSelection();
      render();
    }
  };
  document.addEventListener('keydown', onKey);

  render();

  return {
    destroy(): void {
      destroyed = true;
      document.removeEventListener('keydown', onKey);
      root.remove();
      tooltip.remove();
    },
  };
};
