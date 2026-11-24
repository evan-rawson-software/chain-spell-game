import './battle.css';
import type { MountBattle } from '../contracts';
import { createGame } from './game';

export const mountBattle: MountBattle = (container, opts) => createGame(container, opts);
