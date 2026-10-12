/**
 * Nhập dữ liệu hàng loạt từ file Excel mẫu (giao diện đọc file .xlsx trên trình duyệt,
 * gửi từng bảng lên đây). Mọi dòng được kiểm tra trước khi ghi; có lỗi thì không ghi
 * gì (trừ khi người dùng chọn "bỏ qua dòng lỗi").
 */

/** Thứ tự nhập quan trọng: môn → trường → GV → liên kết → lịch bận → TKB → tài khoản. */
var IMPORT_TABLES = {
  subjects: { perm: 'edit_teachers' },
  schools: { perm: 'edit_schools' },
  teachers: { perm: 'edit_teachers' },
  links: { perm: 'edit_teachers' },
  unavailability: { perm: 'edit_teachers' },
  lessons: { perm: 'edit_timetable' },
  users: { perm: 'manage_users' },
};
var IMPORT_ORDER = ['subjects', 'schools', 'teachers', 'links', 'unavailability', 'lessons', 'users'];
var IMPORT_SKIP_COLUMNS = {
  lessons: ['source', 'explain', 'updatedAt', 'updatedBy'],
  users: ['addedBy', 'createdAt', 'lastLogin'],
  unavailability: ['id'],
};
var USER_ROLE_OPTIONS = ['Admin', 'AC', 'Sale', 'Xem lịch', 'Giáo viên', 'Chờ duyệt'];
var MAX_IMPORT_ROWS = 5000;

function importColumns_(table) {
  var skip = IMPORT_SKIP_COLUMNS[table] || [];
  return TABLES[table].columns.filter(function (c) { return skip.indexOf(c.key) < 0; }).map(function (c) {
    var col = { key: c.key, header: c.header, type: c.type || 'text', required: !!c.required, options: c.options || null };
    if (table === 'users' && c.key === 'role') col.options = USER_ROLE_OPTIONS;
    if (table === 'lessons' && c.key === 'id') col.hint = 'Để trống khi thêm tiết mới; giữ ID để cập nhật tiết đã có';
    col.hint = col.hint || columnHint_(col);
    return col;
  });
}

function columnHint_(c) {
  switch (c.type) {
    case 'weekday': return 'Thứ 2, Thứ 3, …, Thứ 7, Chủ nhật';
    case 'time': return 'Giờ:phút, vd. 07:30';
    case 'bool': return 'TRUE (có) / FALSE (không)';
    case 'subjects': return 'Mã môn, nhiều môn cách nhau dấu phẩy (vd. RB, SCR)';
    case 'teacher': return 'Mã GV có trong sheet GiaoVien';
    case 'school': return 'Mã trường có trong sheet TruongHoc';
    case 'subject': return 'Mã môn hoặc tên môn trong sheet MonHoc';
    case 'number': return 'Số (dùng dấu chấm hoặc phẩy cho phần thập phân)';
    case 'color': return 'Mã màu, vd. #e8590c';
    case 'phone': return 'Số điện thoại';
    default: return c.options ? 'Chọn: ' + c.options.join(' / ') : '';
  }
}

/** Mô tả các bảng người dùng được phép nhập + dòng ví dụ (dùng để tạo file mẫu). */
function importSpec_(args, user) {
  var demo = buildDemoData(20260901);
  var examples = {
    subjects: demo.subjects.slice(0, 3),
    schools: demo.schools.slice(0, 2),
    teachers: demo.teachers.slice(0, 2),
    links: [demo.links[0], demo.links.filter(function (l) { return l.preference === 'Không xếp'; })[0]],
    unavailability: demo.unavailability.slice(0, 2),
    lessons: demo.lessons.slice(0, 3).map(function (l) { return Object.assign({}, l, { id: '' }); }),
    users: [
      { email: 'ten.ac@kdi.edu.vn', name: 'Nguyễn Văn A', role: 'AC', active: true },
      { email: 'ten.sale@kdi.edu.vn', name: 'Trần Thị B', role: 'Sale', active: true },
    ],
  };
  return IMPORT_ORDER.filter(function (t) { return hasPerm(user, IMPORT_TABLES[t].perm); }).map(function (t) {
    var cols = importColumns_(t);
    return {
      table: t, sheet: TABLES[t].sheet, label: TABLES[t].label, columns: cols,
      examples: examples[t].map(function (r) {
        return cols.map(function (c) {
          var v = r[c.key];
          if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
          return v === undefined || v === null ? '' : String(v);
        });
      }),
      canReplace: t !== 'users',
    };
  });
}

/**
 * args: { table, rows: [{key: value, _line}], mode: 'upsert' | 'replace', dryRun, skipErrors }
 *   - upsert: thêm mới + cập nhật bản ghi trùng mã (cột không có trong file được giữ nguyên)
 *   - replace: xóa dữ liệu cũ của bảng (TKB: chỉ của các trường có trong file) rồi nhập mới
 */
function importData_(args, user) {
  var table = String(args.table || '');
  var conf = IMPORT_TABLES[table];
  if (!conf) throw userError_('Bảng không hợp lệ: ' + table);
  if (!hasPerm(user, conf.perm)) throw userError_('Bạn không có quyền nhập dữ liệu "' + TABLES[table].label + '".', 'FORBIDDEN');
  var rows = args.rows || [];
  if (!rows.length) throw userError_('Sheet "' + TABLES[table].sheet + '" không có dòng dữ liệu nào.');
  if (rows.length > MAX_IMPORT_ROWS) throw userError_('Tối đa ' + MAX_IMPORT_ROWS + ' dòng mỗi bảng.');
  var mode = args.mode === 'replace' ? 'replace' : 'upsert';
  if (table === 'users' && mode === 'replace') throw userError_('Tài khoản chỉ hỗ trợ thêm mới / cập nhật.');
  return withLock_(function () {
    var res;
    if (table === 'lessons') res = importLessons_(rows, mode, args, user);
    else if (table === 'users') res = importUsers_(rows, args, user);
    else res = importGeneric_(table, rows, mode, args, user);
    res.table = table;
    res.label = TABLES[table].label;
    res.total = rows.length;
    res.mode = mode;
    if (res.written) {
      audit_(user, 'Nhập dữ liệu từ Excel', TABLES[table].sheet,
        (mode === 'replace' ? 'Thay thế' : 'Thêm/cập nhật') + ': thêm ' + res.inserted + ', cập nhật ' + res.updated +
        (res.removed ? ', xóa ' + res.removed : '') + (res.errors.length ? ', bỏ qua ' + res.errors.length + ' dòng lỗi' : ''));
    }
    return res;
  });
}

function lineOf_(raw, i) {
  return raw && raw._line ? raw._line : i + 2;
}

function shouldWrite_(args, errors) {
  return !args.dryRun && (!errors.length || args.skipErrors);
}

function importGeneric_(table, rows, mode, args, user) {
  var refs = refSets_();
  var current = Db.read(table);
  var existing = {};
  if (mode === 'upsert') current.forEach(function (r) { existing[Db.keyOf(table, r)] = r; });
  var seen = {};
  var errors = [];
  var inserts = [];
  var updates = [];
  rows.forEach(function (raw, i) {
    var line = lineOf_(raw, i);
    try {
      var rec = normalizeRecord_(table, raw);
      TABLES[table].columns.forEach(function (c) {
        if (c.required && !c.auto && !(c.key in rec)) throw userError_('Thiếu cột bắt buộc: ' + c.header);
      });
      validateRefs_(table, rec, refs);
      if (table !== 'unavailability') {
        var key = Db.keyOf(table, rec);
        if (seen[key]) throw userError_('Trùng mã "' + key + '" với dòng ' + seen[key]);
        seen[key] = line;
        if (existing[key]) {
          rec._row = existing[key]._row;
          updates.push(rec);
          return;
        }
      }
      TABLES[table].columns.forEach(function (c) {
        if (!(c.key in rec) && c.def !== undefined) rec[c.key] = c.def;
      });
      inserts.push(rec);
    } catch (e) {
      errors.push('Dòng ' + line + ': ' + e.message);
    }
  });
  var res = { inserted: inserts.length, updated: updates.length, removed: mode === 'replace' ? current.length : 0, errors: errors, written: false };
  if (!shouldWrite_(args, errors)) return res;
  if (table === 'unavailability' && inserts.length) {
    var ids = nextIds_('unavailability', 'LB', inserts.length);
    inserts.forEach(function (r, k) { r.id = ids[k]; });
  }
  if (mode === 'replace') {
    Db.replaceAll(table, inserts);
  } else {
    Db.update(table, updates);
    Db.append(table, inserts);
  }
  res.written = true;
  return res;
}

function importLessons_(rows, mode, args, user) {
  var ctx = context_();
  var canAssign = hasPerm(user, 'assign');
  var errors = [];
  var inserts = [];
  var updates = [];
  var schoolsInFile = {};
  var now = nowString();
  rows.forEach(function (raw, i) {
    var line = lineOf_(raw, i);
    try {
      var norm = normalizeLessonInput_(ctx, raw);
      if (norm.error) throw userError_(norm.error);
      var o = norm.obj;
      var t = str(raw.teacher).toUpperCase();
      if (t) {
        if (!canAssign) throw userError_('Bạn không có quyền phân công GV – hãy để trống cột "Mã GV".');
        if (!ctx.teachers[t]) throw userError_('Mã GV "' + t + '" không tồn tại.');
        o.teacher = t;
        o.source = 'Thủ công';
        o.explain = '';
      }
      if (canAssign && str(raw.locked) !== '') o.locked = toBool(raw.locked, false);
      o.updatedAt = now;
      o.updatedBy = user.email;
      schoolsInFile[o.school] = true;
      var id = str(raw.id);
      if (mode === 'upsert' && id && ctx.lessons[id]) {
        o._row = ctx.lessons[id].row;
        updates.push(o);
      } else {
        if (!('teacher' in o)) o.teacher = '';
        if (!('locked' in o)) o.locked = false;
        inserts.push(o);
      }
    } catch (e) {
      errors.push('Dòng ' + line + ': ' + e.message);
    }
  });
  var removeRows = [];
  if (mode === 'replace') {
    removeRows = Db.read('lessons').filter(function (l) { return schoolsInFile[str(l.school).toUpperCase()]; }).map(function (l) { return l._row; });
  }
  var res = { inserted: inserts.length, updated: updates.length, removed: removeRows.length, errors: errors, written: false };
  if (!shouldWrite_(args, errors)) return res;
  Db.update('lessons', updates);
  Db.remove('lessons', removeRows);
  if (inserts.length) {
    var ids = nextIds_('lessons', 'TKB', inserts.length);
    inserts.forEach(function (o, k) { o.id = ids[k]; });
    Db.append('lessons', inserts);
  }
  res.written = true;
  return res;
}

/** "AC", "Chuyên viên xếp lịch (AC)", "scheduler" … → mã vai trò. */
function parseRole_(v) {
  var s = removeDiacritics_(str(v)).toLowerCase();
  if (!s) return 'viewer';
  var aliases = {
    admin: 'admin', 'quan tri': 'admin', 'quan tri vien': 'admin',
    ac: 'scheduler', 'xep lich': 'scheduler', 'chuyen vien xep lich': 'scheduler',
    sale: 'sale', 'kinh doanh': 'sale',
    'giao vien': 'teacher', gv: 'teacher',
    'xem lich': 'viewer', xem: 'viewer',
    'cho duyet': 'pending',
  };
  if (aliases[s]) return aliases[s];
  var keys = Object.keys(ROLES);
  for (var i = 0; i < keys.length; i++) {
    if (s === keys[i] || s === removeDiacritics_(ROLES[keys[i]]).toLowerCase()) return keys[i];
  }
  return '';
}

function importUsers_(rows, args, user) {
  var existing = {};
  Db.read('users').forEach(function (u) { existing[normEmail(u.email)] = u; });
  var seen = {};
  var errors = [];
  var inserts = [];
  var updates = [];
  rows.forEach(function (raw, i) {
    var line = lineOf_(raw, i);
    try {
      var email = normEmail(raw.email);
      if (!isAllowedEmail(email)) throw userError_('Email "' + str(raw.email) + '" không phải email @' + APP.ALLOWED_DOMAINS[0]);
      if (seen[email]) throw userError_('Trùng email với dòng ' + seen[email]);
      seen[email] = line;
      if (isSuperAdmin(email)) throw userError_('Không thay đổi tài khoản quản trị gốc qua file nhập.');
      var role = parseRole_(raw.role);
      if (!role) throw userError_('Vai trò "' + raw.role + '" không hợp lệ (chọn: ' + USER_ROLE_OPTIONS.join(', ') + ')');
      var old = existing[email];
      if ((role === 'admin' || (old && old.role === 'admin')) && !user.isSuperAdmin) {
        throw userError_('Chỉ quản trị gốc (' + APP.SUPER_ADMIN + ') được cấp/thu hồi quyền Admin.');
      }
      var active = str(raw.active) === '' ? true : toBool(raw.active, true);
      if (old) {
        updates.push({ _row: old._row, name: str(raw.name) || old.name, role: role, active: active });
      } else {
        inserts.push({ email: email, name: str(raw.name), role: role, active: active, addedBy: user.email, createdAt: nowString(), lastLogin: '' });
      }
    } catch (e) {
      errors.push('Dòng ' + line + ': ' + e.message);
    }
  });
  var res = { inserted: inserts.length, updated: updates.length, removed: 0, errors: errors, written: false };
  if (!shouldWrite_(args, errors)) return res;
  Db.update('users', updates);
  Db.append('users', inserts);
  res.written = true;
  return res;
}
