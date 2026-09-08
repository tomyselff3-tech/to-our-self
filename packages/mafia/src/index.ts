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

type MafiaRole = 'mafia' | 'doctor' | 'detective' | 'villager';
type MafiaPhase = 'day' | 'night' | 'voting' | 'result';

interface MafiaPlayer {
  userId?: UserId;
  isAi: boolean;
  aiName?: string;
  role: MafiaRole;
  isAlive: boolean;
  votes: Set<string>; // player IDs they voted for
  joinedAt: number;
}

interface MafiaGameState {
  sessionId: GameSessionId;
  players: Map<string, MafiaPlayer>;
  phase: MafiaPhase;
  day: number;
  alivePlayers: string[];
  deadPlayers: string[];
  mafiaCount: number;
  createdAt: number;
}

const gameStates = new Map<GameSessionId, MafiaGameState>();

export class MafiaModule extends BaseGameModule {
  config: GameModuleConfig = {
    gameType: 'mafia',
    minPlayers: 4,
    maxPlayers: 10,
    aiEnabled: true,
  };

  async createSession(params: {
    sessionId: GameSessionId;
    creatorId: UserId;
    players: Array<{ userId?: UserId; isAi: boolean; aiName?: string }>;
  }): Promise<GameSnapshot> {
    const state: MafiaGameState = {
      sessionId: params.sessionId,
      players: new Map(),
      phase: 'day',
      day: 1,
      alivePlayers: [],
      deadPlayers: [],
      mafiaCount: 0,
      createdAt: Date.now(),
    };

    // Assign roles
    const playerIds = params.players.map((p, i) => (p.userId ? `user_${p.userId}` : `ai_${p.aiName || i}`));
    const mafiaCount = Math.max(1, Math.floor(playerIds.length / 3));
    const shuffled = playerIds.sort(() => Math.random() - 0.5);
    const roles: MafiaRole[] = [
      ...Array(mafiaCount).fill('mafia'),
      'doctor',
      'detective',
      ...Array(playerIds.length - mafiaCount - 2).fill('villager'),
    ];

    params.players.forEach((p, index) => {
      const playerId = playerIds[index];
      state.players.set(playerId, {
        userId: p.userId,
        isAi: p.isAi,
        aiName: p.aiName,
        role: roles[index],
        isAlive: true,
        votes: new Set(),
        joinedAt: Date.now(),
      });
      state.alivePlayers.push(playerId);
    });

    state.mafiaCount = mafiaCount;
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
      status: p.isAlive ? 'active' : 'eliminated',
      score: state.alivePlayers.includes(`${p.userId || p.aiName}`) ? 1 : 0,
      eliminated: !p.isAlive,
    }));

    return {
      sessionId,
      status: 'active',
      roundNumber: state.day,
      players,
      gameState: {
        phase: state.phase,
        day: state.day,
        alivePlayers: state.alivePlayers.length,
        mafiaAlive: state.alivePlayers.filter(
          (id) => state.players.get(id)?.role === 'mafia'
        ).length,
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
    if (!player || !player.isAlive) throw new Error('Player not active');

    if (action.actionType === 'vote') {
      const { targetId } = action.payload as { targetId: string };
      player.votes.add(targetId);
    }
  }

  async resolveRound(sessionId: GameSessionId): Promise<RoundResult> {
    const state = gameStates.get(sessionId);
    if (!state) throw new Error('Game session not found');

    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    const playerStates = new Map<string, Record<string, unknown>>();

    // Count votes and eliminate
    const voteCounts = new Map<string, number>();
    state.players.forEach((player) => {
      player.votes.forEach((vote) => {
        voteCounts.set(vote, (voteCounts.get(vote) || 0) + 1);
      });
    });

    if (voteCounts.size > 0) {
      const mostVoted = Array.from(voteCounts.entries()).sort((a, b) => b[1] - a[1])[0];
      const eliminated = state.players.get(mostVoted[0]);
      if (eliminated) {
        eliminated.isAlive = false;
        state.deadPlayers.push(mostVoted[0]);
        state.alivePlayers = state.alivePlayers.filter((id) => id !== mostVoted[0]);
        events.push({
          type: 'PLAYER_ELIMINATED',
          data: { playerId: mostVoted[0], role: eliminated.role, votes: mostVoted[1] },
        });
      }
    }

    state.players.forEach((player, id) => {
      playerStates.set(id, { isAlive: player.isAlive, role: player.role });
    });

    state.day++;
    return {
      roundNumber: state.day,
      events,
      playerStates,
    };
  }

  async finish(sessionId: GameSessionId): Promise<GameResult> {
    const state = gameStates.get(sessionId);
    if (!state) throw new Error('Game session not found');

    // Determine winner (mafia or villagers)
    const mafiasAlive = state.alivePlayers.filter((id) => state.players.get(id)?.role === 'mafia').length;
    const villagersAlive = state.alivePlayers.filter((id) => state.players.get(id)?.role !== 'mafia').length;

    let winners: string[] = [];
    if (mafiasAlive === 0) {
      winners = state.alivePlayers;
    } else if (villagersAlive === 0) {
      winners = state.alivePlayers;
    }

    const rankings = Array.from(state.players.entries())
      .map(([id, player]) => ({
        userId: player.userId,
        position: winners.includes(id) ? 1 : 2,
        score: winners.includes(id) ? 100 : 10,
        rewards: {
          xp: winners.includes(id) ? 100 : 25,
          coins: winners.includes(id) ? 50 : 10,
        },
      }));

    const winnerIds = winners
      .map((id) => state.players.get(id)?.userId)
      .filter((id) => id !== undefined) as UserId[];

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
