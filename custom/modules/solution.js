let Problem = syzoj.model('problem');
let ProblemSolutionComment = syzoj.model('problem-solution-comment');
let ProblemSolution = syzoj.model('problem-solution');
let User = syzoj.model('user');
let ProblemSolutionSetting = syzoj.model('problem-solution-setting');
app.get('/problem/:pid/solutions', async (req, res) => {
  try {
    let pid = parseInt(req.params.pid);
    let problem = await Problem.findById(pid);
    if (!problem) throw new ErrorMessage('无此题目。');
    if (!await problem.isAllowedUseBy(res.locals.user)) {
      throw new ErrorMessage('您没有权限进行此操作。');
    }

    let user = res.locals.user;
    let canReview = syzoj.authz.has(user, 'manage_solution');
    let where;
    if (canReview) {
      where = { problem_id: pid };
    } else if (user) {
      where = [
        { problem_id: pid, status: 'accepted' },
        { problem_id: pid, user_id: user.id }
      ];
    } else {
      where = { problem_id: pid, status: 'accepted' };
    }

    let pageSize = 20;
    let total = await ProblemSolution.count(where);
    let paginate = syzoj.utils.paginate(total, req.query.page, pageSize);
    let solutions = await ProblemSolution.queryPage(paginate, where, {
      public_time: 'DESC'
    });
    for (let sol of solutions) {
      sol.user = await User.findById(sol.user_id);
      sol.allowedEdit = await sol.isAllowedEditBy(res.locals.user);
    }
    let setting = await ProblemSolutionSetting.findOne({ where: { problem_id: pid } });
    let submissionDisabled = !!(setting && setting.disable_submission);

    let canManageSetting = syzoj.authz.has(user, 'manage_solution_setting');
    let allowedPost = !!user && !submissionDisabled;

    res.render('solutions', {
      problem: problem,
      solutions: solutions,
      paginate: paginate,
      allowedPost: allowedPost,
      submissionDisabled: submissionDisabled,
      canManageSetting: canManageSetting
    });
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});
app.get('/problem/:pid/solution/new', async (req, res) => {
  try {
    if (!res.locals.user) {
      throw new ErrorMessage('请登录后继续。', {
        '登录': syzoj.utils.makeUrl(['login'], { 'url': req.originalUrl })
      });
    }

    let pid = parseInt(req.params.pid);
    let problem = await Problem.findById(pid);
    if (!problem) throw new ErrorMessage('无此题目。');
    if (!await problem.isAllowedUseBy(res.locals.user)) {
      throw new ErrorMessage('您没有权限进行此操作。');
    }
    let setting = await ProblemSolutionSetting.findOne({ where: { problem_id: pid } });
    if (setting && setting.disable_submission) {
      throw new ErrorMessage('该题已关闭题解提交。', {
        '查看现有题解': syzoj.utils.makeUrl(['problem', pid, 'solutions'])
      });
    }
    if (!await syzoj.utils.isEmailVerified(res.locals.user.id)) {
      throw new ErrorMessage('请先验证邮箱后再投稿题解。', {
        '前往验证': syzoj.utils.makeUrl(['user', res.locals.user.id, 'edit'])
      });
    }

    res.redirect(syzoj.utils.makeUrl(['solution', 0, 'edit'], { pid: pid }));
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});
app.get('/solution/:id', async (req, res) => {
  try {
    let id = parseInt(req.params.id);
    let solution = await ProblemSolution.findById(id);
    if (!solution) throw new ErrorMessage('无此题解。');

    if (!(await solution.isAllowedSeeBy(res.locals.user))) {
      throw new ErrorMessage('您没有权限查看此题解。');
    }

    let problem = await Problem.findById(solution.problem_id);
    if (!problem) throw new ErrorMessage('题解所属题目不存在。');
    if (!await problem.isAllowedUseBy(res.locals.user)) {
      throw new ErrorMessage('您没有权限查看此题解。');
    }

    solution.user = await User.findById(solution.user_id);
    if (solution.reviewer_id) {
      solution.reviewer = await User.findById(solution.reviewer_id);
    }
    solution.allowedEdit = await solution.isAllowedEditBy(res.locals.user);
    solution.allowedComment = solution.isAllowedCommentBy(res.locals.user);
    solution.contentRendered = await syzoj.utils.markdown(solution.content || '');

    let canReview = syzoj.authz.has(res.locals.user, 'manage_solution');
    let commentsCount = await ProblemSolutionComment.count({ solution_id: solution.id });
    let pageSize = (syzoj.config.page && syzoj.config.page.article_comment) || 10;
    let paginate = syzoj.utils.paginate(commentsCount, req.query.page, pageSize);
    let comments = await ProblemSolutionComment.queryPage(paginate, { solution_id: solution.id }, {
      public_time: 'DESC'
    });

    for (let c of comments) {
      c.user = await User.findById(c.user_id);
      c.allowedEdit = await c.isAllowedEditBy(res.locals.user);
      c.contentRendered = await syzoj.utils.markdown(c.content || '');
    }
    res.render('solution', {
      solution: solution,
      problem: problem,
      canReview: canReview,
      comments: comments,
      commentsCount: commentsCount,
      paginate: paginate
    });
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});
app.get('/solution/:id/edit', async (req, res) => {
  try {
    if (!res.locals.user) {
      throw new ErrorMessage('请登录后继续。', {
        '登录': syzoj.utils.makeUrl(['login'], { 'url': req.originalUrl })
      });
    }

    let id = parseInt(req.params.id);
    let solution;
    let problem;

    if (id === 0) {
      let pid = parseInt(req.query.pid);
      problem = await Problem.findById(pid);
      if (!problem) throw new ErrorMessage('无此题目。');
      if (!await problem.isAllowedUseBy(res.locals.user)) {
        throw new ErrorMessage('您没有权限进行此操作。');
      }
      let setting = await ProblemSolutionSetting.findOne({ where: { problem_id: pid } });
      if (setting && setting.disable_submission) {
        throw new ErrorMessage('该题已关闭题解提交。');
      }
      solution = await ProblemSolution.create();
      solution.id = 0;
      solution.problem_id = pid;
      solution.title = '';
      solution.content = '';
      solution.allowedEdit = true;
    } else {
      solution = await ProblemSolution.findById(id);
      if (!solution) throw new ErrorMessage('无此题解。');

      if (!solution.isAllowedEditBy(res.locals.user)) {
        throw new ErrorMessage('您没有权限编辑此题解。');
      }

      problem = await Problem.findById(solution.problem_id);
      if (!problem) throw new ErrorMessage('题解所属题目不存在。');
      solution.allowedEdit = true;
    }

    res.render('solution_edit', {
      solution: solution,
      problem: problem
    });
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});
app.post('/solution/:id/edit', async (req, res) => {
  try {
    if (!res.locals.user) throw new ErrorMessage('请登录后继续。');

    let id = parseInt(req.params.id);
    let solution;
    let isNew = false;

    if (id === 0) {
      let pid = parseInt(req.body.problem_id);
      let problem = await Problem.findById(pid);
      if (!problem) throw new ErrorMessage('无此题目。');
      if (!await problem.isAllowedUseBy(res.locals.user)) {
        throw new ErrorMessage('您没有权限进行此操作。');
      }

      solution = await ProblemSolution.create();
      solution.problem_id = pid;
      solution.user_id = res.locals.user.id;
      solution.public_time = parseInt((new Date()).getTime() / 1000);
      solution.status = res.locals.user.is_admin ? 'accepted' : 'pending';
      isNew = true;
    } else {
      solution = await ProblemSolution.findById(id);
      if (!solution) throw new ErrorMessage('无此题解。');
      if (!solution.isAllowedEditBy(res.locals.user)) {
        throw new ErrorMessage('您没有权限编辑此题解。');
      }
      if (!res.locals.user.is_admin && solution.status !== 'pending') {
        solution.status = 'pending';
      }
    }

    let title = (req.body.title || '').trim();
    let content = (req.body.content || '').trim();

    if (!title) throw new ErrorMessage('标题不能为空。');
    if (title.length > 80) throw new ErrorMessage('标题过长(最多 80 字符)。');
    if (!content) throw new ErrorMessage('内容不能为空。');

    solution.title = title;
    solution.content = content;
    solution.update_time = parseInt((new Date()).getTime() / 1000);
    solution.allow_comment = req.body.allow_comment === 'on' || req.body.allow_comment === 'true';
    await solution.save();

    res.redirect(syzoj.utils.makeUrl(['solution', solution.id]));
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});
app.post('/solution/:id/withdraw', async (req, res) => {
  try {
    if (!res.locals.user) throw new ErrorMessage('请登录后继续。');

    let id = parseInt(req.params.id);
    let solution = await ProblemSolution.findById(id);
    if (!solution) throw new ErrorMessage('无此题解。');
    if (solution.user_id !== res.locals.user.id) {
      throw new ErrorMessage('您没有权限撤回此题解。');
    }

    solution.status = 'withdrawn';
    solution.update_time = parseInt((new Date()).getTime() / 1000);
    await solution.save();

    res.redirect(syzoj.utils.makeUrl(['problem', solution.problem_id, 'solutions']));
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});
app.post('/solution/:id/delete', async (req, res) => {
  try {
    if (!res.locals.user) throw new ErrorMessage('请登录后继续。');

    let id = parseInt(req.params.id);
    let solution = await ProblemSolution.findById(id);
    if (!solution) throw new ErrorMessage('无此题解。');

    if (!solution.isAllowedEditBy(res.locals.user)) {
      throw new ErrorMessage('您没有权限删除此题解。');
    }

    let pid = solution.problem_id;
    let solutionTitle = solution.title;
    await solution.destroy();
    if (syzoj.authz.has(res.locals.user, 'manage_solution')) {
      await syzoj.audit.log(req, 'solution.delete', 'problem_solution', id, {
        problem_id: pid,
        title: solutionTitle
      });
    }

    res.redirect(syzoj.utils.makeUrl(['problem', pid, 'solutions']));
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});
app.get('/admin/solutions', async (req, res) => {
  try {
    syzoj.authz.require(res.locals.user, 'manage_solution');
    let status = req.query.status || 'pending';
    let validStatus = ['pending', 'accepted', 'rejected', 'withdrawn', 'all'];
    if (!validStatus.includes(status)) status = 'pending';

    let where = (status === 'all') ? {} : { status: status };

    let pageSize = 30;
    let total = await ProblemSolution.count(where);
    let paginate = syzoj.utils.paginate(total, req.query.page, pageSize);
    let solutions = await ProblemSolution.queryPage(paginate, where, {
      public_time: 'DESC'
    });
    for (let sol of solutions) {
      sol.user = await User.findById(sol.user_id);
      sol.problem = await Problem.findById(sol.problem_id);
      if (sol.reviewer_id) {
        sol.reviewer = await User.findById(sol.reviewer_id);
      }
    }
    let counts = {
      pending: await ProblemSolution.count({ status: 'pending' }),
      accepted: await ProblemSolution.count({ status: 'accepted' }),
      rejected: await ProblemSolution.count({ status: 'rejected' }),
      withdrawn: await ProblemSolution.count({ status: 'withdrawn' })
    };
    counts.all = counts.pending + counts.accepted + counts.rejected + counts.withdrawn;

    res.render('admin_solutions', {
      solutions: solutions,
      paginate: paginate,
      currentStatus: status,
      counts: counts
    });
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});
app.post('/solution/:id/approve', async (req, res) => {
  try {
    syzoj.authz.require(res.locals.user, 'manage_solution');

    let id = parseInt(req.params.id);
    let solution = await ProblemSolution.findById(id);
    if (!solution) throw new ErrorMessage('无此题解。');

    solution.status = 'accepted';
    solution.reviewer_id = res.locals.user.id;
    solution.reviewed_at = parseInt((new Date()).getTime() / 1000);
    solution.reject_reason = null;
    solution.update_time = parseInt((new Date()).getTime() / 1000);
    await solution.save();
    try {
      await syzoj.utils.createNotification({
        recipientId: solution.user_id,
        type: 'solution_approved',
        title: '您的题解《' + (solution.title || '无标题') + '》已通过审核',
        content: '审核员：' + res.locals.user.username,
        sourceUrl: syzoj.utils.makeUrl(['solution', solution.id]),
        sourceId: solution.id,
        actorId: res.locals.user.id
      });
    } catch (e) { syzoj.log('[notification] solution_approved failed: ' + e.message); }
    await syzoj.audit.log(req, 'solution.approve', 'problem_solution', solution.id, {
      problem_id: solution.problem_id,
      user_id: solution.user_id,
      title: solution.title
    });

    res.redirect(syzoj.utils.makeUrl(['solution', solution.id]));
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});
app.post('/solution/:id/reject', async (req, res) => {
  try {
    syzoj.authz.require(res.locals.user, 'manage_solution');

    let id = parseInt(req.params.id);
    let solution = await ProblemSolution.findById(id);
    if (!solution) throw new ErrorMessage('无此题解。');

    let reason = (req.body.reason || '').trim();
    if (!reason) reason = '管理员未通过此题解，未提供原因。';
    if (reason.length > 255) reason = reason.substring(0, 255);

    solution.status = 'rejected';
    solution.reviewer_id = res.locals.user.id;
    solution.reviewed_at = parseInt((new Date()).getTime() / 1000);
    solution.reject_reason = reason;
    solution.update_time = parseInt((new Date()).getTime() / 1000);
    await solution.save();
    try {
      await syzoj.utils.createNotification({
        recipientId: solution.user_id,
        type: 'solution_rejected',
        title: '您的题解《' + (solution.title || '无标题') + '》未通过审核',
        content: '审核员：' + res.locals.user.username + '\n原因：' + reason,
        sourceUrl: syzoj.utils.makeUrl(['solution', solution.id]),
        sourceId: solution.id,
        actorId: res.locals.user.id
      });
    } catch (e) { syzoj.log('[notification] solution_rejected failed: ' + e.message); }
    await syzoj.audit.log(req, 'solution.reject', 'problem_solution', solution.id, {
      problem_id: solution.problem_id,
      user_id: solution.user_id,
      title: solution.title,
      reason: reason
    });

    res.redirect(syzoj.utils.makeUrl(['solution', solution.id]));
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});
app.post('/solution/:id/comment', async (req, res) => {
  try {
    if (!res.locals.user) {
      throw new ErrorMessage('请登录后继续。', { '登录': syzoj.utils.makeUrl(['login'], { 'url': req.originalUrl }) });
    }

    let id = parseInt(req.params.id);
    let solution = await ProblemSolution.findById(id);
    if (!solution) throw new ErrorMessage('无此题解。');

    if (!solution.isAllowedCommentBy(res.locals.user)) {
      throw new ErrorMessage('您没有权限评论此题解。');
    }

    let content = (req.body.comment || '').trim();
    if (!content) throw new ErrorMessage('评论内容不能为空。');
    if (content.length > 5000) throw new ErrorMessage('评论内容过长(最多 5000 字)。');

    let comment = await ProblemSolutionComment.create({
      content: content,
      solution_id: id,
      user_id: res.locals.user.id,
      public_time: parseInt((new Date()).getTime() / 1000)
    });
    await comment.save();

    await solution.resetCommentsNum();
    let viewerId = res.locals.user.id;
    let notifiedIds = new Set();
    notifiedIds.add(viewerId);
    if (solution.user_id && !notifiedIds.has(solution.user_id)) {
      try {
        await syzoj.utils.createNotification({
          recipientId: solution.user_id,
          type: 'solution_comment',
          title: res.locals.user.username + ' 评论了你的题解',
          content: content.length > 100 ? content.substring(0, 100) + '...' : content,
          sourceUrl: syzoj.utils.makeUrl(['solution', solution.id]),
          sourceId: solution.id,
          actorId: viewerId
        });
        notifiedIds.add(solution.user_id);
      } catch (e) { syzoj.log('[solution] notify author failed: ' + e.message); }
    }
    try {
      if (syzoj.utils.parseMentions) {
        let mentions = await syzoj.utils.parseMentions(content);
        for (let m of mentions) {
          if (notifiedIds.has(m.userId)) continue;
          await syzoj.utils.createNotification({
            recipientId: m.userId,
            type: 'solution_comment_mention',
            title: res.locals.user.username + ' 在题解评论里提到了你',
            content: content.length > 100 ? content.substring(0, 100) + '...' : content,
            sourceUrl: syzoj.utils.makeUrl(['solution', solution.id]),
            sourceId: solution.id,
            actorId: viewerId
          });
          notifiedIds.add(m.userId);
        }
      }
    } catch (e) { syzoj.log('[solution] @ mention notify failed: ' + e.message); }

    res.redirect(syzoj.utils.makeUrl(['solution', id]));
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});
app.post('/solution/:sid/comment/:cid/delete', async (req, res) => {
  try {
    if (!res.locals.user) throw new ErrorMessage('请登录后继续。');

    let sid = parseInt(req.params.sid);
    let cid = parseInt(req.params.cid);
    let comment = await ProblemSolutionComment.findById(cid);
    if (!comment || comment.solution_id !== sid) throw new ErrorMessage('无此评论。');

    if (!(await comment.isAllowedEditBy(res.locals.user))) {
      throw new ErrorMessage('您没有权限删除此评论。');
    }

    await comment.destroy();

    let solution = await ProblemSolution.findById(sid);
    if (solution) await solution.resetCommentsNum();

    res.redirect(syzoj.utils.makeUrl(['solution', sid]));
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});
app.post('/problem/:pid/solution-toggle-submission', async (req, res) => {
  try {
    if (!res.locals.user) throw new ErrorMessage('请登录后继续。');
    syzoj.authz.require(res.locals.user, 'manage_solution_setting');

    let pid = parseInt(req.params.pid);
    let problem = await Problem.findById(pid);
    if (!problem) throw new ErrorMessage('无此题目。');

    let setting = await ProblemSolutionSetting.findOne({ where: { problem_id: pid } });
    if (!setting) {
      setting = await ProblemSolutionSetting.create();
      setting.problem_id = pid;
      setting.disable_submission = false;
    }

    setting.disable_submission = !setting.disable_submission;
    setting.update_time = parseInt((new Date()).getTime() / 1000);
    setting.updated_by = res.locals.user.id;
    await setting.save();
    await syzoj.audit.log(req, 'solution_setting.toggle_submission', 'problem', pid, {
      disable_submission: setting.disable_submission
    });

    res.redirect(syzoj.utils.makeUrl(['problem', pid, 'solutions']));
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});
