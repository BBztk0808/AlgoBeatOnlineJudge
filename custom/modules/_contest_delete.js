let Contest = syzoj.model('contest');
let ContestPlayer = syzoj.model('contest_player');
let ContestRanklist = syzoj.model('contest_ranklist');
async function canDeleteContest(user, contest) {
  if (!user) return false;
  if (contest.holder_id === user.id) return true;
  return syzoj.authz && syzoj.authz.has(user, 'delete_contest');
}

app.post('/contest/:id/delete', async (req, res) => {
  try {
    if (!res.locals.user) throw new ErrorMessage('请登录后继续。');

    let id = parseInt(req.params.id);
    let contest = await Contest.findById(id);
    if (!contest) throw new ErrorMessage('无此比赛。');

    if (!await canDeleteContest(res.locals.user, contest)) {
      throw new ErrorMessage('您没有权限删除此比赛。');
    }
    try {
      await ContestPlayer.createQueryBuilder()
        .delete()
        .where('contest_id = :id', { id: id })
        .execute();
    } catch (e) {
      syzoj.log('[contest-delete] Failed to clean contest_player: ' + e.message);
    }
    if (contest.ranklist_id) {
      try {
        let ranklist = await ContestRanklist.findById(contest.ranklist_id);
        if (ranklist) await ranklist.destroy();
      } catch (e) {
        syzoj.log('[contest-delete] Failed to delete ranklist: ' + e.message);
      }
    }
    await contest.destroy();

    res.redirect(syzoj.utils.makeUrl(['contests']));
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});
