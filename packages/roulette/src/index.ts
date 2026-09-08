import { GameSessionId, UserId } from '@to-our-self/shared';
import {
  BaseGameModule,
  GameSnapshot,
  GameResult,
  RoundResult,
  RewardMap,
  PlayerSnapshot,
  GameModuleConfig,
} from '@to-our-self/game-engine';

interface RouletteGameState {
  sessionId: GameSessionId;
  players: Map<string, RoulettePlayer>;
  currentRound: number;
  spinResult?: number; // 0-36 for roulette wheel
  status: 'waiting' | 'active' | 'spinning' | 'result' | 'finished';
  createdAt: number;
}

interface RoulettePlayer {
  userId?: UserId;
  isAi: boolean;
  aiName?: string;
  status: 'waiting' | 'betting' | 'eliminated' | 'won';
  bets: Map<number, number>; // number -> amount
  totalBet: number;
  balance: number;
  finalWinnings: number;
  joinedAt: number;
}

const gameStates = new Map<GameSessionId, RouletteGameState>();

export class RouletteModule extends BaseGameModule {
  config: GameModuleConfig = {
    gameType: 'roulette',
    minPlayers: 2,
    maxPlayers: 8,
    aiEnabled: true,
  };

  async createSession(params: {
    sessionId: GameSessionId;
    creatorId: UserId;
    players: Array<{ userId?: UserId; isAi: boolean; aiName?: string }>;
  }): Promise<GameSnapshot> {
    const state: RouletteGameState = {
      sessionId: params.sessionId,
      players: new Map(),
      currentRound: 1,
      status: 'waiting',
      createdAt: Date.now(),
    };

    params.players.forEach((p, index) => {
      const playerId = p.userId ? `user_${p.userId}` : `ai_${p.aiName || index}`;
      state.players.set(playerId, {
        userId: p.userId,
        isAi: p.isAi,
        aiName: p.aiName,
        status: 'waiting',
        bets: new Map(),
        totalBet: 0,
        balance: 1000, // Starting chips
        finalWinnings: 0,
        joinedAt: Date.now(),
      });
    });

    gameStates.set(params.sessionId, state);
    return this.getSnapshot(params.sessionId);
  }

  async getSnapshot(sessionId: GameSessionId): Promise<GameSnapshot> {
    const state = gameStates.get(sessionId);
    if (!state) throw new Error('Game session not found');

    const players: PlayerSnapshot[] = Array.from(state.players.values()).map((p) => ({
      userId: p.userId,
      isAi: p.isAi,
      aiName: p.aiName,
      status: p.status as any,
      score: p.balance,
      eliminated: p.status === 'eliminated',
    }));

    return {
      sessionId,
      status: state.status as any,
      roundNumber: state.currentRound,
      players,
      gameState: {
        spinResult: state.spinResult,
        totalBets: Array.from(state.players.values()).reduce((sum, p) => sum + p.totalBet, 0),
      },
    };
  }

  async handleAction(
    sessionId: GameSessionId,
    action: {
      userId?: UserId;
      actionType: string;
      payload: Record<string, unknown>;
    }
  ): Promise<void> {
    const state = gameStates.get(sessionId);
    if (!state) throw new Error('Game session not found');

    const playerId = action.userId ? `user_${action.userId}` : `ai_${action.userId}`;
    const player = state.players.get(playerId);
    if (!player) throw new Error('Player not in session');

    if (action.actionType === 'place_bet') {
      const { number, amount } = action.payload as { number: number; amount: number };
      if (amount > player.balance) throw new Error('Insufficient balance');

      player.bets.set(number, (player.bets.get(number) || 0) + amount);
      player.balance -= amount;
      player.totalBet += amount;
    }

    if (action.actionType === 'start_round') {
      state.status = 'spinning';
    }
  }

  async resolveRound(sessionId: GameSessionId): Promise<RoundResult> {
    const state = gameStates.get(sessionId);
    if (!state) throw new Error('Game session not found');

    // Spin the wheel
    const spinResult = Math.floor(Math.random() * 37); // 0-36
    state.spinResult = spinResult;
    state.status = 'result';

    // Calculate winnings
    const playerStates = new Map<string, Record<string, unknown>>();
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];

    state.players.forEach((player, playerId) => {
      const bet = player.bets.get(spinResult) || 0;
      if (bet > 0) {
        player.finalWinnings = bet * 36; // Standard roulette payout
        player.balance += player.finalWinnings;
        events.push({
          type: 'PLAYER_WON',
          data: { playerId, amount: player.finalWinnings, number: spinResult },
        });
      }
      playerStates.set(playerId, { balance: player.balance, winnings: player.finalWinnings });
    });

    events.push({
      type: 'SPIN_RESULT',
      data: { number: spinResult },
    });

    return {
      roundNumber: state.currentRound,
      events,
      playerStates,
    };
  }

  async finish(sessionId: GameSessionId): Promise<GameResult> {
    const state = gameStates.get(sessionId);
    if (!state) throw new Error('Game session not found');

    const rankings = Array.from(state.players.entries())
      .map(([_, player], index) => ({
        userId: player.userId,
        position: index + 1,
        score: player.finalWinnings,
        rewards: {
          xp: player.finalWinnings > 0 ? 50 : 10,
          coins: Math.floor(player.finalWinnings / 10),
        },
      }))
      .sort((a, b) => b.score - a.score);

    const winnerIds = rankings
      .filter((r) => r.score > 0 && r.userId)
      .slice(0, 3)
      .map((r) => r.userId as UserId);

    state.status = 'finished';
    gameStates.delete(sessionId);

    return {
      sessionId,
      winnerIds,
      rankings,
    };
  }

  calculateRewards(result: GameResult): Map<UserId, RewardMap> {
    const rewards = new Map<UserId, RewardMap>();

    result.rankings.forEach((ranking) => {
      if (!ranking.userId) return;
      rewards.set(ranking.userId, ranking.rewards);
    });

    return rewards;
  }
}
