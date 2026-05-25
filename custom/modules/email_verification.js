let EmailVerificationToken = syzoj.model('email-verification-token');
let UserEmailStatus = syzoj.model('user-email-status');
let User = syzoj.model('user');
let nodemailer = require('/app/custom-node-modules/nodemailer');

const TOKEN_TTL_HOURS = 24;
const RESEND_COOLDOWN_SEC = 60; // 60 秒内不能重发
function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SYZOJ_WEB_SMTP_HOST || 'smtp.zoho.com.cn',
    port: parseInt(process.env.SYZOJ_WEB_SMTP_PORT || '465'),
    secure: parseInt(process.env.SYZOJ_WEB_SMTP_PORT || '465') === 465,
    auth: {
      user: process.env.SYZOJ_WEB_SMTP_USER,
      pass: process.env.SYZOJ_WEB_SMTP_PASS
    }
  });
}
function genToken() {
  let crypto = require('crypto');
  return crypto.randomBytes(32).toString('hex');
}

function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function makeAbsoluteUrl(req, path) {
  let publicBaseUrl = (process.env.SYZOJ_WEB_PUBLIC_BASE_URL || '').trim();
  if (publicBaseUrl) {
    return publicBaseUrl.replace(/\/+$/, '') + path;
  }
  let proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  let host = req.headers['x-forwarded-host'] || req.get('host');
  return proto + '://' + host + path;
}
async function sendVerificationEmail(req, user, email, token) {
  let transporter = createTransporter();
  let verifyUrl = makeAbsoluteUrl(req, '/email/verify/' + token);
  let verifyUrlHtml = escapeHtml(verifyUrl);
  let usernameHtml = escapeHtml(user.username);
  let fromName = process.env.SYZOJ_WEB_SMTP_FROM_NAME || 'AlgoBeat Online Judge';
  let fromAddr = process.env.SYZOJ_WEB_SMTP_USER;

  let html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 30px;">
      <h2 style="color: #2185d0;">邮箱验证</h2>
      <p>你好 <b>${usernameHtml}</b>，</p>
      <p>感谢你注册 AlgoBeat Online Judge！请点击下方按钮完成邮箱验证：</p>
      <p style="text-align: center; margin: 30px 0;">
        <a href="${verifyUrlHtml}" style="display: inline-block; padding: 12px 28px; background: #2185d0; color: #fff; text-decoration: none; border-radius: 4px; font-weight: bold;">
          验证邮箱
        </a>
      </p>
      <p style="color: #888; font-size: 0.9em;">如果按钮无法点击，请复制以下链接到浏览器访问：<br>
      <code style="word-break: break-all;">${verifyUrlHtml}</code></p>
      <p style="color: #888; font-size: 0.9em;">此链接将于 <b>${TOKEN_TTL_HOURS} 小时</b>后过期。</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
      <p style="color: #999; font-size: 0.85em;">如果不是你本人操作，请忽略本邮件。</p>
    </div>
  `;

  await transporter.sendMail({
    from: '"' + fromName + '" <' + fromAddr + '>',
    to: email,
    subject: '【AlgoBeat OJ】请验证你的邮箱',
    html: html
  });
}
async function getOrCreateStatus(userId) {
  let s = await UserEmailStatus.findOne({ where: { user_id: userId } });
  if (!s) {
    s = await UserEmailStatus.create();
    s.user_id = userId;
    s.is_email_verified = false;
  }
  return s;
}
app.post('/email/send-verification', async (req, res) => {
  try {
    if (!res.locals.user) throw new ErrorMessage('请登录后继续。');

    let user = res.locals.user;
    let status = await getOrCreateStatus(user.id);

    if (status.is_email_verified) {
      throw new ErrorMessage('您的邮箱已验证。');
    }

    let now = parseInt((new Date()).getTime() / 1000);
    if (status.last_send_at && now - status.last_send_at < RESEND_COOLDOWN_SEC) {
      let remaining = RESEND_COOLDOWN_SEC - (now - status.last_send_at);
      throw new ErrorMessage('请求过于频繁,请 ' + remaining + ' 秒后重试。');
    }

    if (!user.email) {
      throw new ErrorMessage('您的账号没有邮箱地址,请先完善个人资料。');
    }
    let token = genToken();
    let record = await EmailVerificationToken.create();
    record.token = token;
    record.user_id = user.id;
    record.email = user.email;
    record.purpose = 'register';
    record.created_at = now;
    record.expires_at = now + TOKEN_TTL_HOURS * 3600;
    record.used = false;
    await record.save();
    try {
      await sendVerificationEmail(req, user, user.email, token);
    } catch (mailErr) {
      syzoj.log(mailErr);
      throw new ErrorMessage('邮件发送失败:' + (mailErr.message || mailErr));
    }
    status.last_send_at = now;
    await status.save();

    res.render('email_verify_pending', {
      email: user.email
    });
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});
app.get('/email/verify/:token', async (req, res) => {
  try {
    let tokenStr = String(req.params.token || '').trim();
    if (!tokenStr) throw new ErrorMessage('无效的验证链接。');

    let record = await EmailVerificationToken.findOne({ where: { token: tokenStr } });
    if (!record) {
      return res.render('email_verify_result', {
        success: false,
        message: '此验证链接无效或已被使用。'
      });
    }

    let now = parseInt((new Date()).getTime() / 1000);

    if (record.used) {
      return res.render('email_verify_result', {
        success: false,
        message: '此验证链接已被使用。'
      });
    }
    if (now > record.expires_at) {
      return res.render('email_verify_result', {
        success: false,
        message: '验证链接已过期,请回到页面重新发送验证邮件。'
      });
    }
    record.used = true;
    await record.save();
    let status = await getOrCreateStatus(record.user_id);
    status.is_email_verified = true;
    status.verified_at = now;
    await status.save();
    if (syzoj.utils.refreshVerifiedCache) await syzoj.utils.refreshVerifiedCache();

    res.render('email_verify_result', {
      success: true,
      message: '邮箱验证成功!欢迎使用 AlgoBeat Online Judge。'
    });
  } catch (e) {
    syzoj.log(e);
    res.render('email_verify_result', {
      success: false,
      message: '验证过程发生错误:' + (e.message || String(e))
    });
  }
});
syzoj.utils.isEmailVerified = async function(userId) {
  if (!userId) return false;
  let status = await UserEmailStatus.findOne({ where: { user_id: userId } });
  return !!(status && status.is_email_verified);
};
