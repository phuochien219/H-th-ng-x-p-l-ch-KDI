/**
 * Khởi tạo bảng dữ liệu, menu trong Google Sheets và dữ liệu mẫu.
 */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🗓 KDI Xếp lịch')
    .addItem('Mở ứng dụng web', 'menuOpenWebApp')
    .addSeparator()
    .addItem('Xếp lịch tự động (điền tiết trống)', 'menuAutoSchedule')
    .addItem('Kiểm tra trùng lịch (tô màu sheet TKB)', 'menuHighlightConflicts')
    .addSeparator()
    .addItem('Khởi tạo / kiểm tra cấu trúc bảng', 'setupSheets')
    .addItem('Nạp dữ liệu mẫu (XÓA dữ liệu hiện có)', 'menuLoadDemoData')
    .addToUi();
}

/** Tạo các sheet còn thiếu, tiêu đề, danh sách chọn, cấu hình mặc định, tài khoản admin gốc. */
function setupSheets() {
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
    toast_('Đã khởi tạo cấu trúc dữ liệu.');
    return true;
  });
}

var DEFAULT_SUBJECTS = [
  { code: 'RB', name: 'Robotics', description: 'Lắp ráp & lập trình robot', color: '#e8590c' },
  { code: 'SCR', name: 'Lập trình Scratch', description: 'Tư duy lập trình kéo thả', color: '#7048e8' },
  { code: 'PY', name: 'Python & AI', description: 'Lập trình Python, trí tuệ nhân tạo cơ bản', color: '#1c7ed6' },
  { code: 'KH', name: 'Khoa học STEM', description: 'Thí nghiệm khoa học thực hành', color: '#2f9e44' },
  { code: 'MK', name: 'Maker – Kỹ thuật', description: 'Thiết kế & chế tạo sản phẩm', color: '#c2255c' },
  { code: 'IOT', name: 'Điện tử & IoT', description: 'Mạch điện tử, Arduino, IoT', color: '#0c8599' },
];

function applyValidations_() {
  var lists = {
    'TKB.weekday': WEEKDAYS, 'LichBan.weekday': WEEKDAYS,
    'GiaoVien.type': TEACHER_TYPES, 'GiaoVien.rating': RATINGS,
    'GV_Truong.preference': PREFERENCES, 'NguoiDung.role': Object.keys(ROLES),
    'TruongHoc.level': TABLES.schools.columns.filter(function (c) { return c.key === 'level'; })[0].options,
  };
  Object.keys(TABLES).forEach(function (table) {
    var d = TABLES[table];
    var sh = Db.sheet(table, true);
    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(str);
    var maxRows = Math.max(sh.getMaxRows() - 1, 1);
    d.columns.forEach(function (c) {
      var col = headers.indexOf(c.header) + 1;
      if (col < 1) return;
      var range = sh.getRange(2, col, maxRows, 1);
      var list = lists[d.sheet + '.' + c.key];
      if (list) {
        range.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(true).build());
      } else if (c.type === 'bool') {
        range.insertCheckboxes();
      }
    });
  });
}

function toast_(msg) {
  try { SpreadsheetApp.getActiveSpreadsheet().toast(msg, 'KDI Scheduler', 5); } catch (e) { /* chạy ngoài Sheets */ }
}

function menuUser_() {
  var email = '';
  try { email = Session.getActiveUser().getEmail(); } catch (e) { email = ''; }
  return { email: email || 'menu', isSuperAdmin: isSuperAdmin(email), role: 'admin' };
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
  var user = menuUser_();
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
  SpreadsheetApp.getUi().alert('Kiểm tra trùng lịch',
    'Lỗi (đỏ): ' + errors + '\nCảnh báo (vàng): ' + (conflicts.length - errors) + '\nTiết chưa có GV: tô xanh nhạt.\n\nXem chi tiết trong ứng dụng web → Cảnh báo.',
    SpreadsheetApp.getUi().ButtonSet.OK);
}

function menuLoadDemoData() {
  var ui = SpreadsheetApp.getUi();
  if (ui.alert('Nạp dữ liệu mẫu', 'Thao tác này XÓA toàn bộ dữ liệu trường, GV, TKB hiện có và thay bằng dữ liệu mẫu. Tiếp tục?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  setupSheets();
  loadDemoData_();
  ui.alert('Đã nạp dữ liệu mẫu. Mở ứng dụng web → "Xếp lịch tự động" để chạy thử.');
}

function loadDemoData_() {
  var demo = buildDemoData(20260901);
  withLock_(function () {
    Db.replaceAll('subjects', demo.subjects);
    Db.replaceAll('schools', demo.schools);
    Db.replaceAll('teachers', demo.teachers);
    Db.replaceAll('links', demo.links);
    Db.replaceAll('unavailability', demo.unavailability);
    Db.replaceAll('lessons', demo.lessons);
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

/** Sinh dữ liệu mẫu (TP.HCM) – hàm thuần, cùng seed cho cùng kết quả. */
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

  var districts = [
    ['Quận 1', 10.7769, 106.7009], ['Quận 3', 10.7843, 106.6844], ['Quận 4', 10.7579, 106.7013],
    ['Quận 5', 10.7540, 106.6634], ['Quận 6', 10.7480, 106.6352], ['Quận 7', 10.7340, 106.7218],
    ['Quận 8', 10.7240, 106.6286], ['Quận 10', 10.7746, 106.6670], ['Quận 11', 10.7629, 106.6503],
    ['Quận 12', 10.8672, 106.6413], ['Bình Thạnh', 10.8106, 106.7091], ['Gò Vấp', 10.8387, 106.6653],
    ['Phú Nhuận', 10.7991, 106.6802], ['Tân Bình', 10.8015, 106.6527], ['Tân Phú', 10.7918, 106.6283],
    ['Bình Tân', 10.7653, 106.6037], ['TP Thủ Đức', 10.8494, 106.7537], ['Nhà Bè', 10.6950, 106.7046],
  ];
  var subjects = DEFAULT_SUBJECTS.map(function (s) { return Object.assign({}, s); });
  var subjectCodes = subjects.map(function (s) { return s.code; });

  var famous = ['Nguyễn Bỉnh Khiêm', 'Lê Quý Đôn', 'Trần Hưng Đạo', 'Lê Lợi', 'Nguyễn Du', 'Chu Văn An', 'Võ Thị Sáu',
    'Nguyễn Trãi', 'Lý Thường Kiệt', 'Hai Bà Trưng', 'Kim Đồng', 'Nguyễn Thị Minh Khai', 'Phan Chu Trinh', 'Lương Thế Vinh',
    'Trần Quốc Toản', 'Đinh Tiên Hoàng', 'Nguyễn Văn Trỗi', 'Phan Bội Châu', 'Hồ Văn Huê', 'Lê Văn Tám', 'Ngô Quyền',
    'Hùng Vương', 'Quang Trung', 'Nguyễn Huệ', 'Tô Hiến Thành', 'Lạc Long Quân', 'Âu Cơ', 'Bế Văn Đàn', 'Cao Bá Quát',
    'Đoàn Thị Điểm', 'Huỳnh Thúc Kháng', 'Mạc Đĩnh Chi', 'Nguyễn Khuyến', 'Phạm Ngũ Lão', 'Trần Đại Nghĩa', 'Yết Kiêu'];

  var schools = [];
  for (var i = 1; i <= 72; i++) {
    var d = districts[(i * 7) % districts.length];
    var level = rnd() < 0.68 ? 'Tiểu học' : 'THCS';
    schools.push({
      code: 'TR' + pad(i, 3), name: (level === 'Tiểu học' ? 'TH ' : 'THCS ') + famous[(i - 1) % famous.length] + (i > famous.length ? ' ' + d[0].replace('Quận ', 'Q') : ''),
      level: level, address: between(1, 300) + ' đường số ' + between(1, 40) + ', ' + d[0], district: d[0],
      lat: jitter(d[1], 0.018), lng: jitter(d[2], 0.018), contact: 'Cô ' + pick(['Lan', 'Hoa', 'Mai', 'Hương', 'Thảo', 'Ngọc']),
      phone: '09' + between(10000000, 99999999), sale: pick(['sale1@kdi.edu.vn', 'sale2@kdi.edu.vn', 'sale3@kdi.edu.vn']),
      notes: '', active: true,
    });
  }

  var families = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý'];
  var middles = ['Văn', 'Thị', 'Minh', 'Ngọc', 'Hoàng', 'Thanh', 'Đức', 'Quốc', 'Thu', 'Anh', 'Hữu', 'Gia'];
  var givens = ['An', 'Bình', 'Châu', 'Dũng', 'Giang', 'Hà', 'Hải', 'Hiếu', 'Hùng', 'Khoa', 'Lan', 'Linh', 'Long', 'Mai', 'Nam',
    'Nhi', 'Phong', 'Phúc', 'Quân', 'Quỳnh', 'Sơn', 'Tâm', 'Thảo', 'Thịnh', 'Trang', 'Trí', 'Tú', 'Tuấn', 'Vy', 'Yến'];
  var teachers = [];
  var unavailability = [];
  for (var k = 1; k <= 110; k++) {
    var fam = pick(families);
    var giv = pick(givens);
    var dd = districts[Math.floor(rnd() * districts.length)];
    var partTime = k % 3 === 0;
    var nSub = between(2, 4);
    var subs = [];
    while (subs.length < nSub) {
      var sc = subjectCodes[Math.floor(rnd() * subjectCodes.length)];
      if (subs.indexOf(sc) < 0) subs.push(sc);
    }
    var r = rnd();
    var code = 'GV' + pad(k, 3);
    teachers.push({
      code: code, name: fam + ' ' + pick(middles) + ' ' + giv,
      email: removeDiacritics_(giv).toLowerCase() + '.' + removeDiacritics_(fam).toLowerCase() + pad(k, 3) + '@kdi.edu.vn',
      phone: '09' + between(10000000, 99999999), type: partTime ? 'Kiêm nhiệm' : 'Thường',
      rating: r < 0.2 ? 'A' : r < 0.65 ? 'B' : r < 0.95 ? 'C' : 'D',
      address: between(1, 500) + ' ' + pick(['Lê Văn Sỹ', 'CMT8', 'Nguyễn Văn Cừ', 'Phan Xích Long', 'Quang Trung', 'Lý Thường Kiệt']) + ', ' + dd[0],
      district: dd[0], lat: jitter(dd[1], 0.02), lng: jitter(dd[2], 0.02), subjects: subs.join(', '),
      targetHours: '', maxHours: '', maxSchools: '', notes: partTime ? 'Kiêm nhiệm công tác văn phòng' : '', active: k !== 110,
    });
    if (partTime) {
      // GV kiêm nhiệm bận 2 buổi trong tuần.
      var days = [between(0, 4), between(0, 4)];
      days.forEach(function (wd, j) {
        if (j === 1 && wd === days[0]) return;
        var morning = rnd() < 0.5;
        unavailability.push({ id: 'LB-' + pad(unavailability.length + 1, 6), teacher: code, weekday: WEEKDAYS[wd],
          start: morning ? '07:00' : '13:00', end: morning ? '11:30' : '17:00', reason: 'Công tác văn phòng' });
      });
    }
  }

  // Trường ưu tiên & khoảng cách: 45 GV có 1–2 trường ưu tiên trong số trường gần nhà.
  var links = [];
  teachers.slice(0, 100).forEach(function (t, idx) {
    if (idx % 2 === 1 && idx > 10) return;
    var near = schools.map(function (s) { return { s: s, d: haversineKm(t.lat, t.lng, s.lat, s.lng) }; })
      .sort(function (a, b) { return a.d - b.d; }).slice(0, 5);
    var n = idx % 3 === 0 ? 2 : 1;
    for (var j = 0; j < n; j++) {
      var e = near[between(0, 4)];
      if (links.some(function (l) { return l.teacher === t.code && l.school === e.s.code; })) continue;
      links.push({ teacher: t.code, school: e.s.code, distance: round1(e.d * 1.35), preference: 'Ưu tiên', notes: 'Trường đề nghị giữ GV' });
    }
  });
  links.push({ teacher: 'GV007', school: 'TR003', distance: '', preference: 'Không xếp', notes: 'Trường phản hồi chưa phù hợp' });
  links.push({ teacher: 'GV015', school: 'TR020', distance: '', preference: 'Không xếp', notes: '' });

  // Thời khóa biểu STEM: mỗi trường 1–2 môn, 10–30 lớp, mỗi lớp 1 tiết/tuần.
  var thSlots = [[450, 485], [495, 530], [555, 590], [600, 635], [840, 875], [885, 920], [930, 965]];
  var thcsSlots = [[420, 465], [470, 515], [530, 575], [580, 625], [810, 855], [860, 905], [915, 960]];
  var lessons = [];
  schools.forEach(function (s) {
    var primary = s.level === 'Tiểu học';
    var slots = primary ? thSlots : thcsSlots;
    var grades = primary ? [1, 2, 3, 4, 5] : [6, 7, 8, 9];
    var subA = pick(subjectCodes);
    var subB = pick(subjectCodes);
    var nClasses = between(10, 30);
    var rooms = nClasses > 18 ? 2 : 1;
    var dayList = shuffle([0, 1, 2, 3, 4]).slice(0, between(3, 5)).sort();
    if (rnd() < 0.15) dayList.push(5);
    var cells = [];
    dayList.forEach(function (wd) {
      slots.forEach(function (sl, si) {
        for (var room = 1; room <= rooms; room++) cells.push({ wd: wd, sl: sl, si: si, room: room });
      });
    });
    shuffle(cells);
    for (var c = 0; c < nClasses && c < cells.length; c++) {
      var g = grades[c % grades.length];
      var cell = cells[c];
      lessons.push({
        id: '', school: s.code, weekday: WEEKDAYS[cell.wd], start: fmtTime(cell.sl[0]), end: fmtTime(cell.sl[1]),
        className: g + 'A' + (Math.floor(c / grades.length) + 1), grade: String(g), subject: c % 3 === 2 ? subB : subA,
        periods: 1, room: 'STEM ' + cell.room, teacher: '', locked: false, source: '', explain: '', notes: '',
        updatedAt: '', updatedBy: 'demo',
      });
    }
  });
  lessons.sort(function (a, b) {
    return a.school < b.school ? -1 : a.school > b.school ? 1 : parseWeekday(a.weekday) - parseWeekday(b.weekday) || parseTime(a.start) - parseTime(b.start);
  });
  lessons.forEach(function (l, i) { l.id = 'TKB-' + pad(i + 1, 6); });

  return { subjects: subjects, schools: schools, teachers: teachers, links: links, unavailability: unavailability, lessons: lessons };
}
