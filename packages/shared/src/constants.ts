export const GAME_TYPES = ['roulette', 'mafia', 'dice', 'chairs', 'hide_and_seek'] as const;

export const GAME_CONSTRAINTS = {
  roulette: { minPlayers: 2, maxPlayers: 8 },
  mafia: { minPlayers: 4, maxPlayers: 10 },
  dice: { minPlayers: 2, maxPlayers: 4 },
  chairs: { minPlayers: 3, maxPlayers: 10 },
  hide_and_seek: { minPlayers: 3, maxPlayers: 8 },
} as const;

export const GAME_STATUS = {
  WAITING: 'waiting',
  STARTING: 'starting',
  ACTIVE: 'active',
  RESOLVING: 'resolving',
  RESULT: 'result',
  FINISHED: 'finished',
} as const;

export const TRANSACTION_TYPES = {
  GAME_ENTRY: 'GAME_ENTRY',
  GAME_REWARD: 'GAME_REWARD',
  PURCHASE: 'PURCHASE',
  REFUND: 'REFUND',
  MISSION_REWARD: 'MISSION_REWARD',
  TRANSFER: 'TRANSFER',
  ADMIN_ADJUSTMENT: 'ADMIN_ADJUSTMENT',
} as const;

export const PERMISSIONS = {
  GAME_CREATE: 'game:create',
  GAME_JOIN: 'game:join',
  GAME_SPECTATE: 'game:spectate',
  USER_VIEW_PROFILE: 'user:view_profile',
  USER_EDIT_PROFILE: 'user:edit_profile',
  ADMIN_MODERATE: 'admin:moderate',
  ADMIN_MANAGE_USERS: 'admin:manage_users',
} as const;

export const ROLES = {
  ADMIN: 'admin',
  MODERATOR: 'moderator',
  USER: 'user',
  GUEST: 'guest',
} as const;
