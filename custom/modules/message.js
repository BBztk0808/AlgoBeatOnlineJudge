let PrivateMessage = syzoj.model('private-message');
let UserMessageSetting = syzoj.model('user-message-setting');
let User = syzoj.model('user');
async function canSendTo(sender, receiver) {
  if (!sender) return { ok: false, reason: '请登录后继续。' };
  if (!receiver) return { ok: false, reason: '收件人不存在。' };
  if (sender.id === receiver.id) return { ok: false, reason: '不能给自己发送站内信。' };
  if (!sender.is_admin) {
    if (!await syzoj.utils.isEmailVerified(sender.id)) {
      return { ok: false, reason: '请先验证邮箱后再发送站内信。' };
    }
  }
  if (sender.is_admin) return { ok: true };
  let setting = await UserMessageSetting.findOne({ where: { user_id: receiver.id } });
  if (setting && setting.disable_messages) {
    return { ok: false, reason: '该用户已关闭站内信。' };
  }
  return { ok: true };
}
async function getOrCreateSetting(userId) {
  let s = await UserMessageSetting.findOne({ where: { user_id: userId } });
  if (!s) {
    s = await UserMessageSetting.create();
    s.user_id = userId;
    s.disable_messages = false;
  }
  return s;
}
async function countUnread(userId) {
  return await PrivateMessage.count({
    receiver_id: userId,
    is_read: false,
    receiver_deleted: false
  });
}
app.get('/messages', async (req, res) => {
  try {
    if (!res.locals.user) {
      throw new ErrorMessage('请登录后继续。', { '登录': syzoj.utils.makeUrl(['login'], { 'url': req.originalUrl }) });
    }
    let myId = res.locals.user.id;
    let qb = PrivateMessage.createQueryBuilder('m')
      .select('CASE WHEN m.sender_id = :myId THEN m.receiver_id ELSE m.sender_id END', 'partner_id')
      .addSelect('MAX(m.public_time)', 'last_time')
      .addSelect('SUM(CASE WHEN m.receiver_id = :myId AND m.is_read = 0 AND m.receiver_deleted = 0 THEN 1 ELSE 0 END)', 'unread')
      .where('(m.sender_id = :myId AND m.sender_deleted = 0) OR (m.receiver_id = :myId AND m.receiver_deleted = 0)', { myId: myId })
      .setParameter('myId', myId)
      .groupBy('partner_id')
      .orderBy('last_time', 'DESC');

    let raws = await qb.getRawMany();
    let conversations = [];
    for (let r of raws) {
      let partnerId = parseInt(r.partner_id);
      if (!partnerId) continue;
      let partner = await User.findById(partnerId);
      if (!partner) continue;
      let lastMsg = await PrivateMessage.findOne({
        where: [
          { sender_id: myId, receiver_id: partnerId, sender_deleted: false },
          { sender_id: partnerId, receiver_id: myId, receiver_deleted: false }
        ],
        order: { public_time: 'DESC' }
      });

      conversations.push({
        partner: partner,
        last_message: lastMsg,
        last_time: parseInt(r.last_time),
        unread: parseInt(r.unread) || 0
      });
    }
    res.render('messages_inbox', {
      conversations: conversations
    });
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});
app.get('/messages/with/:uid', async (req, res) => {
  try {
    if (!res.locals.user) {
      throw new ErrorMessage('请登录后继续。', { '登录': syzoj.utils.makeUrl(['login'], { 'url': req.originalUrl }) });
    }
    let myId = res.locals.user.id;
    let partnerId = parseInt(req.params.uid);
    if (!partnerId || partnerId === myId) {
      throw new ErrorMessage('无效的对话对象。');
    }

    let partner = await User.findById(partnerId);
    if (!partner) throw new ErrorMessage('对方用户不存在。');
    let qb = PrivateMessage.createQueryBuilder('m')
      .where(
        '((m.sender_id = :myId AND m.receiver_id = :partnerId AND m.sender_deleted = 0)' +
        ' OR (m.sender_id = :partnerId AND m.receiver_id = :myId AND m.receiver_deleted = 0))',
        { myId: myId, partnerId: partnerId }
      )
      .orderBy('m.public_time', 'ASC');

    let messages = await qb.getMany();
    for (let m of messages) {
      m.is_self = (m.sender_id === myId);
      m.contentRendered = await syzoj.utils.markdown(m.content || '');
    }
    let unreadIds = messages.filter(m => !m.is_self && !m.is_read).map(m => m.id);
    if (unreadIds.length > 0) {
      await PrivateMessage.createQueryBuilder()
        .update()
        .set({ is_read: true })
        .where('id IN (:...ids)', { ids: unreadIds })
        .execute();
    }
    let canReply = await canSendTo(res.locals.user, partner);

    res.render('messages_conversation', {
      partner: partner,
      messages: messages,
      canReply: canReply.ok,
      cannotReplyReason: canReply.ok ? null : canReply.reason
    });
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});
app.post('/messages/with/:uid/send', async (req, res) => {
  try {
    if (!res.locals.user) {
      throw new ErrorMessage('请登录后继续。');
    }
    let myId = res.locals.user.id;
    let partnerId = parseInt(req.params.uid);
    let partner = await User.findById(partnerId);

    let check = await canSendTo(res.locals.user, partner);
    if (!check.ok) throw new ErrorMessage(check.reason);

    let content = (req.body.content || '').trim();
    if (!content) throw new ErrorMessage('消息内容不能为空。');
    if (content.length > 5000) throw new ErrorMessage('消息内容过长(最多 5000 字)。');

    let msg = await PrivateMessage.create({
      sender_id: myId,
      receiver_id: partnerId,
      content: content,
      public_time: parseInt((new Date()).getTime() / 1000),
      is_read: false,
      sender_deleted: false,
      receiver_deleted: false
    });
    await msg.save();

    res.redirect(syzoj.utils.makeUrl(['messages', 'with', partnerId]));
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});
app.get('/messages/new', async (req, res) => {
  try {
    if (!res.locals.user) {
      throw new ErrorMessage('请登录后继续。', { '登录': syzoj.utils.makeUrl(['login'], { 'url': req.originalUrl }) });
    }
    let prefill = (req.query.to || '').trim();

    res.render('messages_new', {
      prefill: prefill
    });
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});
app.post('/messages/new', async (req, res) => {
  try {
    if (!res.locals.user) throw new ErrorMessage('请登录后继续。');

    let to = (req.body.to || '').trim();
    if (!to) throw new ErrorMessage('请填写收件人。');
    let receiver = null;
    if (/^\d+$/.test(to)) {
      receiver = await User.findById(parseInt(to));
    }
    if (!receiver) {
      receiver = await User.findOne({ where: { username: to } });
    }
    if (!receiver) throw new ErrorMessage('找不到该用户。请检查 UID 或用户名是否正确。');

    let check = await canSendTo(res.locals.user, receiver);
    if (!check.ok) throw new ErrorMessage(check.reason);

    let content = (req.body.content || '').trim();
    if (!content) throw new ErrorMessage('消息内容不能为空。');
    if (content.length > 5000) throw new ErrorMessage('消息内容过长(最多 5000 字)。');

    let msg = await PrivateMessage.create({
      sender_id: res.locals.user.id,
      receiver_id: receiver.id,
      content: content,
      public_time: parseInt((new Date()).getTime() / 1000),
      is_read: false,
      sender_deleted: false,
      receiver_deleted: false
    });
    await msg.save();

    res.redirect(syzoj.utils.makeUrl(['messages', 'with', receiver.id]));
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});
app.get('/api/search-user', async (req, res) => {
  try {
    if (!res.locals.user) return res.json({ results: [] });
    let q = (req.query.q || '').trim();
    if (!q) return res.json({ results: [] });

    let users = [];
    if (/^\d+$/.test(q)) {
      let u = await User.findById(parseInt(q));
      if (u && u.id !== res.locals.user.id) users.push(u);
    }
    let qb = User.createQueryBuilder()
      .where('username LIKE :name', { name: `%${q}%` })
      .andWhere('id != :myId', { myId: res.locals.user.id })
      .limit(10);
    let byName = await qb.getMany();
    for (let u of byName) {
      if (!users.find(x => x.id === u.id)) users.push(u);
    }

    res.json({
      results: users.slice(0, 10).map(u => ({
        id: u.id,
        username: u.username
      }))
    });
  } catch (e) {
    syzoj.log(e);
    res.json({ results: [] });
  }
});
app.post('/messages/:mid/delete', async (req, res) => {
  try {
    if (!res.locals.user) throw new ErrorMessage('请登录后继续。');
    let myId = res.locals.user.id;
    let mid = parseInt(req.params.mid);
    let msg = await PrivateMessage.findById(mid);
    if (!msg) throw new ErrorMessage('无此消息。');

    if (msg.sender_id === myId) {
      msg.sender_deleted = true;
    } else if (msg.receiver_id === myId) {
      msg.receiver_deleted = true;
    } else {
      throw new ErrorMessage('您没有权限删除此消息。');
    }
    if (msg.sender_deleted && msg.receiver_deleted) {
      await msg.destroy();
    } else {
      await msg.save();
    }

    let partnerId = (msg.sender_id === myId) ? msg.receiver_id : msg.sender_id;
    res.redirect(syzoj.utils.makeUrl(['messages', 'with', partnerId]));
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});
app.post('/messages/with/:uid/delete-all', async (req, res) => {
  try {
    if (!res.locals.user) throw new ErrorMessage('请登录后继续。');
    let myId = res.locals.user.id;
    let partnerId = parseInt(req.params.uid);
    await PrivateMessage.createQueryBuilder()
      .update()
      .set({ sender_deleted: true })
      .where('sender_id = :myId AND receiver_id = :partnerId', { myId, partnerId })
      .execute();
    await PrivateMessage.createQueryBuilder()
      .update()
      .set({ receiver_deleted: true })
      .where('sender_id = :partnerId AND receiver_id = :myId', { myId, partnerId })
      .execute();

    res.redirect(syzoj.utils.makeUrl(['messages']));
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});
app.post('/messages/with/:uid/mark-read', async (req, res) => {
  try {
    if (!res.locals.user) throw new ErrorMessage('请登录后继续。');
    let myId = res.locals.user.id;
    let partnerId = parseInt(req.params.uid);

    await PrivateMessage.createQueryBuilder()
      .update()
      .set({ is_read: true })
      .where('sender_id = :partnerId AND receiver_id = :myId AND is_read = 0',
             { partnerId, myId })
      .execute();

    res.redirect(syzoj.utils.makeUrl(['messages', 'with', partnerId]));
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});
app.get('/api/messages/unread-count', async (req, res) => {
  try {
    if (!res.locals.user) return res.json({ count: 0 });
    let n = await countUnread(res.locals.user.id);
    res.set('Cache-Control', 'no-store');
    res.json({ count: n });
  } catch (e) {
    syzoj.log(e);
    res.json({ count: 0 });
  }
});
app.get('/messages/settings', async (req, res) => {
  try {
    if (!res.locals.user) {
      throw new ErrorMessage('请登录后继续。', { '登录': syzoj.utils.makeUrl(['login'], { 'url': req.originalUrl }) });
    }
    let s = await getOrCreateSetting(res.locals.user.id);
    res.render('messages_settings', {
      setting: s
    });
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});
app.post('/messages/settings', async (req, res) => {
  try {
    if (!res.locals.user) throw new ErrorMessage('请登录后继续。');
    let s = await getOrCreateSetting(res.locals.user.id);
    s.disable_messages = req.body.disable_messages === 'on' || req.body.disable_messages === 'true';
    s.update_time = parseInt((new Date()).getTime() / 1000);
    await s.save();
    res.redirect(syzoj.utils.makeUrl(['messages', 'settings']));
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});
