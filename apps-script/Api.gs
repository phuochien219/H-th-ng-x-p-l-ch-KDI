/**
 * API cho giao diện web: client gọi google.script.run.api(action, args, token).
 * Mọi thao tác đi qua một điểm duy nhất để kiểm tra đăng nhập + phân quyền tập trung.
 * Kết quả trả về dạng chuỗi JSON (google.script.run không truyền được Date).
 */

function api(action, args, token) {
  var res;
  try {
    res = { ok: true, data: dispatch_(String(action || ''), args || {}, token || '') };
  } catch (e) {
    res = { ok: false, error: e && e.message ? e.message : String(e), code: (e && e.code) || '' };
    if (!e || !e.userFacing) console.error('API ' + action + ': ' + (e && e.stack ? e.stack : e));
  }
  return JSON.stringify(res);
}

function userError_(msg, code) {
  var e = new Error(msg);
  e.userFacing = true;
  if (code) e.code = code;
  return e;
}

function dispatch_(action, args, token) {
  if (action === 'auth.requestCode') return requestLoginCode_(args.email);
  if (action === 'auth.verifyCode') return verifyLoginCode_(args.email, args.code);
  if (action === 'auth.logout') return logout_(token);

  var user = resolveUser_(token);
  if (action === 'auth.me') return publicUser_(user);
  if (user.status !== 'ok') throw userError_(authMessage_(user), 'AUTH');

  var def = ACTIONS[action];
  if (!def) throw userError_('Thao tác không hợp lệ: ' + action);
  var perms = def.perm ? [].concat(def.perm) : [];
  if (perms.length && !perms.some(function (p) { return hasPerm(user, p); })) {
    throw userError_('Bạn không có quyền thực hiện thao tác này (vai trò: ' + user.roleLabel + ').', 'FORBIDDEN');
  }
  return def.fn(args, user);
}

function authMessage_(user) {
  switch (user.status) {
    case 'anonymous': return 'Vui lòng đăng nhập bằng email @' + APP.ALLOWED_DOMAINS[0] + '.';
    case 'forbidden': return 'Tài khoản ' + user.email + ' không thuộc KDI. Chỉ chấp nhận email @' + APP.ALLOWED_DOMAINS.join(', @') + '.';
    case 'disabled': return 'Tài khoản ' + user.email + ' đã bị khóa. Liên hệ quản trị viên.';
    case 'pending': return 'Tài khoản ' + user.email + ' đang chờ quản trị viên phân quyền.';
    default: return 'Chưa đăng nhập.';
  }
}

function publicUser_(user) {
  var out = { status: user.status, email: user.email || '' };
  if (user.role) {
    out.name = user.name;
    out.role = user.role;
    out.roleLabel = user.roleLabel;
    out.isSuperAdmin = user.isSuperAdmin;
    out.teacherCode = user.teacherCode;
    out.perms = user.perms;
    out.via = user.via;
  }
  if (user.status !== 'ok') out.message = authMessage_(user);
  return out;
}

/* ------------------------------- Tiện ích ------------------------------- */

function loadAll_() {
  return {
    subjects: Db.read('subjects'), schools: Db.read('schools'), teachers: Db.read('teachers'),
    links: Db.read('links'), unavailability: Db.read('unavailability'), lessons: Db.read('lessons'),
  };
}

function context_() {
  return buildContext(loadAll_(), getSettings());
}

function lessonDto_(ctx, l, cidx) {
  var s = ctx.schools[l.school];
  var t = ctx.teachers[l.teacher];
  var subj = ctx.subjects[l.subject];
  return {
    id: l.id, school: l.school, schoolName: s ? s.name : l.school, district: s ? s.district : '',
    weekday: l.weekday, weekdayLabel: weekdayLabel(l.weekday), start: l.start, end: l.end,
    startText: fmtTime(l.start), endText: fmtTime(l.end), className: l.className, grade: l.grade,
    subject: l.subject, subjectName: subj ? subj.name : l.subject, color: subj ? subj.color : '',
    periods: l.periods, room: l.room, teacher: l.teacher, teacherName: t ? t.name : (l.teacher ? l.teacher + ' (?)' : ''),
    locked: l.locked, source: l.source, explain: l.explain, notes: l.notes, load: round1(l.load),
    invalid: l.invalid, conflict: cidx ? (cidx[l.id] || '') : '',
  };
}

function teacherInfo_(ctx, t, user) {
  var o = {
    code: t.code, name: t.name, type: t.typeLabel, rating: t.rating, district: t.district,
    subjects: t.subjects.map(function (c) { return { code: c, name: subjectName_(ctx, c) }; }),
    target: t.target, max: t.max, maxSchools: t.maxSchools, active: t.active,
  };
  if (hasPerm(user, 'view_personal')) {
    var raw = Db.findByKey('teachers', t.code) || {};
    o.email = raw.email || '';
    o.phone = raw.phone || '';
    o.address = raw.address || '';
    o.notes = raw.notes || '';
  }
  return o;
}

function teacherSchedule_(ctx, code, user) {
  code = str(code).toUpperCase();
  var t = ctx.teachers[code];
  if (!t) throw userError_('Không tìm thấy giáo viên ' + code);
  var conflicts = detectConflicts(ctx).filter(function (c) { return c.teacher === code; });
  var cidx = conflictIndex(conflicts);
  var lessons = ctx.lessonList.filter(function (l) { return !l.invalid && l.teacher === code; })
    .sort(function (a, b) { return a.weekday - b.weekday || a.start - b.start; });
  var personal = hasPerm(user, 'view_personal');
  var bySchool = {};
  lessons.forEach(function (l) {
    var e = bySchool[l.school] = bySchool[l.school] || { code: l.school, name: (ctx.schools[l.school] || {}).name, lessons: 0, hours: 0 };
    e.lessons++;
    e.hours += l.load;
  });
  var schools = Object.keys(bySchool).map(function (k) {
    var e = bySchool[k];
    e.hours = round1(e.hours);
    e.priority = isPriority_(ctx, code, k);
    if (personal) e.distance = teacherSchoolDistance(ctx, code, k).km;
    return e;
  });
  var load = lessons.reduce(function (s, l) { return s + l.load; }, 0);
  var out = {
    teacher: teacherInfo_(ctx, t, user),
    lessons: lessons.map(function (l) { return lessonDto_(ctx, l, cidx); }),
    load: round1(load), schools: schools, conflicts: conflicts,
    unavailable: [],
  };
  t.unavailable.forEach(function (list, wd) {
    list.forEach(function (u) {
      out.unavailable.push({ weekday: wd, weekdayLabel: weekdayLabel(wd), start: u.start, end: u.end, startText: fmtTime(u.start), endText: fmtTime(u.end), reason: personal ? u.reason : '' });
    });
  });
  if (personal) {
    out.priorityLinks = Object.keys(ctx.links).filter(function (k) { return k.indexOf(code + '|') === 0 && ctx.links[k].preference; })
      .map(function (k) {
        var sc = k.split('|')[1];
        return { school: sc, name: (ctx.schools[sc] || {}).name || sc, preference: ctx.links[k].preference };
      });
    out.nearestSchools = Object.keys(ctx.schools).filter(function (sc) { return ctx.schools[sc].active; })
      .map(function (sc) {
        var d = teacherSchoolDistance(ctx, code, sc);
        return { school: sc, name: ctx.schools[sc].name, district: ctx.schools[sc].district, distance: d.km, source: d.source, priority: isPriority_(ctx, code, sc) };
      })
      .filter(function (x) { return x.distance !== null; })
      .sort(function (a, b) { return a.distance - b.distance; }).slice(0, 8);
  }
  return out;
}

function schoolSchedule_(ctx, code, user) {
  code = str(code).toUpperCase();
  var s = ctx.schools[code];
  if (!s) throw userError_('Không tìm thấy trường ' + code);
  var conflicts = detectConflicts(ctx);
  var cidx = conflictIndex(conflicts);
  var lessons = ctx.lessonList.filter(function (l) { return l.school === code; })
    .sort(function (a, b) { return a.weekday - b.weekday || a.start - b.start || (a.className < b.className ? -1 : 1); });
  var teachers = {};
  lessons.forEach(function (l) {
    if (!l.teacher) return;
    var t = ctx.teachers[l.teacher];
    var e = teachers[l.teacher] = teachers[l.teacher] || { code: l.teacher, name: t ? t.name : l.teacher, type: t ? t.typeLabel : '', lessons: 0, hours: 0 };
    e.lessons++;
    e.hours += l.load;
  });
  var raw = Db.findByKey('schools', code) || {};
  return {
    school: {
      code: s.code, name: s.name, district: s.district, level: raw.level || '', address: raw.address || '',
      contact: raw.contact || '', phone: raw.phone || '', sale: raw.sale || '', notes: raw.notes || '', active: s.active,
    },
    lessons: lessons.map(function (l) { return lessonDto_(ctx, l, cidx); }),
    teachers: Object.keys(teachers).map(function (k) { teachers[k].hours = round1(teachers[k].hours); return teachers[k]; }),
    unassigned: lessons.filter(function (l) { return !l.invalid && !l.teacher; }).length,
    conflicts: conflicts.filter(function (c) {
      return (c.lessons || []).some(function (id) { return ctx.lessons[id] && ctx.lessons[id].school === code; });
    }),
  };
}

/* ------------------------------ Tiết dạy (TKB) ------------------------------ */

/** Chuẩn hóa dữ liệu 1 tiết từ form/dán Excel. Trả về { obj, error }. */
function normalizeLessonInput_(ctx, input) {
  var school = str(input.school).toUpperCase();
  if (!ctx.schools[school]) return { error: 'Mã trường "' + school + '" không tồn tại' };
  var wd = typeof input.weekday === 'number' && input.weekday >= 0 && input.weekday <= 6 && input.weekdayIndex ? input.weekday : parseWeekday(input.weekday);
  if (wd < 0) return { error: 'Thứ "' + input.weekday + '" không hợp lệ' };
  var start = parseTime(input.start);
  var end = parseTime(input.end);
  if (start === null) return { error: 'Giờ bắt đầu "' + input.start + '" không hợp lệ' };
  if (end === null) return { error: 'Giờ kết thúc "' + input.end + '" không hợp lệ' };
  if (end <= start) return { error: 'Giờ kết thúc phải sau giờ bắt đầu' };
  var subject = str(input.subject).toUpperCase();
  if (!subject) return { error: 'Thiếu mã môn' };
  if (!ctx.subjects[subject]) {
    var found = findSubjectByName_(ctx, input.subject);
    if (!found) return { error: 'Môn "' + input.subject + '" không có trong danh mục môn học (dùng mã môn hoặc tên môn)' };
    subject = found;
  }
  var periods = toNum(input.periods);
  return {
    obj: {
      school: school, weekday: weekdayLabel(wd), start: fmtTime(start), end: fmtTime(end),
      className: str(input.className), grade: str(input.grade), subject: subject,
      periods: periods === null ? 1 : periods, room: str(input.room), notes: str(input.notes),
    },
  };
}

/** Tìm mã môn theo tên: khớp đúng tên, hoặc tên chứa từ khóa nếu chỉ có 1 môn khớp. */
function findSubjectByName_(ctx, text) {
  var q = removeDiacritics_(str(text)).toLowerCase();
  if (!q) return '';
  var codes = Object.keys(ctx.subjects);
  var exact = codes.filter(function (k) { return removeDiacritics_(ctx.subjects[k].name).toLowerCase() === q; });
  if (exact.length === 1) return exact[0];
  var partial = codes.filter(function (k) { return removeDiacritics_(ctx.subjects[k].name).toLowerCase().indexOf(q) >= 0; });
  return partial.length === 1 ? partial[0] : '';
}

function saveLesson_(args, user) {
  return withLock_(function () {
    var ctx = context_();
    var input = args.lesson || {};
    var norm = normalizeLessonInput_(ctx, input);
    if (norm.error) throw userError_(norm.error);
    var obj = norm.obj;
    obj.updatedAt = nowString();
    obj.updatedBy = user.email;
    var id = str(input.id);
    var existing = id ? ctx.lessons[id] : null;
    if (id && !existing) throw userError_('Không tìm thấy tiết ' + id);
    var wantTeacher = 'teacher' in input ? str(input.teacher).toUpperCase() : (existing ? existing.teacher : '');
    if (wantTeacher !== (existing ? existing.teacher : '')) {
      if (!hasPerm(user, 'assign')) throw userError_('Bạn không có quyền phân công giáo viên.', 'FORBIDDEN');
      if (wantTeacher && !ctx.teachers[wantTeacher]) throw userError_('Mã GV "' + wantTeacher + '" không tồn tại');
      obj.teacher = wantTeacher;
      obj.source = wantTeacher ? 'Thủ công' : '';
      obj.explain = '';
    }
    if ('locked' in input && hasPerm(user, 'assign')) obj.locked = !!input.locked;
    if (existing) {
      obj._row = existing.row;
      Db.update('lessons', [obj]);
      audit_(user, 'Sửa tiết', id, obj);
    } else {
      id = nextIds_('lessons', 'TKB', 1)[0];
      obj.id = id;
      if (!('teacher' in obj)) obj.teacher = '';
      if (!('locked' in obj)) obj.locked = false;
      Db.append('lessons', [obj]);
      audit_(user, 'Thêm tiết', id, obj);
    }
    return { id: id, warnings: lessonWarnings_(id) };
  });
}

/** Cảnh báo liên quan đến 1 tiết sau khi lưu/gán. */
function lessonWarnings_(id) {
  Db.clearCache();
  var ctx = context_();
  return detectConflicts(ctx).filter(function (c) {
    return (c.lessons || []).indexOf(id) >= 0 ||
      (ctx.lessons[id] && ctx.lessons[id].teacher && c.teacher === ctx.lessons[id].teacher && !(c.lessons || []).length);
  }).map(function (c) { return { severity: c.severity, label: c.label, message: c.message }; });
}

function bulkAddLessons_(args, user) {
  return withLock_(function () {
    var ctx = context_();
    var rows = args.rows || [];
    if (!rows.length) throw userError_('Không có dòng nào để thêm.');
    if (rows.length > 2000) throw userError_('Tối đa 2000 dòng mỗi lần.');
    var objs = [];
    var errors = [];
    rows.forEach(function (r, i) {
      var input = Object.assign({}, r);
      if (args.school && !input.school) input.school = args.school;
      var norm = normalizeLessonInput_(ctx, input);
      if (norm.error) { errors.push('Dòng ' + (i + 1) + ': ' + norm.error); return; }
      var o = norm.obj;
      o.teacher = '';
      o.locked = false;
      o.updatedAt = nowString();
      o.updatedBy = user.email;
      objs.push(o);
    });
    if (errors.length && !args.skipErrors) return { added: 0, removed: 0, errors: errors };
    var removed = 0;
    if (args.replaceSchool && args.school) {
      var code = str(args.school).toUpperCase();
      var rowsToRemove = Db.read('lessons').filter(function (l) { return str(l.school).toUpperCase() === code; }).map(function (l) { return l._row; });
      Db.remove('lessons', rowsToRemove);
      removed = rowsToRemove.length;
    }
    var ids = nextIds_('lessons', 'TKB', objs.length);
    objs.forEach(function (o, i) { o.id = ids[i]; });
    Db.append('lessons', objs);
    audit_(user, 'Nhập TKB', args.school || 'nhiều trường', 'Thêm ' + objs.length + ' tiết' + (removed ? ', xóa ' + removed + ' tiết cũ' : ''));
    return { added: objs.length, removed: removed, errors: errors };
  });
}

function deleteLessons_(args, user) {
  return withLock_(function () {
    var ids = (args.ids || []).map(str);
    var rows = Db.read('lessons').filter(function (l) { return ids.indexOf(str(l.id)) >= 0; });
    Db.remove('lessons', rows.map(function (l) { return l._row; }));
    audit_(user, 'Xóa tiết', ids.join(', '), rows.length + ' tiết');
    return { deleted: rows.length };
  });
}

function assignLesson_(args, user) {
  return withLock_(function () {
    var ctx = context_();
    var id = str(args.id);
    var l = ctx.lessons[id];
    if (!l) throw userError_('Không tìm thấy tiết ' + id);
    var code = str(args.teacher).toUpperCase();
    var explain = '';
    if (code) {
      var t = ctx.teachers[code];
      if (!t) throw userError_('Mã GV "' + code + '" không tồn tại');
      var st = stateFromAssignments(ctx, id);
      explain = 'Gán tay. ' + explainText(scoreCandidate(ctx, st, t, l));
    }
    var patch = { _row: l.row, teacher: code, source: code ? 'Thủ công' : '', explain: explain, updatedAt: nowString(), updatedBy: user.email };
    if ('locked' in args) patch.locked = !!args.locked;
    Db.update('lessons', [patch]);
    audit_(user, code ? 'Gán GV' : 'Bỏ gán GV', id, (l.teacher || '–') + ' → ' + (code || '–'));
    return { id: id, warnings: code ? lessonWarnings_(id) : [] };
  });
}

function lockLessons_(args, user) {
  return withLock_(function () {
    var ids = (args.ids || []).map(str);
    var items = Db.read('lessons').filter(function (l) { return ids.indexOf(str(l.id)) >= 0; })
      .map(function (l) { return { _row: l._row, locked: !!args.locked }; });
    Db.update('lessons', items);
    audit_(user, args.locked ? 'Ghim tiết' : 'Bỏ ghim tiết', ids.join(', '), '');
    return { updated: items.length };
  });
}

/* --------------------------- Xếp lịch tự động --------------------------- */

var RUN_STATUS = { preview: 'Xem trước', applied: 'Đã áp dụng', reverted: 'Đã hoàn tác', discarded: 'Đã hủy' };

function runAuto_(args, user) {
  return withLock_(function () {
    var ctx = context_();
    var t0 = Date.now();
    var result = runAutoSchedule(ctx, { mode: args.mode, schools: args.schools });
    var ms = Date.now() - t0;
    var id = 'RUN-' + Utilities.formatDate(new Date(), APP.TIMEZONE, 'yyyyMMdd-HHmmss');
    var summary = {
      stats: result.stats, ms: ms, scope: args.schools && args.schools.length ? args.schools : 'all',
      loads: result.loads.map(function (l) { return [l.teacher, l.load, l.target, l.max, l.schools.length]; }),
    };
    Db.append('runs', [{ id: id, createdAt: nowString(), createdBy: user.email, mode: result.mode === 'rebuild' ? 'Xếp lại toàn bộ' : 'Điền tiết trống', status: RUN_STATUS.preview, summary: JSON.stringify(summary) }]);
    var items = result.proposals.map(function (p) {
      return { runId: id, lessonId: p.lessonId, before: p.before, after: p.teacher, score: p.score, explain: p.explain };
    }).concat(result.unassigned.map(function (u) {
      return { runId: id, lessonId: u.lessonId, before: u.before, after: '', score: '', explain: u.reason };
    }));
    Db.append('runItems', items);
    pruneRuns_();
    audit_(user, 'Chạy xếp lịch (xem trước)', id, result.stats);
    return getRun_({ id: id }, user);
  });
}

function pruneRuns_() {
  var runs = Db.read('runs');
  if (runs.length <= APP.KEEP_RUNS) return;
  var old = runs.slice(0, runs.length - APP.KEEP_RUNS);
  var oldIds = {};
  old.forEach(function (r) { oldIds[r.id] = true; });
  var itemRows = Db.read('runItems').filter(function (it) { return oldIds[it.runId]; }).map(function (it) { return it._row; });
  Db.remove('runItems', itemRows);
  Db.remove('runs', old.map(function (r) { return r._row; }));
}

function getRun_(args, user) {
  var run = Db.findByKey('runs', str(args.id));
  if (!run) throw userError_('Không tìm thấy lần xếp lịch ' + args.id);
  var ctx = context_();
  var summary = {};
  try { summary = JSON.parse(run.summary || '{}'); } catch (e) { summary = {}; }
  var items = Db.read('runItems').filter(function (it) { return it.runId === run.id; }).map(function (it) {
    var l = ctx.lessons[str(it.lessonId)];
    var dto = l ? lessonDto_(ctx, l, null) : { id: it.lessonId, schoolName: '(tiết đã bị xóa)' };
    var after = str(it.after).toUpperCase();
    var before = str(it.before).toUpperCase();
    return {
      lesson: dto, before: before, beforeName: before ? ((ctx.teachers[before] || {}).name || before) : '',
      after: after, afterName: after ? ((ctx.teachers[after] || {}).name || after) : '',
      score: it.score, explain: it.explain, assigned: !!after, changed: after !== before,
    };
  });
  var loads = (summary.loads || []).map(function (a) {
    return { teacher: a[0], name: (ctx.teachers[a[0]] || {}).name || a[0], load: a[1], target: a[2], max: a[3], schools: a[4] };
  });
  return {
    id: run.id, createdAt: run.createdAt, createdBy: run.createdBy, mode: run.mode, status: run.status,
    appliedAt: run.appliedAt, appliedBy: run.appliedBy, stats: summary.stats || {}, ms: summary.ms, scope: summary.scope,
    items: items, loads: loads,
  };
}

function applyRun_(args, user) {
  return withLock_(function () {
    var run = Db.findByKey('runs', str(args.id));
    if (!run) throw userError_('Không tìm thấy lần xếp lịch.');
    if (run.status !== RUN_STATUS.preview) throw userError_('Lần xếp này đang ở trạng thái "' + run.status + '", không thể áp dụng.');
    var items = Db.read('runItems').filter(function (it) { return it.runId === run.id; });
    var lessons = {};
    Db.read('lessons').forEach(function (l) { lessons[str(l.id)] = l; });
    var patches = [];
    var skipped = 0;
    var now = nowString();
    items.forEach(function (it) {
      var l = lessons[str(it.lessonId)];
      var before = str(it.before).toUpperCase();
      // Bỏ qua nếu tiết đã bị xóa / ghim / đổi GV sau lúc chạy thử.
      if (!l || toBool(l.locked) || str(l.teacher).toUpperCase() !== before) { skipped++; return; }
      var after = str(it.after).toUpperCase();
      patches.push({
        _row: l._row, teacher: after, source: after ? 'Tự động' : '',
        explain: after ? it.explain : 'Chưa xếp được – ' + it.explain, updatedAt: now, updatedBy: user.email,
      });
    });
    Db.update('lessons', patches);
    Db.update('runs', [{ _row: run._row, status: RUN_STATUS.applied, appliedAt: now, appliedBy: user.email }]);
    audit_(user, 'Áp dụng xếp lịch', run.id, 'Cập nhật ' + patches.length + ' tiết, bỏ qua ' + skipped);
    return { applied: patches.length, skipped: skipped };
  });
}

function revertRun_(args, user) {
  return withLock_(function () {
    var run = Db.findByKey('runs', str(args.id));
    if (!run) throw userError_('Không tìm thấy lần xếp lịch.');
    if (run.status !== RUN_STATUS.applied) throw userError_('Chỉ hoàn tác được lần xếp đã áp dụng.');
    var items = Db.read('runItems').filter(function (it) { return it.runId === run.id; });
    var lessons = {};
    Db.read('lessons').forEach(function (l) { lessons[str(l.id)] = l; });
    var patches = [];
    var skipped = 0;
    var now = nowString();
    items.forEach(function (it) {
      var l = lessons[str(it.lessonId)];
      if (!l || str(l.teacher).toUpperCase() !== str(it.after).toUpperCase()) { skipped++; return; }
      var before = str(it.before).toUpperCase();
      patches.push({ _row: l._row, teacher: before, source: before ? 'Hoàn tác' : '', explain: '', updatedAt: now, updatedBy: user.email });
    });
    Db.update('lessons', patches);
    Db.update('runs', [{ _row: run._row, status: RUN_STATUS.reverted }]);
    audit_(user, 'Hoàn tác xếp lịch', run.id, 'Khôi phục ' + patches.length + ' tiết, bỏ qua ' + skipped);
    return { reverted: patches.length, skipped: skipped };
  });
}

function discardRun_(args, user) {
  return withLock_(function () {
    var run = Db.findByKey('runs', str(args.id));
    if (!run) throw userError_('Không tìm thấy lần xếp lịch.');
    if (run.status !== RUN_STATUS.preview) throw userError_('Chỉ hủy được bản xem trước.');
    Db.update('runs', [{ _row: run._row, status: RUN_STATUS.discarded }]);
    return { ok: true };
  });
}

function runHistory_() {
  return Db.read('runs').reverse().map(function (r) {
    var stats = {};
    try { stats = JSON.parse(r.summary || '{}').stats || {}; } catch (e) { stats = {}; }
    return { id: r.id, createdAt: r.createdAt, createdBy: r.createdBy, mode: r.mode, status: r.status, appliedAt: r.appliedAt, appliedBy: r.appliedBy, stats: stats };
  });
}

/* --------------------------- Danh mục dữ liệu --------------------------- */

var DATA_TABLES = {
  subjects: { view: 'view_schedule', edit: 'edit_teachers' },
  schools: { view: 'view_schedule', edit: 'edit_schools' },
  teachers: { view: 'view_schedule', edit: 'edit_teachers' },
  links: { view: 'view_personal', edit: 'edit_teachers' },
  unavailability: { view: 'view_personal', edit: 'edit_teachers' },
};

function tableMeta_(table, user) {
  var personal = hasPerm(user, 'view_personal');
  return TABLES[table].columns.filter(function (c) { return personal || !c.personal; }).map(function (c) {
    return { key: c.key, header: c.header, type: c.type || 'text', options: c.options || null, required: !!c.required, auto: !!c.auto, def: c.def };
  });
}

function dataList_(args, user) {
  var table = String(args.table);
  var conf = DATA_TABLES[table];
  if (!conf) throw userError_('Bảng không hợp lệ.');
  if (!hasPerm(user, conf.view)) throw userError_('Bạn không có quyền xem dữ liệu này.', 'FORBIDDEN');
  var meta = tableMeta_(table, user);
  var rows = Db.read(table).map(function (r) {
    var o = { _key: Db.keyOf(table, r) };
    meta.forEach(function (c) { o[c.key] = r[c.key]; });
    return o;
  });
  return { table: table, label: TABLES[table].label, key: TABLES[table].key, columns: meta, rows: rows, canEdit: hasPerm(user, conf.edit) };
}

var CODE_FIELDS = { code: true, teacher: true, school: true, subject: true };

function dataSave_(args, user) {
  var table = String(args.table);
  var conf = DATA_TABLES[table];
  if (!conf) throw userError_('Bảng không hợp lệ.');
  if (!hasPerm(user, conf.edit)) throw userError_('Bạn không có quyền sửa dữ liệu này.', 'FORBIDDEN');
  return withLock_(function () {
    var input = args.record || {};
    var rec = {};
    TABLES[table].columns.forEach(function (c) {
      if (!(c.key in input) || c.auto) return;
      var v = input[c.key];
      if (c.type === 'bool') v = toBool(v, c.def);
      else if (c.type === 'number') { v = toNum(v); if (v === null) v = ''; }
      else if (c.type === 'time') { var t = parseTime(v); if (str(v) && t === null) throw userError_(c.header + ': giờ không hợp lệ'); v = t === null ? '' : fmtTime(t); }
      else if (c.type === 'weekday') { var w = parseWeekday(v); if (w < 0) throw userError_(c.header + ': thứ không hợp lệ'); v = weekdayLabel(w); }
      else if (c.type === 'subjects') v = (Array.isArray(v) ? v : splitList(v)).map(function (x) { return str(x).toUpperCase(); }).join(', ');
      else v = str(v);
      if (CODE_FIELDS[c.key] && typeof v === 'string') v = v.toUpperCase();
      if (c.key === 'email') v = normEmail(v);
      if (c.required && (v === '' || v === null)) throw userError_('Thiếu thông tin bắt buộc: ' + c.header);
      if (c.options && v && c.options.indexOf(v) < 0) throw userError_(c.header + ': giá trị "' + v + '" không hợp lệ');
      rec[c.key] = v;
    });
    validateRefs_(table, rec);
    if (table === 'unavailability' && rec.start && rec.end && parseTime(rec.end) <= parseTime(rec.start)) {
      throw userError_('Giờ kết thúc phải sau giờ bắt đầu.');
    }
    var originalKey = str(args.originalKey);
    var newKey = Db.keyOf(table, Object.assign({}, rec, table === 'unavailability' ? { id: originalKey } : {}));
    var existing = originalKey ? Db.findByKey(table, originalKey) : null;
    if (originalKey && !existing) throw userError_('Bản ghi không còn tồn tại (có thể đã bị xóa).');
    if (existing) {
      if (table !== 'unavailability' && newKey !== originalKey) {
        throw userError_('Không đổi được mã/khóa của bản ghi. Hãy tạo bản ghi mới rồi xóa bản ghi cũ.');
      }
      rec._row = existing._row;
      Db.update(table, [rec]);
      audit_(user, 'Sửa ' + TABLES[table].label, originalKey, rec);
    } else {
      if (table === 'unavailability') {
        rec.id = nextIds_('unavailability', 'LB', 1)[0];
        newKey = rec.id;
      } else if (Db.findByKey(table, newKey)) {
        throw userError_('Đã tồn tại bản ghi với mã/khóa "' + newKey + '".');
      }
      TABLES[table].columns.forEach(function (c) {
        if (!(c.key in rec) && c.def !== undefined) rec[c.key] = c.def;
      });
      Db.append(table, [rec]);
      audit_(user, 'Thêm ' + TABLES[table].label, newKey, rec);
    }
    return { key: newKey };
  });
}

function validateRefs_(table, rec) {
  if (rec.teacher !== undefined && rec.teacher && !Db.findByKey('teachers', rec.teacher)) throw userError_('Mã GV "' + rec.teacher + '" không tồn tại.');
  if (rec.school !== undefined && rec.school && !Db.findByKey('schools', rec.school)) throw userError_('Mã trường "' + rec.school + '" không tồn tại.');
  if (table === 'teachers' && rec.subjects) {
    var bad = splitList(rec.subjects).filter(function (c) { return !Db.findByKey('subjects', c); });
    if (bad.length) throw userError_('Mã môn không tồn tại: ' + bad.join(', '));
  }
  if (table === 'teachers' && rec.email && !isAllowedEmail(rec.email)) throw userError_('Email GV phải là email @' + APP.ALLOWED_DOMAINS[0]);
}

function dataDelete_(args, user) {
  var table = String(args.table);
  var conf = DATA_TABLES[table];
  if (!conf) throw userError_('Bảng không hợp lệ.');
  if (!hasPerm(user, conf.edit)) throw userError_('Bạn không có quyền xóa dữ liệu này.', 'FORBIDDEN');
  return withLock_(function () {
    var key = str(args.key);
    var rec = Db.findByKey(table, key);
    if (!rec) throw userError_('Không tìm thấy bản ghi.');
    var refField = { teachers: 'teacher', schools: 'school', subjects: 'subject' }[table];
    if (refField) {
      var used = Db.read('lessons').filter(function (l) { return str(l[refField]).toUpperCase() === key; }).length;
      if (used) throw userError_('Đang được dùng trong ' + used + ' tiết của TKB. Hãy chuyển "Hoạt động" sang tắt thay vì xóa.');
    }
    Db.remove(table, [rec._row]);
    audit_(user, 'Xóa ' + TABLES[table].label, key, '');
    return { deleted: 1 };
  });
}

/* ------------------------------ Danh sách tổng hợp ------------------------------ */

function overviewLists_(args, user) {
  var ctx = context_();
  var conflicts = detectConflicts(ctx);
  var st = stateFromAssignments(ctx, null);
  var confByTeacher = {};
  var confBySchool = {};
  conflicts.forEach(function (c) {
    if (c.teacher) confByTeacher[c.teacher] = (confByTeacher[c.teacher] || 0) + 1;
    (c.lessons || []).forEach(function (id) {
      var l = ctx.lessons[id];
      if (l) confBySchool[l.school] = (confBySchool[l.school] || 0) + 1;
    });
  });
  var teachers = Object.keys(ctx.teachers).sort().map(function (code) {
    var t = ctx.teachers[code];
    var ts = st[code];
    var lessonsCount = ts.byDay.reduce(function (s, d) { return s + d.length; }, 0);
    return { code: code, name: t.name, type: t.typeLabel, rating: t.rating, district: t.district, active: t.active,
      load: round1(ts.load), target: t.target, max: t.max, lessons: lessonsCount, schools: Object.keys(ts.schools).length,
      conflicts: confByTeacher[code] || 0 };
  });
  var schoolStats = {};
  ctx.lessonList.forEach(function (l) {
    var e = schoolStats[l.school] = schoolStats[l.school] || { lessons: 0, assigned: 0, teachers: {}, hours: 0 };
    e.lessons++;
    e.hours += l.load;
    if (l.teacher && ctx.teachers[l.teacher]) { e.assigned++; e.teachers[l.teacher] = true; }
  });
  var schools = Object.keys(ctx.schools).sort().map(function (code) {
    var s = ctx.schools[code];
    var e = schoolStats[code] || { lessons: 0, assigned: 0, teachers: {}, hours: 0 };
    return { code: code, name: s.name, district: s.district, active: s.active, lessons: e.lessons, assigned: e.assigned,
      hours: round1(e.hours), teachers: Object.keys(e.teachers).length, conflicts: confBySchool[code] || 0 };
  });
  return { teachers: teachers, schools: schools };
}

function listLessons_(args, user) {
  var ctx = context_();
  var cidx = conflictIndex(detectConflicts(ctx));
  return ctx.lessonList.map(function (l) { return lessonDto_(ctx, l, cidx); })
    .sort(function (a, b) { return a.school < b.school ? -1 : a.school > b.school ? 1 : (a.weekday - b.weekday) || ((a.start || 0) - (b.start || 0)); });
}

function bootstrap_(args, user) {
  var out = {
    user: publicUser_(user),
    app: { name: APP.NAME, title: APP.TITLE, version: APP.VERSION, superAdmin: APP.SUPER_ADMIN, domains: APP.ALLOWED_DOMAINS },
    roles: ROLES, weekdays: WEEKDAYS, teacherTypes: TEACHER_TYPES, ratings: RATINGS, preferences: PREFERENCES,
    lookups: { schools: [], teachers: [], subjects: [], districts: [] },
  };
  var s = getSettings();
  out.settings = { day_start: s.day_start, day_end: s.day_end, load_unit: s.load_unit, min_free_minutes: s.min_free_minutes };
  out.lookups.subjects = Db.read('subjects').map(function (x) { return { code: str(x.code).toUpperCase(), name: x.name, color: x.color }; });
  if (hasPerm(user, 'view_schedule') || hasPerm(user, 'edit_timetable')) {
    var districts = {};
    out.lookups.schools = Db.read('schools').map(function (x) {
      if (x.district) districts[x.district] = true;
      return { code: str(x.code).toUpperCase(), name: x.name, district: x.district, active: toBool(x.active, true) };
    });
    out.lookups.teachers = Db.read('teachers').map(function (x) {
      if (x.district) districts[x.district] = true;
      return { code: str(x.code).toUpperCase(), name: x.name, type: x.type, district: x.district, active: toBool(x.active, true) };
    });
    out.lookups.districts = Object.keys(districts).sort();
  }
  return out;
}

/* --------------------------------- Bảng hành động --------------------------------- */

var ACTIONS = {
  'bootstrap': { fn: bootstrap_ },
  'dashboard': {
    perm: 'view_schedule', fn: function () {
      var ctx = context_();
      var conflicts = detectConflicts(ctx);
      var d = computeDashboard(ctx, conflicts);
      d.topConflicts = conflicts.slice(0, 12);
      return d;
    },
  },
  'overview.lists': { perm: 'view_schedule', fn: overviewLists_ },
  'schedule.teacher': { perm: 'view_schedule', fn: function (a, u) { return teacherSchedule_(context_(), a.code, u); } },
  'schedule.school': { perm: 'view_schedule', fn: function (a, u) { return schoolSchedule_(context_(), a.code, u); } },
  'schedule.me': {
    fn: function (a, u) {
      if (!u.teacherCode) throw userError_('Email của bạn chưa được gắn với hồ sơ giáo viên nào (cột Email trong sheet GiaoVien).');
      return teacherSchedule_(context_(), u.teacherCode, u);
    },
  },
  'schedule.free': {
    perm: 'view_schedule', fn: function (a, u) {
      var wd = Number(a.weekday);
      if (!(wd >= 0 && wd <= 6)) throw userError_('Thứ không hợp lệ.');
      var from = parseTime(a.from);
      var to = parseTime(a.to);
      if (from !== null && to !== null && to <= from) throw userError_('Khoảng giờ không hợp lệ.');
      var res = computeFreeSlots(context_(), wd, { from: from, to: to, subject: a.subject, district: a.district, type: a.type, school: a.school });
      if (!hasPerm(u, 'view_personal')) res.rows.forEach(function (r) { r.distance = null; r.busy.forEach(function (b) { if (b.kind === 'unavailable') b.label = 'Bận'; }); });
      return res;
    },
  },
  'conflicts.list': {
    perm: 'view_schedule', fn: function () {
      var ctx = context_();
      return detectConflicts(ctx).map(function (c) {
        c.teacherName = c.teacher && ctx.teachers[c.teacher] ? ctx.teachers[c.teacher].name : '';
        c.schoolName = c.school && ctx.schools[c.school] ? ctx.schools[c.school].name : '';
        c.weekdayLabel = c.weekday !== undefined ? weekdayLabel(c.weekday) : '';
        return c;
      });
    },
  },
  'lessons.list': { perm: ['view_schedule', 'edit_timetable'], fn: listLessons_ },
  'lessons.save': { perm: 'edit_timetable', fn: saveLesson_ },
  'lessons.bulkAdd': { perm: 'edit_timetable', fn: bulkAddLessons_ },
  'lessons.delete': { perm: 'edit_timetable', fn: deleteLessons_ },
  'lessons.assign': { perm: 'assign', fn: assignLesson_ },
  'lessons.lock': { perm: 'assign', fn: lockLessons_ },
  'lessons.candidates': {
    perm: 'assign', fn: function (a) {
      var ctx = context_();
      var l = ctx.lessons[str(a.id)];
      if (!l) throw userError_('Không tìm thấy tiết.');
      return { lesson: lessonDto_(ctx, l, null), candidates: rankCandidates(ctx, l.id) };
    },
  },
  'auto.run': { perm: 'auto_schedule', fn: runAuto_ },
  'auto.get': { perm: 'auto_schedule', fn: getRun_ },
  'auto.apply': { perm: 'auto_schedule', fn: applyRun_ },
  'auto.revert': { perm: 'auto_schedule', fn: revertRun_ },
  'auto.discard': { perm: 'auto_schedule', fn: discardRun_ },
  'auto.history': { perm: 'auto_schedule', fn: runHistory_ },
  'data.list': { fn: dataList_ },
  'data.save': { fn: dataSave_ },
  'data.delete': { fn: dataDelete_ },
  'users.list': { perm: 'manage_users', fn: function () { return listUsers_(); } },
  'users.save': { perm: 'manage_users', fn: function (a, u) { return saveUser_(u, a.user || {}); } },
  'users.delete': { perm: 'manage_users', fn: function (a, u) { return deleteUser_(u, a.email); } },
  'settings.get': {
    perm: 'manage_settings', fn: function () {
      var values = getSettings();
      return SETTINGS_SPEC.map(function (s) { return Object.assign({}, s, { value: values[s.key] }); });
    },
  },
  'settings.save': {
    perm: 'manage_settings', fn: function (a, u) {
      return withLock_(function () {
        saveSettings(a.values || {});
        audit_(u, 'Cập nhật cấu hình', 'CauHinh', a.values || {});
        return { ok: true };
      });
    },
  },
  'audit.list': {
    perm: 'view_audit', fn: function (a) {
      var rows = Db.read('audit');
      var limit = Math.min(Number(a.limit) || 300, 2000);
      return rows.slice(-limit).reverse().map(function (r) { return { at: r.at, user: r.user, action: r.action, entity: r.entity, details: r.details }; });
    },
  },
  'export.sheet': { perm: 'export', fn: function (a, u) { return exportToSpreadsheet_(u); } },
  'email.schedules': { perm: 'send_email', fn: function (a, u) { return emailSchedules_(u, a.teachers || []); } },
};
