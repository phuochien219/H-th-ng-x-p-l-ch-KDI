/**
 * Khởi tạo bảng dữ liệu, menu trong Google Sheets và dữ liệu mẫu.
 */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🗓 KDI Xếp lịch')
    .addItem('Mở ứng dụng web', 'menuOpenWebApp')
    .addSeparator()
    .addItem('Xếp lịch tự động (điền tiết trống)', 'menuAutoSchedule')
    .addItem('Kiểm tra trùng lịch (tô màu sheet TKB)', 'menuHighlightConflicts')
    .addItem('Cập nhật tọa độ & khoảng cách Google Maps (xe máy)', 'menuUpdateMaps')
    .addSeparator()
    .addItem('Khởi tạo / kiểm tra cấu trúc bảng', 'setupSheets')
    .addItem('Nạp dữ liệu mẫu (XÓA dữ liệu hiện có)', 'menuLoadDemoData')
    .addToUi();
}

/**
 * Trigger đơn giản: khi ai đó sửa trực tiếp trên Google Sheets thì xóa dữ liệu lưu tạm
 * để ứng dụng web hiển thị ngay dữ liệu mới.
 */
function onEdit(e) {
  try { CacheService.getScriptCache().remove('snap_meta'); } catch (err) { /* bỏ qua */ }
}

/**
 * Các hàm gọi từ menu là hàm "công khai" nên client web cũng gọi được qua
 * google.script.run → luôn kiểm tra quyền của người đang thao tác.
 * Ngoại lệ: lần cài đặt đầu tiên (chưa có sheet NguoiDung).
 */
function requireSheetRole_(perm) {
  if (!Db.sheet('users', false)) {
    return { email: activeGoogleEmail_() || 'cài đặt', isSuperAdmin: true, role: 'admin', status: 'ok' };
  }
  var u = resolveUser_('');
  if (u.status !== 'ok' || !hasPerm(u, perm)) {
    throw new Error('Bạn không có quyền dùng chức năng này. Hãy đăng nhập Google bằng tài khoản @' + APP.ALLOWED_DOMAINS[0] +
      ' có vai trò phù hợp (' + (u.email || 'chưa xác định email') + ').');
  }
  return u;
}

/** Tạo các sheet còn thiếu, tiêu đề, danh sách chọn, cấu hình mặc định, tài khoản admin gốc. */
function setupSheets() {
  requireSheetRole_('manage_settings');
  return withLock_(function () {
    Object.keys(TABLES).forEach(function (table) { Db.ensureHeaders(table); });
    applyValidations_();

    var existing = {};
    Db.read('settings').forEach(function (r) { existing[r.key] = true; });
    Db.append('settings', SETTINGS_SPEC.filter(function (s) { return !existing[s.key]; }).map(function (s) {
      return { key: s.key, value: s.def, description: s.label };
    }));

    if (!Db.findByKey('users', normEmail(APP.SUPER_ADMIN))) {
      Db.append('users', [{ email: APP.SUPER_ADMIN, name: 'Quản trị gốc', role: 'admin', active: true, addedBy: 'Hệ thống', createdAt: nowString(), lastLogin: '' }]);
    }
    if (!Db.read('subjects').length) Db.append('subjects', DEFAULT_SUBJECTS);
    migrateLegacyTraining_();
    toast_('Đã khởi tạo cấu trúc dữ liệu.');
    return true;
  });
}

/** Chương trình STEM mặc định (theo khối lớp, giống TKB thực tế của KDI). */
var DEFAULT_SUBJECTS = [
  { code: 'G01', name: 'School - Grade 01', description: 'Chương trình STEM khối 1', color: '#e8590c' },
  { code: 'G02', name: 'School - Grade 02', description: 'Chương trình STEM khối 2', color: '#f08c00' },
  { code: 'G03', name: 'School - Grade 03', description: 'Chương trình STEM khối 3', color: '#2f9e44' },
  { code: 'G04', name: 'School - Grade 04', description: 'Chương trình STEM khối 4', color: '#0c8599' },
  { code: 'G05', name: 'School - Grade 05', description: 'Chương trình STEM khối 5', color: '#1c7ed6' },
  { code: 'G06', name: 'School - Grade 06', description: 'Chương trình STEM khối 6', color: '#4263eb' },
  { code: 'G07', name: 'School - Grade 07', description: 'Chương trình STEM khối 7', color: '#7048e8' },
  { code: 'G08', name: 'School - Grade 08', description: 'Chương trình STEM khối 8', color: '#ae3ec9' },
  { code: 'G09', name: 'School - Grade 09', description: 'Chương trình STEM khối 9', color: '#c2255c' },
  { code: 'GK', name: 'School - Grade .K', description: 'Chương trình K (Tin học/Khoa học máy tính)', color: '#495057' },
];

/** Danh sách thả xuống ngay trên các sheet dữ liệu (kể cả mã tham chiếu sang sheet khác). */
/** Bản 1.0/1.1 lưu "Môn đã đào tạo" trong sheet GiaoVien → chuyển sang GV_DaoTao (1 dòng / GV × môn). */
function migrateLegacyTraining_() {
  var sh = Db.sheet('teachers', false);
  if (!sh || sh.getLastRow() < 2) return 0;
  var grid = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  var head = grid[0].map(str);
  var cSub = head.indexOf('Môn đã đào tạo');
  var cCode = head.indexOf('Mã GV');
  if (cSub < 0 || cCode < 0) return 0;
  var have = {};
  Db.read('training').forEach(function (r) { have[str(r.teacher).toUpperCase() + '|' + str(r.subject).toUpperCase()] = true; });
  var add = [];
  for (var r = 1; r < grid.length; r++) {
    var code = str(grid[r][cCode]).toUpperCase();
    splitList(grid[r][cSub]).forEach(function (subj) {
      subj = subj.toUpperCase();
      if (!code || have[code + '|' + subj]) return;
      have[code + '|' + subj] = true;
      add.push({ teacher: code, subject: subj, status: 'Đạt', date: '', notes: 'Chuyển từ cột "Môn đã đào tạo"' });
    });
  }
  Db.append('training', add);
  return add.length;
}

function applyValidations_() {
  var codeRanges = {};
  ['schools', 'teachers', 'assistants', 'subjects'].forEach(function (t) {
    var sh = Db.sheet(t, true);
    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(str);
    var col = headers.indexOf(TABLES[t].columns[0].header) + 1;
    codeRanges[t] = sh.getRange(2, col, Math.max(sh.getMaxRows() - 1, 1), 1);
  });
  var refSource = { school: 'schools', teacher: 'teachers', assistant: 'assistants', subject: 'subjects' };
  Object.keys(TABLES).forEach(function (table) {
    var d = TABLES[table];
    var sh = Db.sheet(table, true);
    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(str);
    var maxRows = Math.max(sh.getMaxRows() - 1, 1);
    d.columns.forEach(function (c) {
      var col = headers.indexOf(c.header) + 1;
      if (col < 1) return;
      var range = sh.getRange(2, col, maxRows, 1);
      var list = c.type === 'weekday' ? WEEKDAYS : (table === 'users' && c.key === 'role') ? Object.keys(ROLES) : c.options;
      // Ô checkbox (cột kiểu bool) được tạo khi thêm dòng (Db.append) – không chèn cho cả
      // cột vì Sheets sẽ ghi FALSE vào mọi ô trống và làm sai vị trí dòng cuối.
      if (list) {
        range.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(true).build());
      } else if (refSource[c.type] && refSource[c.type] !== table) {
        range.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInRange(codeRanges[refSource[c.type]], true).setAllowInvalid(true).build());
      }
    });
  });
}

function toast_(msg) {
  try { SpreadsheetApp.getActiveSpreadsheet().toast(msg, 'KDI Scheduler', 5); } catch (e) { /* chạy ngoài Sheets */ }
}

function menuOpenWebApp() {
  var url = '';
  try { url = ScriptApp.getService().getUrl(); } catch (e) { url = ''; }
  var html = url
    ? '<p style="font-family:Arial">Mở ứng dụng: <a href="' + url + '" target="_blank">' + url + '</a></p>'
    : '<p style="font-family:Arial">Chưa triển khai Web App. Vào <b>Triển khai (Deploy) → Triển khai mới → Ứng dụng web</b> (xem README).</p>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(520).setHeight(120), 'KDI Scheduler');
}

function menuAutoSchedule() {
  var ui = SpreadsheetApp.getUi();
  var user = requireSheetRole_('auto_schedule');
  var run = runAuto_({ mode: 'fill' }, user);
  var s = run.stats;
  var msg = 'Xếp được ' + s.assigned + '/' + s.considered + ' tiết trống (giữ nguyên ' + s.kept + ' tiết đã có GV).\n' +
    'Chưa xếp được: ' + s.unassigned + ' tiết. Dữ liệu lỗi: ' + s.invalid + ' tiết.\n\nÁp dụng kết quả vào sheet TKB?';
  if (ui.alert('Kết quả xếp lịch', msg, ui.ButtonSet.YES_NO) === ui.Button.YES) {
    var res = applyRun_({ id: run.id }, user);
    ui.alert('Đã áp dụng ' + res.applied + ' tiết. Có thể hoàn tác trong ứng dụng web (mục Xếp lịch tự động).');
  } else {
    discardRun_({ id: run.id }, user);
  }
}

function menuHighlightConflicts() {
  var ui = SpreadsheetApp.getUi();
  requireSheetRole_('auto_schedule');
  var ctx = context_();
  var conflicts = detectConflicts(ctx);
  var idx = conflictIndex(conflicts);
  var sh = Db.sheet('lessons', true);
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow >= 2) {
    var colors = [];
    var rowColor = {};
    ctx.lessonList.forEach(function (l) {
      if (idx[l.id] === 'error') rowColor[l.row] = '#ffc9c9';
      else if (idx[l.id] === 'warning') rowColor[l.row] = '#fff3bf';
      else if (!l.teacher) rowColor[l.row] = '#e7f5ff';
    });
    for (var r = 2; r <= lastRow; r++) {
      var c = rowColor[r] || '#ffffff';
      var row = [];
      for (var k = 0; k < lastCol; k++) row.push(c);
      colors.push(row);
    }
    sh.getRange(2, 1, lastRow - 1, lastCol).setBackgrounds(colors);
  }
  var errors = conflicts.filter(function (c) { return c.severity === 'error'; }).length;
  ui.alert('Kiểm tra trùng lịch',
    'Lỗi (đỏ): ' + errors + '\nCảnh báo (vàng): ' + (conflicts.length - errors) + '\nTiết chưa có GV: tô xanh nhạt.\n\nXem chi tiết trong ứng dụng web → Cảnh báo.',
    ui.ButtonSet.OK);
}

function menuLoadDemoData() {
  var ui = SpreadsheetApp.getUi();
  requireSheetRole_('manage_settings');
  if (ui.alert('Nạp dữ liệu mẫu', 'Thao tác này XÓA toàn bộ dữ liệu trường, GV, TKB hiện có và thay bằng dữ liệu mẫu. Tiếp tục?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  setupSheets();
  loadDemoData_();
  ui.alert('Đã nạp dữ liệu mẫu. Mở ứng dụng web → "Xếp lịch tự động" để chạy thử.');
}

function loadDemoData_() {
  var demo = buildDemoData(20260901);
  withLock_(function () {
    ['subjects', 'schools', 'classes', 'teachers', 'training', 'assistants', 'assistantFree', 'links', 'unavailability', 'lessons']
      .forEach(function (t) { Db.replaceAll(t, demo[t]); });
    Db.replaceAll('distances', []);
    Db.replaceAll('runs', []);
    Db.replaceAll('runItems', []);
  });
  return demo;
}

/* ------------------------------ Dữ liệu mẫu ------------------------------ */

function mulberry32_(seed) {
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sinh dữ liệu mẫu (Hà Nội) – hàm thuần, cùng seed cho cùng kết quả. */
function buildDemoData(seed) {
  var rnd = mulberry32_(seed || 1);
  function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
  function between(a, b) { return a + Math.floor(rnd() * (b - a + 1)); }
  function jitter(v, d) { return Math.round((v + (rnd() * 2 - 1) * d) * 100000) / 100000; }
  function pad(n, w) { n = String(n); while (n.length < w) n = '0' + n; return n; }
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }
  function mapUrl(lat, lng) { return 'https://www.google.com/maps?q=' + lat + ',' + lng; }

  var districts = [
    ['Ba Đình', 21.0350, 105.8190], ['Hoàn Kiếm', 21.0285, 105.8542], ['Đống Đa', 21.0180, 105.8290],
    ['Hai Bà Trưng', 21.0060, 105.8580], ['Hoàng Mai', 20.9740, 105.8630], ['Thanh Xuân', 20.9930, 105.8110],
    ['Cầu Giấy', 21.0330, 105.7940], ['Long Biên', 21.0470, 105.8890], ['Tây Hồ', 21.0680, 105.8200],
    ['Nam Từ Liêm', 21.0130, 105.7650], ['Bắc Từ Liêm', 21.0700, 105.7600], ['Hà Đông', 20.9710, 105.7790],
    ['Đông Anh', 21.1370, 105.8490], ['Gia Lâm', 21.0280, 105.9380],
  ];
  var subjects = DEFAULT_SUBJECTS.map(function (x) { return Object.assign({}, x); });
  var primary = ['G01', 'G02', 'G03', 'G04', 'G05'];
  var secondary = ['G06', 'G07', 'G08', 'G09'];

  var names = ['Kim Đồng', 'Chu Văn An', 'Nguyễn Tri Phương', 'Ái Mộ A', 'Đô Thị Việt Hưng', 'Việt Nam - Cuba', 'Tràng An',
    'Hoàng Mai', 'Đô thị Sài Đồng', 'Tây Mỗ 3', 'Nguyễn Trung Trực', 'Lý Thường Kiệt', 'Thăng Long', 'Đoàn Thị Điểm', 'Nam Thành Công',
    'Dịch Vọng', 'Yên Hòa', 'Lê Ngọc Hân', 'Phúc Xá', 'Giảng Võ', 'Phúc Lợi', 'Phương Canh', 'Nguyễn Quý Đức', 'Sài Đồng',
    'Trung Văn', 'Đại Mỗ', 'Ngọc Lâm', 'Mỹ Đình 1', 'Mỹ Đình 2', 'Nguyễn Bỉnh Khiêm', 'Phan Bội Châu', 'Nguyễn Gia Thiều',
    'Lê Quý Đôn', 'Cát Linh', 'Nguyễn Huy Tưởng', 'Lý Nam Đế', 'Nguyễn Trường Tộ', 'Đại Kim', 'Ngô Quyền', 'Tây Mỗ',
    'Thanh Xuân Trung', 'Khương Đình', 'Định Công', 'Hoàng Liệt', 'Đông Anh'];
  var schools = [];
  names.forEach(function (n, i) {
    var d = districts[(i * 5) % districts.length];
    var th = i < 21;
    var lat = jitter(d[1], 0.015);
    var lng = jitter(d[2], 0.015);
    schools.push({
      code: 'TR' + pad(i + 1, 3), name: (th ? 'TH ' : 'THCS ') + n, level: th ? 'Tiểu học' : 'THCS',
      mapUrl: mapUrl(lat, lng), address: 'Phường ' + pick(['Láng Hạ', 'Kim Mã', 'Dịch Vọng', 'Bồ Đề', 'Mỹ Đình', 'Văn Quán', 'Định Công']) + ', ' + d[0],
      district: d[0], lat: lat, lng: lng, contact: 'Cô ' + pick(['Lan', 'Hoa', 'Mai', 'Hương', 'Thảo', 'Ngọc']),
      phone: '09' + between(10000000, 99999999), sale: pick(['sale1@kdi.edu.vn', 'sale2@kdi.edu.vn']), notes: '', active: true,
    });
  });

  // Lớp học & chương trình: TH học G01–G05, THCS học G06–G09; một số trường học chương trình K.
  var classes = [];
  schools.forEach(function (s, i) {
    var grades = s.level === 'Tiểu học' ? primary : secondary;
    var useK = s.level === 'THCS' && i % 4 === 0;
    shuffle(grades.slice()).slice(0, between(2, grades.length)).sort().forEach(function (subj) {
      var g = Number(subj.slice(1));
      var n = between(3, 6);
      for (var k = 1; k <= n; k++) {
        classes.push({ school: s.code, className: g + 'A' + k, grade: String(g), subject: useK ? 'GK' : subj,
          needAssistant: rnd() < 0.85 ? 'Có' : 'Không', students: between(30, 45), notes: '' });
      }
    });
  });

  var families = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Vũ', 'Phan', 'Đặng', 'Bùi', 'Đỗ', 'Ngô', 'Dương', 'Đinh', 'Lương'];
  var middles = ['Thị', 'Văn', 'Thu', 'Thanh', 'Minh', 'Ngọc', 'Hồng', 'Khánh', 'Bảo', 'Phương'];
  var givens = ['Anh', 'Chi', 'Dung', 'Giang', 'Hà', 'Hằng', 'Hiền', 'Hương', 'Linh', 'Mai', 'My', 'Nga', 'Nhung', 'Phương',
    'Thảo', 'Trang', 'Tú', 'Vân', 'Yến', 'Huyền', 'Tâm', 'Hải', 'Nam', 'Sơn', 'Tuấn'];
  function person(prefix, k) {
    var fam = pick(families);
    var giv = pick(givens);
    var d = districts[Math.floor(rnd() * districts.length)];
    var lat = jitter(d[1], 0.02);
    var lng = jitter(d[2], 0.02);
    return {
      code: prefix + pad(k, 3), name: fam + ' ' + pick(middles) + ' ' + giv,
      email: removeDiacritics_(giv).toLowerCase() + '.' + removeDiacritics_(fam).toLowerCase() + '.' + prefix.toLowerCase() + pad(k, 3) + '@kdi.edu.vn',
      phone: '09' + between(10000000, 99999999), mapUrl: mapUrl(lat, lng),
      address: 'Ngõ ' + between(1, 300) + ' ' + pick(['Xuân Thủy', 'Nguyễn Trãi', 'Giải Phóng', 'Nguyễn Văn Cừ', 'Láng', 'Trần Duy Hưng']) + ', ' + d[0],
      district: d[0], lat: lat, lng: lng,
    };
  }

  var teachers = [];
  var training = [];
  var unavailability = [];
  for (var k = 1; k <= 80; k++) {
    var t = person('GV', k);
    var partTime = k % 3 === 0;
    var r = rnd();
    teachers.push(Object.assign(t, {
      type: partTime ? 'Kiêm nhiệm' : 'Thường', rating: r < 0.2 ? 'A' : r < 0.65 ? 'B' : r < 0.95 ? 'C' : 'D',
      targetHours: '', maxHours: '', maxSchools: '', notes: partTime ? 'Kiêm nhiệm công tác văn phòng' : '', active: k !== 80,
    }));
    // GV tiểu học (k lẻ) được đào tạo các khối 1–5, GV THCS được đào tạo khối 6–9 / K.
    var pool = k % 2 === 1 ? primary : secondary.concat(['GK']);
    shuffle(pool.slice()).slice(0, between(2, pool.length)).forEach(function (subj) {
      training.push({ teacher: t.code, subject: subj, status: rnd() < 0.93 ? 'Đạt' : 'Đang đào tạo', date: '2025-0' + between(6, 9) + '-15', notes: '' });
    });
    if (partTime) {
      var wd = between(0, 4);
      var morning = rnd() < 0.5;
      unavailability.push({ id: 'LB-' + pad(unavailability.length + 1, 6), teacher: t.code, weekday: WEEKDAYS[wd],
        start: morning ? '07:00' : '13:00', end: morning ? '11:30' : '17:00', reason: 'Công tác văn phòng' });
    }
  }

  var assistants = [];
  var assistantFree = [];
  for (var a = 1; a <= 75; a++) {
    var ta = person('TG', a);
    assistants.push(Object.assign(ta, { targetHours: '', maxHours: '', maxSchools: '', notes: rnd() < 0.5 ? 'Sinh viên' : '', active: true }));
    shuffle([0, 1, 2, 3, 4]).slice(0, between(3, 5)).sort().forEach(function (wd) {
      var kind = pick(['sáng', 'chiều', 'cả ngày', 'cả ngày']);
      var start = kind === 'chiều' ? '13:00' : '07:00';
      var end = kind === 'sáng' ? '11:45' : '17:00';
      assistantFree.push({ id: 'LR-' + pad(assistantFree.length + 1, 6), assistant: ta.code, weekday: WEEKDAYS[wd], start: start, end: end, notes: 'Rảnh ' + kind });
    });
  }

  // Trường ưu tiên: ~1/3 GV có 1 trường ưu tiên gần nhà dạy đúng chương trình đã đào tạo.
  var links = [];
  teachers.forEach(function (t, idx) {
    if (idx % 3 !== 0) return;
    var trained = training.filter(function (x) { return x.teacher === t.code && x.status === 'Đạt'; }).map(function (x) { return x.subject; });
    var near = schools.map(function (s) { return { s: s, d: haversineKm(t.lat, t.lng, s.lat, s.lng) }; })
      .filter(function (x) { return classes.some(function (c) { return c.school === x.s.code && trained.indexOf(c.subject) >= 0; }); })
      .sort(function (p, q) { return p.d - q.d; });
    if (near.length) links.push({ teacher: t.code, school: near[0].s.code, preference: 'Ưu tiên', distance: '', notes: 'Trường đề nghị giữ GV' });
  });
  links.push({ teacher: 'GV007', school: 'TR003', preference: 'Không xếp', distance: '', notes: 'Trường phản hồi chưa phù hợp' });

  // Thời khóa biểu: mỗi lớp 1 buổi/tuần (một số lớp 2 tiết gộp).
  var thSlots = [[460, 495], [500, 535], [560, 595], [620, 655], [810, 845], [850, 885], [905, 940], [950, 985]];
  var thcsSlots = [[450, 495], [505, 550], [565, 610], [620, 665], [820, 865], [875, 920], [935, 980]];
  var lessons = [];
  schools.forEach(function (s) {
    var mine = classes.filter(function (c) { return c.school === s.code; });
    var slots = s.level === 'Tiểu học' ? thSlots : thcsSlots;
    var days = shuffle([0, 1, 2, 3, 4]).slice(0, between(2, 4)).sort();
    var cells = [];
    days.forEach(function (wd) { slots.forEach(function (sl, si) { cells.push({ wd: wd, sl: sl, si: si }); }); });
    shuffle(cells);
    mine.forEach(function (c, i) {
      var cell = cells[i % cells.length];
      var double = rnd() < 0.08 && cell.si + 1 < slots.length;
      lessons.push({
        id: '', school: s.code, weekday: WEEKDAYS[cell.wd], start: fmtTime(cell.sl[0]),
        end: fmtTime(double ? slots[cell.si + 1][1] : cell.sl[1]), className: c.className, grade: c.grade,
        subject: '', periods: double ? 2 : 1, room: 'Phòng STEM', teacher: '', needAssistant: '', assistant: '', locked: false,
        source: '', explain: '', explainTA: '', notes: '', updatedAt: '', updatedBy: 'demo',
      });
    });
  });
  lessons.sort(function (x, y) {
    return x.school < y.school ? -1 : x.school > y.school ? 1 : parseWeekday(x.weekday) - parseWeekday(y.weekday) || parseTime(x.start) - parseTime(y.start);
  });
  lessons.forEach(function (l, i) { l.id = 'TKB-' + pad(i + 1, 6); });

  return {
    subjects: subjects, schools: schools, classes: classes, teachers: teachers, training: training,
    assistants: assistants, assistantFree: assistantFree, links: links, unavailability: unavailability, lessons: lessons,
  };
}
