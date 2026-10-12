/**
 * Xác thực & phân quyền.
 *
 * Cách 1 (khuyến nghị): Web App triển khai "Execute as: Me" + "Who has access:
 * Anyone within kdi.edu.vn" → Google tự đăng nhập bằng tài khoản Workspace
 * @kdi.edu.vn, script đọc email qua Session.getActiveUser().
 *
 * Cách 2 (dự phòng): nếu không đọc được email (vd. triển khai cho "Anyone"),
 * người dùng nhập email @kdi.edu.vn → nhận mã 6 số qua email → nhận phiên đăng nhập.
 */

var OTP_TTL_SEC = 600;
var SESSION_TTL_SEC = 21600; // 6 giờ – giới hạn tối đa của CacheService

function hasPerm(user, perm) {
  if (!user || !user.role) return false;
  var roles = PERMISSIONS[perm];
  return !!roles && roles.indexOf(user.role) >= 0;
}

function permsOf_(role) {
  return Object.keys(PERMISSIONS).filter(function (p) { return PERMISSIONS[p].indexOf(role) >= 0; });
}

function activeGoogleEmail_() {
  var email = '';
  try { email = Session.getActiveUser().getEmail(); } catch (e) { email = ''; }
  return normEmail(email);
}

function hash_(s) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ((b + 256) % 256).toString(16); }).map(function (h) { return h.length < 2 ? '0' + h : h; }).join('');
}

function secret_() {
  var props = PropertiesService.getScriptProperties();
  var s = props.getProperty('AUTH_SECRET');
  if (!s) {
    s = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('AUTH_SECRET', s);
  }
  return s;
}

/** Xác định người dùng hiện tại. Trả về { status, ...thông tin } */
function resolveUser_(token) {
  var email = activeGoogleEmail_();
  var via = 'google';
  if (!email && token) {
    var cached = CacheService.getScriptCache().get('sess_' + hash_(String(token)));
    if (cached) { email = normEmail(cached); via = 'otp'; }
  }
  if (!email) return { status: 'anonymous' };
  if (!isAllowedEmail(email)) return { status: 'forbidden', email: email };

  var user = Db.findByKey('users', email);
  if (!user) user = createUserOnFirstLogin_(email);
  if (!toBool(user.active, true)) return { status: 'disabled', email: email };

  var role = isSuperAdmin(email) ? 'admin' : (ROLES[user.role] ? user.role : 'pending');
  touchLastLogin_(user);
  var teacher = findTeacherByEmail_(email);
  return {
    status: role === 'pending' ? 'pending' : 'ok',
    email: email,
    name: user.name || (teacher ? teacher.name : email.split('@')[0]),
    role: role,
    roleLabel: ROLES[role],
    isSuperAdmin: isSuperAdmin(email),
    teacherCode: teacher ? str(teacher.code).toUpperCase() : '',
    via: via,
    perms: permsOf_(role),
  };
}

/** GV hoặc trợ giảng có email này (để tự nhận diện "Lịch của tôi"). */
function findTeacherByEmail_(email) {
  var tables = ['teachers', 'assistants'];
  for (var k = 0; k < tables.length; k++) {
    var rows = Db.read(tables[k]);
    for (var i = 0; i < rows.length; i++) {
      if (normEmail(rows[i].email) === email) return rows[i];
    }
  }
  return null;
}

function createUserOnFirstLogin_(email) {
  return withLock_(function () {
    var existing = Db.findByKey('users', email);
    if (existing) return existing;
    var role;
    if (isSuperAdmin(email)) role = 'admin';
    else if (findTeacherByEmail_(email)) role = 'teacher';
    else role = getSettings_().new_user_role || 'viewer';
    var teacher = findTeacherByEmail_(email);
    var user = { email: email, name: teacher ? teacher.name : '', role: role, active: true, addedBy: 'Tự đăng ký', createdAt: nowString(), lastLogin: nowString() };
    Db.append('users', [user]);
    audit_(email, 'Tài khoản mới', 'NguoiDung', 'Vai trò: ' + ROLES[role]);
    return Db.findByKey('users', email) || user;
  });
}

function touchLastLogin_(user) {
  var cache = CacheService.getScriptCache();
  var key = 'seen_' + hash_(user.email);
  if (cache.get(key)) return;
  cache.put(key, '1', 3600);
  try {
    withLock_(function () {
      var u = Db.findByKey('users', normEmail(user.email));
      if (u) Db.update('users', [{ _row: u._row, lastLogin: nowString() }]);
    });
  } catch (e) {
    // Không quan trọng – bỏ qua nếu đang bận.
  }
}

/* --------------------------- Đăng nhập bằng mã OTP --------------------------- */

function requestLoginCode_(email) {
  email = normEmail(email);
  if (!isAllowedEmail(email)) throw new Error('Chỉ chấp nhận email nội bộ @' + APP.ALLOWED_DOMAINS.join(', @'));
  var cache = CacheService.getScriptCache();
  var rlKey = 'otp_rl_' + hash_(email);
  if (cache.get(rlKey)) throw new Error('Vui lòng đợi 60 giây trước khi yêu cầu mã mới.');
  var code = String(Math.floor(100000 + Math.random() * 900000));
  cache.put('otp_' + hash_(email), JSON.stringify({ h: hash_(code + secret_()), n: 0 }), OTP_TTL_SEC);
  cache.put(rlKey, '1', 60);
  MailApp.sendEmail({
    to: email,
    subject: '[KDI Scheduler] Mã đăng nhập: ' + code,
    htmlBody: '<p>Xin chào,</p><p>Mã đăng nhập hệ thống xếp lịch KDI của bạn là: <b style="font-size:20px">' + code +
      '</b></p><p>Mã có hiệu lực trong 10 phút. Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>',
  });
  var res = { sent: true, email: email };
  if (PropertiesService.getScriptProperties().getProperty('DEV_SHOW_OTP') === 'true') res.devCode = code;
  return res;
}

function verifyLoginCode_(email, code) {
  email = normEmail(email);
  if (!isAllowedEmail(email)) throw new Error('Email không hợp lệ.');
  var cache = CacheService.getScriptCache();
  var key = 'otp_' + hash_(email);
  var raw = cache.get(key);
  if (!raw) throw new Error('Mã đã hết hạn hoặc chưa được gửi. Vui lòng yêu cầu mã mới.');
  var data = JSON.parse(raw);
  if (data.n >= 5) {
    cache.remove(key);
    throw new Error('Nhập sai quá 5 lần. Vui lòng yêu cầu mã mới.');
  }
  if (hash_(String(code).trim() + secret_()) !== data.h) {
    data.n++;
    cache.put(key, JSON.stringify(data), OTP_TTL_SEC);
    throw new Error('Mã không đúng.');
  }
  cache.remove(key);
  var token = Utilities.getUuid() + '-' + Utilities.getUuid();
  cache.put('sess_' + hash_(token), email, SESSION_TTL_SEC);
  return { token: token };
}

function logout_(token) {
  if (token) CacheService.getScriptCache().remove('sess_' + hash_(String(token)));
  return { ok: true };
}

/* ----------------------------- Quản lý người dùng ----------------------------- */

function listUsers_() {
  return Db.read('users').map(function (u) {
    return {
      email: normEmail(u.email), name: u.name, role: isSuperAdmin(u.email) ? 'admin' : u.role,
      roleLabel: ROLES[isSuperAdmin(u.email) ? 'admin' : u.role] || u.role,
      active: toBool(u.active, true), addedBy: u.addedBy, createdAt: u.createdAt, lastLogin: u.lastLogin,
      isSuperAdmin: isSuperAdmin(u.email),
    };
  }).sort(function (a, b) { return a.email < b.email ? -1 : 1; });
}

/**
 * Thêm/sửa người dùng. Quy tắc:
 *  - Chỉ email @kdi.edu.vn.
 *  - Chỉ super admin (hien.le@kdi.edu.vn) được cấp hoặc thu hồi quyền admin.
 *  - Không ai được đổi vai trò/khóa tài khoản super admin.
 */
function saveUser_(actor, input) {
  var email = normEmail(input.email);
  if (!isAllowedEmail(email)) throw new Error('Chỉ thêm được email nội bộ @' + APP.ALLOWED_DOMAINS.join(', @'));
  var role = String(input.role || 'viewer');
  if (!ROLES[role]) throw new Error('Vai trò không hợp lệ.');
  return withLock_(function () {
    var existing = Db.findByKey('users', email);
    if (isSuperAdmin(email)) {
      if (role !== 'admin' || input.active === false) throw new Error('Không thể thay đổi vai trò hoặc khóa tài khoản quản trị gốc.');
    }
    var touchesAdmin = role === 'admin' || (existing && existing.role === 'admin');
    if (touchesAdmin && !actor.isSuperAdmin) {
      throw new Error('Chỉ quản trị gốc (' + APP.SUPER_ADMIN + ') mới được cấp/thu hồi quyền Admin.');
    }
    var active = input.active === undefined ? true : !!input.active;
    if (existing) {
      Db.update('users', [{ _row: existing._row, name: str(input.name) || existing.name, role: role, active: active }]);
      audit_(actor, 'Cập nhật người dùng', email, 'Vai trò: ' + ROLES[role] + (active ? '' : ' (khóa)'));
    } else {
      Db.append('users', [{ email: email, name: str(input.name), role: role, active: active, addedBy: actor.email, createdAt: nowString(), lastLogin: '' }]);
      audit_(actor, 'Thêm người dùng', email, 'Vai trò: ' + ROLES[role]);
    }
    return listUsers_();
  });
}

function deleteUser_(actor, email) {
  email = normEmail(email);
  if (isSuperAdmin(email)) throw new Error('Không thể xóa tài khoản quản trị gốc.');
  if (email === actor.email) throw new Error('Không thể tự xóa tài khoản của mình.');
  return withLock_(function () {
    var u = Db.findByKey('users', email);
    if (!u) throw new Error('Không tìm thấy người dùng.');
    if (u.role === 'admin' && !actor.isSuperAdmin) throw new Error('Chỉ quản trị gốc mới được xóa Admin.');
    Db.remove('users', [u._row]);
    audit_(actor, 'Xóa người dùng', email, '');
    return listUsers_();
  });
}
