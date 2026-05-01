export type AuthUserPermissions = {
  adminPanel?: boolean;
  moderateGuestbook?: boolean;
  moderateQuestionOfTheDay?: boolean;
  manageShrines?: boolean;
};

export type AuthUserRole = "user" | "admin" | "owner";

export type AuthUserAccess = {
  roles?: string[] | null;
  permissions?: AuthUserPermissions | null;
} | null | undefined;

function hasRole(user: AuthUserAccess, role: AuthUserRole) {
  return Array.isArray(user?.roles) && user.roles.includes(role);
}

export function canAccessAdminPanel(user: AuthUserAccess) {
  return Boolean(
    user?.permissions?.adminPanel || hasRole(user, "admin") || hasRole(user, "owner"),
  );
}

export function canModerateGuestbook(user: AuthUserAccess) {
  return Boolean(
    user?.permissions?.moderateGuestbook ||
      hasRole(user, "admin") ||
      hasRole(user, "owner"),
  );
}

export function canModerateQuestionOfTheDay(user: AuthUserAccess) {
  return Boolean(
    user?.permissions?.moderateQuestionOfTheDay ||
      hasRole(user, "admin") ||
      hasRole(user, "owner"),
  );
}

export function canManageShrines(user: AuthUserAccess) {
  return Boolean(
    user?.permissions?.manageShrines ||
      hasRole(user, "admin") ||
      hasRole(user, "owner"),
  );
}
