
function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, function(c) {
    return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
  });
}

function tierFromHit(hit) {
  if (hit >= 350) return 'red';
  if (hit >= 280) return 'orange';
  if (hit >= 200) return 'green';
  if (hit >= 100) return 'blue';
  return 'gray';
}
function calcTier(user) {
  if (!user) return 'default';
  if (user.is_admin) return 'admin';
  if (syzoj.adminUserIds && syzoj.adminUserIds.has(user.id)) return 'admin';
  if (syzoj.cheaterUserIds && syzoj.cheaterUserIds.has(user.id)) return 'cheater';
  if (syzoj.userHitScores && syzoj.userHitScores.has(user.id)) {
    let s = syzoj.userHitScores.get(user.id);
    return tierFromHit(s.total || 0);
  }
  return 'default';
}
function renderTagHtml(user, tier) {
  if (!user) return '';
  if (tier === 'cheater') {
    return ' <span class="user-name-tag tag-tier-cheater">作弊者</span>';
  }

  if (!syzoj.userTags || !syzoj.userTags.has(user.id)) return '';
  let t = syzoj.userTags.get(user.id);
  if (!t || !t.text) return '';
  return ' <span class="user-name-tag tag-tier-' + (t.tier || 'default') +
    '">' + escapeHtml(t.text) + '</span>';
}

syzoj.utils.renderUsername = function(user, options) {
  options = options || {};

  if (!user) {
    return '<span class="username-tier-unknown">(未知用户)</span>';
  }

  let tier = calcTier(user);
  let url = '/user/' + user.id;
  let username = escapeHtml(user.username || '');
  let nameplate = user.nameplate || '';
  let tagHtml = options.noTag ? '' : renderTagHtml(user, tier);

  if (options.noLink) {
    return '<span class="username-tier-' + tier + '">' + username + '</span>' + tagHtml + nameplate;
  }

  return '<a href="' + url + '" class="username-tier-' + tier + '">' +
         username + '</a>' + tagHtml + nameplate;
};
syzoj.utils.calcUserTier = calcTier;

syzoj.utils.plainUsername = function(user) {
  if (!user) return '(未知用户)';
  return user.username || '';
};