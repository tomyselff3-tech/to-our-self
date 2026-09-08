import { UserId, GameSessionId, GameStatus } from '@to-our-self/shared';

export interface GameSnapshot {
  sessionId: GameSessionId;
  status: GameStatus;
  roundNumber: number;
  players: PlayerSnapshot[];
  gameState: Record<string, unknown>;
  currentRoundData?: Record<string, unknown>;
}

export interface PlayerSnapshot {
  userId?: UserId;
  isAi: boolean;
  aiName?: string;
  status: 'waiting' | 'active' | 'eliminated' | 'finished';
  position?: number;
  score: number;
  eliminated: boolean;
}

export interface GameResult {
  sessionId: GameSessionId;
  winnerIds: UserId[];
  rankings: Array<{
    userId?: UserId;
    position: number;
    score: number;
    rewards: RewardMap;
  }>;
}

export interface RewardMap {
  xp: number;
  coins: number;
  rating?: number;
}

export interface RoundResult {
  roundNumber: number;
  events: Array<{
    type: string;
    data: Record<string, unknown>;
  }>;
  playerStates: Map<string, Record<string, unknown>>;
}

export interface GameModuleConfig {
  gameType: string;
  minPlayers: number;
  maxPlayers: number;
  aiEnabled: boolean;
}
