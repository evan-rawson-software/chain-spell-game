import './battle.css';
import type { MountBattle, MountPractice } from '../contracts';
import { createGame } from './game';
import { createPractice } from './practice';

export const mountBattle: MountBattle = (container, opts) => createGame(container, opts);

export const mountPractice: MountPractice = (container, opts) => createPractice(container, opts);
