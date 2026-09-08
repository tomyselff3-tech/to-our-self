// Domain types
export type UserId = number & { readonly __brand: 'UserId' };
export type GroupId = number & { readonly __brand: 'GroupId' };
export type GameSessionId = string & { readonly __brand: 'GameSessionId' };
export type TransactionId = number & { readonly __brand: 'TransactionId' };

// User & Auth
export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  added_to_attachment_menu?: boolean;
}

export interface AuthContext {
  userId: UserId;
  telegramUsername?: string;
  roles: string[];
  permissions: string[];
  iat: number;
  exp: number;
}

export interface User {
  id: UserId;
  telegramId: number;
  telegramUsername?: string;
  firstName: string;
  lastName?: string;
  isBot: boolean;
  isPremium: boolean;
  avatarUrl?: string;
  bannedAt?: Date;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Profile {
  userId: UserId;
  displayName: string;
  bio?: string;
  avatarUrl?: string;
  level: number;
  xp: number;
  reputation: number;
  totalWins: number;
  totalLosses: number;
  favoriteGames: string[];
  frameId?: string;
  bannerId?: string;
  clanId?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Games
export type GameType = 'roulette' | 'mafia' | 'dice' | 'chairs' | 'hide_and_seek';

export interface Game {
  id: string;
  name: GameType;
  displayName: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  aiEnabled: boolean;
  iconUrl?: string;
  createdAt: Date;
}

export type GameStatus = 'waiting' | 'starting' | 'active' | 'resolving' | 'result' | 'finished';

export interface GameSession {
  id: GameSessionId;
  gameId: string;
  groupId?: GroupId;
  creatorId: UserId;
  status: GameStatus;
  gameVersion: string;
  roundSeed?: number;
  roundNumber: number;
  startedAt?: Date;
  finishedAt?: Date;
  winnerIds: UserId[];
  createdAt: Date;
  updatedAt: Date;
}

export interface GamePlayer {
  id: number;
  gameSessionId: GameSessionId;
  userId?: UserId;
  isAi: boolean;
  aiName?: string;
  status: 'waiting' | 'active' | 'eliminated' | 'finished';
  position?: number;
  score: number;
  eliminatedAt?: Date;
  joinedAt: Date;
}

export interface PlayerAction {
  id: number;
  gameSessionId: GameSessionId;
  userId?: UserId;
  roundNumber: number;
  actionType: string;
  payload: Record<string, unknown>;
  processed: boolean;
  result?: Record<string, unknown>;
  createdAt: Date;
}

// Economy
export interface Wallet {
  userId: UserId;
  coins: number;
  gems: number;
  rating: number;
  updatedAt: Date;
}

export type TransactionType =
  | 'GAME_ENTRY'
  | 'GAME_REWARD'
  | 'PURCHASE'
  | 'REFUND'
  | 'MISSION_REWARD'
  | 'TRANSFER'
  | 'ADMIN_ADJUSTMENT';

export interface WalletTransaction {
  id: TransactionId;
  userId: UserId;
  amount: number;
  currency: 'coins' | 'gems';
  type: TransactionType;
  referenceType?: string;
  referenceId?: string;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
  createdAt: Date;
}

// Progression
export interface Mission {
  id: string;
  title: string;
  description?: string;
  missionType: 'daily' | 'weekly' | 'season';
  period: string;
  conditionType: string;
  conditionTarget: number;
  rewardXp: number;
  rewardCoins: number;
  createdAt: Date;
}

export interface PlayerMission {
  userId: UserId;
  missionId: string;
  progress: number;
  completedAt?: Date;
  rewardClaimedAt?: Date;
  createdAt: Date;
}

export interface Achievement {
  id: string;
  key: string;
  name: string;
  description?: string;
  iconUrl?: string;
  isHidden: boolean;
  rarity?: 'common' | 'rare' | 'epic' | 'legendary';
  createdAt: Date;
}

export interface PlayerAchievement {
  userId: UserId;
  achievementId: string;
  unlockedAt?: Date;
  progress?: Record<string, unknown>;
  createdAt: Date;
}

// Realtime
export type GameEventType =
  | 'GAME_STARTED'
  | 'PLAYER_JOINED'
  | 'ROUND_STARTED'
  | 'PLAYER_ACTION'
  | 'PLAYER_ELIMINATED'
  | 'ROUND_RESOLVED'
  | 'GAME_FINISHED'
  | 'ERROR'
  | 'RECONNECT_OK';

export interface GameEvent {
  id: string;
  sessionId: GameSessionId;
  type: GameEventType;
  data: Record<string, unknown>;
  timestamp: number;
}
