let UserPrivilege = syzoj.model('user_privilege');
let ProblemSolution = syzoj.model('problem-solution');
let PrivateMessage = syzoj.model('private-message');
let UserEmailStatus = syzoj.model('user-email-status');

app.use(async (req, res, next) => {
  try {
    if (res.locals.user && !res.locals.user.privileges) {
      let records = await UserPrivilege.find({ where: { user_id: res.locals.user.id } });
      res.locals.user.privileges = records.map(r => r.privilege);
    }
  } catch (e) {
    if (res.locals.user) res.locals.user.privileges = [];
  }

  try {
    res.locals.pendingSolutionsCount = 0;
    let user = res.locals.user;
    if (user) {
      let canReview = syzoj.authz && syzoj.authz.has(user, 'manage_solution');
      if (canReview) {
        res.locals.pendingSolutionsCount = await ProblemSolution.count({ status: 'pending' });
      }
    }
  } catch (e) {
    res.locals.pendingSolutionsCount = 0;
  }

  try {
    res.locals.unreadMessagesCount = 0;
    if (res.locals.user) {
      res.locals.unreadMessagesCount = await PrivateMessage.count({
        receiver_id: res.locals.user.id,
        is_read: false,
        receiver_deleted: false
      });
    }
  } catch (e) {
    res.locals.unreadMessagesCount = 0;
  }
  try {
    res.locals.unreadNotificationsCount = 0;
    if (res.locals.user && syzoj.utils.countUnreadNotifications) {
      res.locals.unreadNotificationsCount = await syzoj.utils.countUnreadNotifications(res.locals.user.id);
    }
  } catch (e) {
    res.locals.unreadNotificationsCount = 0;
  }

  try {
    if (res.locals.user) {
      let status = await UserEmailStatus.findOne({ where: { user_id: res.locals.user.id } });
      res.locals.user.is_email_verified = !!(status && status.is_email_verified);
    }
  } catch (e) {
    if (res.locals.user) res.locals.user.is_email_verified = false;
  }

  next();
});
