import { UserId, GameSessionId } from '@to-our-self/shared';
import { GameSnapshot, GameResult, RoundResult, RewardMap, GameModuleConfig } from './types';

export interface GameModule {
  config: GameModuleConfig;

  /**
   * Initialize a new game session
   */
  createSession(params: {
    sessionId: GameSessionId;
    creatorId: UserId;
    players: Array<{ userId?: UserId; isAi: boolean; aiName?: string }>;
  }): Promise<GameSnapshot>;

  /**
   * Get current game state snapshot
   */
  getSnapshot(sessionId: GameSessionId): Promise<GameSnapshot>;

  /**
   * Player performs an action
   */
  handleAction(sessionId: GameSessionId, action: {
    userId?: UserId;
    actionType: string;
    payload: Record<string, unknown>;
  }): Promise<void>;

  /**
   * Resolve current round and determine outcome
   */
  resolveRound(sessionId: GameSessionId): Promise<RoundResult>;

  /**
   * Finish the game and calculate final rewards
   */
  finish(sessionId: GameSessionId): Promise<GameResult>;

  /**
   * Calculate rewards based on game result
   */
  calculateRewards(result: GameResult): Map<UserId, RewardMap>;
}

export abstract class BaseGameModule implements GameModule {
  abstract config: GameModuleConfig;

  abstract createSession(params: any): Promise<GameSnapshot>;
  abstract getSnapshot(sessionId: GameSessionId): Promise<GameSnapshot>;
  abstract handleAction(sessionId: GameSessionId, action: any): Promise<void>;
  abstract resolveRound(sessionId: GameSessionId): Promise<RoundResult>;
  abstract finish(sessionId: GameSessionId): Promise<GameResult>;
  abstract calculateRewards(result: GameResult): Map<UserId, RewardMap>;
}
