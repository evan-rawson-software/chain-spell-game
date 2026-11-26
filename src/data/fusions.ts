import type { FusionRecipe } from '../contracts';

/** Forge fusion recipes (DESIGN.md, Fusion). Results are 'fused' runes in the catalog, never in reward pools. */
export const FUSIONS: FusionRecipe[] = [
  { a: 'fireball', b: 'frost_bolt', result: 'steam_burst' },
  { a: 'ember_dart', b: 'ice_shard', result: 'frostflare_barrage' },
  { a: 'thorn_shot', b: 'fireball', result: 'briar_inferno' },
  { a: 'lightning_bolt', b: 'frost_bolt', result: 'stormfrost_spear' },
  { a: 'arcane_missile', b: 'seeker', result: 'astral_swarm' },
  { a: 'amplify', b: 'empower', result: 'apex_conduit' },
];
