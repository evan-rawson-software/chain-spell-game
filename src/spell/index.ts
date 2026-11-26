/**
 * Pure spell engine: graph validation, placement search, and compilation to a CastPlan.
 * No DOM, no mutation of inputs.
 */
import { COLOR_BITS } from '../types';
import type {
  CastPlan, Color, KeystoneId, Link, Modifier, OutputRef, ResolvedShot, RuneCatalog, RuneDef, RuneInstance, ShotStat,
  SpellGraph, StatusApplication,
} from '../types';
import type { OpenOutput, Placement, SpellEngine, ValidationResult } from '../contracts';

const MAX_PLACEMENTS = 300;
const MIN_CAST_TIME = 0.15;
const STAGGER = 0.1;

// ---------------------------------------------------------------- colors

export function colorsCombine(parts: Color[], target: Color): boolean {
  if (parts.length < 2) return false;
  const t = COLOR_BITS[target];
  let acc = 0;
  for (const p of parts) {
    const b = COLOR_BITS[p];
    if (b === undefined || b === 0) return false;
    if ((b & t) !== b) return false; // subset of target
    if ((acc & b) !== 0) return false; // overlap
    acc |= b;
  }
  return acc === t;
}

const isPrimary = (c: Color): boolean => c === 'R' || c === 'G' || c === 'B';

/**
 * Can a single output of color `out` feed an input of color `target`?
 * Exact match, or a complex output feeding a primary input it contains (Y -> R or G, W -> any primary).
 */
export function outputFeeds(out: Color, target: Color): boolean {
  if (out === target) return true;
  return isPrimary(target) && (COLOR_BITS[out] & COLOR_BITS[target]) !== 0;
}

/** One matching output, or a legal combination. */
function inputSatisfied(target: Color, outs: Color[]): boolean {
  if (outs.length === 1) return outputFeeds(outs[0], target);
  return colorsCombine(outs, target);
}

// ---------------------------------------------------------------- graph analysis helpers

interface Analysis {
  nodeIndex: Map<string, number>;
  /** links whose endpoints both exist as nodes */
  links: Link[];
  parents: Map<string, string[]>;
  children: Map<string, string[]>;
  levels: Map<string, number>;
  hasCycle: boolean;
}

function analyze(graph: SpellGraph): Analysis {
  const nodeIndex = new Map<string, number>();
  graph.nodes.forEach((n, i) => {
    if (!nodeIndex.has(n.uid)) nodeIndex.set(n.uid, i);
  });
  const links = graph.links.filter((l) => nodeIndex.has(l.from.uid) && nodeIndex.has(l.toUid));
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  for (const uid of nodeIndex.keys()) {
    parents.set(uid, []);
    children.set(uid, []);
  }
  for (const l of links) {
    const p = parents.get(l.toUid)!;
    if (!p.includes(l.from.uid)) p.push(l.from.uid);
    const c = children.get(l.from.uid)!;
    if (!c.includes(l.toUid)) c.push(l.toUid);
  }
  // Kahn's algorithm for cycle detection + levels
  const indeg = new Map<string, number>();
  for (const [uid, p] of parents) indeg.set(uid, p.length);
  const queue: string[] = [];
  for (const [uid, d] of indeg) if (d === 0) queue.push(uid);
  const levels = new Map<string, number>();
  if (nodeIndex.has(graph.rootUid)) levels.set(graph.rootUid, 0);
  let processed = 0;
  while (queue.length) {
    const uid = queue.shift()!;
    processed++;
    const ps = parents.get(uid)!;
    if (ps.length > 0) {
      const known = ps.map((p) => levels.get(p)).filter((x): x is number => x !== undefined);
      if (known.length > 0) levels.set(uid, known[0] + 1);
    }
    for (const c of children.get(uid)!) {
      indeg.set(c, indeg.get(c)! - 1);
      if (indeg.get(c) === 0) queue.push(c);
    }
  }
  return { nodeIndex, links, parents, children, levels, hasCycle: processed < nodeIndex.size };
}

/** All strict ancestors of uid (safe on cyclic graphs). */
function ancestorsOf(uid: string, parents: Map<string, string[]>): Set<string> {
  const seen = new Set<string>();
  const stack = [...(parents.get(uid) ?? [])];
  while (stack.length) {
    const u = stack.pop()!;
    if (seen.has(u)) continue;
    seen.add(u);
    for (const p of parents.get(u) ?? []) stack.push(p);
  }
  seen.delete(uid);
  return seen;
}

function stackValue(base: number, mods: Modifier[]): number {
  let flat = 0;
  let inc = 0;
  let more = 1;
  for (const m of mods) {
    if (m.op === 'flat') flat += m.value;
    else if (m.op === 'increased') inc += m.value;
    else more *= 1 + m.value;
  }
  return (base + flat) * (1 + inc) * more;
}

function modsOf(def: RuneDef | undefined, which: 'augments' | 'globals'): Modifier[] {
  return (def && def[which]) || [];
}

// ---------------------------------------------------------------- forging

const r3 = (n: number): number => Math.round(n * 1000) / 1000;

function upgradeMod(m: Modifier): Modifier {
  if (m.stat === 'castTime' || m.stat === 'manaCost') {
    if (m.value >= 0) return { ...m };
    // flat mana is integral: one more point off instead of x1.5
    if (m.stat === 'manaCost' && m.op === 'flat') return { ...m, value: m.value - 1 };
    return { ...m, value: r3(m.value * 1.5) };
  }
  if (m.value <= 0) return { ...m };
  if (m.op === 'flat' && (m.stat === 'count' || m.stat === 'pierce' || m.stat === 'chain')) {
    return { ...m, value: m.value + 1 };
  }
  if (m.stat === 'spreadDeg') return { ...m };
  return { ...m, value: r3(m.value * 1.5) };
}

const upgraded = new WeakMap<RuneDef, RuneDef>();

/** The forged ("+") version of a rune. Pure; see DESIGN.md, Forge. */
export function upgradeDef(def: RuneDef): RuneDef {
  if (def.rarity === 'starter' && def.inputs.length === 0) return def;
  const cached = upgraded.get(def);
  if (cached) return cached;
  const out: RuneDef = {
    ...def,
    name: def.name + '+',
    mana: Math.max(0, def.mana - 1),
    inputs: [...def.inputs],
    outputs: [...def.outputs],
    description: `${def.description}
Forged: +50% effect, -1 mana.`,
  };
  if (def.shot) {
    out.shot = {
      ...def.shot,
      damage: Math.round(def.shot.damage * 1.5),
      statuses: def.shot.statuses.map((s) => (s.kind === 'freeze' ? { ...s } : { ...s, potency: Math.round(s.potency * 1.25 * 100) / 100 })),
    };
  }
  if (def.augments) out.augments = def.augments.map(upgradeMod);
  if (def.globals) out.globals = def.globals.map(upgradeMod);
  upgraded.set(def, out);
  return out;
}

/** The def an instance resolves to (upgraded when `inst.plus`). */
export function defOf(catalog: RuneCatalog, inst: RuneInstance): RuneDef | undefined {
  const d = catalog[inst.defId];
  return d && inst.plus ? upgradeDef(d) : d;
}

// ---------------------------------------------------------------- open outputs & placement

export function openOutputs(graph: SpellGraph, catalog: RuneCatalog): OpenOutput[] {
  const a = analyze(graph);
  const used = new Set(graph.links.map((l) => `${l.from.uid}#${l.from.output}`));
  const result: OpenOutput[] = [];
  for (const n of graph.nodes) {
    const def = defOf(catalog, n);
    const level = a.levels.get(n.uid);
    if (!def || level === undefined) continue;
    def.outputs.forEach((color, output) => {
      if (!used.has(`${n.uid}#${output}`)) result.push({ uid: n.uid, output, color, level });
    });
  }
  return result;
}

export function findPlacements(graph: SpellGraph, catalog: RuneCatalog, def: RuneDef): Placement[] {
  if (def.inputs.length === 0) return [];
  const open = openOutputs(graph, catalog);
  const byLevel = new Map<number, OpenOutput[]>();
  for (const o of open) {
    const arr = byLevel.get(o.level) ?? [];
    arr.push(o);
    byLevel.set(o.level, arr);
  }
  const results: Placement[] = [];
  const seenKeys = new Set<string>();
  const levelKeys = [...byLevel.keys()].sort((x, y) => x - y);
  for (const L of levelKeys) {
    const outs = byLevel.get(L)!;
    const used = new Set<number>();
    const chosen: OutputRef[][] = [];
    const rec = (i: number): void => {
      if (results.length >= MAX_PLACEMENTS) return;
      if (i === def.inputs.length) {
        // Inputs of the same color are interchangeable: (R<-a, R<-b) is the same placement as (R<-b, R<-a).
        const key = chosen
          .map((g, k) => `${def.inputs[k]}:${g.map((r) => `${r.uid}#${r.output}`).sort().join(',')}`)
          .sort()
          .join('|');
        if (seenKeys.has(key)) return;
        seenKeys.add(key);
        results.push({ inputs: chosen.map((g) => g.map((r) => ({ ...r }))), level: L + 1 });
        return;
      }
      const target = def.inputs[i];
      const tbits = COLOR_BITS[target];
      const tryGroup = (idxs: number[]): void => {
        for (const j of idxs) used.add(j);
        chosen.push(idxs.map((j) => ({ uid: outs[j].uid, output: outs[j].output })));
        rec(i + 1);
        chosen.pop();
        for (const j of idxs) used.delete(j);
      };
      // single matching outputs (exact, or a complex output containing a primary target)
      for (let a = 0; a < outs.length; a++) {
        if (used.has(a) || !outputFeeds(outs[a].color, target)) continue;
        tryGroup([a]);
        if (results.length >= MAX_PLACEMENTS) return;
      }
      // combinations of 2 or 3 (index-ascending, so order within group is canonical)
      if (tbits & (tbits - 1)) {
        for (let a = 0; a < outs.length; a++) {
          if (used.has(a)) continue;
          const ba = COLOR_BITS[outs[a].color];
          if ((ba & tbits) !== ba) continue;
          for (let b = a + 1; b < outs.length; b++) {
            if (used.has(b)) continue;
            const bb = COLOR_BITS[outs[b].color];
            if ((bb & tbits) !== bb || (ba & bb) !== 0) continue;
            if ((ba | bb) === tbits) {
              tryGroup([a, b]);
              if (results.length >= MAX_PLACEMENTS) return;
              continue;
            }
            for (let c = b + 1; c < outs.length; c++) {
              if (used.has(c)) continue;
              const bc = COLOR_BITS[outs[c].color];
              if ((bc & tbits) !== bc || ((ba | bb) & bc) !== 0) continue;
              if ((ba | bb | bc) === tbits) {
                tryGroup([a, b, c]);
                if (results.length >= MAX_PLACEMENTS) return;
              }
            }
          }
        }
      }
    };
    rec(0);
    if (results.length >= MAX_PLACEMENTS) break;
  }
  return results.slice(0, MAX_PLACEMENTS);
}

export function placeRune(
  graph: SpellGraph, catalog: RuneCatalog, inst: RuneInstance, placement: Placement,
): SpellGraph {
  const def = defOf(catalog, inst);
  if (!def) throw new Error(`Unknown rune def "${inst.defId}"`);
  if (graph.nodes.some((n) => n.uid === inst.uid)) throw new Error(`Duplicate uid "${inst.uid}"`);
  if (placement.inputs.length !== def.inputs.length || def.inputs.length === 0) {
    throw new Error(`Placement has ${placement.inputs.length} inputs, rune needs ${def.inputs.length}`);
  }
  const open = openOutputs(graph, catalog);
  const seen = new Set<string>();
  let level: number | undefined;
  placement.inputs.forEach((group, i) => {
    const colors: Color[] = [];
    for (const ref of group) {
      const key = `${ref.uid}#${ref.output}`;
      if (seen.has(key)) throw new Error(`Output ${key} used twice in placement`);
      seen.add(key);
      const o = open.find((x) => x.uid === ref.uid && x.output === ref.output);
      if (!o) throw new Error(`Output ${key} does not exist or is not open`);
      if (level === undefined) level = o.level;
      else if (level !== o.level) throw new Error('Placement inputs come from mixed levels');
      colors.push(o.color);
    }
    if (group.length === 0 || !inputSatisfied(def.inputs[i], colors)) {
      throw new Error(`Input ${i} (${def.inputs[i]}) is not satisfied by outputs ${colors.join('+')}`);
    }
  });
  const newLinks: Link[] = [];
  placement.inputs.forEach((group, i) => {
    for (const ref of group) newLinks.push({ from: { uid: ref.uid, output: ref.output }, toUid: inst.uid, toInput: i });
  });
  return {
    rootUid: graph.rootUid,
    nodes: [...graph.nodes, inst.plus ? { uid: inst.uid, defId: inst.defId, plus: true } : { uid: inst.uid, defId: inst.defId }],
    links: [...graph.links, ...newLinks],
  };
}

export function removeRune(graph: SpellGraph, uid: string): SpellGraph {
  if (uid === graph.rootUid) throw new Error('Cannot remove the root rune');
  const removed = new Set<string>();
  const stack = [uid];
  while (stack.length) {
    const u = stack.pop()!;
    if (removed.has(u)) continue;
    removed.add(u);
    for (const l of graph.links) if (l.from.uid === u) stack.push(l.toUid);
  }
  return {
    rootUid: graph.rootUid,
    nodes: graph.nodes.filter((n) => !removed.has(n.uid)),
    links: graph.links.filter((l) => !removed.has(l.from.uid) && !removed.has(l.toUid)),
  };
}

// ---------------------------------------------------------------- cost / cast time

function spellWideMods(graph: SpellGraph, catalog: RuneCatalog, stat: 'castTime' | 'manaCost'): Modifier[] {
  const out: Modifier[] = [];
  for (const n of graph.nodes) {
    const def = defOf(catalog, n);
    for (const m of modsOf(def, 'augments')) if (m.stat === stat) out.push(m);
    for (const m of modsOf(def, 'globals')) if (m.stat === stat) out.push(m);
  }
  return out;
}

function computeCastTime(graph: SpellGraph, catalog: RuneCatalog): number {
  let base = 0;
  for (const n of graph.nodes) base += defOf(catalog, n)?.castTime ?? 0;
  return Math.max(MIN_CAST_TIME, stackValue(base, spellWideMods(graph, catalog, 'castTime')));
}

function computeMana(graph: SpellGraph, catalog: RuneCatalog, a: Analysis): number {
  const globalFlat = graph.nodes
    .flatMap((n) => modsOf(defOf(catalog, n), 'globals'))
    .filter((m) => m.stat === 'manaCost' && m.op === 'flat')
    .reduce((s, m) => s + m.value, 0);
  const seen = new Set<string>();
  let total = 0;
  for (const n of graph.nodes) {
    if (seen.has(n.uid)) continue;
    seen.add(n.uid);
    const def = defOf(catalog, n);
    if (!def) continue;
    let mana = def.mana + globalFlat;
    for (const anc of ancestorsOf(n.uid, a.parents)) {
      const ad = defOf(catalog, graph.nodes[a.nodeIndex.get(anc)!]);
      for (const m of modsOf(ad, 'augments')) if (m.stat === 'manaCost' && m.op === 'flat') mana += m.value;
    }
    total += Math.max(0, mana);
  }
  return total;
}

// ---------------------------------------------------------------- validation

export function validateSpell(graph: SpellGraph, catalog: RuneCatalog, maxMana: number): ValidationResult {
  const errors: string[] = [];
  const a = analyze(graph);

  if (!a.nodeIndex.has(graph.rootUid)) errors.push(`Root rune "${graph.rootUid}" is missing`);

  const uidSeen = new Set<string>();
  for (const n of graph.nodes) {
    if (uidSeen.has(n.uid)) errors.push(`Duplicate rune uid "${n.uid}"`);
    uidSeen.add(n.uid);
    if (!defOf(catalog, n)) errors.push(`Unknown rune "${n.defId}" (uid ${n.uid})`);
  }

  const defByUid = (uid: string): RuneDef | undefined => {
    const i = a.nodeIndex.get(uid);
    return i === undefined ? undefined : defOf(catalog, graph.nodes[i]);
  };

  // link sanity
  const goodLinks: Link[] = [];
  const outputUse = new Map<string, number>();
  for (const l of graph.links) {
    const fromDef = defByUid(l.from.uid);
    const toDef = defByUid(l.toUid);
    let ok = true;
    if (!a.nodeIndex.has(l.from.uid)) { errors.push(`Link references missing source rune "${l.from.uid}"`); ok = false; }
    if (!a.nodeIndex.has(l.toUid)) { errors.push(`Link references missing target rune "${l.toUid}"`); ok = false; }
    if (a.nodeIndex.has(l.from.uid)) {
      const key = `${l.from.uid}#${l.from.output}`;
      outputUse.set(key, (outputUse.get(key) ?? 0) + 1);
      if (fromDef && !(l.from.output >= 0 && l.from.output < fromDef.outputs.length)) {
        errors.push(`Link references missing output ${l.from.output} on rune "${l.from.uid}"`);
        ok = false;
      }
    }
    if (toDef && !(l.toInput >= 0 && l.toInput < toDef.inputs.length)) {
      errors.push(`Link references missing input ${l.toInput} on rune "${l.toUid}"`);
      ok = false;
    }
    if (ok && fromDef && toDef) goodLinks.push(l);
  }
  for (const [key, count] of outputUse) {
    if (count > 1) errors.push(`Output ${key} is used ${count} times (an output can feed only one input)`);
  }

  if (a.hasCycle) errors.push('Spell graph contains a cycle');

  // per-node input checks
  for (const n of graph.nodes) {
    const def = defOf(catalog, n);
    if (!def) continue;
    const isRoot = n.uid === graph.rootUid;
    def.inputs.forEach((color, i) => {
      const feeding = goodLinks.filter((l) => l.toUid === n.uid && l.toInput === i);
      if (feeding.length === 0) {
        if (!isRoot) errors.push(`Rune "${def.name}" (${n.uid}) input ${i} (${color}) is not connected`);
        return;
      }
      const colors = feeding.map((l) => defByUid(l.from.uid)!.outputs[l.from.output]);
      if (!inputSatisfied(color, colors)) {
        errors.push(
          `Color mismatch: rune "${def.name}" (${n.uid}) input ${i} needs ${color} but got ${colors.join('+')}`,
        );
      }
    });
    const parentLevels = new Set<number>();
    for (const p of a.parents.get(n.uid) ?? []) {
      const lv = a.levels.get(p);
      if (lv !== undefined) parentLevels.add(lv);
    }
    if (parentLevels.size > 1) {
      errors.push(`Rune "${def.name}" (${n.uid}) has inputs from mixed levels (${[...parentLevels].sort().join(', ')})`);
    }
  }

  const manaUsed = computeMana(graph, catalog, a);
  if (manaUsed > maxMana) errors.push(`Mana over budget: ${manaUsed} used, max ${maxMana}`);
  const castTime = computeCastTime(graph, catalog);

  const levels: Record<string, number> = {};
  for (const [uid, lv] of a.levels) levels[uid] = lv;
  return { valid: errors.length === 0, errors, manaUsed, castTime, levels };
}

// ---------------------------------------------------------------- compilation

const SHOT_STATS: ShotStat[] = ['damage', 'speed', 'aoeRadius', 'count', 'spreadDeg', 'pierce', 'homing', 'chain'];

function resolveShot(uid: string, def: RuneDef, mods: Modifier[]): ResolvedShot {
  const shot = def.shot!;
  const applicable = mods.filter((m) => m.element === undefined || m.element === shot.element);
  const forStat = (s: ShotStat | 'statusPotency' | 'statusDuration') => applicable.filter((m) => m.stat === s);
  const out: Record<string, number> = {};
  for (const s of SHOT_STATS) {
    out[s] = Math.max(0, stackValue(shot[s as keyof typeof shot] as number, forStat(s)));
  }
  const potencyMul = Math.max(0, stackValue(1, forStat('statusPotency')));
  const durationMul = Math.max(0, stackValue(1, forStat('statusDuration')));
  const statuses: StatusApplication[] = shot.statuses.map((s) => ({
    ...s, potency: s.potency * potencyMul, duration: s.duration * durationMul,
  }));
  return {
    element: shot.element,
    damage: out.damage,
    speed: out.speed,
    size: shot.size,
    aoeRadius: out.aoeRadius,
    count: Math.max(1, Math.round(out.count)),
    spreadDeg: out.spreadDeg,
    pierce: out.pierce,
    homing: out.homing,
    chain: out.chain,
    statuses,
    sourceUid: uid,
    runeName: def.name,
  };
}

export function compileSpell(graph: SpellGraph, catalog: RuneCatalog, extraGlobals: Modifier[] = []): CastPlan {
  const a = analyze(graph);
  const globals: Modifier[] = [
    ...graph.nodes.flatMap((n) => modsOf(defOf(catalog, n), 'globals')),
    // boons only carry shot stats; cast time / mana never come from them
    ...extraGlobals.filter((m) => m.stat !== 'castTime' && m.stat !== 'manaCost'),
  ];

  // DFS order from root
  const order: string[] = [];
  const visited = new Set<string>();
  const visit = (uid: string): void => {
    if (visited.has(uid)) return;
    visited.add(uid);
    order.push(uid);
    const kids = a.links
      .filter((l) => l.from.uid === uid)
      .sort((x, y) => a.nodeIndex.get(x.toUid)! - a.nodeIndex.get(y.toUid)! || x.from.output - y.from.output);
    for (const l of kids) visit(l.toUid);
  };
  if (a.nodeIndex.has(graph.rootUid)) visit(graph.rootUid);

  const shots: ResolvedShot[] = [];
  for (const uid of order) {
    const def = defAt(graph, catalog, a, uid);
    if (!def || def.outputs.length !== 0 || !def.shot) continue;
    const mods: Modifier[] = [];
    // ancestors in graph order for determinism
    const anc = ancestorsOf(uid, a.parents);
    for (const n of graph.nodes) {
      if (anc.has(n.uid)) mods.push(...modsOf(defOf(catalog, n), 'augments'));
    }
    mods.push(...globals);
    shots.push(resolveShot(uid, def, mods));
  }

  const keystones: KeystoneId[] = [];
  for (const n of graph.nodes) {
    const k = defOf(catalog, n)?.keystone;
    if (k && !keystones.includes(k)) keystones.push(k);
  }

  return {
    castTime: computeCastTime(graph, catalog),
    manaUsed: computeMana(graph, catalog, a),
    shots,
    stagger: STAGGER,
    keystones,
  };
}

function defAt(graph: SpellGraph, catalog: RuneCatalog, a: Analysis, uid: string): RuneDef | undefined {
  const i = a.nodeIndex.get(uid);
  return i === undefined ? undefined : defOf(catalog, graph.nodes[i]);
}

export const engine: SpellEngine = {
  colorsCombine, openOutputs, findPlacements, placeRune, removeRune, validateSpell, compileSpell, upgradeDef, defOf,
};
