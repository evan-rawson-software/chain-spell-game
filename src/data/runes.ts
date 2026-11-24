import type {
  Color, Element, Modifier, RuneCatalog, RuneDef, RuneInstance, ShotBase, SpellGraph, StatusApplication,
} from '../types';

export const SOURCE_ID = 'source';
export const ROOT_UID = 'root';

// ---------------------------------------------------------------- helpers

function shot(element: Element, damage: number, o: Partial<ShotBase> = {}): ShotBase {
  return {
    element, damage, speed: 500, size: 8, aoeRadius: 0, count: 1, spreadDeg: 0,
    pierce: 0, homing: 0, chain: 0, statuses: [], ...o,
  };
}

const st = (kind: StatusApplication['kind'], potency: number, duration: number): StatusApplication =>
  ({ kind, potency, duration });

const inc = (stat: Modifier['stat'], value: number, element?: Element): Modifier =>
  element ? { stat, op: 'increased', value, element } : { stat, op: 'increased', value };
const flat = (stat: Modifier['stat'], value: number, element?: Element): Modifier =>
  element ? { stat, op: 'flat', value, element } : { stat, op: 'flat', value };
const more = (stat: Modifier['stat'], value: number, element?: Element): Modifier =>
  element ? { stat, op: 'more', value, element } : { stat, op: 'more', value };

type Def = Omit<RuneDef, 'id'>;
const defs: Record<string, Def> = {
  // ------------------------------------------------------------ Source & starters
  [SOURCE_ID]: {
    name: 'Source', rarity: 'starter', inputs: [], outputs: ['R', 'B'], mana: 0, castTime: 0.5,
    description: 'The wellspring of every spell. Emits Red and Blue. Sets the base cast time.',
  },
  amplify: {
    name: 'Amplify', rarity: 'starter', inputs: ['R'], outputs: ['R'], mana: 2, castTime: 0.1,
    augments: [inc('damage', 0.3)],
    description: 'Passes Red along and boosts damage of everything beyond it by 30%.',
  },
  fireball: {
    name: 'Fireball', rarity: 'starter', inputs: ['R'], outputs: [], mana: 2, castTime: 0.2,
    shot: shot('fire', 40, { aoeRadius: 50, size: 10, speed: 450, statuses: [st('burn', 6, 3)] }),
    description: 'Hurls a fireball: 40 fire damage in a small blast, and sets enemies burning.',
  },
  frost_bolt: {
    name: 'Frost Bolt', rarity: 'starter', inputs: ['B'], outputs: [], mana: 2, castTime: 0.2,
    shot: shot('frost', 25, { statuses: [st('slow', 0.4, 2)] }),
    description: 'A shard of ice: 25 frost damage that slows the target by 40% for 2s.',
  },

  // ------------------------------------------------------------ Common
  ember_dart: {
    name: 'Ember Dart', rarity: 'common', inputs: ['R'], outputs: [], mana: 1, castTime: 0.1,
    shot: shot('fire', 20, { speed: 650, size: 6 }),
    description: 'A fast, cheap dart of flame. 20 fire damage.',
  },
  ice_shard: {
    name: 'Ice Shard', rarity: 'common', inputs: ['B'], outputs: [], mana: 1, castTime: 0.15,
    shot: shot('frost', 16, { speed: 600, size: 6, pierce: 1 }),
    description: 'A sliver of ice that pierces one extra enemy. 16 frost damage.',
  },
  thorn_shot: {
    name: 'Thorn Shot', rarity: 'common', inputs: ['G'], outputs: [], mana: 2, castTime: 0.2,
    shot: shot('nature', 14, { speed: 550, statuses: [st('poison', 4, 4)] }),
    description: 'A barbed thorn: 14 nature damage and a stacking poison (4 dps per stack, 4s).',
  },
  prism_fork: {
    name: 'Prism Fork', rarity: 'common', inputs: ['R'], outputs: ['R', 'B'], mana: 1, castTime: 0.1,
    description: 'Splits one Red stream into a Red and a Blue stream.',
  },
  bloom: {
    name: 'Bloom', rarity: 'common', inputs: ['G'], outputs: ['G', 'G'], mana: 2, castTime: 0.1,
    description: 'Splits one Green stream into two Green streams.',
  },
  verdigris: {
    name: 'Verdigris', rarity: 'common', inputs: ['B'], outputs: ['G'], mana: 1, castTime: 0.05,
    description: 'Converts a Blue stream into Green.',
  },
  kindle: {
    name: 'Kindle', rarity: 'common', inputs: ['B'], outputs: ['R'], mana: 1, castTime: 0.05,
    description: 'Converts a Blue stream into Red.',
  },
  ember_focus: {
    name: 'Ember Focus', rarity: 'common', inputs: ['R'], outputs: ['R'], mana: 1, castTime: 0.1,
    augments: [inc('damage', 0.4, 'fire')],
    description: 'Passes Red along. Fire shots beyond it deal 40% more (increased) damage.',
  },
  frost_focus: {
    name: 'Frost Focus', rarity: 'common', inputs: ['B'], outputs: ['B'], mana: 1, castTime: 0.1,
    augments: [inc('damage', 0.4, 'frost')],
    description: 'Passes Blue along. Frost shots beyond it deal 40% more (increased) damage.',
  },
  kindling: {
    name: 'Kindling', rarity: 'common', inputs: ['R'], outputs: ['R'], mana: 1, castTime: 0.1,
    augments: [flat('damage', 8)],
    description: 'Passes Red along and adds 8 flat damage to every shot beyond it.',
  },
  thrift: {
    name: 'Thrift', rarity: 'common', inputs: ['B'], outputs: ['B'], mana: 1, castTime: 0.05,
    augments: [flat('manaCost', -1)],
    description: 'Passes Blue along. Runes beyond it cost 1 less mana.',
  },

  // ------------------------------------------------------------ Uncommon
  split: {
    name: 'Split', rarity: 'uncommon', inputs: ['R'], outputs: ['R'], mana: 2, castTime: 0.15,
    augments: [flat('count', 2), flat('spreadDeg', 20), more('damage', -0.25)],
    description: 'Passes Red along. Shots beyond it fire 2 extra projectiles in a fan, each 25% weaker.',
  },
  pierce: {
    name: 'Pierce', rarity: 'uncommon', inputs: ['B'], outputs: ['B'], mana: 2, castTime: 0.1,
    augments: [flat('pierce', 2)],
    description: 'Passes Blue along. Shots beyond it pass through 2 extra enemies.',
  },
  blast: {
    name: 'Blast', rarity: 'uncommon', inputs: ['R'], outputs: ['R'], mana: 2, castTime: 0.15,
    augments: [flat('aoeRadius', 40)],
    description: 'Passes Red along. Shots beyond it explode in a 40px radius.',
  },
  seeker: {
    name: 'Seeker', rarity: 'uncommon', inputs: ['B'], outputs: ['B'], mana: 2, castTime: 0.1,
    augments: [flat('homing', 3)],
    description: 'Passes Blue along. Shots beyond it curve toward nearby enemies.',
  },
  chain_link: {
    name: 'Chain Link', rarity: 'uncommon', inputs: ['Y'], outputs: ['Y'], mana: 2, castTime: 0.1,
    augments: [flat('chain', 2)],
    description: 'Passes Yellow along. Shots beyond it jump to 2 more nearby enemies.',
  },
  quicken: {
    name: 'Quicken', rarity: 'uncommon', inputs: ['R'], outputs: ['R'], mana: 2, castTime: -0.1,
    augments: [inc('castTime', -0.25), inc('damage', -0.15)],
    description: 'Passes Red along. Spell cast time -25%, but shots beyond it deal 15% less damage.',
  },
  overload: {
    name: 'Overload', rarity: 'uncommon', inputs: ['R'], outputs: ['R'], mana: 3, castTime: 0.1,
    augments: [inc('damage', 0.5), flat('castTime', 0.4)],
    description: 'Passes Red along. Shots beyond it deal 50% more damage, but the cast takes 0.4s longer.',
  },
  virulence: {
    name: 'Virulence', rarity: 'uncommon', inputs: ['G'], outputs: ['G'], mana: 2, castTime: 0.1,
    augments: [inc('statusPotency', 0.5)],
    description: 'Passes Green along. Status effects beyond it are 50% more potent.',
  },
  lingering: {
    name: 'Lingering', rarity: 'uncommon', inputs: ['G'], outputs: ['G'], mana: 2, castTime: 0.1,
    augments: [inc('statusDuration', 0.5)],
    description: 'Passes Green along. Status effects beyond it last 50% longer.',
  },
  lightning_bolt: {
    name: 'Lightning Bolt', rarity: 'uncommon', inputs: ['Y'], outputs: [], mana: 3, castTime: 0.2,
    shot: shot('lightning', 30, { speed: 700, size: 7, chain: 2 }),
    description: 'A crackling bolt: 30 lightning damage that chains to 2 more enemies. Big bonus on Wet targets.',
  },
  arcane_missile: {
    name: 'Arcane Missile', rarity: 'uncommon', inputs: ['P'], outputs: [], mana: 3, castTime: 0.2,
    shot: shot('arcane', 28, { speed: 450, size: 7, homing: 4, count: 2, spreadDeg: 16 }),
    description: 'Two homing missiles of raw arcana, 28 damage each.',
  },
  squall: {
    name: 'Squall', rarity: 'uncommon', inputs: ['T'], outputs: [], mana: 3, castTime: 0.25,
    shot: shot('storm', 22, { speed: 400, size: 11, aoeRadius: 70, statuses: [st('wet', 0.5, 5)] }),
    description: 'A rolling storm cell: 22 storm damage in a wide area. Soaks enemies, so lightning hits harder.',
  },
  hex: {
    name: 'Hex', rarity: 'uncommon', inputs: ['G'], outputs: [], mana: 2, castTime: 0.15,
    shot: shot('arcane', 8, { speed: 550, statuses: [st('weaken', 0.3, 6)] }),
    description: 'A curse bolt: 8 damage, and the target takes 30% more damage from all sources for 6s.',
  },
  haste_sigil: {
    name: 'Haste Sigil', rarity: 'uncommon', inputs: ['B'], outputs: [], mana: 2, castTime: 0.05,
    globals: [inc('castTime', -0.2)],
    description: 'Fires nothing. The whole spell casts 20% faster.',
  },
  power_sigil: {
    name: 'Power Sigil', rarity: 'uncommon', inputs: ['R'], outputs: [], mana: 3, castTime: 0.3,
    globals: [inc('damage', 0.2)],
    description: 'Fires nothing. Every shot in the spell deals 20% more damage.',
  },

  // ------------------------------------------------------------ Rare
  empower: {
    name: 'Empower', rarity: 'rare', inputs: ['R'], outputs: ['R'], mana: 3, castTime: 0.15,
    augments: [more('damage', 0.5)],
    description: 'Passes Red along. Shots beyond it deal x1.5 damage (multiplies after all other bonuses).',
  },
  chromatic_lens: {
    name: 'Chromatic Lens', rarity: 'rare', inputs: ['R'], outputs: ['Y', 'P'], mana: 3, castTime: 0.15,
    description: 'Refracts a Red stream directly into a Yellow and a Purple stream.',
  },
  storm_lens: {
    name: 'Storm Lens', rarity: 'rare', inputs: ['G'], outputs: ['T', 'Y'], mana: 3, castTime: 0.15,
    description: 'Refracts a Green stream directly into a Teal and a Yellow stream.',
  },
  meteor: {
    name: 'Meteor', rarity: 'rare', inputs: ['R', 'R', 'B'], outputs: [], mana: 4, castTime: 0.5,
    shot: shot('fire', 160, { speed: 350, size: 14, aoeRadius: 100, statuses: [st('burn', 12, 4), st('slow', 0.3, 2)] }),
    description: 'Needs Red, Red and Blue. A huge slow meteor: 160 fire damage in a wide blast, burns and chills.',
  },
  spectrum_nova: {
    name: 'Spectrum Nova', rarity: 'rare', inputs: ['R', 'G', 'B'], outputs: [], mana: 4, castTime: 0.4,
    shot: shot('pure', 110, { speed: 500, size: 12, aoeRadius: 90, pierce: 2 }),
    description: 'Needs Red, Green and Blue. Pure energy: 110 damage in a wide burst, piercing.',
  },
  catalyst: {
    name: 'Catalyst', rarity: 'rare', inputs: ['R'], outputs: [], mana: 3, castTime: 0.1,
    globals: [inc('damage', 0.25, 'fire')],
    description: 'Fires nothing. Every fire shot in the spell deals 25% more damage.',
  },
  conduit: {
    name: 'Conduit', rarity: 'rare', inputs: ['Y'], outputs: [], mana: 3, castTime: 0.1,
    globals: [flat('chain', 1), inc('statusPotency', 0.25)],
    description: 'Fires nothing. Every shot in the spell chains 1 extra time and has 25% stronger statuses.',
  },
};

export const CATALOG: RuneCatalog = Object.fromEntries(
  Object.entries(defs).map(([id, d]) => [id, { id, ...d } as RuneDef]),
);

/** defIds owned at run start (Source excluded). */
export const STARTER_KIT: string[] = ['amplify', 'fireball', 'frost_bolt'];

// ---------------------------------------------------------------- starter graph

export function starterGraph(owned: RuneInstance[]): SpellGraph {
  const pick = (defId: string): RuneInstance => {
    const inst = owned.find((r) => r.defId === defId);
    if (!inst) throw new Error(`starterGraph: owned runes missing "${defId}"`);
    return inst;
  };
  const amplify = pick('amplify');
  const frost = pick('frost_bolt');
  const fireball = pick('fireball');
  return {
    rootUid: ROOT_UID,
    nodes: [{ uid: ROOT_UID, defId: SOURCE_ID }, amplify, frost, fireball],
    links: [
      { from: { uid: ROOT_UID, output: 0 }, toUid: amplify.uid, toInput: 0 },
      { from: { uid: ROOT_UID, output: 1 }, toUid: frost.uid, toInput: 0 },
      { from: { uid: amplify.uid, output: 0 }, toUid: fireball.uid, toInput: 0 },
    ],
  };
}

// ---------------------------------------------------------------- tooltip

const ELEMENT_NAME: Record<Element, string> = {
  fire: 'Fire', frost: 'Frost', nature: 'Nature', lightning: 'Lightning',
  arcane: 'Arcane', storm: 'Storm', pure: 'Pure',
};

const STAT_LABEL: Record<Modifier['stat'], string> = {
  damage: 'damage', speed: 'projectile speed', aoeRadius: 'blast radius', count: 'projectiles',
  spreadDeg: 'spread (deg)', pierce: 'pierce', homing: 'homing', chain: 'chain jumps',
  statusPotency: 'status potency', statusDuration: 'status duration',
  castTime: 'cast time', manaCost: 'mana cost',
};

const num = (n: number): string => String(Math.round(n * 100) / 100);
const sgn = (n: number): string => (n >= 0 ? '+' : '-') + num(Math.abs(n));

function fmtMod(m: Modifier): string {
  const label = STAT_LABEL[m.stat];
  let body: string;
  if (m.op === 'flat') {
    body = `${sgn(m.value)}${m.stat === 'castTime' ? 's' : ''} ${label}`;
  } else if (m.op === 'increased') {
    body = `${sgn(m.value * 100)}% ${label}`;
  } else {
    body = `x${num(1 + m.value)} ${label}`;
  }
  return m.element ? `${ELEMENT_NAME[m.element]} shots ${body}` : body;
}

export function runeTooltip(def: RuneDef): string {
  const lines: string[] = [def.name];
  lines.push(`In: ${def.inputs.length ? def.inputs.join(' + ') : 'none'}   Out: ${def.outputs.length ? def.outputs.join(', ') : 'none'}`);
  lines.push(`Mana ${def.mana}   Cast ${sgn(def.castTime)}s`);
  if (def.shot) {
    const s = def.shot;
    const parts = [`${ELEMENT_NAME[s.element]} ${s.damage} dmg`];
    if (s.count > 1) parts.push(`x${s.count} shots`);
    if (s.aoeRadius > 0) parts.push(`${s.aoeRadius}px blast`);
    if (s.pierce > 0) parts.push(`pierce ${s.pierce}`);
    if (s.homing > 0) parts.push('homing');
    if (s.chain > 0) parts.push(`chain ${s.chain}`);
    lines.push(parts.join(', '));
    for (const a of s.statuses) {
      const pot = a.kind === 'slow' || a.kind === 'wet' || a.kind === 'weaken'
        ? `${Math.round(a.potency * 100)}%` : num(a.potency);
      lines.push(`Applies ${a.kind} (${pot}) for ${num(a.duration)}s`);
    }
  }
  for (const m of def.augments ?? []) lines.push(`${fmtMod(m)} to descendants`);
  for (const m of def.globals ?? []) lines.push(`${fmtMod(m)} (whole spell)`);
  return lines.join('\n');
}

export type { Color };
