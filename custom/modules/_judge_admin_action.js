let JudgeState = syzoj.model('judge_state');
let JudgeStateAdminAction = syzoj.model('judge-state-admin-action');
let User = syzoj.model('user');
syzoj.cheatedJudgeIds = new Set();
syzoj.cancelledJudgeIds = new Set();

async function refreshAdminActionCache() {
  try {
    let rows = await JudgeStateAdminAction.find({});
    let cheated = new Set();
    let cancelled = new Set();
    let cheaters = new Set();
    for (let r of rows) {
      if (r.action_type === 'cheated') {
        cheated.add(r.judge_id);
        if (r.affected_user_id) cheaters.add(r.affected_user_id);
      } else if (r.action_type === 'cancelled') {
        cancelled.add(r.judge_id);
      }
    }
    syzoj.cheatedJudgeIds = cheated;
    syzoj.cancelledJudgeIds = cancelled;
    syzoj.cheaterUserIds = cheaters;
  } catch (e) {
    syzoj.log('[judge-admin-action] cache refresh failed: ' + e.message);
  }
}
setTimeout(refreshAdminActionCache, 30 * 1000);
setInterval(refreshAdminActionCache, 60 * 1000);

function canManageJudgeAction(user) {
  return syzoj.authz && syzoj.authz.has(user, 'manage_judge_action');
}

async function hasOtherValidAcceptedSubmission(userId, problemId, excludeJudgeId) {
  let qb = JudgeState.createQueryBuilder('js')
    .leftJoin('judge_state_admin_action', 'a', 'a.judge_id = js.id')
    .where('js.user_id = :uid', { uid: userId })
    .andWhere('js.problem_id = :pid', { pid: problemId })
    .andWhere('js.status = :st', { st: 'Accepted' })
    .andWhere('js.id <> :ex', { ex: excludeJudgeId })
    .andWhere('a.judge_id IS NULL');
  let cnt = await qb.getCount();
  return cnt > 0;
}
app.post('/submission/:id/admin-action', async (req, res) => {
  try {
    if (!res.locals.user) throw new ErrorMessage('请登录后继续。');
    if (!canManageJudgeAction(res.locals.user)) {
      throw new ErrorMessage('您没有权限进行此操作。');
    }

    let id = parseInt(req.params.id);
    let actionType = (req.body.action_type || '').trim();
    let reason = (req.body.reason || '').trim();

    if (!['cancelled', 'cheated'].includes(actionType)) {
      throw new ErrorMessage('无效的操作类型。');
    }

    let judge = await JudgeState.findById(id);
    if (!judge) throw new ErrorMessage('无此提交记录。');

    let existing = await JudgeStateAdminAction.findOne({ where: { judge_id: id } });
    if (existing) {
      throw new ErrorMessage('该提交已被标记为「' + (existing.action_type === 'cancelled' ? '取消评测' : '作弊') + '」。请先撤销当前标记。');
    }

    let now = parseInt((new Date()).getTime() / 1000);
    let wasAccepted = (judge.status === 'Accepted');

    let action = await JudgeStateAdminAction.create();
    action.judge_id = id;
    action.action_type = actionType;
    action.operator_id = res.locals.user.id;
    action.operator_time = now;
    action.reason = reason || null;
    action.was_accepted = wasAccepted;
    action.affected_problem_id = judge.problem_id;
    action.affected_user_id = judge.user_id;
    await action.save();
    if (wasAccepted) {
      let hasOther = await hasOtherValidAcceptedSubmission(judge.user_id, judge.problem_id, id);
      if (!hasOther) {
        let user = await User.findById(judge.user_id);
        if (user && user.ac_num > 0) {
          user.ac_num = user.ac_num - 1;
          await user.save();
        }
      }
    }
    if (actionType === 'cancelled') {
      judge.status = 'Cancelled';
      judge.pending = false;
      judge.score = 0;
      judge.result = null;
      await judge.save();
    }
    await refreshAdminActionCache();
    if (syzoj.utils.refreshContestCheaterCache) await syzoj.utils.refreshContestCheaterCache();
    await syzoj.audit.log(req, 'judge_action.' + actionType, 'judge_state', id, {
      reason: reason || null,
      was_accepted: wasAccepted,
      affected_problem_id: judge.problem_id,
      affected_user_id: judge.user_id
    });

    res.redirect(syzoj.utils.makeUrl(['submission', id]));
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});
app.post('/submission/:id/admin-action/revoke', async (req, res) => {
  try {
    if (!res.locals.user) throw new ErrorMessage('请登录后继续。');
    if (!canManageJudgeAction(res.locals.user)) {
      throw new ErrorMessage('您没有权限进行此操作。');
    }

    let id = parseInt(req.params.id);
    let action = await JudgeStateAdminAction.findOne({ where: { judge_id: id } });
    if (!action) throw new ErrorMessage('该提交并未被标记。');

    let judge = await JudgeState.findById(id);
    if (!judge) throw new ErrorMessage('无此提交记录。');

    let wasCancelled = (action.action_type === 'cancelled');
    if (action.was_accepted && action.affected_user_id && action.affected_problem_id) {
      let hasOther = await hasOtherValidAcceptedSubmission(action.affected_user_id, action.affected_problem_id, id);
      if (!hasOther && judge.status === 'Accepted') {
        let user = await User.findById(action.affected_user_id);
        if (user) {
          user.ac_num = (user.ac_num || 0) + 1;
          await user.save();
        }
      }
    }

    await action.destroy();
    await refreshAdminActionCache();
    if (syzoj.utils.refreshContestCheaterCache) await syzoj.utils.refreshContestCheaterCache();
    await syzoj.audit.log(req, 'judge_action.revoke', 'judge_state', id, {
      action_type: action.action_type,
      affected_problem_id: action.affected_problem_id,
      affected_user_id: action.affected_user_id
    });

    res.redirect(syzoj.utils.makeUrl(['submission', id]));
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});
syzoj.utils.getJudgeAdminActions = async function(judgeIds) {
  if (!judgeIds || judgeIds.length === 0) return {};
  let rows = await JudgeStateAdminAction.createQueryBuilder()
    .where('judge_id IN (:...ids)', { ids: judgeIds })
    .getMany();
  let map = {};
  for (let r of rows) {
    map[r.judge_id] = {
      action_type: r.action_type,
      operator_id: r.operator_id,
      operator_time: r.operator_time,
      reason: r.reason
    };
  }
  return map;
};
app.post('/submission/:id/restore-and-rejudge', async (req, res) => {
  try {
    if (!res.locals.user) throw new ErrorMessage('请先登录。');

    let id = parseInt(req.params.id);
    let judge = await JudgeState.findById(id);
    if (!judge) throw new ErrorMessage('无此提交记录。');

    let isOwner = (judge.user_id === res.locals.user.id);
    let isAdmin = canManageJudgeAction(res.locals.user);
    if (!isOwner && !isAdmin) {
      throw new ErrorMessage('您没有权限重新评测此提交。');
    }

    if (judge.status !== 'Cancelled') {
      throw new ErrorMessage('仅可对已取消评测的提交使用此操作。');
    }
    let action = await JudgeStateAdminAction.findOne({ where: { judge_id: id } });
    if (action) await action.destroy();

    await refreshAdminActionCache();
    if (syzoj.utils.refreshContestCheaterCache) await syzoj.utils.refreshContestCheaterCache();
    await judge.loadRelationships();
    await judge.rejudge();

    res.redirect(syzoj.utils.makeUrl(['submission', id]));
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});
