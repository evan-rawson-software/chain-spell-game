import { BOONS } from '../data/boons';
import { CATALOG, ROOT_UID, SOURCE_ID } from '../data/runes';
import type { RunState } from '../types';
import { nodeSeed, rollBoons } from './rewards';
import { createRng, type Rng } from './rng';
import { addBoon, applyReward, forgeRune, removeBoon } from './state';
import { dropRune, instTier, rollHigher, runeLabel } from './trade';

export type EventId = 'mage' | 'altar' | 'tome' | 'merchant' | 'dice' | 'fountain';
export const EVENT_IDS: EventId[] = ['mage', 'altar', 'tome', 'merchant', 'dice', 'fountain'];

export const DICE_COST = 25;
export const DICE_WIN = 60;
export const DICE_CHANCE = 0.5;
export const FOUNTAIN_HP = 15;
export const MAGE_MIN = 10;

export const EVENT_INFO: Record<EventId, { name: string; text: string }> = {
  mage: { name: 'Wounded Mage', text: 'A mage slumped against a tree offers a rune from his pack, if you will pay for his healer.' },
  altar: { name: 'Rune Altar', text: 'An altar hums. Give it one rune and it will temper two others.' },
  tome: { name: 'Cursed Tome', text: 'Reading the tome will empower your spell, but the book bites back.' },
  merchant: { name: 'Wandering Merchant', text: 'A hooded trader will swap any rune of yours for a finer one.' },
  dice: { name: "Gambler's Dice", text: `Two bone dice. Stake ${DICE_COST} gold; call it right and win ${DICE_WIN}.` },
  fountain: { name: 'Fountain', text: 'Clear water wells up. It can fortify your ward or wash a curse away.' },
};

/** The event of a node: seeded from the run seed and node id. */
export function eventFor(seed: number, nodeId: string): EventId {
  return createRng(nodeSeed(seed, nodeId, 40)).pick(EVENT_IDS);
}

/** Per-node RNG for the event's random results. */
export function eventRng(seed: number, nodeId: string): Rng {
  return createRng(nodeSeed(seed, nodeId, 41));
}

export interface EventResult { run: RunState; lines: string[] }

export const mageCost = (run: RunState): number => Math.max(MAGE_MIN, Math.floor(run.gold / 2));

const unforged = (run: RunState, except?: string) => run.owned.filter((o) => !o.plus && o.uid !== except && !!CATALOG[o.defId]);
const heldCurses = (run: RunState) => run.boons.filter((id) => BOONS[id]?.kind === 'curse');
const spellForgeable = (run: RunState) => run.graph.nodes.filter((n) => n.uid !== ROOT_UID && !n.plus && !!CATALOG[n.defId]);

const cutNote = (n: number): string[] => (n > 1 ? [`${n - 1} dependent rune${n === 2 ? '' : 's'} left your spell too.`] : []);

export function canMage(run: RunState): boolean { return run.gold >= mageCost(run); }
export function canTome(run: RunState): boolean {
  return spellForgeable(run).length > 0 && rollBoons('curse', run.boons, createRng(1), 1).length > 0;
}
export function canAltar(run: RunState, uid?: string): boolean { return unforged(run, uid).length > 0; }
export function canDice(run: RunState): boolean { return run.gold >= DICE_COST; }
export function canFountainCurse(run: RunState): boolean { return heldCurses(run).length > 0; }

/** Pay half your gold (min 10) for a random uncommon or rare rune. */
export function resolveMage(run: RunState, rng: Rng): EventResult | null {
  const cost = mageCost(run);
  if (run.gold < cost) return null;
  const pool = Object.values(CATALOG).filter((d) => d.id !== SOURCE_ID && (d.rarity === 'uncommon' || d.rarity === 'rare'));
  const def = rng.pick(pool);
  const next = applyReward({ ...run, gold: run.gold - cost }, { kind: 'rune', defId: def.id });
  return { run: next, lines: [`You paid ${cost} gold.`, `You received ${def.name} (${def.rarity}).`] };
}

/** Sacrifice a rune to forge two other random unforged runes. */
export function resolveAltar(run: RunState, uid: string, rng: Rng): EventResult | null {
  const inst = run.owned.find((o) => o.uid === uid);
  if (!inst) return null;
  const targets = unforged(run, uid);
  if (!targets.length) return null;
  const dropped = dropRune(run, uid);
  let next = dropped.run;
  const lines = [`The altar consumed ${runeLabel(inst)}.`, ...cutNote(dropped.cut.length)];
  const pool = [...targets];
  for (let i = 0; i < 2 && pool.length; i++) {
    const t = pool.splice(rng.int(pool.length), 1)[0];
    next = forgeRune(next, t.uid);
    lines.push(`${runeLabel(t)} was forged to ${runeLabel({ ...t, plus: true })}.`);
  }
  return { run: next, lines };
}

/** Take a random curse; every rune in your spell is forged. */
export function resolveTome(run: RunState, rng: Rng): EventResult | null {
  const curse = rollBoons('curse', run.boons, rng, 1)[0];
  const targets = spellForgeable(run);
  if (!curse || !targets.length) return null;
  let next = addBoon(run, curse.id);
  const lines = [`You took the curse ${curse.name}: ${curse.description}`];
  for (const t of targets) {
    next = forgeRune(next, t.uid);
    lines.push(`${runeLabel(t)} was forged to ${runeLabel({ ...t, plus: true })}.`);
  }
  return { run: next, lines };
}

/** Trade a rune for a random rune one rarity higher. */
export function resolveMerchant(run: RunState, uid: string, rng: Rng): EventResult | null {
  const inst = run.owned.find((o) => o.uid === uid);
  if (!inst) return null;
  const def = rollHigher(instTier(inst), rng, [inst.defId]);
  if (!def) return null;
  const dropped = dropRune(run, uid);
  const next = applyReward(dropped.run, { kind: 'rune', defId: def.id });
  return { run: next, lines: [`You traded ${runeLabel(inst)} for ${def.name} (${def.rarity}).`, ...cutNote(dropped.cut.length)] };
}

/** Pay 25 gold; 50% to win 60. */
export function resolveDice(run: RunState, rng: Rng): EventResult | null {
  if (run.gold < DICE_COST) return null;
  const win = rng.next() < DICE_CHANCE;
  const gold = run.gold - DICE_COST + (win ? DICE_WIN : 0);
  return {
    run: { ...run, gold },
    lines: win ? [`The dice came up right. You won ${DICE_WIN} gold (net +${DICE_WIN - DICE_COST}).`] : [`The dice fell wrong. You lost ${DICE_COST} gold.`],
  };
}

/** +15 max ward HP, or remove a random curse. */
export function resolveFountain(run: RunState, mode: 'hp' | 'curse', rng: Rng): EventResult | null {
  if (mode === 'hp') return { run: { ...run, wardMaxHp: run.wardMaxHp + FOUNTAIN_HP }, lines: [`Your base max ward HP rose by ${FOUNTAIN_HP}.`] };
  const held = heldCurses(run);
  if (!held.length) return null;
  const id = held[rng.int(held.length)];
  return { run: removeBoon(run, id), lines: [`The water washed away the curse ${BOONS[id]?.name ?? id}.`] };
}
