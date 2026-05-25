let JudgeStateAdminAction = syzoj.model('judge-state-admin-action');
let User = syzoj.model('user');
app.use('/submission/:id', async (req, res, next) => {
  try {
    let id = parseInt(req.params.id);
    if (!id || isNaN(id)) return next();
    if (req.method !== 'GET') return next();
    let cached = false;
    if (syzoj.cheatedJudgeIds && syzoj.cheatedJudgeIds.has(id)) cached = true;
    if (syzoj.cancelledJudgeIds && syzoj.cancelledJudgeIds.has(id)) cached = true;
    if (!cached) {
      res.locals.judgeAdminAction = null;
      return next();
    }
    let action = await JudgeStateAdminAction.findOne({ where: { judge_id: id } });
    if (!action) {
      res.locals.judgeAdminAction = null;
      return next();
    }
    let operator = await User.findById(action.operator_id);
    res.locals.judgeAdminAction = {
      action_type: action.action_type,
      operator_username: operator ? operator.username : '未知',
      operator_id: action.operator_id,
      operator_time: action.operator_time,
      reason: action.reason,
      affected_user_id: action.affected_user_id  // [v1.5.1] 暴露给重评按钮判断作者身份
    };
    next();
  } catch (e) {
    syzoj.log('[judge-admin-action-loader] error: ' + e.message);
    res.locals.judgeAdminAction = null;
    next();
  }
});
