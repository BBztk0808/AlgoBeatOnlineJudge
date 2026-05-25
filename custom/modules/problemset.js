let ProblemSet = syzoj.model('problem-set');
let ProblemSetItem = syzoj.model('problem-set-item');
let ProblemFavorite = syzoj.model('problem-favorite');
let Problem = syzoj.model('problem');
let User = syzoj.model('user');
let TypeORM = require('typeorm');

const MAX_SET_TITLE_LENGTH = 80;
const MAX_SET_DESCRIPTION_LENGTH = 5000;
const MAX_SET_ITEMS = 300;
const MAX_ITEM_NOTE_LENGTH = 200;

function now() {
  return parseInt(Date.now() / 1000);
}

function loginRequired(req, res) {
  if (!res.locals.user) {
    throw new ErrorMessage('请登录后继续。', {
      '登录': syzoj.utils.makeUrl(['login'], { url: req.originalUrl })
    });
  }
  return res.locals.user;
}

function canManageProblemSets(user) {
  return syzoj.authz && syzoj.authz.has(user, 'manage_problemset');
}

function ensureCanPublishPublicProblemSet(user) {
  if (!canManageProblemSets(user)) {
    throw new ErrorMessage('只有拥有题单管理权限的管理员可以创建或维护公开题单。');
  }
}

function canViewProblem(user, problem) {
  if (!problem) return false;
  if (problem.is_public) return true;
  if (user && problem.user_id === user.id) return true;
  return canManageProblemSets(user);
}

function canViewSet(user, set) {
  if (!set) return false;
  if (set.visibility === 'public') return true;
  if (set.user_id && user && set.user_id === user.id) return true;
  return canManageProblemSets(user);
}

function canEditSet(user, set) {
  if (!user || !set) return false;
  if (set.visibility === 'public') return canManageProblemSets(user);
  if (set.user_id === user.id) return true;
  return canManageProblemSets(user);
}

function getConn() {
  return TypeORM.getConnection();
}

function buildInPlaceholders(values) {
  return values.map(() => '?').join(',');
}

async function getAcceptedProblemIdSet(userId, problemIds) {
  if (!userId || !problemIds || !problemIds.length) return new Set();
  let ids = Array.from(new Set(problemIds.map(x => parseInt(x)).filter(x => x > 0)));
  if (!ids.length) return new Set();
  let conn = getConn();
  let rows = await conn.query(`
    SELECT DISTINCT js.problem_id
    FROM judge_state js
    LEFT JOIN judge_state_admin_action a ON a.judge_id = js.id
    WHERE js.user_id = ?
      AND js.problem_id IN (${buildInPlaceholders(ids)})
      AND js.status = 'Accepted'
      AND (a.action_type IS NULL OR a.action_type NOT IN ('cheated', 'cancelled'))
  `, [userId].concat(ids));
  return new Set(rows.map(r => parseInt(r.problem_id)));
}

async function loadSetItems(setId, viewer) {
  let rows = await ProblemSetItem.find({
    where: { set_id: setId },
    order: { sort_order: 'ASC', id: 'ASC' }
  });
  let items = [];
  for (let item of rows) {
    let problem = await Problem.findById(item.problem_id);
    if (!problem || !canViewProblem(viewer, problem)) continue;
    item.problem = problem;
    items.push(item);
  }
  return items;
}

async function buildItemsText(setId) {
  let rows = await ProblemSetItem.find({
    where: { set_id: setId },
    order: { sort_order: 'ASC', id: 'ASC' }
  });
  return rows.map(row => {
    let line = String(row.problem_id);
    if (row.note) line += ' ' + row.note;
    return line;
  }).join('\n');
}

async function parseItemsText(text, viewer) {
  let lines = String(text || '').split(/\r?\n/);
  let items = [];
  let seen = new Set();
  let errors = [];

  for (let i = 0; i < lines.length; i++) {
    let raw = lines[i].trim();
    if (!raw) continue;
    let m = raw.match(/^#?(\d+)(?:[\s,，]+(.+))?$/);
    if (!m) {
      errors.push('第 ' + (i + 1) + ' 行格式错误，应为：题号 可选备注');
      continue;
    }
    let pid = parseInt(m[1]);
    if (!pid || pid <= 0) {
      errors.push('第 ' + (i + 1) + ' 行题号无效。');
      continue;
    }
    if (seen.has(pid)) continue;
    seen.add(pid);

    let problem = await Problem.findById(pid);
    if (!problem || !canViewProblem(viewer, problem)) {
      errors.push('第 ' + (i + 1) + ' 行题目 #' + pid + ' 不存在或不可见。');
      continue;
    }

    let note = (m[2] || '').trim();
    if (note.length > MAX_ITEM_NOTE_LENGTH) note = note.substring(0, MAX_ITEM_NOTE_LENGTH);
    items.push({ problem_id: pid, note: note });
    if (items.length >= MAX_SET_ITEMS) break;
  }

  if (errors.length) throw new ErrorMessage(errors.slice(0, 5).join('\n'));
  return items;
}

async function saveSetItems(set, items) {
  let conn = getConn();
  await conn.query('DELETE FROM problem_set_item WHERE set_id = ?', [set.id]);
  for (let i = 0; i < items.length; i++) {
    let row = await ProblemSetItem.create();
    row.set_id = set.id;
    row.problem_id = items[i].problem_id;
    row.sort_order = i;
    row.note = items[i].note || null;
    row.created_at = now();
    await row.save();
  }
  set.items_count = items.length;
  set.updated_at = now();
  await set.save();
}

async function setFavorite(userId, problemId, enabled) {
  let conn = getConn();
  if (enabled) {
    let existed = await ProblemFavorite.findOne({ where: { user_id: userId, problem_id: problemId } });
    if (!existed) {
      let fav = await ProblemFavorite.create();
      fav.user_id = userId;
      fav.problem_id = problemId;
      fav.created_at = now();
      await fav.save();
    }
  } else {
    await conn.query('DELETE FROM problem_favorite WHERE user_id = ? AND problem_id = ?', [userId, problemId]);
  }
  let cntRows = await conn.query('SELECT COUNT(*) AS cnt FROM problem_favorite WHERE problem_id = ?', [problemId]);
  return parseInt(cntRows[0].cnt) || 0;
}

async function getFavoriteInfo(user, problemId) {
  let conn = getConn();
  let cntRows = await conn.query('SELECT COUNT(*) AS cnt FROM problem_favorite WHERE problem_id = ?', [problemId]);
  let favorite = false;
  if (user) {
    favorite = !!(await ProblemFavorite.findOne({ where: { user_id: user.id, problem_id: problemId } }));
  }
  return { favorite: favorite, count: parseInt(cntRows[0].cnt) || 0 };
}
app.get('/problemsets', async (req, res) => {
  try {
    let tab = req.query.tab === 'mine' ? 'mine' : 'public';
    let user = res.locals.user;
    let pageSize = 20;
    let where;

    if (tab === 'mine') {
      loginRequired(req, res);
      where = { user_id: user.id };
    } else {
      where = { visibility: 'public' };
    }

    let total = await ProblemSet.count(where);
    let paginate = syzoj.utils.paginate(total, req.query.page, pageSize);
    let sets = await ProblemSet.queryPage(paginate, where, { updated_at: 'DESC' });
    for (let set of sets) {
      set.owner = await User.findById(set.user_id);
    }

    res.render('problemsets', {
      sets: sets,
      total: total,
      paginate: paginate,
      tab: tab
    });
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});
app.get('/problemset/new', async (req, res) => {
  try {
    let user = loginRequired(req, res);
    let set = await ProblemSet.create();
    set.id = 0;
    set.user_id = user.id;
    set.title = '';
    set.description = '';
    set.visibility = 'private';
    set.itemsText = '';
    res.render('problemset_edit', {
      set: set,
      isNew: true,
      canPublishPublic: canManageProblemSets(user)
    });
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});

app.post('/problemset/new', async (req, res) => {
  try {
    let user = loginRequired(req, res);
    let title = String(req.body.title || '').trim();
    let description = String(req.body.description || '').trim();
    let visibility = req.body.visibility === 'public' ? 'public' : 'private';

    if (!title) throw new ErrorMessage('题单标题不能为空。');
    if (title.length > MAX_SET_TITLE_LENGTH) throw new ErrorMessage('题单标题最多 ' + MAX_SET_TITLE_LENGTH + ' 字。');
    if (description.length > MAX_SET_DESCRIPTION_LENGTH) throw new ErrorMessage('题单介绍过长。');
    if (visibility === 'public') ensureCanPublishPublicProblemSet(user);

    let items = await parseItemsText(req.body.items_text || '', user);
    let set = await ProblemSet.create();
    set.user_id = user.id;
    set.title = title;
    set.description = description;
    set.visibility = visibility;
    set.items_count = 0;
    set.created_at = now();
    set.updated_at = set.created_at;
    await set.save();
    await saveSetItems(set, items);

    res.redirect(syzoj.utils.makeUrl(['problemset', set.id]));
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});
app.get('/problemset/:id/edit', async (req, res) => {
  try {
    let user = loginRequired(req, res);
    let set = await ProblemSet.findById(parseInt(req.params.id));
    if (!set) throw new ErrorMessage('题单不存在。');
    if (!canEditSet(user, set)) throw new ErrorMessage('您没有权限编辑此题单。');
    set.itemsText = await buildItemsText(set.id);
    res.render('problemset_edit', {
      set: set,
      isNew: false,
      canPublishPublic: canManageProblemSets(user)
    });
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});

app.post('/problemset/:id/edit', async (req, res) => {
  try {
    let user = loginRequired(req, res);
    let set = await ProblemSet.findById(parseInt(req.params.id));
    if (!set) throw new ErrorMessage('题单不存在。');
    if (!canEditSet(user, set)) throw new ErrorMessage('您没有权限编辑此题单。');

    let title = String(req.body.title || '').trim();
    let description = String(req.body.description || '').trim();
    let visibility = req.body.visibility === 'public' ? 'public' : 'private';
    if (!title) throw new ErrorMessage('题单标题不能为空。');
    if (title.length > MAX_SET_TITLE_LENGTH) throw new ErrorMessage('题单标题最多 ' + MAX_SET_TITLE_LENGTH + ' 字。');
    if (description.length > MAX_SET_DESCRIPTION_LENGTH) throw new ErrorMessage('题单介绍过长。');
    if (set.visibility === 'public' || visibility === 'public') ensureCanPublishPublicProblemSet(user);

    let items = await parseItemsText(req.body.items_text || '', user);
    set.title = title;
    set.description = description;
    set.visibility = visibility;
    set.updated_at = now();
    await set.save();
    await saveSetItems(set, items);

    res.redirect(syzoj.utils.makeUrl(['problemset', set.id]));
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});

app.post('/problemset/:id/delete', async (req, res) => {
  try {
    let user = loginRequired(req, res);
    let set = await ProblemSet.findById(parseInt(req.params.id));
    if (!set) throw new ErrorMessage('题单不存在。');
    if (!canEditSet(user, set)) throw new ErrorMessage('您没有权限删除此题单。');
    let conn = getConn();
    await conn.query('DELETE FROM problem_set_item WHERE set_id = ?', [set.id]);
    await conn.query('DELETE FROM problem_set WHERE id = ?', [set.id]);
    res.redirect(syzoj.utils.makeUrl(['problemsets'], { tab: 'mine' }));
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});
app.get('/problemset/:id', async (req, res) => {
  try {
    let set = await ProblemSet.findById(parseInt(req.params.id));
    if (!set) throw new ErrorMessage('题单不存在。');
    if (!canViewSet(res.locals.user, set)) throw new ErrorMessage('您没有权限查看此题单。');

    set.owner = await User.findById(set.user_id);
    set.descriptionRendered = await syzoj.utils.markdown(set.description || '');
    let items = await loadSetItems(set.id, res.locals.user);
    let accepted = await getAcceptedProblemIdSet(res.locals.user && res.locals.user.id, items.map(i => i.problem_id));
    for (let item of items) item.accepted = accepted.has(item.problem_id);

    res.render('problemset', {
      set: set,
      items: items,
      acceptedCount: accepted.size,
      canEdit: canEditSet(res.locals.user, set)
    });
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});
app.get('/api/problem/:id/favorite', async (req, res) => {
  try {
    let problemId = parseInt(req.params.id);
    let problem = await Problem.findById(problemId);
    if (!problem || !canViewProblem(res.locals.user, problem)) {
      return res.status(404).json({ ok: false, message: '题目不存在或不可见。' });
    }
    let info = await getFavoriteInfo(res.locals.user, problemId);
    res.json({ ok: true, favorite: info.favorite, count: info.count, loggedIn: !!res.locals.user });
  } catch (e) {
    syzoj.log(e);
    res.status(500).json({ ok: false, message: e.message || String(e) });
  }
});

app.post('/api/problem/:id/favorite', async (req, res) => {
  try {
    let user = loginRequired(req, res);
    let problemId = parseInt(req.params.id);
    let problem = await Problem.findById(problemId);
    if (!problem || !canViewProblem(user, problem)) throw new ErrorMessage('题目不存在或不可见。');
    let count = await setFavorite(user.id, problemId, true);
    res.json({ ok: true, favorite: true, count: count });
  } catch (e) {
    syzoj.log(e);
    res.status(400).json({ ok: false, message: e.message || String(e) });
  }
});

app.post('/api/problem/:id/unfavorite', async (req, res) => {
  try {
    let user = loginRequired(req, res);
    let problemId = parseInt(req.params.id);
    let count = await setFavorite(user.id, problemId, false);
    res.json({ ok: true, favorite: false, count: count });
  } catch (e) {
    syzoj.log(e);
    res.status(400).json({ ok: false, message: e.message || String(e) });
  }
});
app.get('/favorites', async (req, res) => {
  try {
    let user = loginRequired(req, res);
    let pageSize = 30;
    let where = { user_id: user.id };
    let total = await ProblemFavorite.count(where);
    let paginate = syzoj.utils.paginate(total, req.query.page, pageSize);
    let favorites = await ProblemFavorite.queryPage(paginate, where, { created_at: 'DESC' });
    let accepted = await getAcceptedProblemIdSet(user.id, favorites.map(f => f.problem_id));

    let items = [];
    for (let fav of favorites) {
      let problem = await Problem.findById(fav.problem_id);
      if (!problem || !canViewProblem(user, problem)) continue;
      fav.problem = problem;
      fav.accepted = accepted.has(fav.problem_id);
      items.push(fav);
    }

    res.render('favorites', {
      favorites: items,
      total: total,
      paginate: paginate
    });
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});
