import { PERMISSIONS, ROLES } from '@to-our-self/shared';

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  [ROLES.ADMIN]: Object.values(PERMISSIONS),
  [ROLES.MODERATOR]: [
    PERMISSIONS.ADMIN_MODERATE,
    PERMISSIONS.GAME_CREATE,
    PERMISSIONS.GAME_JOIN,
  ],
  [ROLES.USER]: [
    PERMISSIONS.GAME_CREATE,
    PERMISSIONS.GAME_JOIN,
    PERMISSIONS.GAME_SPECTATE,
    PERMISSIONS.USER_VIEW_PROFILE,
    PERMISSIONS.USER_EDIT_PROFILE,
  ],
  [ROLES.GUEST]: [
    PERMISSIONS.USER_VIEW_PROFILE,
  ],
};

export function getPermissionsForRoles(roles: string[]): string[] {
  const permissions = new Set<string>();
  for (const role of roles) {
    const rolePerms = ROLE_PERMISSIONS[role] || [];
    rolePerms.forEach((perm) => permissions.add(perm));
  }
  return Array.from(permissions);
}

export function hasPermission(
  permissions: string[],
  requiredPermission: string
): boolean {
  return permissions.includes(requiredPermission);
}
