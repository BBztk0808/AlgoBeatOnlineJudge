syzoj.contestCheaterMap = new Map();

async function refreshContestCheaterCache() {
  try {
    let conn = require('typeorm').getConnection();
    let rows = await conn.query(`
      SELECT DISTINCT js.user_id, js.type_info AS contest_id
      FROM judge_state js
      JOIN judge_state_admin_action a ON a.judge_id = js.id
      WHERE a.action_type = 'cheated' AND js.type = 1
    `);
    let map = new Map();
    for (let r of rows) {
      let cid = parseInt(r.contest_id);
      let uid = parseInt(r.user_id);
      if (!map.has(cid)) map.set(cid, new Set());
      map.get(cid).add(uid);
    }
    syzoj.contestCheaterMap = map;
    syzoj.log('[contest-cheater-cache] Refreshed: ' + map.size + ' contests with cheaters');
  } catch (e) {
    syzoj.log('[contest-cheater-cache] refresh failed: ' + e.message);
  }
}
setTimeout(refreshContestCheaterCache, 8 * 1000);
setInterval(refreshContestCheaterCache, 60 * 1000);
syzoj.utils.refreshContestCheaterCache = refreshContestCheaterCache;
