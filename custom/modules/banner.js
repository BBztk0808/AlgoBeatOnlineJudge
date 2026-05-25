let HomepageBanner = syzoj.model('homepage-banner');
let User = syzoj.model('user');
let fs = require('fs');
let path = require('path');
let crypto = require('crypto');

const BANNER_UPLOAD_DIR = '/app/static/self/banner';
const MAX_BANNER_SIZE = 5 * 1024 * 1024;  // 5MB
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

try { fs.mkdirSync(BANNER_UPLOAD_DIR, { recursive: true }); } catch (e) {}
function sanitizeLinkUrl(url) {
  if (!url) return null;
  url = url.trim();
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/')) {
    return url.substring(0, 500);
  }
  return null;
}
app.get('/api/active-banners', async (req, res) => {
  try {
    let conn = require('typeorm').getConnection();
    let now = Math.floor(Date.now() / 1000);
    let rows = await conn.query(
      `SELECT id, title, image_path, link_url, sort_order
       FROM homepage_banner
       WHERE is_active = 1
         AND (start_time IS NULL OR start_time <= ?)
         AND (end_time IS NULL OR end_time >= ?)
       ORDER BY sort_order DESC, id DESC
       LIMIT 20`, [now, now]
    );
    res.json({ banners: rows });
  } catch (e) {
    syzoj.log('[banner] api failed: ' + e.message);
    res.json({ banners: [] });
  }
});
app.get('/admin/banners', async (req, res) => {
  try {
    syzoj.authz.require(res.locals.user, 'manage_banner', '您没有权限。');
    let banners = await HomepageBanner.queryAll(HomepageBanner.createQueryBuilder()
      .orderBy('sort_order', 'DESC')
      .addOrderBy('id', 'DESC'));
    for (let b of banners) {
      if (b.created_by) b.creator = await User.findById(b.created_by);
    }
    res.render('admin_banners', { banners: banners });
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});
app.post('/admin/banner/new', app.multer.single('image'), async (req, res) => {
  try {
    syzoj.authz.require(res.locals.user, 'manage_banner', '您没有权限。');
    if (!req.file) throw new ErrorMessage('请上传图片文件。');
    if (req.file.size > MAX_BANNER_SIZE) throw new ErrorMessage('图片不能超过 5MB。');
    if (!ALLOWED_MIME.includes(req.file.mimetype)) {
      throw new ErrorMessage('仅支持 JPG / PNG / WebP / GIF 格式。');
    }

    let title = (req.body.title || '').trim().substring(0, 100);
    if (!title) title = '未命名 Banner';
    let linkUrl = sanitizeLinkUrl(req.body.link_url);
    let sortOrder = parseInt(req.body.sort_order || 0) || 0;
    let ext = path.extname(req.file.originalname).toLowerCase() || '.jpg';
    if (!['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) ext = '.jpg';
    let filename = crypto.randomBytes(16).toString('hex') + ext;
    let targetPath = path.join(BANNER_UPLOAD_DIR, filename);
    fs.copyFileSync(req.file.path, targetPath);
    try { fs.unlinkSync(req.file.path); } catch (e) {}

    let banner = await HomepageBanner.create();
    banner.title = title;
    banner.image_path = '/self/banner/' + filename;
    banner.link_url = linkUrl;
    banner.sort_order = sortOrder;
    banner.is_active = 1;
    banner.created_by = res.locals.user.id;
    banner.created_at = Math.floor(Date.now() / 1000);
    await banner.save();
    await syzoj.audit.log(req, 'banner.create', 'homepage_banner', banner.id, {
      title: banner.title,
      link_url: banner.link_url,
      sort_order: banner.sort_order
    });

    res.redirect(syzoj.utils.makeUrl(['admin', 'banners']));
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});
app.post('/admin/banner/:id/edit', async (req, res) => {
  try {
    syzoj.authz.require(res.locals.user, 'manage_banner', '您没有权限。');
    let id = parseInt(req.params.id);
    let banner = await HomepageBanner.findById(id);
    if (!banner) throw new ErrorMessage('Banner 不存在。');

    let title = (req.body.title || '').trim().substring(0, 100);
    if (title) banner.title = title;
    let linkUrl = sanitizeLinkUrl(req.body.link_url);
    banner.link_url = linkUrl;  // null 也允许(清空跳转)
    banner.sort_order = parseInt(req.body.sort_order || 0) || 0;
    banner.is_active = (req.body.is_active === 'on' || req.body.is_active === 'true' || req.body.is_active === '1') ? 1 : 0;
    await banner.save();
    await syzoj.audit.log(req, 'banner.update', 'homepage_banner', banner.id, {
      title: banner.title,
      link_url: banner.link_url,
      sort_order: banner.sort_order,
      is_active: banner.is_active
    });

    res.redirect(syzoj.utils.makeUrl(['admin', 'banners']));
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});
app.post('/admin/banner/:id/delete', async (req, res) => {
  try {
    syzoj.authz.require(res.locals.user, 'manage_banner', '您没有权限。');
    let id = parseInt(req.params.id);
    let banner = await HomepageBanner.findById(id);
    if (!banner) throw new ErrorMessage('Banner 不存在。');

    let title = banner.title;
    if (banner.image_path && banner.image_path.startsWith('/self/banner/')) {
      let fileName = banner.image_path.replace('/self/banner/', '');
      let filePath = path.join(BANNER_UPLOAD_DIR, fileName);
      try { fs.unlinkSync(filePath); } catch (e) { syzoj.log('[banner] delete file failed: ' + e.message); }
    }

    await banner.destroy();
    await syzoj.audit.log(req, 'banner.delete', 'homepage_banner', id, { title: title });
    res.redirect(syzoj.utils.makeUrl(['admin', 'banners']));
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});
