
let AdminAuditLog = syzoj.model('admin-audit-log');

function truncate(s, max) {
  if (s === null || s === undefined) return null;
  s = String(s);
  return s.length > max ? s.substring(0, max) : s;
}

function getRequestIp(req) {
  let forwarded = req.headers['x-forwarded-for'];
  if (Array.isArray(forwarded)) forwarded = forwarded[0];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.ip || (req.connection && req.connection.remoteAddress) || null;
}

async function log(req, action, targetType, targetId, details) {
  try {
    if (!action) return null;

    let user = req && req.res && req.res.locals ? req.res.locals.user : null;
    if (!user && req && req.user) user = req.user;

    let row = await AdminAuditLog.create();
    row.actor_id = user && user.id ? user.id : null;
    row.action = truncate(action, 80);
    row.target_type = truncate(targetType || null, 80);
    row.target_id = targetId === undefined || targetId === null ? null : parseInt(targetId);
    row.detail_json = details === undefined || details === null ? null : JSON.stringify(details).substring(0, 5000);
    row.ip = req ? truncate(getRequestIp(req), 64) : null;
    row.user_agent = req && req.headers ? truncate(req.headers['user-agent'], 255) : null;
    row.created_at = parseInt(Date.now() / 1000);
    await row.save();
    return row;
  } catch (e) {
    syzoj.log('[audit] write failed: ' + (e && e.message ? e.message : e));
    return null;
  }
}

syzoj.audit = { log };
