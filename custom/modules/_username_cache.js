let UserPrivilege = syzoj.model('user_privilege');
let User = syzoj.model('user');
const MGMT_PRIVS = ['manage_problem', 'manage_problem_tag', 'manage_problemset', 'manage_user'];
const REFRESH_INTERVAL_MS = 60 * 1000;

syzoj.adminUserIds = new Set();

async function refreshAdminUserIds() {
  try {
    let newSet = new Set();
    let privRecords = await UserPrivilege.createQueryBuilder()
      .where('privilege IN (:...privs)', { privs: MGMT_PRIVS })
      .getMany();
    for (let r of privRecords) newSet.add(r.user_id);
    let conn = require('typeorm').getConnection();
    let superAdmins = await conn.query('SELECT id FROM user WHERE is_admin = 1');
    for (let u of superAdmins) newSet.add(u.id);

    syzoj.adminUserIds = newSet;
    syzoj.log('[admin-cache] Refreshed: ' + newSet.size + ' privileged users');
  } catch (e) {
    syzoj.log('[admin-cache] Refresh failed: ' + e.message);
  }
}

refreshAdminUserIds();
setInterval(refreshAdminUserIds, REFRESH_INTERVAL_MS);
syzoj.refreshAdminUserIds = refreshAdminUserIds;
