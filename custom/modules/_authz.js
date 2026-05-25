
const PERMISSIONS = {
  super_admin: { superAdminOnly: true },
  manage_announcement: { superAdminOnly: true },
  manage_banner: { superAdminOnly: true },
  manage_user_tag: { superAdminOnly: true },
  recalc_hit_scores: { superAdminOnly: true },

  manage_problemset: { privileges: ['manage_problemset'] },
  manage_solution: { privileges: ['manage_problem'] },
  manage_solution_setting: { privileges: ['manage_problem'] },
  manage_ticket: { privileges: ['manage_problem'] },
  manage_judge_action: { privileges: ['manage_problem'] },
  delete_contest: { privileges: ['manage_problem'] },

  moderate_community: { privileges: ['manage_user'] }
};

function normalizePrivileges(user) {
  if (!user || !user.privileges) return [];
  return Array.isArray(user.privileges) ? user.privileges : [];
}

function isSuperAdmin(user) {
  return !!(user && user.is_admin);
}

function has(user, key) {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;

  let def = PERMISSIONS[key];
  if (!def) return false;
  if (def.superAdminOnly) return false;

  let privileges = normalizePrivileges(user);
  if (def.privileges && def.privileges.some(p => privileges.includes(p))) {
    return true;
  }
  return false;
}

function any(user, keys) {
  if (!Array.isArray(keys)) keys = [keys];
  return keys.some(key => has(user, key));
}

function requirePermission(user, key, message) {
  if (!has(user, key)) {
    throw new ErrorMessage(message || '您没有权限进行此操作。');
  }
  return true;
}

syzoj.authz = {
  permissions: PERMISSIONS,
  isSuperAdmin,
  has,
  any,
  require: requirePermission
};

app.use((req, res, next) => {
  res.locals.isSuperAdmin = isSuperAdmin(res.locals.user);
  res.locals.can = function(key) {
    return has(res.locals.user, key);
  };
  res.locals.canAny = function(keys) {
    return any(res.locals.user, keys);
  };
  next();
});
