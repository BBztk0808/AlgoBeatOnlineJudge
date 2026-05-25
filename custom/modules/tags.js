let ProblemTag = syzoj.model('problem_tag');
let ProblemTagMap = syzoj.model('problem_tag_map');
app.get('/tags', async (req, res) => {
  try {
    let tags = await ProblemTag.find({});
    for (let tag of tags) {
      tag.problemCount = await ProblemTagMap.count({ tag_id: tag.id });
    }
    tags.sort((a, b) => {
      if (a.color !== b.color) {
        return (a.color || '') > (b.color || '') ? 1 : -1;
      }
      return (a.name || '') > (b.name || '') ? 1 : -1;
    });

    res.render('tags', {
      tags: tags
    });
  } catch (e) {
    syzoj.log(e);
    res.render('error', {
      err: e
    });
  }
});
