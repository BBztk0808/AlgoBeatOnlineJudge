
app.use(async (req, res, next) => {
  try {
    let m = req.path.match(/^\/user\/(\d+)(\/.*)?$/);
    if (m) {
      let targetId = parseInt(m[1]);
      if (targetId && syzoj.utils.countFollowing && syzoj.utils.countFollowers) {
        res.locals.followStats = {
          following: await syzoj.utils.countFollowing(targetId),
          followers: await syzoj.utils.countFollowers(targetId)
        };
        if (res.locals.user && syzoj.utils.getFollowRelation) {
          res.locals.followRelation = await syzoj.utils.getFollowRelation(res.locals.user.id, targetId);
        } else {
          res.locals.followRelation = { iFollow: false, theyFollow: false, mutual: false };
        }
      }
    }
  } catch (e) {
    syzoj.log('[user-follow-loader] ' + e.message);
  }
  next();
});

