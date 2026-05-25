let Announcement = syzoj.model('announcement');
app.get('/admin/announcements', async (req, res) => {
  try {
    syzoj.authz.require(res.locals.user, 'manage_announcement');

    let pageSize = 20;
    let total = await Announcement.count({});
    let paginate = syzoj.utils.paginate(total, req.query.page, pageSize);
    let announcements = await Announcement.queryPage(paginate, {}, {
      public_time: 'DESC'
    });

    let now = parseInt((new Date()).getTime() / 1000);
    for (let a of announcements) {
      a.isLive = a.isCurrentlyActive();
    }

    res.render('admin_announcements', {
      announcements: announcements,
      paginate: paginate,
      now: now
    });
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});
app.get('/admin/announcement/:id/edit', async (req, res) => {
  try {
    syzoj.authz.require(res.locals.user, 'manage_announcement');

    let id = parseInt(req.params.id);
    let announcement;
    if (id === 0) {
      announcement = await Announcement.create();
      announcement.id = 0;
      announcement.title = '';
      announcement.content = '';
      announcement.level = 'info';
      announcement.is_active = true;
      let now = parseInt((new Date()).getTime() / 1000);
      announcement.start_time = now;
      announcement.end_time = now + 7 * 24 * 3600;
    } else {
      announcement = await Announcement.findById(id);
      if (!announcement) throw new ErrorMessage('无此公告。');
    }

    res.render('admin_announcement_edit', {
      announcement: announcement
    });
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});
app.post('/admin/announcement/:id/edit', async (req, res) => {
  try {
    syzoj.authz.require(res.locals.user, 'manage_announcement');

    let id = parseInt(req.params.id);
    let announcement;
    let isNew = id === 0;
    if (id === 0) {
      announcement = await Announcement.create();
      announcement.public_time = parseInt((new Date()).getTime() / 1000);
    } else {
      announcement = await Announcement.findById(id);
      if (!announcement) throw new ErrorMessage('无此公告。');
    }

    let title = (req.body.title || '').trim();
    let content = (req.body.content || '').trim();
    let level = req.body.level || 'info';
    if (!['info', 'warning', 'important'].includes(level)) level = 'info';

    if (!title) throw new ErrorMessage('标题不能为空。');
    if (title.length > 120) throw new ErrorMessage('标题过长(最多 120 字)。');
    if (!content) throw new ErrorMessage('内容不能为空。');
    function parseDateTimeStr(s) {
      if (!s) return null;
      let d = new Date(s);
      if (isNaN(d.getTime())) return null;
      return parseInt(d.getTime() / 1000);
    }

    let startTs = parseDateTimeStr(req.body.start_time);
    let endTs = parseDateTimeStr(req.body.end_time);

    if (!startTs || !endTs) throw new ErrorMessage('请填写有效的生效时间。');
    if (endTs <= startTs) throw new ErrorMessage('结束时间必须晚于开始时间。');

    announcement.title = title;
    announcement.content = content;
    announcement.level = level;
    announcement.start_time = startTs;
    announcement.end_time = endTs;
    announcement.is_active = req.body.is_active === 'on' || req.body.is_active === 'true';
    announcement.update_time = parseInt((new Date()).getTime() / 1000);

    await announcement.save();
    await syzoj.audit.log(req, isNew ? 'announcement.create' : 'announcement.update', 'announcement', announcement.id, {
      title: announcement.title,
      level: announcement.level,
      is_active: announcement.is_active
    });

    res.redirect(syzoj.utils.makeUrl(['admin', 'announcements']));
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});
app.post('/admin/announcement/:id/toggle', async (req, res) => {
  try {
    syzoj.authz.require(res.locals.user, 'manage_announcement');
    let id = parseInt(req.params.id);
    let announcement = await Announcement.findById(id);
    if (!announcement) throw new ErrorMessage('无此公告。');

    announcement.is_active = !announcement.is_active;
    announcement.update_time = parseInt((new Date()).getTime() / 1000);
    await announcement.save();
    await syzoj.audit.log(req, 'announcement.toggle', 'announcement', announcement.id, {
      is_active: announcement.is_active
    });

    res.redirect(syzoj.utils.makeUrl(['admin', 'announcements']));
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});
app.post('/admin/announcement/:id/delete', async (req, res) => {
  try {
    syzoj.authz.require(res.locals.user, 'manage_announcement');
    let id = parseInt(req.params.id);
    let announcement = await Announcement.findById(id);
    if (!announcement) throw new ErrorMessage('无此公告。');

    let title = announcement.title;
    await announcement.destroy();
    await syzoj.audit.log(req, 'announcement.delete', 'announcement', id, { title: title });

    res.redirect(syzoj.utils.makeUrl(['admin', 'announcements']));
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});
app.get('/api/active-announcements', async (req, res) => {
  try {
    let now = parseInt((new Date()).getTime() / 1000);
    let qb = Announcement.createQueryBuilder()
      .where('is_active = 1')
      .andWhere('(start_time IS NULL OR start_time <= :now)', { now: now })
      .andWhere('(end_time IS NULL OR end_time >= :now)', { now: now })
      .orderBy('public_time', 'DESC');

    let list = await qb.getMany();
    let result = [];
    for (let a of list) {
      result.push({
        id: a.id,
        title: a.title,
        contentRendered: await syzoj.utils.markdown(a.content || ''),
        level: a.level,
        end_time: a.end_time
      });
    }

    res.set('Cache-Control', 'no-store');
    res.json({ announcements: result });
  } catch (e) {
    syzoj.log(e);
    res.status(500).json({ error: e.message || String(e) });
  }
});
