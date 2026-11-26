import type { SchoolDef } from '../types';

export const DEFAULT_SCHOOL = 'elementalist';

export const SCHOOLS: SchoolDef[] = [
  {
    id: 'elementalist', name: 'Elementalist', color: 'P', boon: 'catalysis',
    description: 'Fire and frost in balance. Reactions hit 50% harder.',
    kit: ['amplify', 'fireball', 'frost_bolt'],
  },
  {
    id: 'pyromancer', name: 'Pyromancer', color: 'R', boon: 'ember_heart',
    description: 'Pure flame. Fire shots deal 20% more damage.',
    kit: ['amplify', 'fireball', 'ember_dart'],
  },
  {
    id: 'cryomancer', name: 'Cryomancer', color: 'B', boon: 'frost_heart',
    description: 'Cold control. Frost shots deal 20% more damage.',
    kit: ['frost_focus', 'frost_bolt', 'ice_shard', 'ember_dart'],
  },
  {
    id: 'druid', name: 'Druid', color: 'G', boon: 'verdant_heart',
    description: 'Poison and rot. Nature statuses are 25% more potent.',
    kit: ['bloom', 'thorn_shot', 'poison_cloud', 'ember_dart'],
  },
];
