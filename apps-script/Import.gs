/**
 * Nhập dữ liệu hàng loạt từ file Excel mẫu (giao diện đọc file .xlsx trên trình duyệt,
 * gửi từng bảng lên đây). Mọi dòng được kiểm tra trước khi ghi; có lỗi thì không ghi
 * gì (trừ khi người dùng chọn "bỏ qua dòng lỗi").
 */

/** Thứ tự nhập quan trọng: môn → trường → GV → liên kết → lịch bận → TKB → tài khoản. */
var IMPORT_TABLES = {
  subjects: { perm: 'edit_teachers' },
  schools: { perm: 'edit_schools' },
  classes: { perm: 'edit_timetable' },
  teachers: { perm: 'edit_teachers' },
  training: { perm: 'edit_teachers' },
  assistants: { perm: 'edit_teachers' },
  assistantFree: { perm: 'edit_teachers' },
  links: { perm: 'edit_teachers' },
  unavailability: { perm: 'edit_teachers' },
  lessons: { perm: 'edit_timetable' },
  users: { perm: 'manage_users' },
};
var IMPORT_ORDER = ['subjects', 'schools', 'classes', 'teachers', 'training', 'assistants', 'assistantFree', 'links', 'unavailability', 'lessons', 'users'];
var IMPORT_SKIP_COLUMNS = {
  lessons: ['source', 'explain', 'explainTA', 'updatedAt', 'updatedBy'],
  users: ['addedBy', 'createdAt', 'lastLogin'],
  unavailability: ['id'],
  assistantFree: ['id'],
  schools: ['lat', 'lng'],
  teachers: ['lat', 'lng'],
  assistants: ['lat', 'lng'],
};
/** Sheet & cột chứa danh sách mã để làm danh sách thả xuống. */
var REF_SOURCE = { school: 'schools', teacher: 'teachers', assistant: 'assistants', subject: 'subjects' };
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
    case 'teacher': return 'Chọn mã GV (danh sách lấy từ sheet GiaoVien)';
    case 'assistant': return 'Chọn mã trợ giảng (danh sách lấy từ sheet TroGiang)';
    case 'person': return 'Mã GV hoặc mã trợ giảng';
    case 'school': return 'Chọn mã trường (danh sách lấy từ sheet TruongHoc)';
    case 'subject': return 'Chọn mã chương trình (danh sách lấy từ sheet MonHoc)';
    case 'map': return 'Dán link Google Maps (Chia sẻ → Sao chép đường liên kết) – hệ thống tự lấy tọa độ';
    case 'district': return 'Quận/Huyện';
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
    subjects: demo.subjects,
    schools: demo.schools.slice(0, 3),
    classes: demo.classes.filter(function (c) { return c.school === 'TR001' || c.school === 'TR030'; }).slice(0, 6),
    teachers: demo.teachers.slice(0, 3),
    training: demo.training.filter(function (t) { return ['GV001', 'GV002', 'GV003'].indexOf(t.teacher) >= 0; }),
    assistants: demo.assistants.slice(0, 3),
    assistantFree: demo.assistantFree.filter(function (f) { return ['TG001', 'TG002'].indexOf(f.assistant) >= 0; }),
    links: [demo.links[0], demo.links.filter(function (l) { return l.preference === 'Không xếp'; })[0]],
    unavailability: demo.unavailability.slice(0, 2),
    lessons: demo.lessons.filter(function (l) { return l.school === 'TR001'; }).slice(0, 4).map(function (l) { return Object.assign({}, l, { id: '' }); }),
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
      if (!AUTO_ID_PREFIX[table]) {
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
  if (AUTO_ID_PREFIX[table] && inserts.length) {
    var ids = nextIds_(table, AUTO_ID_PREFIX[table], inserts.length);
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
      var ta = str(raw.assistant).toUpperCase();
      if (ta) {
        if (!canAssign) throw userError_('Bạn không có quyền phân công trợ giảng – hãy để trống cột "Mã TG".');
        if (!ctx.assistants[ta]) throw userError_('Mã TG "' + ta + '" không tồn tại.');
        o.assistant = ta;
        o.explainTA = '';
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
        if (!('assistant' in o)) o.assistant = '';
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

/* ----------------------- File nhập liệu trên Google Sheets ----------------------- */

/** Giá trị 1 ô khi xuất ra file nhập liệu. */
function cellForTemplate_(c, v) {
  if (c.type === 'bool') return v === true || v === 'TRUE' ? 'TRUE' : v === false || v === '' || v === undefined ? (c.def ? 'TRUE' : 'FALSE') : String(v);
  return v === undefined || v === null ? '' : String(v);
}

/**
 * Tạo file Google Sheets để nhập liệu: mỗi bảng 1 sheet, kèm dữ liệu hiện có (nếu hệ thống
 * chưa có dữ liệu thì kèm dòng ví dụ). Cột mã (trường, GV, TG, chương trình) có danh sách thả
 * xuống lấy từ chính các sheet trong file → thêm trường/GV mới là chọn được ngay.
 * Trả về link mở trực tiếp + link tải dạng Excel.
 */
function makeImportTemplate_(args, user) {
  var spec = importSpec_({}, user);
  var name = 'KDI – File nhập liệu – ' + Utilities.formatDate(new Date(), APP.TIMEZONE, 'dd/MM/yyyy HH:mm');
  var out = SpreadsheetApp.create(name);
  var guide = out.getSheets()[0];
  guide.setName('HuongDan');
  var lines = [
    ['HƯỚNG DẪN NHẬP DỮ LIỆU – KDI SCHEDULER'],
    ['1. Mỗi sheet là 1 bảng. Giữ nguyên TÊN SHEET và DÒNG TIÊU ĐỀ. Cột tiêu đề màu cam là bắt buộc.'],
    ['2. Ô có mũi tên ▼: bấm để CHỌN từ danh sách (Thứ, loại GV, mã trường, mã GV, mã TG, chương trình…). Không gõ tay để tránh sai dữ liệu.'],
    ['3. Danh sách mã lấy trực tiếp từ các sheet MonHoc, TruongHoc, GiaoVien, TroGiang trong file này – thêm dòng mới ở đó là chọn được ngay ở sheet khác.'],
    ['4. Vị trí trường / nhà GV / nhà TG: mở Google Maps → chọn địa điểm → Chia sẻ → Sao chép đường liên kết → dán vào cột "Link Google Maps".'],
    ['5. Lớp nào học chương trình gì: khai báo ở sheet LopHoc. Ở sheet TKB có thể để trống "Mã môn" – hệ thống tự lấy theo lớp.'],
    ['6. GV đã được đào tạo chương trình nào: mỗi dòng ở sheet GV_DaoTao là 1 GV × 1 chương trình (Trạng thái "Đạt" mới được xếp dạy).'],
    ['7. Trợ giảng: khai báo ở TroGiang, giờ rảnh ở TG_LichRanh (mỗi dòng 1 khung giờ rảnh trong tuần).'],
    ['8. Điền xong: vào web → Nhập dữ liệu từ Excel → dán link file này (hoặc tải về dạng .xlsx rồi chọn file) → Kiểm tra → Nhập dữ liệu.'],
  ];
  guide.getRange(1, 1, lines.length, 1).setValues(lines);
  guide.getRange(1, 1).setFontWeight('bold');
  guide.setColumnWidth(1, 900);

  var sheets = {};
  var MAXROWS = 3000;
  spec.forEach(function (t) {
    var sh = out.insertSheet(t.sheet);
    sheets[t.table] = { sheet: sh, cols: t.columns };
    var current = Db.read(t.table);
    var rows = current.length ? current.map(function (r) {
      return t.columns.map(function (c) { return cellForTemplate_(c, t.table === 'users' && c.key === 'role' ? roleLabelShort_(r.role) : r[c.key]); });
    }) : t.examples;
    var need = Math.max(rows.length + 1, MAXROWS);
    if (need > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());
    if (t.columns.length > sh.getMaxColumns()) sh.insertColumnsAfter(sh.getMaxColumns(), t.columns.length - sh.getMaxColumns());
    t.columns.forEach(function (c, i) {
      if (c.type === 'time' || c.type === 'weekday' || c.type === 'phone' || REF_SOURCE[c.type] || c.key === 'code' || c.key === 'id') {
        sh.getRange(2, i + 1, need - 1, 1).setNumberFormat('@');
      }
    });
    var head = sh.getRange(1, 1, 1, t.columns.length).setValues([t.columns.map(function (c) { return c.header; })]);
    head.setFontWeight('bold').setFontColor('#ffffff').setBackground('#1f3b73');
    t.columns.forEach(function (c, i) {
      if (c.required) sh.getRange(1, i + 1).setBackground('#c2410c');
      sh.setColumnWidth(i + 1, Math.max(90, Math.min(260, c.header.length * 9 + 30)));
    });
    sh.setFrozenRows(1);
    if (rows.length) sh.getRange(2, 1, rows.length, t.columns.length).setValues(rows);
  });

  // Danh sách thả xuống.
  Object.keys(sheets).forEach(function (table) {
    var sh = sheets[table].sheet;
    sheets[table].cols.forEach(function (c, i) {
      var range = sh.getRange(2, i + 1, MAXROWS - 1, 1);
      var rule = null;
      var list = c.type === 'weekday' ? WEEKDAYS : c.type === 'bool' ? ['TRUE', 'FALSE'] : c.options;
      var src = REF_SOURCE[c.type];
      if (list) {
        rule = SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(false).build();
      } else if (src && sheets[src] && table !== src) {
        rule = SpreadsheetApp.newDataValidation().requireValueInRange(sheets[src].sheet.getRange(2, 1, MAXROWS - 1, 1), true).setAllowInvalid(false).build();
      } else if (c.type === 'person') {
        var codes = Db.read('teachers').concat(Db.read('assistants')).map(function (r) { return str(r.code).toUpperCase(); }).filter(Boolean);
        if (codes.length && codes.length <= 500) rule = SpreadsheetApp.newDataValidation().requireValueInList(codes, true).setAllowInvalid(true).build();
      }
      if (rule) range.setDataValidation(rule);
    });
  });
  try { out.addEditor(user.email); } catch (e) { /* người dùng là chủ sở hữu */ }
  audit_(user, 'Tạo file nhập liệu', name, out.getUrl());
  return { url: out.getUrl(), xlsxUrl: 'https://docs.google.com/spreadsheets/d/' + out.getId() + '/export?format=xlsx', name: name };
}

function roleLabelShort_(role) {
  return { admin: 'Admin', scheduler: 'AC', sale: 'Sale', viewer: 'Xem lịch', teacher: 'Giáo viên', pending: 'Chờ duyệt' }[role] || 'Xem lịch';
}

/** Đọc toàn bộ các sheet của 1 file Google Sheets (link) để nhập. */
function readImportSheet_(args, user) {
  var url = str(args.url);
  var m = url.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  if (!m) throw userError_('Link Google Sheets không hợp lệ.');
  var ss;
  try { ss = SpreadsheetApp.openById(m[1]); } catch (e) {
    throw userError_('Không mở được file. Hãy chia sẻ file cho ' + Session.getEffectiveUser().getEmail() + ' (quyền xem) rồi thử lại.');
  }
  return {
    name: ss.getName(),
    sheets: ss.getSheets().map(function (sh) {
      var lr = sh.getLastRow();
      var lc = sh.getLastColumn();
      return { name: sh.getName(), aoa: lr && lc ? sh.getRange(1, 1, lr, lc).getDisplayValues() : [] };
    }),
  };
}

