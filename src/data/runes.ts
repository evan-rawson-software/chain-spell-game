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
    name: 'Source', rarity: 'starter', inputs: [], outputs: ['R', 'B', 'G'], mana: 0, castTime: 0.5,
    description: 'The wellspring of every spell. Emits Red, Blue and Green. Sets the base cast time.',
  },
  amplify: {
    name: 'Amplify', rarity: 'starter', inputs: ['R'], outputs: ['R', 'R'], mana: 2, castTime: 0.1,
    augments: [inc('damage', 0.3)],
    description: 'Splits Red into two Red streams. Shots beyond it deal 30% more damage.',
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
    name: 'Prism Fork', rarity: 'common', inputs: ['R'], outputs: ['R', 'G', 'B'], mana: 2, castTime: 0.1,
    augments: [inc('speed', 0.2), flat('damage', 4)],
    description: 'Turns Red into Red, Green and Blue streams. Shots beyond it fly 20% faster and deal +4 damage.',
  },
  bloom: {
    name: 'Bloom', rarity: 'common', inputs: ['G'], outputs: ['G', 'G', 'G'], mana: 3, castTime: 0.1,
    augments: [inc('statusDuration', 0.3)],
    description: 'Splits Green into three Green streams. Status effects beyond it last 30% longer.',
  },
  verdigris: {
    name: 'Verdigris', rarity: 'common', inputs: ['B'], outputs: ['G', 'T'], mana: 2, castTime: 0.05,
    augments: [inc('statusPotency', 0.25)],
    description: 'Turns Blue into Green and Teal streams. Status effects beyond it are 25% more potent.',
  },
  kindle: {
    name: 'Kindle', rarity: 'common', inputs: ['B'], outputs: ['R', 'R'], mana: 2, castTime: 0.05,
    augments: [flat('damage', 5)],
    description: 'Turns Blue into two Red streams. Shots beyond it deal +5 damage.',
  },
  ember_focus: {
    name: 'Ember Focus', rarity: 'common', inputs: ['R'], outputs: ['R', 'R'], mana: 2, castTime: 0.1,
    augments: [inc('damage', 0.4, 'fire')],
    description: 'Splits Red into two Red streams. Fire shots beyond it deal 40% more (increased) damage.',
  },
  frost_focus: {
    name: 'Frost Focus', rarity: 'common', inputs: ['B'], outputs: ['B', 'B'], mana: 2, castTime: 0.1,
    augments: [inc('damage', 0.4, 'frost')],
    description: 'Splits Blue into two Blue streams. Frost shots beyond it deal 40% more (increased) damage.',
  },
  kindling: {
    name: 'Kindling', rarity: 'common', inputs: ['R'], outputs: ['R', 'B'], mana: 2, castTime: 0.1,
    augments: [flat('damage', 8)],
    description: 'Turns Red into Red and Blue streams. Shots beyond it deal +8 damage.',
  },
  thrift: {
    name: 'Thrift', rarity: 'common', inputs: ['B'], outputs: ['B', 'G'], mana: 2, castTime: 0.05,
    augments: [flat('manaCost', -1)],
    description: 'Turns Blue into Blue and Green streams. Runes beyond it cost 1 less mana.',
  },

  // ------------------------------------------------------------ Uncommon
  split: {
    name: 'Split', rarity: 'uncommon', inputs: ['R'], outputs: ['R', 'R', 'R'], mana: 3, castTime: 0.15,
    augments: [flat('count', 2), flat('spreadDeg', 20), more('damage', -0.25)],
    description: 'Splits Red into three Red streams. Shots beyond it fire 2 extra projectiles in a fan, each 25% weaker.',
  },
  pierce: {
    name: 'Pierce', rarity: 'uncommon', inputs: ['B'], outputs: ['B', 'B'], mana: 3, castTime: 0.1,
    augments: [flat('pierce', 2)],
    description: 'Splits one Blue stream into two Blue streams. Shots beyond it pass through 2 extra enemies.',
  },
  blast: {
    name: 'Blast', rarity: 'uncommon', inputs: ['R'], outputs: ['R', 'Y'], mana: 3, castTime: 0.15,
    augments: [flat('aoeRadius', 40)],
    description: 'Splits Red into a Red and a Yellow stream. Shots beyond it explode in a 40px radius.',
  },
  seeker: {
    name: 'Seeker', rarity: 'uncommon', inputs: ['B'], outputs: ['B', 'P'], mana: 3, castTime: 0.1,
    augments: [flat('homing', 3)],
    description: 'Splits Blue into a Blue and a Purple stream. Shots beyond it curve toward nearby enemies.',
  },
  chain_link: {
    name: 'Chain Link', rarity: 'uncommon', inputs: ['Y'], outputs: ['Y', 'Y'], mana: 3, castTime: 0.1,
    augments: [flat('chain', 2)],
    description: 'Splits one Yellow stream into two Yellow streams. Shots beyond it jump to 2 more nearby enemies.',
  },
  quicken: {
    name: 'Quicken', rarity: 'uncommon', inputs: ['R'], outputs: ['R', 'B'], mana: 2, castTime: -0.1,
    augments: [inc('castTime', -0.25), inc('damage', -0.15)],
    description: 'Turns Red into Red and Blue streams. Spell cast time -25%, but shots beyond it deal 15% less damage.',
  },
  overload: {
    name: 'Overload', rarity: 'uncommon', inputs: ['R'], outputs: ['R', 'R'], mana: 3, castTime: 0.1,
    augments: [inc('damage', 0.5), flat('castTime', 0.4)],
    description: 'Splits Red into two Red streams. Shots beyond it deal 50% more damage, but the cast takes 0.4s longer.',
  },
  virulence: {
    name: 'Virulence', rarity: 'uncommon', inputs: ['G'], outputs: ['G', 'T'], mana: 3, castTime: 0.1,
    augments: [inc('statusPotency', 0.5)],
    description: 'Splits Green into a Green and a Teal stream. Status effects beyond it are 50% more potent.',
  },
  lingering: {
    name: 'Lingering', rarity: 'uncommon', inputs: ['G'], outputs: ['G', 'G'], mana: 3, castTime: 0.1,
    augments: [inc('statusDuration', 0.5)],
    description: 'Splits one Green stream into two Green streams. Status effects beyond it last 50% longer.',
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
    name: 'Empower', rarity: 'rare', inputs: ['R'], outputs: ['R', 'P'], mana: 4, castTime: 0.15,
    augments: [more('damage', 0.5)],
    description: 'Turns Red into Red and Purple streams. Shots beyond it deal x1.5 damage (multiplies after all other bonuses).',
  },
  chromatic_lens: {
    name: 'Chromatic Lens', rarity: 'rare', inputs: ['R'], outputs: ['Y', 'P'], mana: 3, castTime: 0.15,
    augments: [inc('damage', 0.2), flat('homing', 1.5)],
    description: 'Refracts a Red stream into a Yellow and a Purple stream. Shots beyond it deal 20% more damage and gently home.',
  },
  storm_lens: {
    name: 'Storm Lens', rarity: 'rare', inputs: ['G'], outputs: ['T', 'Y'], mana: 3, castTime: 0.15,
    augments: [flat('chain', 1), inc('speed', 0.2)],
    description: 'Refracts a Green stream into a Teal and a Yellow stream. Shots beyond it chain 1 extra time and fly 20% faster.',
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

  // ------------------------------------------------------------ New: common
  spectral_split: {
    name: 'Spectral Split', rarity: 'common', inputs: ['G'], outputs: ['R', 'G', 'B'], mana: 3, castTime: 0.1,
    augments: [inc('statusPotency', 0.15)],
    description: 'Turns Green into Red, Green and Blue streams. Status effects beyond it are 15% more potent.',
  },
  teal_weave: {
    name: 'Teal Weave', rarity: 'common', inputs: ['G', 'B'], outputs: ['T', 'T'], mana: 2, castTime: 0.1,
    augments: [inc('statusDuration', 0.2)],
    description: 'Merges Green and Blue into two Teal streams. Status effects beyond it last 20% longer.',
  },
  poison_cloud: {
    name: 'Poison Cloud', rarity: 'common', inputs: ['G'], outputs: [], mana: 2, castTime: 0.25,
    shot: shot('nature', 6, { speed: 300, size: 12, aoeRadius: 85, statuses: [st('poison', 5, 5)] }),
    description: 'A slow toxic cloud: 6 nature damage in a wide area and a stacking poison (5 dps per stack, 5s).',
  },

  // ------------------------------------------------------------ New: uncommon
  photosynth: {
    name: 'Photosynth', rarity: 'uncommon', inputs: ['R'], outputs: ['G', 'G'], mana: 3, castTime: 0.1,
    augments: [inc('statusDuration', 0.2)],
    description: 'Turns one Red stream into two Green streams. Status effects beyond it last 20% longer.',
  },
  prism_merge: {
    name: 'Prism Merge', rarity: 'uncommon', inputs: ['R', 'B'], outputs: ['P', 'P'], mana: 3, castTime: 0.15,
    augments: [inc('damage', 0.15)],
    description: 'Fuses a Red and a Blue stream into two Purple streams. Shots beyond it deal 15% more damage.',
  },
  gilded_weave: {
    name: 'Gilded Weave', rarity: 'uncommon', inputs: ['R', 'G'], outputs: ['Y', 'Y'], mana: 3, castTime: 0.15,
    augments: [flat('chain', 1)],
    description: 'Fuses a Red and a Green stream into two Yellow streams. Shots beyond it chain 1 extra time.',
  },
  frost_nova: {
    name: 'Frost Nova', rarity: 'uncommon', inputs: ['T'], outputs: [], mana: 3, castTime: 0.25,
    shot: shot('frost', 18, { speed: 380, size: 11, aoeRadius: 80, statuses: [st('freeze', 0, 1.5), st('slow', 0.3, 3)] }),
    description: 'A burst of killing cold: 18 frost damage in an area that freezes enemies solid for 1.5s, then chills them.',
  },
  weaken_beam: {
    name: 'Weaken Beam', rarity: 'uncommon', inputs: ['Y'], outputs: [], mana: 3, castTime: 0.2,
    shot: shot('arcane', 10, { speed: 750, size: 6, pierce: 3, statuses: [st('weaken', 0.35, 5)] }),
    description: 'A piercing ray: 10 arcane damage, and every enemy hit takes 35% more damage from all sources for 5s.',
  },
  nature_volley: {
    name: 'Nature Volley', rarity: 'uncommon', inputs: ['G'], outputs: [], mana: 3, castTime: 0.25,
    shot: shot('nature', 9, { speed: 520, size: 6, count: 4, spreadDeg: 30, statuses: [st('poison', 2, 3)] }),
    description: 'Four barbed seeds in a fan: 9 nature damage each, with a light stacking poison.',
  },
  void_bolt: {
    name: 'Void Bolt', rarity: 'uncommon', inputs: ['P'], outputs: [], mana: 3, castTime: 0.25,
    shot: shot('arcane', 48, { speed: 480, size: 8, pierce: 2 }),
    description: 'A heavy bolt of the void: 48 arcane damage, piercing 2 extra enemies.',
  },
  arc_flash: {
    name: 'Arc Flash', rarity: 'uncommon', inputs: ['Y'], outputs: [], mana: 3, castTime: 0.2,
    shot: shot('lightning', 14, { speed: 720, size: 6, count: 3, spreadDeg: 24, chain: 1 }),
    description: 'Three lightning sparks in a fan: 14 lightning damage each, each chaining once. Strong on Wet targets.',
  },
  cyclone: {
    name: 'Cyclone', rarity: 'uncommon', inputs: ['T'], outputs: [], mana: 3, castTime: 0.25,
    shot: shot('storm', 30, { speed: 360, size: 11, aoeRadius: 60, pierce: 2, statuses: [st('wet', 0.4, 4)] }),
    description: 'A tearing whirlwind: 30 storm damage in an area that pierces through enemies and soaks them.',
  },
  frenzy_sigil: {
    name: 'Frenzy Sigil', rarity: 'uncommon', inputs: ['B'], outputs: [], mana: 2, castTime: 0.05,
    globals: [inc('castTime', -0.3), more('damage', -0.2)],
    description: 'Fires nothing. The whole spell casts 30% faster, but every shot deals 20% less damage.',
  },
  venom_sigil: {
    name: 'Venom Sigil', rarity: 'uncommon', inputs: ['G'], outputs: [], mana: 2, castTime: 0.1,
    globals: [inc('statusPotency', 0.5), more('damage', -0.1)],
    description: 'Fires nothing. Every status in the spell is 50% more potent, but shots deal 10% less direct damage.',
  },

  // ------------------------------------------------------------ New: rare
  prismatic_heart: {
    name: 'Prismatic Heart', rarity: 'rare', inputs: ['R', 'G', 'B'], outputs: ['W', 'W'], mana: 4, castTime: 0.2,
    augments: [more('damage', 0.3)],
    description: 'Merges Red, Green and Blue into two White streams. Shots beyond it deal x1.3 damage.',
  },
  prism_break: {
    name: 'Prism Break', rarity: 'rare', inputs: ['W'], outputs: ['P', 'T', 'Y'], mana: 4, castTime: 0.2,
    augments: [inc('damage', 0.2), inc('statusPotency', 0.2)],
    description: 'Turns White into Purple, Teal and Yellow streams. Shots beyond it deal 20% more damage and have 20% stronger statuses.',
  },
  radiant_lance: {
    name: 'Radiant Lance', rarity: 'rare', inputs: ['W'], outputs: [], mana: 4, castTime: 0.45,
    shot: shot('pure', 130, { speed: 650, size: 10, pierce: 4 }),
    description: 'Needs White. A lance of pure light: 130 damage, piercing 4 extra enemies.',
  },
  tempest: {
    name: 'Tempest', rarity: 'rare', inputs: ['W'], outputs: [], mana: 4, castTime: 0.45,
    shot: shot('storm', 70, { speed: 340, size: 14, aoeRadius: 110, chain: 2, statuses: [st('wet', 0.6, 5)] }),
    description: 'Needs White. A raging storm: 70 storm damage in a huge area, chaining twice and drenching everything.',
  },
  sun_lance: {
    name: 'Sun Lance', rarity: 'rare', inputs: ['Y'], outputs: [], mana: 4, castTime: 0.35,
    shot: shot('fire', 75, { speed: 700, size: 9, pierce: 3, statuses: [st('burn', 10, 4)] }),
    description: 'A beam of searing light: 75 fire damage, piercing 3 extra enemies and setting them ablaze.',
  },
  glass_sigil: {
    name: 'Glass Sigil', rarity: 'rare', inputs: ['R'], outputs: [], mana: 3, castTime: 0.1,
    globals: [more('damage', 0.35), inc('castTime', 0.3)],
    description: 'Fires nothing. Every shot deals x1.35 damage, but the whole spell casts 30% slower.',
  },
};

export const CATALOG: RuneCatalog = Object.fromEntries(
  Object.entries(defs).map(([id, d]) => [id, { id, ...d } as RuneDef]),
);

/** defIds owned at run start (Source excluded). */
export const STARTER_KIT: string[] = ['amplify', 'fireball', 'frost_bolt'];

// ---------------------------------------------------------------- starter graph

/** [defId, parent ('root' or a defId), parent output index]. Node order = firing order within a level. */
type LayoutEntry = [string, string, number];

const LAYOUTS: Record<string, LayoutEntry[]> = {
  elementalist: [['amplify', 'root', 0], ['frost_bolt', 'root', 1], ['fireball', 'amplify', 0]],
  pyromancer: [['amplify', 'root', 0], ['fireball', 'amplify', 0], ['ember_dart', 'amplify', 1]],
  cryomancer: [
    ['frost_focus', 'root', 1], ['frost_bolt', 'frost_focus', 0], ['ice_shard', 'frost_focus', 1], ['ember_dart', 'root', 0],
  ],
  druid: [
    ['bloom', 'root', 2], ['thorn_shot', 'bloom', 0], ['poison_cloud', 'bloom', 1], ['ember_dart', 'root', 0],
  ],
};

export function starterGraph(owned: RuneInstance[], schoolId = 'elementalist'): SpellGraph {
  const layout = LAYOUTS[schoolId] ?? LAYOUTS.elementalist;
  const insts = new Map<string, RuneInstance>();
  for (const [defId] of layout) {
    const inst = owned.find((r) => r.defId === defId);
    if (!inst) throw new Error(`starterGraph: owned runes missing "${defId}"`);
    insts.set(defId, inst);
  }
  const uidOf = (defId: string): string => (defId === 'root' ? ROOT_UID : insts.get(defId)!.uid);
  return {
    rootUid: ROOT_UID,
    nodes: [{ uid: ROOT_UID, defId: SOURCE_ID }, ...layout.map(([defId]) => insts.get(defId)!)],
    links: layout.map(([defId, parent, output]) => ({
      from: { uid: uidOf(parent), output }, toUid: insts.get(defId)!.uid, toInput: 0,
    })),
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
