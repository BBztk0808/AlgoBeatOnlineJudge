let UserHitScore = syzoj.model('user-hit-score');
let UserHitScoreHistory = syzoj.model('user-hit-score-history');
let User = syzoj.model('user');
let JudgeState = syzoj.model('judge_state');
let Problem = syzoj.model('problem');
let ProblemSolution = syzoj.model('problem-solution');
let ContestPlayer = syzoj.model('contest_player');
let ProblemTagMap = syzoj.model('problem_tag_map');
let UserEmailStatus = syzoj.model('user-email-status');
let UserHitSetting = syzoj.model('user-hit-setting');
let Contest = syzoj.model('contest');

const CACHE_REFRESH_INTERVAL_MS = 60 * 1000;
const FULL_RECALC_INTERVAL_MS = 24 * 3600 * 1000;
const INITIAL_DELAY_MS = 30 * 1000;
const HISTORY_RETENTION_DAYS = 90;
syzoj.userHitScores = new Map();
function halfLifeDecay(value, daysSinceActive, halfLifeDays) {
  if (daysSinceActive <= 0) return value;
  let factor = Math.pow(0.5, daysSinceActive / halfLifeDays);
  return value * factor;
}
async function calcOneUser(user) {
  let now = parseInt((new Date()).getTime() / 1000);
  let basic = 0;
  try {
    let emailStatus = await UserEmailStatus.findOne({ where: { user_id: user.id } });
    if (emailStatus && emailStatus.is_email_verified) basic += 60;
  } catch (e) {}

  if (user.information && String(user.information).trim().length > 0) basic += 10;
  if (user.register_time && now - user.register_time >= 7 * 86400) basic += 15;

  let cpAnyCount = await ContestPlayer.count({ user_id: user.id });
  if (cpAnyCount >= 1) basic += 15;

  if (basic > 100) basic = 100;
  let contribution = 0;
  let acceptedSolutions = await ProblemSolution.count({
    user_id: user.id,
    status: 'accepted'
  });
  contribution += Math.min(acceptedSolutions * 2, 60);

  let problemsCreated = await Problem.count({ user_id: user.id });
  contribution += Math.min(problemsCreated * 4, 40);

  if (contribution > 100) contribution = 100;
  let contestRaw = 0;
  let lastContestEnd = 0; // 最后一次有效参赛的比赛 end_time
  let activeCps = await ContestPlayer.createQueryBuilder('cp')
    .where('cp.user_id = :uid', { uid: user.id })
    .andWhere('cp.score > 0')
    .getMany();
  const _cheaterMap = syzoj.contestCheaterMap || new Map();
  activeCps = activeCps.filter(cp => {
    const cset = _cheaterMap.get(cp.contest_id);
    return !cset || !cset.has(user.id);
  });

  contestRaw += Math.min(activeCps.length * 2.5, 60);
  let hasGoodScore = false;
  let hasAK = false;
  for (let cp of activeCps) {
    let maxRow = await ContestPlayer.createQueryBuilder()
      .select('MAX(score)', 'max_score')
      .where('contest_id = :cid', { cid: cp.contest_id })
      .getRawOne();
    let maxScore = maxRow ? parseInt(maxRow.max_score) || 0 : 0;
    if (maxScore <= 0) continue;
    let rate = cp.score / maxScore;
    if (rate >= 0.6) hasGoodScore = true;
    if (rate >= 0.9) hasAK = true;
    let contest = await Contest.findById(cp.contest_id);
    if (contest && contest.end_time && contest.end_time > lastContestEnd) {
      lastContestEnd = contest.end_time;
    }
  }
  if (hasGoodScore) contestRaw += 5;
  if (hasAK) contestRaw += 15;

  if (contestRaw > 100) contestRaw = 100;
  let contestFinal = 0;
  if (lastContestEnd > 0) {
    let daysSince = (now - lastContestEnd) / 86400;
    contestFinal = Math.floor(halfLifeDecay(contestRaw, daysSince, 30));
  }
  if (contestFinal < 0) contestFinal = 0;
  let acNum = user.ac_num || 0;
  let acPart = 0;
  if (acNum > 0) {
    acPart = Math.min(Math.floor(Math.log2(acNum + 1) * 2.5), 75);
  }
  let tagCount = 0;
  try {
    let tagRow = await ProblemTagMap.createQueryBuilder('m')
      .innerJoin('judge_state', 'js', 'js.problem_id = m.problem_id')
      .leftJoin('judge_state_admin_action', 'a', 'a.judge_id = js.id')
      .where('js.user_id = :uid', { uid: user.id })
      .andWhere('js.status = :st', { st: 'Accepted' })
      .andWhere('a.judge_id IS NULL')
      .select('COUNT(DISTINCT m.tag_id)', 'cnt')
      .getRawOne();
    tagCount = tagRow ? parseInt(tagRow.cnt) || 0 : 0;
  } catch (e) {}
  let tagPart = Math.min(Math.floor(tagCount * 0.2), 25);
  let lastAcRow = null;
  try {
    lastAcRow = await JudgeState.createQueryBuilder('js')
      .leftJoin('judge_state_admin_action', 'a', 'a.judge_id = js.id')
      .select('MAX(js.submit_time)', 'last_ac')
      .where('js.user_id = :uid', { uid: user.id })
      .andWhere('js.status = :st', { st: 'Accepted' })
      .andWhere('a.judge_id IS NULL')
      .getRawOne();
  } catch (e) {}
  let lastAcTime = lastAcRow ? parseInt(lastAcRow.last_ac) || 0 : 0;

  let acFinal = 0;
  if (acPart > 0 && lastAcTime > 0) {
    let daysSince = (now - lastAcTime) / 86400;
    acFinal = Math.floor(halfLifeDecay(acPart, daysSince, 14));
  }

  let practice = acFinal + tagPart;
  if (practice > 100) practice = 100;
  if (practice < 0) practice = 0;

  let total = basic + contribution + contestFinal + practice;
  if (total > 400) total = 400;
  if (total < 0) total = 0;

  return {
    user_id: user.id,
    total: total,
    basic_score: basic,
    contribution_score: contribution,
    contest_score: contestFinal,
    practice_score: practice
  };
}
async function fullRecalc() {
  let started = Date.now();
  syzoj.log('[hit-engine] Full recalc started');

  let users;
  try {
    users = await User.find({});
  } catch (e) {
    syzoj.log('[hit-engine] Failed to load users: ' + e.message);
    return;
  }

  let now = parseInt((new Date()).getTime() / 1000);
  let updated = 0;
  let failed = 0;

  for (let u of users) {
    try {
      let scores = await calcOneUser(u);
      let row = await UserHitScore.findOne({ where: { user_id: u.id } });
      if (!row) {
        row = await UserHitScore.create();
        row.user_id = u.id;
      }
      row.total = scores.total;
      row.basic_score = scores.basic_score;
      row.contribution_score = scores.contribution_score;
      row.contest_score = scores.contest_score;
      row.practice_score = scores.practice_score;
      row.last_calc_at = now;
      await row.save();
      let hist = await UserHitScoreHistory.create();
      hist.user_id = u.id;
      hist.total = scores.total;
      hist.basic_score = scores.basic_score;
      hist.contribution_score = scores.contribution_score;
      hist.contest_score = scores.contest_score;
      hist.practice_score = scores.practice_score;
      hist.recorded_at = now;
      await hist.save();

      updated++;
    } catch (e) {
      failed++;
      syzoj.log('[hit-engine] Failed for user ' + u.id + ': ' + e.message);
    }
  }
  try {
    let cutoff = now - HISTORY_RETENTION_DAYS * 86400;
    await UserHitScoreHistory.createQueryBuilder()
      .delete()
      .where('recorded_at < :cutoff', { cutoff: cutoff })
      .execute();
  } catch (e) {
    syzoj.log('[hit-engine] Failed to clean old history: ' + e.message);
  }

  let elapsed = ((Date.now() - started) / 1000).toFixed(1);
  syzoj.log('[hit-engine] Full recalc done: ' + updated + ' ok, ' + failed + ' failed, ' + elapsed + 's');
  await refreshMemoryCache();
}
async function refreshMemoryCache() {
  try {
    let rows = await UserHitScore.find({});
    let m = new Map();
    for (let r of rows) {
      m.set(r.user_id, {
        total: r.total,
        basic_score: r.basic_score,
        contribution_score: r.contribution_score,
        contest_score: r.contest_score,
        practice_score: r.practice_score
      });
    }
    syzoj.userHitScores = m;
  } catch (e) {
    syzoj.log('[hit-engine] Refresh memory cache failed: ' + e.message);
  }
}
syzoj.recalcHitScores = fullRecalc;
setTimeout(async () => {
  try {
    await refreshMemoryCache();
    syzoj.log('[hit-engine] Memory cache loaded: ' + syzoj.userHitScores.size + ' users');
    if (syzoj.userHitScores.size === 0) {
      syzoj.log('[hit-engine] Cache table empty, doing initial calculation...');
      await fullRecalc();
    }
    setInterval(refreshMemoryCache, CACHE_REFRESH_INTERVAL_MS);
    setInterval(fullRecalc, FULL_RECALC_INTERVAL_MS);
  } catch (e) {
    syzoj.log('[hit-engine] Init failed: ' + e.message);
  }
}, INITIAL_DELAY_MS);
app.post('/admin/recalc-hit-scores', async (req, res) => {
  try {
    syzoj.authz.require(res.locals.user, 'recalc_hit_scores');
    fullRecalc().catch(function(e) {
      syzoj.log('[hit-engine] Manual recalc failed: ' + e.message);
    });
    await syzoj.audit.log(req, 'hit_score.recalc', 'hit_score', null, {});

    res.render('success', {
      title: 'Hit 值重算',
      message: 'Hit 值重算已开始',
      details: '这是后台异步任务，大约需要 10-30 秒完成。完成后内存缓存将自动刷新，可在用户主页查看新分数。',
      nextUrls: {
        '返回首页': '/',
        '返回后台': '/admin/info'
      }
    });
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});
async function getOrCreateHitSetting(userId) {
  let s = await UserHitSetting.findOne({ where: { user_id: userId } });
  if (!s) {
    s = await UserHitSetting.create();
    s.user_id = userId;
    s.hide_hit = false;
  }
  return s;
}
syzoj.userHitHidden = new Set();

async function refreshHitHiddenSet() {
  try {
    let rows = await UserHitSetting.createQueryBuilder()
      .where('hide_hit = TRUE')
      .getMany();
    let s = new Set();
    for (let r of rows) s.add(r.user_id);
    syzoj.userHitHidden = s;
  } catch (e) {
    syzoj.log('[hit-engine] Refresh hidden set failed: ' + e.message);
  }
}
setTimeout(refreshHitHiddenSet, 30 * 1000);
setInterval(refreshHitHiddenSet, 60 * 1000);
app.post('/user/:id/hit-setting', async (req, res) => {
  try {
    if (!res.locals.user) throw new ErrorMessage('请登录后继续。');
    let uid = parseInt(req.params.id);
    if (uid !== res.locals.user.id && !res.locals.user.is_admin) {
      throw new ErrorMessage('您没有权限修改他人的设置。');
    }

    let s = await getOrCreateHitSetting(uid);
    s.hide_hit = (req.body.hide_hit === 'on' || req.body.hide_hit === 'true' || req.body.hide_hit === '1');
    s.update_time = parseInt((new Date()).getTime() / 1000);
    await s.save();
    if (s.hide_hit) syzoj.userHitHidden.add(uid);
    else syzoj.userHitHidden.delete(uid);

    res.redirect(syzoj.utils.makeUrl(['user', uid, 'edit']));
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});
app.get('/help/hit-value', async (req, res) => {
  try {
    res.render('help_hit_value');
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});
app.get('/api/hit-history/:uid', async (req, res) => {
  try {
    let uid = parseInt(req.params.uid);
    if (!uid) {
      return res.json({ ok: false, message: 'invalid uid' });
    }
    if (syzoj.userHitHidden && syzoj.userHitHidden.has(uid)) {
      if (!res.locals.user || res.locals.user.id !== uid) {
        return res.json({ ok: false, message: 'hidden by user' });
      }
    }

    let days = parseInt(req.query.days) || 30;
    if (days < 1 || days > 90) days = 30;

    let now = parseInt((new Date()).getTime() / 1000);
    let cutoff = now - days * 86400;

    let rows = await UserHitScoreHistory.createQueryBuilder()
      .where('user_id = :uid', { uid: uid })
      .andWhere('recorded_at >= :cutoff', { cutoff: cutoff })
      .orderBy('recorded_at', 'ASC')
      .getMany();
    let points = rows.map(function(r) {
      return {
        t: r.recorded_at,
        basic: r.basic_score,
        contribution: r.contribution_score,
        contest: r.contest_score,
        practice: r.practice_score
      };
    });

    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, points: points, days: days });
  } catch (e) {
    syzoj.log(e);
    res.json({ ok: false, message: e.message });
  }
});
